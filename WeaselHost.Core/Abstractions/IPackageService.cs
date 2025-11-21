using WeaselHost.Core.Models;

namespace WeaselHost.Core.Abstractions;

public interface IPackageService
{
    Task<IReadOnlyCollection<InstalledApplication>> GetInstalledApplicationsAsync(
        CancellationToken cancellationToken = default);

    Task<PackageOperationResult> InstallAsync(
        string packageIdentifierOrPath,
        CancellationToken cancellationToken = default);

    Task<PackageOperationResult> UninstallAsync(
        string packageIdentifierOrProductCode,
        CancellationToken cancellationToken = default);

    Task<PackageShowResponse> ShowAsync(
        string identifierOrMoniker,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<PackageSearchResult>> SearchAsync(
        string query,
        CancellationToken cancellationToken = default);
}


