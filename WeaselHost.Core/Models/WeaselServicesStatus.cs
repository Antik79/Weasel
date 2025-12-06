namespace WeaselHost.Core.Models;

/// <summary>
/// Aggregated status of all Weasel services for the dashboard.
/// </summary>
public record WeaselServicesStatus(
    VncServiceStatus Vnc,
    StorageMonitorStatus StorageMonitor,
    ApplicationMonitorStatus ApplicationMonitor,
    ScreenshotServiceStatus Screenshot,
    TerminalServiceStatus Terminal,
    VncRecordingsStatus Recordings);

/// <summary>
/// VNC server status and statistics.
/// </summary>
public record VncServiceStatus(
    bool IsRunning,
    int Port,
    int ConnectionCount,
    bool AllowRemote,
    int ActiveRecordingSessions,
    bool AutoStart,
    bool Enabled);

/// <summary>
/// Storage monitoring service status.
/// </summary>
public record StorageMonitorStatus(
    bool Enabled,
    bool IsRunning,
    int MonitoredDrivesCount,
    int MonitoredFoldersCount,
    int ActiveAlertsCount,
    DateTimeOffset? LastCheck);

/// <summary>
/// Application monitoring service status.
/// </summary>
public record ApplicationMonitorStatus(
    bool Enabled,
    int TotalApplicationsCount,
    int EnabledApplicationsCount,
    int CurrentlyRunningCount,
    int RecentRestartsCount);

/// <summary>
/// Screenshot/screen capture service status.
/// </summary>
public record ScreenshotServiceStatus(
    bool IntervalCaptureEnabled,
    int IntervalSeconds,
    int RecentScreenshotsCount,
    long TotalScreenshotsCount);

/// <summary>
/// Terminal service status.
/// </summary>
public record TerminalServiceStatus(
    int ActiveSessionsCount);

/// <summary>
/// VNC recordings status.
/// </summary>
public record VncRecordingsStatus(
    int TotalRecordingsCount,
    int RecentRecordingsCount,
    long TotalStorageBytes,
    int ActiveSessionsCount);
