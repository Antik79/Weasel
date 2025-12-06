using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

/// <summary>
/// Base class for background monitoring services that eliminates duplication of StartAsync/StopAsync logic.
/// </summary>
public abstract class BackgroundMonitoringServiceBase<T> : IHostedService
    where T : class
{
    protected readonly IOptionsMonitor<WeaselHostOptions> OptionsMonitor;
    protected readonly ILogger<T> Logger;
    protected CancellationTokenSource? CancellationTokenSource;
    protected Task? MonitoringTask;

    protected BackgroundMonitoringServiceBase(
        IOptionsMonitor<WeaselHostOptions> optionsMonitor,
        ILogger<T> logger)
    {
        OptionsMonitor = optionsMonitor;
        Logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        // IMPORTANT: Always start the loop - check Enabled inside
        CancellationTokenSource = new CancellationTokenSource();
        MonitoringTask = Task.Run(() => MonitorLoopAsync(CancellationTokenSource.Token), cancellationToken);
        Logger.LogInformation("{ServiceName} started", typeof(T).Name);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        Logger.LogInformation("SHUTDOWN TIMING: {ServiceName}.StopAsync starting", typeof(T).Name);
        
        CancellationTokenSource?.Cancel();
        Logger.LogInformation("SHUTDOWN TIMING: {ServiceName} cancellation requested at {ElapsedMs}ms", typeof(T).Name, stopwatch.ElapsedMilliseconds);

        if (MonitoringTask != null)
        {
            try
            {
                using var timeoutCts = new CancellationTokenSource(WeaselConstants.Timeouts.ServiceStopGracePeriod);
                await MonitoringTask.WaitAsync(timeoutCts.Token);
                Logger.LogInformation("SHUTDOWN TIMING: {ServiceName} monitoring task completed in {ElapsedMs}ms", typeof(T).Name, stopwatch.ElapsedMilliseconds);
            }
            catch (OperationCanceledException)
            {
                // Expected when cancelled or timeout
                Logger.LogWarning("SHUTDOWN TIMING: {ServiceName} task did not stop within {TimeoutMs}ms timeout - abandoning (waited {ElapsedMs}ms)", 
                    typeof(T).Name, WeaselConstants.Timeouts.ServiceStopGracePeriod.TotalMilliseconds, stopwatch.ElapsedMilliseconds);
            }
        }

        CancellationTokenSource?.Dispose();
        CancellationTokenSource = null;
        stopwatch.Stop();
        Logger.LogInformation("SHUTDOWN TIMING: {ServiceName}.StopAsync completed in {ElapsedMs}ms", typeof(T).Name, stopwatch.ElapsedMilliseconds);
    }

    /// <summary>
    /// Main monitoring loop. Override this method to implement service-specific monitoring logic.
    /// </summary>
    protected abstract Task MonitorLoopAsync(CancellationToken cancellationToken);
}
