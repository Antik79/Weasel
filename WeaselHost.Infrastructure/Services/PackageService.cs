using Microsoft.Extensions.Logging;
using Microsoft.Win32;
using System.Text;
using WeaselHost.Core.Models;

namespace WeaselHost.Infrastructure.Services;

public sealed class PackageService : IPackageService
{
    private const string WingetExecutable = "winget.exe";
    private static readonly string WingetLogDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Packages",
        "Microsoft.DesktopAppInstaller_8wekyb3d8bbwe",
        "LocalState",
        "DiagOutputDir");
    private readonly ILogger<PackageService>? _logger;

    public PackageService(ILogger<PackageService>? logger = null)
    {
        _logger = logger;
    }

    public Task<IReadOnlyCollection<InstalledApplication>> GetInstalledApplicationsAsync(CancellationToken cancellationToken = default)
    {
        var results = new List<InstalledApplication>();
        ReadApplicationsFromRegistry(results);
        return Task.FromResult<IReadOnlyCollection<InstalledApplication>>(results);
    }

    public async Task<PackageOperationResult> InstallAsync(string packageIdentifierOrPath, CancellationToken cancellationToken = default)
    {
        return await RunWingetAsync($"install \"{packageIdentifierOrPath}\" -h --accept-package-agreements --accept-source-agreements", cancellationToken);
    }

    public async Task<PackageOperationResult> UninstallAsync(string packageIdentifierOrProductCode, CancellationToken cancellationToken = default)
    {
        return await RunWingetAsync($"uninstall \"{packageIdentifierOrProductCode}\" -h", cancellationToken);
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

        if (!TryResolveWingetExecutable(out var executable, out var errorMessage))
        {
            return new PackageShowResponse(false, errorMessage ?? "winget is not installed on this system.", null, Array.Empty<PackageSearchResult>());
        }

        var result = await ProcessRunner.RunAsync(
            executable,
            $"show \"{identifierOrMoniker}\" --accept-source-agreements",
            cancellationToken);

        if (result.ExitCode == 0)
        {
            var details = ParseWingetShowOutput(result.StandardOutput);
            if (details is not null)
            {
                return new PackageShowResponse(true, null, details, Array.Empty<PackageSearchResult>());
            }

            return new PackageShowResponse(false, "winget returned data but it could not be parsed.", null, Array.Empty<PackageSearchResult>());
        }

        if (result.StandardOutput.Contains("Multiple packages found", StringComparison.OrdinalIgnoreCase))
        {
            var alternatives = ParseWingetTableOutput(result.StandardOutput);
            return new PackageShowResponse(false, "Multiple packages matched. Please refine your query.", null, alternatives);
        }

        var formatted = FormatWingetOutput(result, false);
        return new PackageShowResponse(false, formatted, null, Array.Empty<PackageSearchResult>());
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

    private static async Task<PackageOperationResult> RunWingetAsync(string arguments, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            return new PackageOperationResult(false, -1, "winget is only available on Windows.");
        }

        if (!TryResolveWingetExecutable(out var executable, out var errorMessage))
        {
            return new PackageOperationResult(false, -1, errorMessage ?? "winget is not installed on this system.");
        }

        var result = await ProcessRunner.RunAsync(executable, arguments, cancellationToken);
        var succeeded = result.ExitCode == 0;
        var message = FormatWingetOutput(result, succeeded);
        return new PackageOperationResult(succeeded, result.ExitCode, message);
    }

    public async Task<IReadOnlyCollection<PackageSearchResult>> SearchAsync(string query, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Array.Empty<PackageSearchResult>();
        }

        return await RunWingetSearchAsync(query, cancellationToken);
    }

    private async Task<IReadOnlyCollection<PackageSearchResult>> RunWingetSearchAsync(string query, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            return Array.Empty<PackageSearchResult>();
        }

        if (!TryResolveWingetExecutable(out var executable, out _))
        {
            return Array.Empty<PackageSearchResult>();
        }
        
        // Use JSON output for more reliable parsing
        // Add timeout of 60 seconds for search operations (winget can be slow)
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        using var combinedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);
        
        try
        {
            _logger?.LogInformation("Searching winget for: {Query}", query);
            
            // Try JSON output first (more reliable)
            var result = await ProcessRunner.RunAsync(
                executable, 
                $"search \"{query}\" --exact=false --accept-source-agreements --output json", 
                combinedCts.Token);

            _logger?.LogDebug("Winget search (JSON) exit code: {ExitCode}, Output length: {Length}", result.ExitCode, result.StandardOutput.Length);

            if (result.ExitCode == 0 && !string.IsNullOrWhiteSpace(result.StandardOutput))
            {
                // Try to parse JSON output
                try
                {
                    var jsonPackages = System.Text.Json.JsonSerializer.Deserialize<List<WingetJsonPackage>>(result.StandardOutput);
                    if (jsonPackages != null && jsonPackages.Count > 0)
                    {
                        _logger?.LogInformation("Found {Count} packages via JSON output", jsonPackages.Count);
                        return jsonPackages.Select(p => new PackageSearchResult(
                            p.Id ?? "",
                            p.Name ?? "",
                            p.Version ?? "",
                            p.Publisher ?? "",
                            p.Description ?? ""
                        )).ToList();
                    }
                }
                catch (Exception ex)
                {
                    _logger?.LogWarning(ex, "Failed to parse JSON output, falling back to table parsing");
                    // If JSON parsing fails, fall back to table parsing
                    var tableResults = ParseWingetTableOutput(result.StandardOutput);
                    if (tableResults.Count > 0)
                    {
                        return tableResults;
                    }
                }
            }

            // If JSON output fails, try without JSON flag (fallback to table format)
            _logger?.LogDebug("Trying winget search without JSON flag");
            var fallbackResult = await ProcessRunner.RunAsync(
                executable, 
                $"search \"{query}\" --exact=false --accept-source-agreements", 
                combinedCts.Token);
            
            _logger?.LogDebug("Winget search (table) exit code: {ExitCode}, Output length: {Length}", fallbackResult.ExitCode, fallbackResult.StandardOutput.Length);
            
            if (fallbackResult.ExitCode == 0 && !string.IsNullOrWhiteSpace(fallbackResult.StandardOutput))
            {
                var tableResults = ParseWingetTableOutput(fallbackResult.StandardOutput);
                if (tableResults.Count > 0)
                {
                    _logger?.LogInformation("Found {Count} packages via table output", tableResults.Count);
                    return tableResults;
                }
            }

            _logger?.LogWarning("Winget search returned no results for query: {Query}", query);
            return Array.Empty<PackageSearchResult>();
        }
        catch (OperationCanceledException) when (timeoutCts.Token.IsCancellationRequested)
        {
            _logger?.LogWarning("Winget search timed out after 60 seconds for query: {Query}", query);
            return Array.Empty<PackageSearchResult>();
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error during winget search for query: {Query}", query);
            return Array.Empty<PackageSearchResult>();
        }
    }

    private static List<PackageSearchResult> ParseWingetTableOutput(string output)
    {
        var packages = new List<PackageSearchResult>();
        if (string.IsNullOrWhiteSpace(output))
        {
            return packages;
        }

        var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        
        // Find the header line and separator line
        var dataStartIndex = 0;
        for (int i = 0; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            // Look for header line with "Name" and "Id"
            if (line.Contains("Name") && (line.Contains("Id") || line.Contains("ID")))
            {
                // Skip the separator line (usually dashes)
                dataStartIndex = i + 2; // Skip header and separator
                break;
            }
        }

        // If no header found, try to parse from the beginning
        if (dataStartIndex == 0)
        {
            dataStartIndex = 0;
        }

        for (int i = dataStartIndex; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (string.IsNullOrWhiteSpace(line) || 
                line.StartsWith("---") || 
                line.StartsWith("The following") ||
                line.StartsWith("No package") ||
                line.Contains("No applicable packages"))
            {
                continue;
            }

            // Winget uses tab-separated values, but may have multiple tabs between columns
            // Split by tab and filter out empty entries
            var parts = line.Split('\t', StringSplitOptions.RemoveEmptyEntries)
                .Select(p => p.Trim())
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .ToArray();

            if (parts.Length >= 2)
            {
                var name = parts[0];
                var id = parts.Length > 1 ? parts[1] : "";
                var version = parts.Length > 2 ? parts[2] : "";
                var publisher = parts.Length > 3 ? parts[3] : "";
                var description = parts.Length > 4 ? string.Join(" ", parts.Skip(4)) : "";

                // Validate that we have at least name and id
                if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(id))
                {
                    packages.Add(new PackageSearchResult(id, name, version, publisher, description));
                }
            }
        }

        return packages;
    }

    private static PackageDetails? ParseWingetShowOutput(string output)
    {
        if (string.IsNullOrWhiteSpace(output))
        {
            return null;
        }

        string? name = null;
        string? id = null;
        var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var tags = new List<string>();
        var docs = new List<string>();
        string? currentMultilineKey = null;
        var multilineBuilder = new StringBuilder();

        foreach (var rawLine in output.Split(new[] { '\r', '\n' }, StringSplitOptions.None))
        {
            var line = rawLine.TrimEnd();
            if (string.IsNullOrWhiteSpace(line))
            {
                FlushMultiline();
                continue;
            }

            if (line.StartsWith("Found ", StringComparison.OrdinalIgnoreCase))
            {
                var afterFound = line.Substring("Found ".Length).Trim();
                var bracketIndex = afterFound.LastIndexOf('[');
                if (bracketIndex >= 0 && afterFound.EndsWith("]"))
                {
                    name = afterFound[..bracketIndex].Trim();
                    id = afterFound[(bracketIndex + 1)..^1].Trim();
                }
                else
                {
                    name = afterFound;
                }
                continue;
            }

            if (line.Contains("matching input criteria", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            if (IsSpinnerLine(line))
            {
                continue;
            }

            var colonIndex = line.IndexOf(':');
            if (colonIndex > 0 && colonIndex < line.Length - 1 && char.IsLetter(line[0]))
            {
                FlushMultiline();

                var key = line[..colonIndex].Trim();
                var value = line[(colonIndex + 1)..].Trim();

                if (string.IsNullOrEmpty(value))
                {
                    currentMultilineKey = key;
                    continue;
                }

                if (key.Equals("Tags", StringComparison.OrdinalIgnoreCase))
                {
                    tags.AddRange(value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
                }
                else if (key.StartsWith("Documentation", StringComparison.OrdinalIgnoreCase))
                {
                    docs.Add(value);
                }
                else
                {
                    fields[key] = value;
                }
            }
            else if (currentMultilineKey is not null)
            {
                var trimmed = line.Trim();
                if (!string.IsNullOrWhiteSpace(trimmed))
                {
                    if (currentMultilineKey.Equals("Tags", StringComparison.OrdinalIgnoreCase))
                    {
                        tags.Add(trimmed);
                    }
                    else if (currentMultilineKey.StartsWith("Documentation", StringComparison.OrdinalIgnoreCase))
                    {
                        docs.Add(trimmed);
                    }
                    else
                    {
                        if (multilineBuilder.Length > 0)
                        {
                            multilineBuilder.AppendLine();
                        }
                        multilineBuilder.Append(trimmed);
                    }
                }
            }
        }

        FlushMultiline();

        if (name is null || id is null)
        {
            return null;
        }

        fields.TryGetValue("Description", out var description);
        fields.TryGetValue("Homepage", out var homepage);
        fields.TryGetValue("License", out var license);
        fields.TryGetValue("License Url", out var licenseUrl);
        fields.TryGetValue("Installer Type", out var installerType);
        fields.TryGetValue("Installer Url", out var installerUrl);
        fields.TryGetValue("Publisher", out var publisher);
        fields.TryGetValue("Version", out var version);

        return new PackageDetails(
            name,
            id,
            version,
            publisher,
            description,
            homepage,
            license,
            licenseUrl,
            installerType,
            installerUrl,
            tags,
            docs);

        void FlushMultiline()
        {
            if (currentMultilineKey is null)
            {
                return;
            }

            if (multilineBuilder.Length > 0)
            {
                fields[currentMultilineKey] = multilineBuilder.ToString().Trim();
                multilineBuilder.Clear();
            }

            currentMultilineKey = null;
        }
    }

    private static bool TryResolveWingetExecutable(out string executable, out string? errorMessage)
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "WindowsApps", WingetExecutable),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WindowsApps", "Microsoft.DesktopAppInstaller_8wekyb3d8bbwe", WingetExecutable),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), WingetExecutable)
        };

        var wingetPath = candidates.FirstOrDefault(File.Exists);

        if (wingetPath is null)
        {
            var pathEnv = Environment.GetEnvironmentVariable("PATH");
            if (!string.IsNullOrWhiteSpace(pathEnv))
            {
                foreach (var path in pathEnv.Split(Path.PathSeparator))
                {
                    var testPath = Path.Combine(path, WingetExecutable);
                    if (File.Exists(testPath))
                    {
                        wingetPath = testPath;
                        break;
                    }
                }
            }
        }

        if (wingetPath is null)
        {
            executable = WingetExecutable;
            errorMessage = "winget is not installed on this system.";
            return false;
        }

        executable = wingetPath;
        errorMessage = null;
        return true;
    }

    private static string FormatWingetOutput(ProcessResult result, bool succeeded)
    {
        var lines = result.StandardOutput
            .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(l => l.Trim())
            .Where(l => !string.IsNullOrWhiteSpace(l) && !IsSpinnerLine(l))
            .ToList();

        string? candidate = null;

        if (succeeded)
        {
            candidate = lines.FirstOrDefault(l =>
                l.Contains("Successfully", StringComparison.OrdinalIgnoreCase) ||
                l.Contains("completed", StringComparison.OrdinalIgnoreCase));

            if (string.IsNullOrWhiteSpace(candidate) && lines.Count > 0)
            {
                candidate = lines[^1];
            }

            var logHint = Directory.Exists(WingetLogDirectory)
                ? $" See winget logs under {WingetLogDirectory}."
                : string.Empty;

            return string.IsNullOrWhiteSpace(candidate)
                ? $"Command completed successfully. Exit code {result.ExitCode}.{logHint}"
                : $"{candidate}{logHint}";
        }

        if (!string.IsNullOrWhiteSpace(result.StandardError))
        {
            candidate = result.StandardError.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim())
                .FirstOrDefault(l => !string.IsNullOrWhiteSpace(l));
        }

        if (string.IsNullOrWhiteSpace(candidate) && lines.Count > 0)
        {
            candidate = lines[^1];
        }

        return string.IsNullOrWhiteSpace(candidate)
            ? $"winget failed with exit code {result.ExitCode}. See logs under {WingetLogDirectory}."
            : candidate;
    }

    private static bool IsSpinnerLine(string line)
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0)
        {
            return false;
        }

        return trimmed.All(c => c is '-' or '\\' or '/' or '|' or '.');
    }

    private class WingetJsonPackage
    {
        [System.Text.Json.Serialization.JsonPropertyName("Id")]
        public string? Id { get; set; }
        
        [System.Text.Json.Serialization.JsonPropertyName("Name")]
        public string? Name { get; set; }
        
        [System.Text.Json.Serialization.JsonPropertyName("Version")]
        public string? Version { get; set; }
        
        [System.Text.Json.Serialization.JsonPropertyName("Publisher")]
        public string? Publisher { get; set; }
        
        [System.Text.Json.Serialization.JsonPropertyName("Description")]
        public string? Description { get; set; }
    }
}


