using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;
using WeaselHost.Core.Models;

namespace WeaselHost.Infrastructure.Services;

/// <summary>
/// Service that collects system metrics at regular intervals and provides historical data for charts.
/// Also aggregates Weasel services status for the dashboard.
/// </summary>
public sealed class SystemMetricsService : BackgroundMonitoringServiceBase<SystemMetricsService>, ISystemMetricsService
{
    private const int MaxDataPoints = 60; // 5 minutes at 5-second intervals
    private static readonly TimeSpan CollectionInterval = TimeSpan.FromSeconds(5);

    private readonly ISystemInfoService _systemInfoService;
    private readonly IVncService _vncService;
    private readonly IDiskMonitorService _diskMonitorService;
    private readonly IScreenshotService _screenshotService;
    private readonly ITerminalService _terminalService;
    private readonly IVncRecordingService _vncRecordingService;

    private readonly ConcurrentQueue<MetricPoint> _cpuHistory = new();
    private readonly ConcurrentQueue<MetricPoint> _memoryHistory = new();
    private SystemStatus? _latestStatus;
    private readonly object _statusLock = new();

    public SystemMetricsService(
        IOptionsMonitor<WeaselHostOptions> optionsMonitor,
        ILogger<SystemMetricsService> logger,
        ISystemInfoService systemInfoService,
        IVncService vncService,
        IDiskMonitorService diskMonitorService,
        IScreenshotService screenshotService,
        ITerminalService terminalService,
        IVncRecordingService vncRecordingService)
        : base(optionsMonitor, logger)
    {
        _systemInfoService = systemInfoService;
        _vncService = vncService;
        _diskMonitorService = diskMonitorService;
        _screenshotService = screenshotService;
        _terminalService = terminalService;
        _vncRecordingService = vncRecordingService;
    }

    protected override async Task MonitorLoopAsync(CancellationToken cancellationToken)
    {
        Logger.LogInformation("SystemMetricsService: Starting metrics collection");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await CollectMetricsAsync(cancellationToken);
                await Task.Delay(CollectionInterval, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Logger.LogError(ex, "Error collecting system metrics");
                await Task.Delay(WeaselConstants.Intervals.ErrorRetryDelay, cancellationToken);
            }
        }

        Logger.LogInformation("SystemMetricsService: Stopped metrics collection");
    }

    private async Task CollectMetricsAsync(CancellationToken cancellationToken)
    {
        var status = await _systemInfoService.GetStatusAsync(cancellationToken);
        var timestamp = DateTimeOffset.UtcNow;

        // Add to history
        _cpuHistory.Enqueue(new MetricPoint(status.CpuUsagePercent, timestamp));
        _memoryHistory.Enqueue(new MetricPoint(status.MemoryUsagePercent, timestamp));

        // Trim to max data points
        while (_cpuHistory.Count > MaxDataPoints)
        {
            _cpuHistory.TryDequeue(out _);
        }
        while (_memoryHistory.Count > MaxDataPoints)
        {
            _memoryHistory.TryDequeue(out _);
        }

        // Store latest status
        lock (_statusLock)
        {
            _latestStatus = status;
        }
    }

    public async Task<SystemMetrics> GetMetricsAsync(CancellationToken cancellationToken = default)
    {
        SystemStatus current;
        lock (_statusLock)
        {
            current = _latestStatus ?? new SystemStatus(
                "Unknown",
                "127.0.0.1",
                0,
                0,
                Array.Empty<DriveStatus>(),
                DateTimeOffset.UtcNow);
        }

        // If no data yet, collect fresh
        if (_cpuHistory.IsEmpty)
        {
            current = await _systemInfoService.GetStatusAsync(cancellationToken);
        }

        return new SystemMetrics(
            current,
            _cpuHistory.ToArray(),
            _memoryHistory.ToArray());
    }

    public async Task<WeaselServicesStatus> GetWeaselServicesStatusAsync(CancellationToken cancellationToken = default)
    {
        var options = OptionsMonitor.CurrentValue;

        // Get VNC status
        var vncStatus = await _vncService.GetStatusAsync(cancellationToken);
        var vncOptions = options.Vnc;

        // Get disk monitor status
        var diskMonitorStatus = await _diskMonitorService.GetStatusAsync(cancellationToken);
        var diskOptions = options.DiskMonitoring;

        // Get application monitor options (no service interface for this yet)
        var appMonitorOptions = options.ApplicationMonitor;

        // Get screenshot service status
        var captureOptions = options.Capture;
        var screenshotStats = await GetScreenshotStatsAsync(cancellationToken);

        // Get terminal sessions count
        var terminalSessions = _terminalService.GetActiveSessions();

        // Get VNC recordings status
        var recordingsStats = await GetRecordingsStatsAsync(cancellationToken);

        return new WeaselServicesStatus(
            Vnc: new VncServiceStatus(
                IsRunning: vncStatus.IsRunning,
                Port: vncStatus.Port,
                ConnectionCount: vncStatus.ConnectionCount,
                AllowRemote: vncStatus.AllowRemote,
                ActiveRecordingSessions: recordingsStats.ActiveSessionsCount,
                AutoStart: vncOptions.AutoStart,
                Enabled: vncOptions.Enabled),
            StorageMonitor: new StorageMonitorStatus(
                Enabled: diskOptions.Enabled,
                IsRunning: diskMonitorStatus.IsRunning,
                MonitoredDrivesCount: diskOptions.MonitoredDrives.Count(d => d.Enabled),
                MonitoredFoldersCount: diskOptions.FolderMonitors.Count(f => f.Enabled),
                ActiveAlertsCount: diskMonitorStatus.DriveStatuses.Count(d => d.IsBelowThreshold),
                LastCheck: diskMonitorStatus.LastCheck),
            ApplicationMonitor: new ApplicationMonitorStatus(
                Enabled: appMonitorOptions.Enabled,
                TotalApplicationsCount: appMonitorOptions.Applications.Count,
                EnabledApplicationsCount: appMonitorOptions.Applications.Count(a => a.Enabled),
                CurrentlyRunningCount: 0, // Would need to track this in ApplicationMonitorService
                RecentRestartsCount: 0),  // Would need to track this in ApplicationMonitorService
            Screenshot: new ScreenshotServiceStatus(
                IntervalCaptureEnabled: captureOptions.EnableIntervalCapture,
                IntervalSeconds: captureOptions.IntervalSeconds,
                RecentScreenshotsCount: screenshotStats.RecentCount,
                TotalScreenshotsCount: screenshotStats.TotalCount),
            Terminal: new TerminalServiceStatus(
                ActiveSessionsCount: terminalSessions.Count),
            Recordings: recordingsStats);
    }

    private Task<(int RecentCount, long TotalCount)> GetScreenshotStatsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var options = OptionsMonitor.CurrentValue.Capture;
            var screenshotFolder = Path.GetFullPath(options.Folder);
            
            if (!Directory.Exists(screenshotFolder))
            {
                return Task.FromResult((0, 0L));
            }

            var files = Directory.GetFiles(screenshotFolder, "*.png", SearchOption.AllDirectories);
            var totalCount = (long)files.Length;

            // Count screenshots from last 24 hours
            var cutoff = DateTime.UtcNow.AddHours(-24);
            var recentCount = files.Count(f => File.GetCreationTimeUtc(f) > cutoff);

            return Task.FromResult((recentCount, totalCount));
        }
        catch (Exception ex)
        {
            Logger.LogWarning(ex, "Failed to get screenshot statistics");
            return Task.FromResult((0, 0L));
        }
    }

    private async Task<VncRecordingsStatus> GetRecordingsStatsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var recordings = await _vncRecordingService.GetRecordingsAsync(null, cancellationToken);
            var activeSessions = await _vncRecordingService.GetActiveSessionsAsync(cancellationToken);

            var totalCount = recordings.Count;
            var cutoff = DateTimeOffset.UtcNow.AddDays(-7);
            var recentCount = recordings.Count(r => r.StartedAt > cutoff);
            var totalBytes = recordings.Sum(r => r.FileSizeBytes);

            return new VncRecordingsStatus(
                TotalRecordingsCount: totalCount,
                RecentRecordingsCount: recentCount,
                TotalStorageBytes: totalBytes,
                ActiveSessionsCount: activeSessions.Count);
        }
        catch (Exception ex)
        {
            Logger.LogWarning(ex, "Failed to get VNC recordings statistics");
            return new VncRecordingsStatus(0, 0, 0, 0);
        }
    }
}
