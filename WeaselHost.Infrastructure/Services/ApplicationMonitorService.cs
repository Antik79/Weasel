using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Mail;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

public sealed class ApplicationMonitorService : IHostedService
{
    private readonly IOptionsMonitor<WeaselHostOptions> _optionsMonitor;
    private readonly ILogger<ApplicationMonitorService> _logger;
    private readonly IEmailService _emailService;
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastCheck = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastAlertSent = new();
    private long _lastProcessedEventRecordId = -1;
    private CancellationTokenSource? _cancellationTokenSource;
    private Task? _monitoringTask;

    public ApplicationMonitorService(
        IOptionsMonitor<WeaselHostOptions> optionsMonitor,
        ILogger<ApplicationMonitorService> logger,
        IEmailService emailService)
    {
        _optionsMonitor = optionsMonitor;
        _logger = logger;
        _emailService = emailService;
    }

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        var options = _optionsMonitor.CurrentValue.ApplicationMonitor;
        if (!options.Enabled)
        {
            return Task.CompletedTask;
        }

        _cancellationTokenSource = new CancellationTokenSource();
        _monitoringTask = Task.Run(() => MonitorLoopAsync(_cancellationTokenSource.Token), cancellationToken);
        _logger.LogInformation("Application monitoring started");
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        _cancellationTokenSource?.Cancel();

        if (_monitoringTask != null)
        {
            try
            {
                using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                await _monitoringTask.WaitAsync(timeoutCts.Token);
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("Application monitoring task did not stop within timeout - abandoning");
            }
        }

        _cancellationTokenSource?.Dispose();
        _cancellationTokenSource = null;
        _logger.LogInformation("Application monitoring stopped");
    }

    private async Task MonitorLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await CheckApplicationsAsync(cancellationToken);
                await CheckEventLogAsync(cancellationToken);
                // Check every 10 seconds
                await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in application monitoring loop");
                await Task.Delay(TimeSpan.FromMinutes(1), cancellationToken);
            }
        }
    }

    private async Task CheckApplicationsAsync(CancellationToken cancellationToken)
    {
        var options = _optionsMonitor.CurrentValue.ApplicationMonitor;
        if (!options.Enabled || options.Applications.Count == 0)
        {
            return;
        }

        var recipients = ResolveRecipients(options);

        foreach (var app in options.Applications)
        {
            if (!app.Enabled || string.IsNullOrWhiteSpace(app.ExecutablePath))
            {
                continue;
            }

            // Check if enough time has passed since last check for this app
            var lastCheck = _lastCheck.GetValueOrDefault(app.Id);
            var checkInterval = TimeSpan.FromSeconds(Math.Max(1, app.CheckIntervalSeconds));
            if (DateTimeOffset.UtcNow - lastCheck < checkInterval)
            {
                continue; // Skip this app, not time to check yet
            }

            _lastCheck[app.Id] = DateTimeOffset.UtcNow;

            try
            {
                if (!File.Exists(app.ExecutablePath))
                {
                    _logger.LogWarning("Monitored application executable not found: {Path}", app.ExecutablePath);
                    continue;
                }

                var processName = Path.GetFileNameWithoutExtension(app.ExecutablePath);
                var executablePath = Path.GetFullPath(app.ExecutablePath);
                var isRunning = false;
                
                try
                {
                    var processes = Process.GetProcessesByName(processName);
                    foreach (var p in processes)
                    {
                        try
                        {
                            // Try MainModule first (most accurate)
                            if (p.MainModule != null)
                            {
                                var mainModulePath = Path.GetFullPath(p.MainModule.FileName);
                                if (string.Equals(mainModulePath, executablePath, StringComparison.OrdinalIgnoreCase))
                                {
                                    isRunning = true;
                                    p.Dispose();
                                    break;
                                }
                            }
                        }
                        catch (System.ComponentModel.Win32Exception)
                        {
                            // Access denied - can't check MainModule, skip this process
                            // We'll rely on process name matching which is less accurate but works
                        }
                        catch
                        {
                            // Ignore and continue to next process
                        }
                        finally
                        {
                            p.Dispose();
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error checking if process {Name} is running", processName);
                }

                if (!isRunning)
                {
                    _logger.LogInformation("Application {Name} ({Path}) is not running, will restart after {Delay}s delay", 
                        app.Name, app.ExecutablePath, app.RestartDelaySeconds);
                    
                    // Wait for restart delay
                    await Task.Delay(TimeSpan.FromSeconds(Math.Max(0, app.RestartDelaySeconds)), cancellationToken);

                    // Check again - maybe it started on its own
                    var processes = Process.GetProcessesByName(processName);
                    isRunning = false;
                    foreach (var p in processes)
                    {
                        try
                        {
                            if (p.MainModule != null)
                            {
                                var mainModulePath = Path.GetFullPath(p.MainModule.FileName);
                                if (string.Equals(mainModulePath, executablePath, StringComparison.OrdinalIgnoreCase))
                                {
                                    isRunning = true;
                                    p.Dispose();
                                    break;
                                }
                            }
                        }
                        catch
                        {
                            // Ignore and continue
                        }
                        finally
                        {
                            p.Dispose();
                        }
                    }

                    if (!isRunning)
                    {
                        await RestartApplicationAsync(app, recipients, cancellationToken);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking application {Name}", app.Name);
            }
        }
    }

    private async Task RestartApplicationAsync(MonitoredApplication app, IReadOnlyList<string> recipients, CancellationToken cancellationToken)
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = app.ExecutablePath,
                UseShellExecute = true,
                WorkingDirectory = app.WorkingDirectory ?? Path.GetDirectoryName(app.ExecutablePath) ?? string.Empty
            };

            if (!string.IsNullOrWhiteSpace(app.Arguments))
            {
                startInfo.Arguments = app.Arguments;
            }

            _logger.LogInformation("Attempting to start application {Name} from {Path} with working directory {WorkingDir}", 
                app.Name, app.ExecutablePath, startInfo.WorkingDirectory);
            var process = Process.Start(startInfo);
            if (process != null)
            {
                _logger.LogInformation("Successfully restarted application {Name} (PID: {Pid})", app.Name, process.Id);
            }
            else
            {
                _logger.LogWarning("Process.Start returned null for application {Name} at {Path}", app.Name, app.ExecutablePath);
                throw new InvalidOperationException($"Failed to start process: Process.Start returned null");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to restart application {Name}", app.Name);
            
            // Send alert email
            await SendRestartFailureAlertAsync(app, ex, recipients, cancellationToken);
        }
    }

    private async Task CheckEventLogAsync(CancellationToken cancellationToken)
    {
        var options = _optionsMonitor.CurrentValue.ApplicationMonitor;
        if (!options.Enabled || options.Applications.Count == 0)
        {
            return;
        }

        try
        {
            var recipients = ResolveRecipients(options);
            using var eventLog = new System.Diagnostics.EventLog("Application");
            var entries = GetRecentEventLogEntries(eventLog)
                .Where(e => e.EntryType == EventLogEntryType.Error)
                .Where(e => e.TimeGenerated > DateTime.Now.AddMinutes(-10))
                .ToList();

            foreach (var app in options.Applications)
            {
                if (!app.Enabled || string.IsNullOrWhiteSpace(app.EventLogSource))
                {
                    continue;
                }

                var crashEntries = entries
                    .Where(e => string.Equals(e.Source, app.EventLogSource, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                if (crashEntries.Count > 0)
                {
                    var alertKey = $"crash:{app.Id}";
                    var lastAlert = _lastAlertSent.GetValueOrDefault(alertKey);
                    
                    // Send alert max once per hour per app
                    if (DateTimeOffset.UtcNow - lastAlert > TimeSpan.FromHours(1))
                    {
                        await SendCrashAlertAsync(app, crashEntries, recipients, cancellationToken);
                        _lastAlertSent[alertKey] = DateTimeOffset.UtcNow;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking event log for crashes");
        }
    }

    private async Task SendRestartFailureAlertAsync(MonitoredApplication app, Exception exception, IReadOnlyList<string> recipients, CancellationToken cancellationToken)
    {
        try
        {
            var smtp = _optionsMonitor.CurrentValue.Smtp;
            if (string.IsNullOrWhiteSpace(smtp.Host) || recipients.Count == 0)
            {
                return;
            }

            var subject = $"Weasel Application Monitor: Failed to Restart {app.Name}";
            var body = new StringBuilder();
            body.AppendLine($"Failed to restart monitored application on {Environment.MachineName}:");
            body.AppendLine();
            body.AppendLine($"Application: {app.Name}");
            body.AppendLine($"Path: {app.ExecutablePath}");
            body.AppendLine($"Error: {exception.Message}");
            body.AppendLine();
            body.AppendLine($"Time: {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss}");

            await _emailService.SendEmailAsync(
                subject,
                body.ToString(),
                new List<string>(recipients),
                cancellationToken);

            _logger.LogInformation("Sent restart failure alert for {Name}", app.Name);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send restart failure alert for {Name}", app.Name);
        }
    }

    private async Task SendCrashAlertAsync(MonitoredApplication app, List<System.Diagnostics.EventLogEntry> crashEntries, IReadOnlyList<string> recipients, CancellationToken cancellationToken)
    {
        try
        {
            var smtp = _optionsMonitor.CurrentValue.Smtp;
            if (string.IsNullOrWhiteSpace(smtp.Host) || recipients.Count == 0)
            {
                return;
            }

            var subject = $"Weasel Application Monitor: {app.Name} Crashed";
            var body = new StringBuilder();
            body.AppendLine($"Application crash detected on {Environment.MachineName}:");
            body.AppendLine();
            body.AppendLine($"Application: {app.Name}");
            body.AppendLine($"Path: {app.ExecutablePath}");
            body.AppendLine();
            body.AppendLine($"Recent crash events ({crashEntries.Count}):");
            foreach (var entry in crashEntries.Take(5))
            {
                body.AppendLine($"  • {entry.TimeGenerated:yyyy-MM-dd HH:mm:ss}: {entry.Message}");
            }
            body.AppendLine();
            body.AppendLine($"Time: {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss}");

            await _emailService.SendEmailAsync(
                subject,
                body.ToString(),
                new List<string>(recipients),
                cancellationToken);

            _logger.LogInformation("Sent crash alert for {Name}", app.Name);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send crash alert for {Name}", app.Name);
        }
    }

    private IReadOnlyList<string> ResolveRecipients(ApplicationMonitorOptions options)
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

    private IEnumerable<System.Diagnostics.EventLogEntry> GetRecentEventLogEntries(System.Diagnostics.EventLog eventLog)
    {
        if (eventLog.Entries.Count == 0)
        {
            _lastProcessedEventRecordId = -1;
            return Array.Empty<System.Diagnostics.EventLogEntry>();
        }

        if (_lastProcessedEventRecordId < 0)
        {
            _lastProcessedEventRecordId = eventLog.Entries[eventLog.Entries.Count - 1].Index;
            return Array.Empty<System.Diagnostics.EventLogEntry>();
        }

        var buffer = new List<System.Diagnostics.EventLogEntry>();
        for (var i = eventLog.Entries.Count - 1; i >= 0; i--)
        {
            var entry = eventLog.Entries[i];
            if (entry.Index <= _lastProcessedEventRecordId)
            {
                break;
            }

            buffer.Add(entry);

            if (buffer.Count >= 500)
            {
                break;
            }
        }

        if (buffer.Count == 0)
        {
            return Array.Empty<System.Diagnostics.EventLogEntry>();
        }

        _lastProcessedEventRecordId = Math.Max(_lastProcessedEventRecordId, buffer[0].Index);
        buffer.Reverse(); // ensure chronological order
        return buffer;
    }
}

