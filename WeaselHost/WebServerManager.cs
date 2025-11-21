using System.Collections.Concurrent;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
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
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_webApplication is null)
            {
                return;
            }

            _logger.LogInformation("Stopping embedded web server...");
            
            // Cancel the cancellation token to signal shutdown
            _cts?.Cancel();

            try
            {
                // Stop the web application (this will stop all hosted services)
                await _webApplication.StopAsync(cancellationToken);
                
                // Wait for the lifetime task to complete (all hosted services should stop)
                if (_lifetimeTask is not null)
                {
                    using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    timeoutCts.CancelAfter(TimeSpan.FromSeconds(10));
                    try
                    {
                        await _lifetimeTask.WaitAsync(timeoutCts.Token);
                    }
                    catch (OperationCanceledException)
                    {
                        _logger.LogWarning("Lifetime task did not complete within timeout");
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
                    await _webApplication.DisposeAsync();
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
            
            _logger.LogInformation("Embedded web server stopped.");
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


