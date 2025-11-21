using System.Text.Json;
using Microsoft.Extensions.Logging;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Models;

namespace WeaselHost.Infrastructure.Services;

public sealed class PackageBundleService : IPackageBundleService
{
    private readonly string _bundlesPath;
    private readonly ILogger<PackageBundleService>? _logger;

    public PackageBundleService(ILogger<PackageBundleService>? logger = null)
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
            return Array.Empty<PackageBundle>();
        }

        try
        {
            await using var stream = File.OpenRead(_bundlesPath);
            var bundles = await JsonSerializer.DeserializeAsync<List<PackageBundle>>(stream, cancellationToken: cancellationToken);
            return (bundles ?? new List<PackageBundle>()).AsReadOnly();
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Failed to load bundles from {Path}", _bundlesPath);
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
        return bundle;
    }

    public async Task<PackageBundle> UpdateBundleAsync(string bundleId, string? name = null, string? description = null, List<BundlePackage>? packages = null, CancellationToken cancellationToken = default)
    {
        var bundles = (await GetAllBundlesAsync(cancellationToken)).ToList();
        var index = bundles.FindIndex(b => b.Id == bundleId);
        
        if (index < 0)
        {
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
        return updated;
    }

    public async Task DeleteBundleAsync(string bundleId, CancellationToken cancellationToken = default)
    {
        var bundles = (await GetAllBundlesAsync(cancellationToken)).ToList();
        bundles.RemoveAll(b => b.Id == bundleId);
        await SaveBundlesAsync(bundles, cancellationToken);
    }

    public async Task<IReadOnlyCollection<PackageOperationResult>> InstallBundleAsync(string bundleId, IPackageService packageService, CancellationToken cancellationToken = default)
    {
        var bundle = await GetBundleAsync(bundleId, cancellationToken);
        if (bundle == null)
        {
            throw new KeyNotFoundException($"Bundle with ID {bundleId} not found.");
        }

        var results = new List<PackageOperationResult>();
        foreach (var package in bundle.Packages)
        {
            try
            {
                var result = await packageService.InstallAsync(package.Id, cancellationToken);
                results.Add(result);
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Failed to install package {Id} from bundle {BundleId}", package.Id, bundleId);
                results.Add(new PackageOperationResult(false, -1, $"Failed to install {package.Id}: {ex.Message}"));
            }
        }

        return results.AsReadOnly();
    }

    private async Task SaveBundlesAsync(List<PackageBundle> bundles, CancellationToken cancellationToken)
    {
        var options = new JsonSerializerOptions { WriteIndented = true };
        var json = JsonSerializer.Serialize(bundles, options);
        Directory.CreateDirectory(Path.GetDirectoryName(_bundlesPath)!);
        await File.WriteAllTextAsync(_bundlesPath, json, cancellationToken);
    }
}

