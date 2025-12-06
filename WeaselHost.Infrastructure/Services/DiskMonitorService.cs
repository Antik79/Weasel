using System.Collections.Concurrent;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

public sealed class DiskMonitorService : BackgroundMonitoringServiceBase<DiskMonitorService>, IDiskMonitorService
{
    private readonly IEmailService _emailService;
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastAlertSent = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastDriveCheck = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastFolderCheck = new();

    public DiskMonitorService(
        IOptionsMonitor<WeaselHostOptions> optionsMonitor,
        ILogger<DiskMonitorService> logger,
        IEmailService emailService)
        : base(optionsMonitor, logger)
    {
        _emailService = emailService;
    }

    public Task<DiskMonitoringStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var options = OptionsMonitor.CurrentValue.DiskMonitoring;
        var driveStatuses = new List<DriveAlertStatus>();

        if (options.Enabled)
        {
            var drives = DriveInfo.GetDrives()
                .Where(d => d.DriveType == DriveType.Fixed && d.IsReady)
                .ToList();

            foreach (var drive in drives)
            {
                var driveName = drive.Name.TrimEnd('\\');
                var monitorConfig = options.MonitoredDrives.FirstOrDefault(m => 
                    string.Equals(m.DriveName, driveName, StringComparison.OrdinalIgnoreCase));
                
                if (monitorConfig == null || !monitorConfig.Enabled)
                {
                    continue;
                }

                var totalBytes = drive.TotalSize;
                var freeBytes = drive.TotalFreeSpace;
                var freePercent = totalBytes > 0 ? (freeBytes * 100.0 / totalBytes) : 0;
                
            var isBelowThreshold = false;
            if (monitorConfig.ThresholdPercent.HasValue)
            {
                isBelowThreshold = freePercent < monitorConfig.ThresholdPercent.Value;
            }
            else if (monitorConfig.ThresholdBytes.HasValue)
            {
                isBelowThreshold = freeBytes < monitorConfig.ThresholdBytes.Value;
            }
                
                var lastAlert = _lastAlertSent.TryGetValue(driveName, out var last) ? last : (DateTimeOffset?)null;

                driveStatuses.Add(new DriveAlertStatus(
                    driveName,
                    totalBytes,
                    freeBytes,
                    freePercent,
                    isBelowThreshold,
                    lastAlert));
            }
        }

        return Task.FromResult(new DiskMonitoringStatus(
            MonitoringTask?.IsCompleted == false,
            DateTimeOffset.UtcNow,
            driveStatuses));
    }

    public Task UpdateConfigurationAsync(DiskMonitoringOptions options, CancellationToken cancellationToken = default)
    {
        // Configuration is updated via IOptionsMonitor, so the monitoring loop will pick up changes automatically
        Logger.LogInformation("Disk monitoring configuration updated");
        return Task.CompletedTask;
    }

    protected override async Task MonitorLoopAsync(CancellationToken cancellationToken)
    {
        var lastStatusLog = DateTimeOffset.MinValue;

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var options = OptionsMonitor.CurrentValue.DiskMonitoring;

                if (options.Enabled)
                {
                    await CheckDisksAsync(cancellationToken);
                    await CheckFoldersAsync(cancellationToken);

                    // Log periodic status (every 5 minutes when enabled)
                    if (DateTimeOffset.UtcNow - lastStatusLog > TimeSpan.FromMinutes(5))
                    {
                        var driveCount = options.MonitoredDrives.Count(d => d.Enabled);
                        var folderCount = options.FolderMonitors.Count(f => f.Enabled);
                        Logger.LogInformation("DiskMonitor: Checked {DriveCount} drives and {FolderCount} folders, all OK", 
                            driveCount, folderCount);
                        lastStatusLog = DateTimeOffset.UtcNow;
                    }
                }
                else
                {
                    // Log when disabled (less frequently - every 10 minutes)
                    if (DateTimeOffset.UtcNow - lastStatusLog > TimeSpan.FromMinutes(10))
                    {
                        Logger.LogInformation("DiskMonitor: Service is disabled");
                        lastStatusLog = DateTimeOffset.UtcNow;
                    }
                }

                await Task.Delay(WeaselConstants.Intervals.DiskMonitorLoop, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Logger.LogError(ex, "Error in disk monitoring loop");
                await Task.Delay(WeaselConstants.Intervals.ErrorRetryDelay, cancellationToken);
            }
        }
    }

    private async Task CheckDisksAsync(CancellationToken cancellationToken)
    {
        var options = OptionsMonitor.CurrentValue.DiskMonitoring;
        if (!options.Enabled || options.MonitoredDrives.Count == 0)
        {
            return;
        }

        var drives = DriveInfo.GetDrives()
            .Where(d => d.DriveType == DriveType.Fixed && d.IsReady)
            .ToList();

        var alerts = new List<(string DriveName, long FreeBytes, double FreePercent)>();

        foreach (var drive in drives)
        {
            var driveName = drive.Name.TrimEnd('\\');
            var monitorConfig = options.MonitoredDrives.FirstOrDefault(m => 
                string.Equals(m.DriveName, driveName, StringComparison.OrdinalIgnoreCase));
            
            if (monitorConfig == null || !monitorConfig.Enabled)
            {
                continue;
            }

            // Check if enough time has passed since last check for this drive
            var lastCheck = _lastDriveCheck.GetValueOrDefault(driveName);
            var checkInterval = TimeSpan.FromMinutes(Math.Max(1, monitorConfig.CheckIntervalMinutes));
            if (DateTimeOffset.UtcNow - lastCheck < checkInterval)
            {
                continue; // Skip this drive, not time to check yet
            }

            _lastDriveCheck[driveName] = DateTimeOffset.UtcNow;

            var totalBytes = drive.TotalSize;
            var freeBytes = drive.TotalFreeSpace;
            var freePercent = totalBytes > 0 ? (freeBytes * 100.0 / totalBytes) : 0;

            var isBelowThreshold = false;
            if (monitorConfig.ThresholdPercent.HasValue)
            {
                isBelowThreshold = freePercent < monitorConfig.ThresholdPercent.Value;
            }
            else if (monitorConfig.ThresholdBytes.HasValue)
            {
                isBelowThreshold = freeBytes < monitorConfig.ThresholdBytes.Value;
            }

            if (isBelowThreshold)
            {
                // Check if we should send an alert (avoid spam - send max once per hour per drive)
                var lastAlert = _lastAlertSent.GetValueOrDefault(driveName);
                if (DateTimeOffset.UtcNow - lastAlert > WeaselConstants.Alerts.ThrottleInterval)
                {
                    alerts.Add((driveName, freeBytes, freePercent));
                    _lastAlertSent[driveName] = DateTimeOffset.UtcNow;
                }
            }
        }

        if (alerts.Count > 0)
        {
            var recipients = ResolveRecipients(options);
            if (recipients.Count > 0)
            {
                await SendAlertsAsync(alerts, recipients, cancellationToken);
            }
        }
    }

    private async Task CheckFoldersAsync(CancellationToken cancellationToken)
    {
        var options = OptionsMonitor.CurrentValue.DiskMonitoring;
        if (!options.Enabled || options.FolderMonitors.Count == 0)
        {
            return;
        }

        var alerts = new List<(string Path, long SizeBytes, string ThresholdDirection)>();

        foreach (var folderMonitor in options.FolderMonitors)
        {
            if (!folderMonitor.Enabled || string.IsNullOrWhiteSpace(folderMonitor.Path))
            {
                continue;
            }

            // Check if enough time has passed since last check for this folder
            var lastCheck = _lastFolderCheck.GetValueOrDefault(folderMonitor.Path);
            var checkInterval = TimeSpan.FromMinutes(Math.Max(1, folderMonitor.CheckIntervalMinutes));
            if (DateTimeOffset.UtcNow - lastCheck < checkInterval)
            {
                continue; // Skip this folder, not time to check yet
            }

            _lastFolderCheck[folderMonitor.Path] = DateTimeOffset.UtcNow;

            try
            {
                if (!Directory.Exists(folderMonitor.Path))
                {
                    Logger.LogWarning("Folder monitor path does not exist: {Path}", folderMonitor.Path);
                    continue;
                }

                var folderSize = CalculateFolderSize(folderMonitor.Path, cancellationToken);
                
                // Check threshold based on direction (Over or Under)
                var thresholdDirection = folderMonitor.ThresholdDirection ?? "Over";
                var isThresholdExceeded = thresholdDirection.Equals("Under", StringComparison.OrdinalIgnoreCase)
                    ? folderSize < folderMonitor.ThresholdBytes
                    : folderSize > folderMonitor.ThresholdBytes;
                
                if (isThresholdExceeded)
                {
                    // Check if we should send an alert (avoid spam - send max once per hour per folder)
                    var alertKey = $"folder:{folderMonitor.Path}";
                    var lastAlert = _lastAlertSent.GetValueOrDefault(alertKey);
                    if (DateTimeOffset.UtcNow - lastAlert > WeaselConstants.Alerts.ThrottleInterval)
                    {
                        alerts.Add((folderMonitor.Path, folderSize, thresholdDirection));
                        _lastAlertSent[alertKey] = DateTimeOffset.UtcNow;
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.LogError(ex, "Error checking folder size for {Path}", folderMonitor.Path);
            }
        }

        if (alerts.Count > 0)
        {
            var recipients = ResolveRecipients(options);
            if (recipients.Count > 0)
            {
                await SendFolderAlertsAsync(alerts, recipients, cancellationToken);
            }
        }
    }

    private static long CalculateFolderSize(string path, CancellationToken cancellationToken = default)
    {
        long size = 0;
        int fileCount = 0;
        try
        {
            var directoryInfo = new DirectoryInfo(path);
            foreach (var file in directoryInfo.EnumerateFiles("*", SearchOption.AllDirectories))
            {
                // Check cancellation every 100 files for responsiveness during shutdown
                if (++fileCount % 100 == 0)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                }
                
                try
                {
                    size += file.Length;
                }
                catch (UnauthorizedAccessException)
                {
                    // Skip files we can't access due to permissions
                }
                catch (IOException)
                {
                    // Skip files that are locked or inaccessible
                }
            }
        }
        catch (UnauthorizedAccessException)
        {
            // Cannot access directory - return 0
        }
        catch (DirectoryNotFoundException)
        {
            // Directory was deleted - return 0
        }
        return size;
    }

    private async Task SendAlertsAsync(
        List<(string DriveName, long FreeBytes, double FreePercent)> alerts,
        IReadOnlyList<string> recipients,
        CancellationToken cancellationToken)
    {
        try
        {
            var subject = $"Weasel Disk Alert: Low Disk Space Detected";
            var body = new StringBuilder();
            body.AppendLine($"Low disk space detected on {Environment.MachineName}:");
            body.AppendLine();

            foreach (var (driveName, freeBytes, freePercent) in alerts)
            {
                var freeGB = freeBytes / (1024.0 * 1024.0 * 1024.0);
                body.AppendLine($"  • {driveName}: {freePercent:F1}% free ({freeGB:F2} GB)");
            }

            body.AppendLine();
            body.AppendLine($"Time: {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss}");

            await _emailService.SendEmailAsync(
                subject,
                body.ToString(),
                new List<string>(recipients),
                cancellationToken);

            Logger.LogInformation("Sent disk space alerts to {Count} recipients", recipients.Count);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Failed to send disk space alerts");
        }
    }

    private async Task SendFolderAlertsAsync(
        List<(string Path, long SizeBytes, string ThresholdDirection)> alerts,
        IReadOnlyList<string> recipients,
        CancellationToken cancellationToken)
    {
        try
        {
            // Group alerts by direction for better email formatting
            var overAlerts = alerts.Where(a => a.ThresholdDirection.Equals("Over", StringComparison.OrdinalIgnoreCase)).ToList();
            var underAlerts = alerts.Where(a => a.ThresholdDirection.Equals("Under", StringComparison.OrdinalIgnoreCase)).ToList();

            var subject = new StringBuilder("Weasel Disk Alert: Folder Size Threshold");
            if (overAlerts.Count > 0 && underAlerts.Count > 0)
            {
                subject.Append("s");
            }
            else if (overAlerts.Count > 0)
            {
                subject.Append(" Exceeded");
            }
            else
            {
                subject.Append(" Below Minimum");
            }

            var body = new StringBuilder();
            body.AppendLine($"Folder size threshold alert on {Environment.MachineName}:");
            body.AppendLine();

            if (overAlerts.Count > 0)
            {
                body.AppendLine("Folders exceeding threshold:");
                foreach (var (path, sizeBytes, _) in overAlerts)
                {
                    var sizeGB = sizeBytes / (1024.0 * 1024.0 * 1024.0);
                    body.AppendLine($"  • {path}: {sizeGB:F2} GB");
                }
                body.AppendLine();
            }

            if (underAlerts.Count > 0)
            {
                body.AppendLine("Folders below minimum threshold:");
                foreach (var (path, sizeBytes, _) in underAlerts)
                {
                    var sizeGB = sizeBytes / (1024.0 * 1024.0 * 1024.0);
                    body.AppendLine($"  • {path}: {sizeGB:F2} GB");
                }
                body.AppendLine();
            }

            body.AppendLine($"Time: {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss}");

            await _emailService.SendEmailAsync(
                subject.ToString(),
                body.ToString(),
                new List<string>(recipients),
                cancellationToken);

            Logger.LogInformation("Sent folder size alerts to {Count} recipients", recipients.Count);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Failed to send folder size alerts");
        }
    }

    private IReadOnlyList<string> ResolveRecipients(DiskMonitoringOptions options)
    {
        if (options.NotificationRecipients is { Count: > 0 })
        {
            return options.NotificationRecipients;
        }

        var fallback = OptionsMonitor.CurrentValue.Smtp.FromAddress;
        if (!string.IsNullOrWhiteSpace(fallback))
        {
            return new[] { fallback };
        }

        return Array.Empty<string>();
    }
}

