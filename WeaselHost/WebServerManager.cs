using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core.Configuration;

namespace WeaselHost;

public sealed class WebServerManager : IAsyncDisposable
{
    private readonly IConfiguration _configuration;
    private readonly WeaselHostOptions _options;
    private readonly ILogger<WebServerManager> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private WebApplication? _webApplication;
    private Task? _lifetimeTask;
    private CancellationTokenSource? _cts;

    public WebServerManager(
        IConfiguration configuration,
        IOptions<WeaselHostOptions> options,
        ILogger<WebServerManager> logger)
    {
        _configuration = configuration;
        _options = options.Value;
        _logger = logger;
    }

    public Uri DashboardUri => new(_options.WebServer.GetUrl());

    public bool IsRunning => _lifetimeTask is { IsCompleted: false };

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (IsRunning)
            {
                return;
            }

            _logger.LogInformation("Starting embedded web server on {Url}", _options.WebServer.GetUrl());

            _webApplication = WeaselHost.Web.Program.BuildWebApplication(Array.Empty<string>(), builder =>
            {
                builder.Configuration.AddConfiguration(_configuration);
                builder.WebHost.UseUrls(_options.WebServer.GetUrl());
                builder.Environment.ContentRootPath = AppContext.BaseDirectory;
                builder.Environment.WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            });

            _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            await _webApplication.StartAsync(_cts.Token);
            _lifetimeTask = _webApplication.WaitForShutdownAsync(_cts.Token);

            _logger.LogInformation("Embedded web server started.");

            // Auto-start VNC server if enabled
            try
            {
                var vncService = _webApplication.Services.GetService<WeaselHost.Core.Abstractions.IVncService>();
                var vncOptions = _webApplication.Services.GetRequiredService<IOptionsMonitor<WeaselHostOptions>>().CurrentValue.Vnc;
                if (vncService != null && vncOptions.AutoStart && vncOptions.Enabled)
                {
                    _logger.LogInformation("Auto-starting VNC server on port {Port}", vncOptions.Port);
                    await vncService.StartAsync(vncOptions.Port, vncOptions.Password, vncOptions.AllowRemote, _cts.Token);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to auto-start VNC server");
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task RestartAsync(CancellationToken cancellationToken = default)
    {
        await StopAsync(cancellationToken);
        await StartAsync(cancellationToken);
    }

    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        var totalStopwatch = Stopwatch.StartNew();
        
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_webApplication is null)
            {
                _logger.LogInformation("SHUTDOWN TIMING: WebServerManager.StopAsync - web application already null");
                return;
            }

            _logger.LogInformation("Stopping embedded web server...");
            
            // Cancel the cancellation token to signal shutdown
            _cts?.Cancel();

            try
            {
                // Stop the web application (this will stop all hosted services)
                var stopAppStopwatch = Stopwatch.StartNew();
                await _webApplication.StopAsync(cancellationToken);
                stopAppStopwatch.Stop();
                _logger.LogInformation("SHUTDOWN TIMING: WebApplication.StopAsync completed in {ElapsedMs}ms", stopAppStopwatch.ElapsedMilliseconds);
                
                // Wait for the lifetime task to complete (all hosted services should stop)
                if (_lifetimeTask is not null)
                {
                    var lifetimeStopwatch = Stopwatch.StartNew();
                    // Reduced timeout from 10s to 3s to match service stop grace period
                    using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    timeoutCts.CancelAfter(TimeSpan.FromSeconds(3));
                    try
                    {
                        await _lifetimeTask.WaitAsync(timeoutCts.Token);
                        lifetimeStopwatch.Stop();
                        _logger.LogInformation("SHUTDOWN TIMING: Lifetime task completed in {ElapsedMs}ms", lifetimeStopwatch.ElapsedMilliseconds);
                    }
                    catch (OperationCanceledException)
                    {
                        lifetimeStopwatch.Stop();
                        _logger.LogWarning("SHUTDOWN TIMING: Lifetime task did not complete within 3000ms timeout (waited {ElapsedMs}ms)", lifetimeStopwatch.ElapsedMilliseconds);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during web application stop");
            }
            finally
            {
                // Dispose the web application (this will dispose all services)
                try
                {
                    var disposeStopwatch = Stopwatch.StartNew();
                    await _webApplication.DisposeAsync();
                    disposeStopwatch.Stop();
                    _logger.LogInformation("SHUTDOWN TIMING: WebApplication.DisposeAsync completed in {ElapsedMs}ms", disposeStopwatch.ElapsedMilliseconds);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error disposing web application");
                }
                
                _webApplication = null;
                _lifetimeTask = null;
                _cts?.Dispose();
                _cts = null;
            }
            
            totalStopwatch.Stop();
            _logger.LogInformation("SHUTDOWN TIMING: WebServerManager.StopAsync total time {ElapsedMs}ms", totalStopwatch.ElapsedMilliseconds);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
        _gate.Dispose();
    }
}


