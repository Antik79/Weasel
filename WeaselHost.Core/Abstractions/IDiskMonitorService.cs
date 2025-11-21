using WeaselHost.Core.Configuration;

namespace WeaselHost.Core.Abstractions;

public interface IDiskMonitorService
{
    Task StartAsync(CancellationToken cancellationToken = default);

    Task StopAsync(CancellationToken cancellationToken = default);

    Task<DiskMonitoringStatus> GetStatusAsync(CancellationToken cancellationToken = default);

    Task UpdateConfigurationAsync(DiskMonitoringOptions options, CancellationToken cancellationToken = default);
}

public record DiskMonitoringStatus(
    bool IsRunning,
    DateTimeOffset? LastCheck,
    List<DriveAlertStatus> DriveStatuses);

public record DriveAlertStatus(
    string DriveName,
    long TotalBytes,
    long FreeBytes,
    double FreePercent,
    bool IsBelowThreshold,
    DateTimeOffset? LastAlertSent);

