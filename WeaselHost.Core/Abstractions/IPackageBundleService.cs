using WeaselHost.Core.Models;

namespace WeaselHost.Core.Abstractions;

public interface IPackageBundleService
{
    Task<IReadOnlyCollection<PackageBundle>> GetAllBundlesAsync(CancellationToken cancellationToken = default);
    Task<PackageBundle?> GetBundleAsync(string bundleId, CancellationToken cancellationToken = default);
    Task<PackageBundle> CreateBundleAsync(string name, string description, CancellationToken cancellationToken = default);
    Task<PackageBundle> UpdateBundleAsync(string bundleId, string? name = null, string? description = null, List<BundlePackage>? packages = null, CancellationToken cancellationToken = default);
    Task DeleteBundleAsync(string bundleId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PackageOperationResult>> InstallBundleAsync(string bundleId, IPackageService packageService, CancellationToken cancellationToken = default);
}

