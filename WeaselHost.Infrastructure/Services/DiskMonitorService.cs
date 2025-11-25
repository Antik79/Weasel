using System.Collections.Concurrent;
using System.Net;
using System.Net.Mail;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

public sealed class DiskMonitorService : IDiskMonitorService, IHostedService
{
    private readonly IOptionsMonitor<WeaselHostOptions> _optionsMonitor;
    private readonly ILogger<DiskMonitorService> _logger;
    private readonly IEmailService _emailService;
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastAlertSent = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastDriveCheck = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastFolderCheck = new();
    private CancellationTokenSource? _cancellationTokenSource;
    private Task? _monitoringTask;

    public DiskMonitorService(
        IOptionsMonitor<WeaselHostOptions> optionsMonitor,
        ILogger<DiskMonitorService> logger,
        IEmailService emailService)
    {
        _optionsMonitor = optionsMonitor;
        _logger = logger;
        _emailService = emailService;
    }

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        var options = _optionsMonitor.CurrentValue.DiskMonitoring;
        if (!options.Enabled)
        {
            return Task.CompletedTask;
        }

        _cancellationTokenSource = new CancellationTokenSource();
        _monitoringTask = Task.Run(() => MonitorLoopAsync(_cancellationTokenSource.Token), cancellationToken);
        _logger.LogInformation("Disk monitoring started");
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        _cancellationTokenSource?.Cancel();

        if (_monitoringTask != null)
        {
            try
            {
                // Wait for the monitoring task with a 3-second timeout
                using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                await _monitoringTask.WaitAsync(timeoutCts.Token);
            }
            catch (OperationCanceledException)
            {
                // Expected when cancelled or timeout
                _logger.LogWarning("Disk monitoring task did not stop within timeout - abandoning");
            }
        }

        _cancellationTokenSource?.Dispose();
        _cancellationTokenSource = null;
        _logger.LogInformation("Disk monitoring stopped");
    }

    public Task<DiskMonitoringStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var options = _optionsMonitor.CurrentValue.DiskMonitoring;
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
            _monitoringTask?.IsCompleted == false,
            DateTimeOffset.UtcNow,
            driveStatuses));
    }

    public async Task UpdateConfigurationAsync(DiskMonitoringOptions options, CancellationToken cancellationToken = default)
    {
        // Configuration is updated via IOptionsMonitor, so we just need to restart if needed
        var wasRunning = _monitoringTask?.IsCompleted == false;
        if (wasRunning)
        {
            await StopAsync(cancellationToken);
        }

        if (options.Enabled)
        {
            await StartAsync(cancellationToken);
        }
    }

    private async Task MonitorLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await CheckDisksAsync(cancellationToken);
                await CheckFoldersAsync(cancellationToken);
                // Use a short base interval and check each drive/folder based on its own interval
                await Task.Delay(TimeSpan.FromMinutes(1), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in disk monitoring loop");
                await Task.Delay(TimeSpan.FromMinutes(5), cancellationToken);
            }
        }
    }

    private async Task CheckDisksAsync(CancellationToken cancellationToken)
    {
        var options = _optionsMonitor.CurrentValue.DiskMonitoring;
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
                if (DateTimeOffset.UtcNow - lastAlert > TimeSpan.FromHours(1))
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
        var options = _optionsMonitor.CurrentValue.DiskMonitoring;
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
                    _logger.LogWarning("Folder monitor path does not exist: {Path}", folderMonitor.Path);
                    continue;
                }

                var folderSize = CalculateFolderSize(folderMonitor.Path);
                
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
                    if (DateTimeOffset.UtcNow - lastAlert > TimeSpan.FromHours(1))
                    {
                        alerts.Add((folderMonitor.Path, folderSize, thresholdDirection));
                        _lastAlertSent[alertKey] = DateTimeOffset.UtcNow;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking folder size for {Path}", folderMonitor.Path);
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

    private static long CalculateFolderSize(string path)
    {
        long size = 0;
        try
        {
            var directoryInfo = new DirectoryInfo(path);
            foreach (var file in directoryInfo.GetFiles("*", SearchOption.AllDirectories))
            {
                try
                {
                    size += file.Length;
                }
                catch
                {
                    // Skip files we can't access
                }
            }
        }
        catch
        {
            // Return 0 if we can't calculate
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

            _logger.LogInformation("Sent disk space alerts to {Count} recipients", recipients.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send disk space alerts");
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

            _logger.LogInformation("Sent folder size alerts to {Count} recipients", recipients.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send folder size alerts");
        }
    }

    private IReadOnlyList<string> ResolveRecipients(DiskMonitoringOptions options)
    {
        if (options.NotificationRecipients is { Count: > 0 })
        {
            return options.NotificationRecipients;
        }

        var fallback = _optionsMonitor.CurrentValue.Smtp.FromAddress;
        if (!string.IsNullOrWhiteSpace(fallback))
        {
            return new[] { fallback };
        }

        return Array.Empty<string>();
    }
}

