namespace WeaselHost.Core.Models;

public record PackageBundle(
    string Id,
    string Name,
    string Description,
    List<BundlePackage> Packages,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record BundlePackage(
    string Id,
    string Name,
    string? Version = null,
    string? Publisher = null);

