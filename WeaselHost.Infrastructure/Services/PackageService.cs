using Microsoft.Extensions.Logging;
using Microsoft.Win32;
using WGetNET;
using WeaselHost.Core.Models;

namespace WeaselHost.Infrastructure.Services;

public sealed class PackageService : IPackageService
{
    private static readonly string WingetLogDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Packages",
        "Microsoft.DesktopAppInstaller_8wekyb3d8bbwe",
        "LocalState",
        "DiagOutputDir");
    private readonly ILogger<PackageService> _logger;
    private readonly WinGetPackageManager _packageManager;

    public PackageService(ILogger<PackageService> logger)
    {
        _logger = logger;
        _packageManager = new WinGetPackageManager();
    }

    public Task<IReadOnlyCollection<InstalledApplication>> GetInstalledApplicationsAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Reading installed applications from registry");
        var results = new List<InstalledApplication>();
        ReadApplicationsFromRegistry(results);
        _logger.LogInformation("Found {Count} installed applications", results.Count);
        return Task.FromResult<IReadOnlyCollection<InstalledApplication>>(results);
    }

    public async Task<PackageOperationResult> InstallAsync(string packageIdentifierOrPath, CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsWindows())
        {
            return new PackageOperationResult(false, -1, "winget is only available on Windows.");
        }

        if (!_packageManager.IsInstalled)
        {
            return new PackageOperationResult(false, -1, "winget is not installed on this system.");
        }

        try
        {
            _logger.LogInformation("Installing package: {Package}", packageIdentifierOrPath);
            
            // WGet.NET doesn't support cancellation tokens directly, so we wrap it
            var installTask = Task.Run(() => _packageManager.InstallPackage(packageIdentifierOrPath), cancellationToken);
            var result = await installTask;

            if (result)
            {
                _logger.LogInformation("Package installed successfully: {Package}", packageIdentifierOrPath);
                var message = $"Successfully installed {packageIdentifierOrPath}.";
                var logHint = Directory.Exists(WingetLogDirectory)
                    ? $" See winget logs under {WingetLogDirectory}."
                    : string.Empty;
                return new PackageOperationResult(true, 0, message + logHint);
            }
            else
            {
                _logger.LogWarning("Package installation failed: {Package}", packageIdentifierOrPath);
                return new PackageOperationResult(false, -1, $"Failed to install {packageIdentifierOrPath}. See winget logs under {WingetLogDirectory}.");
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Package installation was cancelled: {Package}", packageIdentifierOrPath);
            return new PackageOperationResult(false, -1, "Installation was cancelled.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error installing package: {Package}", packageIdentifierOrPath);
            return new PackageOperationResult(false, -1, $"Failed to install {packageIdentifierOrPath}: {ex.Message}");
        }
    }

    public async Task<PackageOperationResult> UninstallAsync(string packageIdentifierOrProductCode, CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsWindows())
        {
            return new PackageOperationResult(false, -1, "winget is only available on Windows.");
        }

        if (!_packageManager.IsInstalled)
        {
            return new PackageOperationResult(false, -1, "winget is not installed on this system.");
        }

        try
        {
            _logger.LogInformation("Uninstalling package: {Package}", packageIdentifierOrProductCode);
            
            // WGet.NET doesn't support cancellation tokens directly, so we wrap it
            var uninstallTask = Task.Run(() => _packageManager.UninstallPackage(packageIdentifierOrProductCode), cancellationToken);
            var result = await uninstallTask;

            if (result)
            {
                _logger.LogInformation("Package uninstalled successfully: {Package}", packageIdentifierOrProductCode);
                var message = $"Successfully uninstalled {packageIdentifierOrProductCode}.";
                var logHint = Directory.Exists(WingetLogDirectory)
                    ? $" See winget logs under {WingetLogDirectory}."
                    : string.Empty;
                return new PackageOperationResult(true, 0, message + logHint);
            }
            else
            {
                _logger.LogWarning("Package uninstallation failed: {Package}", packageIdentifierOrProductCode);
                return new PackageOperationResult(false, -1, $"Failed to uninstall {packageIdentifierOrProductCode}. See winget logs under {WingetLogDirectory}.");
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Package uninstallation was cancelled: {Package}", packageIdentifierOrProductCode);
            return new PackageOperationResult(false, -1, "Uninstallation was cancelled.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uninstalling package: {Package}", packageIdentifierOrProductCode);
            return new PackageOperationResult(false, -1, $"Failed to uninstall {packageIdentifierOrProductCode}: {ex.Message}");
        }
    }

    public async Task<PackageShowResponse> ShowAsync(string identifierOrMoniker, CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsWindows())
        {
            return new PackageShowResponse(false, "winget is only available on Windows.", null, Array.Empty<PackageSearchResult>());
        }

        if (string.IsNullOrWhiteSpace(identifierOrMoniker))
        {
            return new PackageShowResponse(false, "Please provide a package identifier or moniker.", null, Array.Empty<PackageSearchResult>());
        }

        if (!_packageManager.IsInstalled)
        {
            return new PackageShowResponse(false, "winget is not installed on this system.", null, Array.Empty<PackageSearchResult>());
        }

        try
        {
            _logger.LogInformation("Showing package details for: {Identifier}", identifierOrMoniker);
            
            // WGet.NET's SearchPackage method for searching
            var searchTask = Task.Run(() => _packageManager.SearchPackage(identifierOrMoniker, false), cancellationToken);
            var packages = await searchTask;

            if (packages == null || packages.Count == 0)
            {
                return new PackageShowResponse(false, $"Package '{identifierOrMoniker}' not found.", null, Array.Empty<PackageSearchResult>());
            }

            // Try to find exact match first
            var exactMatch = packages.FirstOrDefault(p => 
                p.Id.Equals(identifierOrMoniker, StringComparison.OrdinalIgnoreCase) ||
                p.Name.Equals(identifierOrMoniker, StringComparison.OrdinalIgnoreCase));

            if (exactMatch != null)
            {
                _logger.LogInformation("Found exact match for package: {Identifier}", identifierOrMoniker);
                var details = MapToPackageDetails(exactMatch);
                return new PackageShowResponse(true, null, details, Array.Empty<PackageSearchResult>());
            }

            // If multiple matches, return them as alternatives
            if (packages.Count > 1)
            {
                _logger.LogInformation("Found {Count} matches for package: {Identifier}", packages.Count, identifierOrMoniker);
                var alternatives = packages.Select(MapToPackageSearchResult).ToList();
                return new PackageShowResponse(false, "Multiple packages matched. Please refine your query.", null, alternatives);
            }

            // Single match
            _logger.LogInformation("Found single match for package: {Identifier}", identifierOrMoniker);
            var singlePackage = packages[0];
            var singleDetails = MapToPackageDetails(singlePackage);
            return new PackageShowResponse(true, null, singleDetails, Array.Empty<PackageSearchResult>());
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Package show was cancelled: {Identifier}", identifierOrMoniker);
            return new PackageShowResponse(false, "Operation was cancelled.", null, Array.Empty<PackageSearchResult>());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error showing package: {Identifier}", identifierOrMoniker);
            return new PackageShowResponse(false, $"Failed to get package information: {ex.Message}", null, Array.Empty<PackageSearchResult>());
        }
    }

    public async Task<IReadOnlyCollection<PackageSearchResult>> SearchAsync(string query, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Array.Empty<PackageSearchResult>();
        }

        if (!OperatingSystem.IsWindows())
        {
            return Array.Empty<PackageSearchResult>();
        }

        if (!_packageManager.IsInstalled)
        {
            return Array.Empty<PackageSearchResult>();
        }

        try
        {
            _logger.LogInformation("Searching winget for: {Query}", query);
            
            // WGet.NET doesn't support cancellation tokens directly, so we wrap it
            // Add timeout of 60 seconds for search operations
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            using var combinedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);
            
            var searchTask = Task.Run(() => _packageManager.SearchPackage(query, false), combinedCts.Token);
            var packages = await searchTask;

            if (packages == null || packages.Count == 0)
            {
                _logger.LogWarning("Winget search returned no results for query: {Query}", query);
                return Array.Empty<PackageSearchResult>();
            }

            _logger.LogInformation("Found {Count} packages via WGet.NET", packages.Count);
            return packages.Select(MapToPackageSearchResult).ToList();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested || cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Winget search was cancelled for query: {Query}", query);
            return Array.Empty<PackageSearchResult>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during winget search for query: {Query}", query);
            return Array.Empty<PackageSearchResult>();
        }
    }

    private static PackageSearchResult MapToPackageSearchResult(WGetNET.WinGetPackage package)
    {
        // Map WGet.NET WinGetPackage to our PackageSearchResult
        // WGet.NET may have limited properties, so we use what's available
        var publisher = GetPropertyValue(package, "Publisher") ?? GetPropertyValue(package, "PublisherName") ?? "";
        var description = GetPropertyValue(package, "Description") ?? GetPropertyValue(package, "ShortDescription") ?? "";
        
        return new PackageSearchResult(
            package.Id ?? "",
            package.Name ?? "",
            package.Version?.ToString() ?? "",
            publisher,
            description);
    }

    private static PackageDetails MapToPackageDetails(WGetNET.WinGetPackage package)
    {
        // WGet.NET's WinGetPackage has limited fields compared to winget show output
        // We'll map what we can get from SearchPackage
        var publisher = GetPropertyValue(package, "Publisher") ?? GetPropertyValue(package, "PublisherName");
        var description = GetPropertyValue(package, "Description") ?? GetPropertyValue(package, "ShortDescription");
        
        return new PackageDetails(
            package.Name ?? "",
            package.Id ?? "",
            package.Version?.ToString(),
            publisher,
            description,
            null, // Homepage - not available from SearchPackage
            null, // License - not available from SearchPackage
            null, // LicenseUrl - not available from SearchPackage
            null, // InstallerType - not available from SearchPackage
            null, // InstallerUrl - not available from SearchPackage
            Array.Empty<string>(), // Tags - not available from SearchPackage
            Array.Empty<string>()); // DocumentationLinks - not available from SearchPackage
    }

    private static string? GetPropertyValue(object obj, string propertyName)
    {
        try
        {
            var prop = obj.GetType().GetProperty(propertyName);
            return prop?.GetValue(obj)?.ToString();
        }
        catch
        {
            return null;
        }
    }

    private static void ReadApplicationsFromRegistry(ICollection<InstalledApplication> sink)
    {
        var uninstallPaths = new[]
        {
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        };

        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            foreach (var path in uninstallPaths)
            {
                using var key = machine.OpenSubKey(path);
                if (key is null)
                {
                    continue;
                }

                ReadApplicationsFromKey(key, sink);
            }
        }

        using var currentUser = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64);
        using var currentUserKey = currentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
        if (currentUserKey is not null)
        {
            ReadApplicationsFromKey(currentUserKey, sink);
        }
    }

    private static void ReadApplicationsFromKey(RegistryKey key, ICollection<InstalledApplication> sink)
    {
        foreach (var subKeyName in key.GetSubKeyNames())
        {
            using var subKey = key.OpenSubKey(subKeyName);
            if (subKey is null)
            {
                continue;
            }

            var name = subKey.GetValue("DisplayName") as string;
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var version = (subKey.GetValue("DisplayVersion") as string) ?? "unknown";
            var publisher = (subKey.GetValue("Publisher") as string) ?? "unknown";
            var systemComponent = Convert.ToInt32(subKey.GetValue("SystemComponent", 0)) == 1;

            sink.Add(new InstalledApplication(
                name,
                subKeyName,
                version,
                publisher,
                systemComponent));
        }
    }
}
