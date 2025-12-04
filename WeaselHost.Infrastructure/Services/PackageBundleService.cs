using System.Text.Json;
using Microsoft.Extensions.Logging;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Models;

namespace WeaselHost.Infrastructure.Services;

public sealed class PackageBundleService : IPackageBundleService
{
    private readonly string _bundlesPath;
    private readonly ILogger<PackageBundleService> _logger;

    public PackageBundleService(ILogger<PackageBundleService> logger)
    {
        _logger = logger;
        var configDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Weasel", "config");
        Directory.CreateDirectory(configDir);
        _bundlesPath = Path.Combine(configDir, "bundles.json");
    }

    public async Task<IReadOnlyCollection<PackageBundle>> GetAllBundlesAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_bundlesPath))
        {
            _logger.LogDebug("Bundles file does not exist: {Path}", _bundlesPath);
            return Array.Empty<PackageBundle>();
        }

        try
        {
            _logger.LogInformation("Loading package bundles from: {Path}", _bundlesPath);
            await using var stream = File.OpenRead(_bundlesPath);
            var bundles = await JsonSerializer.DeserializeAsync<List<PackageBundle>>(stream, cancellationToken: cancellationToken);
            _logger.LogInformation("Loaded {Count} package bundles", bundles?.Count ?? 0);
            return (bundles ?? new List<PackageBundle>()).AsReadOnly();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load bundles from {Path}", _bundlesPath);
            return Array.Empty<PackageBundle>();
        }
    }

    public async Task<PackageBundle?> GetBundleAsync(string bundleId, CancellationToken cancellationToken = default)
    {
        var bundles = await GetAllBundlesAsync(cancellationToken);
        return bundles.FirstOrDefault(b => b.Id == bundleId);
    }

    public async Task<PackageBundle> CreateBundleAsync(string name, string description, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Creating new package bundle: {Name}", name);
        var bundles = (await GetAllBundlesAsync(cancellationToken)).ToList();
        var bundle = new PackageBundle(
            Id: Guid.NewGuid().ToString(),
            Name: name,
            Description: description,
            Packages: new List<BundlePackage>(),
            CreatedAt: DateTimeOffset.UtcNow,
            UpdatedAt: DateTimeOffset.UtcNow);

        bundles.Add(bundle);
        await SaveBundlesAsync(bundles, cancellationToken);
        _logger.LogInformation("Package bundle created successfully: {BundleId} - {Name}", bundle.Id, name);
        return bundle;
    }

    public async Task<PackageBundle> UpdateBundleAsync(string bundleId, string? name = null, string? description = null, List<BundlePackage>? packages = null, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Updating package bundle: {BundleId}", bundleId);
        var bundles = (await GetAllBundlesAsync(cancellationToken)).ToList();
        var index = bundles.FindIndex(b => b.Id == bundleId);

        if (index < 0)
        {
            _logger.LogWarning("Bundle not found: {BundleId}", bundleId);
            throw new KeyNotFoundException($"Bundle with ID {bundleId} not found.");
        }

        var existing = bundles[index];
        var updated = existing with
        {
            Name = name ?? existing.Name,
            Description = description ?? existing.Description,
            Packages = packages ?? existing.Packages,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        bundles[index] = updated;
        await SaveBundlesAsync(bundles, cancellationToken);
        _logger.LogInformation("Package bundle updated successfully: {BundleId} - {Name}", bundleId, updated.Name);
        return updated;
    }

    public async Task DeleteBundleAsync(string bundleId, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Deleting package bundle: {BundleId}", bundleId);
        var bundles = (await GetAllBundlesAsync(cancellationToken)).ToList();
        var removed = bundles.RemoveAll(b => b.Id == bundleId);
        await SaveBundlesAsync(bundles, cancellationToken);
        _logger.LogInformation("Package bundle deleted successfully: {BundleId} ({Removed} removed)", bundleId, removed);
    }

    public async Task<IReadOnlyCollection<PackageOperationResult>> InstallBundleAsync(string bundleId, IPackageService packageService, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Installing package bundle: {BundleId}", bundleId);
        var bundle = await GetBundleAsync(bundleId, cancellationToken);
        if (bundle == null)
        {
            _logger.LogWarning("Bundle not found for installation: {BundleId}", bundleId);
            throw new KeyNotFoundException($"Bundle with ID {bundleId} not found.");
        }

        _logger.LogInformation("Installing {Count} packages from bundle: {BundleName}", bundle.Packages.Count, bundle.Name);
        var results = new List<PackageOperationResult>();
        foreach (var package in bundle.Packages)
        {
            try
            {
                _logger.LogInformation("Installing package {PackageId} from bundle {BundleId}", package.Id, bundleId);
                var result = await packageService.InstallAsync(package.Id, cancellationToken);
                results.Add(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to install package {Id} from bundle {BundleId}", package.Id, bundleId);
                results.Add(new PackageOperationResult(false, -1, $"Failed to install {package.Id}: {ex.Message}"));
            }
        }

        var successCount = results.Count(r => r.Succeeded);
        _logger.LogInformation("Bundle installation completed: {SuccessCount}/{TotalCount} packages installed successfully", successCount, results.Count);
        return results.AsReadOnly();
    }

    private async Task SaveBundlesAsync(List<PackageBundle> bundles, CancellationToken cancellationToken)
    {
        _logger.LogDebug("Saving {Count} bundles to: {Path}", bundles.Count, _bundlesPath);
        var options = new JsonSerializerOptions { WriteIndented = true };
        var json = JsonSerializer.Serialize(bundles, options);
        Directory.CreateDirectory(Path.GetDirectoryName(_bundlesPath)!);
        await File.WriteAllTextAsync(_bundlesPath, json, cancellationToken);
        _logger.LogDebug("Bundles saved successfully");
    }
}

