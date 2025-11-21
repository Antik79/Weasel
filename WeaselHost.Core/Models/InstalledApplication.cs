namespace WeaselHost.Core.Models;

public record InstalledApplication(
    string DisplayName,
    string Identifier,
    string Version,
    string Publisher,
    bool IsSystemComponent);

public record PackageOperationResult(
    bool Succeeded,
    int ExitCode,
    string Message);

public record PackageSearchResult(
    string Id,
    string Name,
    string Version,
    string Publisher,
    string? Description);

public record PackageDetails(
    string Name,
    string Id,
    string? Version,
    string? Publisher,
    string? Description,
    string? Homepage,
    string? License,
    string? LicenseUrl,
    string? InstallerType,
    string? InstallerUrl,
    IReadOnlyCollection<string> Tags,
    IReadOnlyCollection<string> DocumentationLinks);

public record PackageShowResponse(
    bool Success,
    string? Message,
    PackageDetails? Package,
    IReadOnlyCollection<PackageSearchResult> Alternatives);


