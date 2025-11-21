using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WeaselHost;

public sealed class TrayApplicationContext : ApplicationContext
{
    private readonly WebServerManager _webServerManager;
    private readonly BrowserLauncher _browserLauncher;
    private readonly ILogger<TrayApplicationContext> _logger;
    private readonly NotifyIcon _notifyIcon;
    private readonly IHost _host;
    private bool _isShuttingDown;

    public TrayApplicationContext(
        WebServerManager webServerManager,
        BrowserLauncher browserLauncher,
        ILogger<TrayApplicationContext> logger,
        IHost host)
    {
        _webServerManager = webServerManager;
        _browserLauncher = browserLauncher;
        _logger = logger;
        _host = host;
        _notifyIcon = BuildNotifyIcon();

        Application.ApplicationExit += (_, _) => Cleanup();
        Application.ThreadExit += (_, _) => Cleanup();
        _ = InitializeAsync();
    }

    private NotifyIcon BuildNotifyIcon()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Web Console", null, (_, _) => OpenConsole());
        menu.Items.Add("Restart Web Server", null, async (_, _) => await RestartServerAsync());
        menu.Items.Add("Open Config Folder", null, (_, _) => OpenConfigFolder());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => 
        {
            ExitThread();
        });

        var iconPath = Path.Combine(AppContext.BaseDirectory, "Resources", "weasel.ico");
        var icon = File.Exists(iconPath)
            ? new Icon(iconPath)
            : SystemIcons.Application;

        var trayIcon = new NotifyIcon
        {
            Icon = icon,
            Visible = true,
            Text = "Weasel Remote Console",
            ContextMenuStrip = menu
        };

        trayIcon.DoubleClick += (_, _) => OpenConsole();
        return trayIcon;
    }

    private async Task InitializeAsync()
    {
        try
        {
            await _webServerManager.StartAsync();
            _notifyIcon.ShowBalloonTip(
                3000,
                "Weasel",
                $"Serving on {_webServerManager.DashboardUri}",
                ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start embedded web server.");
            MessageBox.Show(
                $"Failed to start web server: {ex.Message}",
                "Weasel",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private void OpenConsole()
    {
        _browserLauncher.Open(_webServerManager.DashboardUri);
    }

    private async Task RestartServerAsync()
    {
        try
        {
            await _webServerManager.RestartAsync();
            _notifyIcon.ShowBalloonTip(2000, "Weasel", "Web server restarted.", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to restart web server.");
            MessageBox.Show($"Unable to restart server: {ex.Message}", "Weasel", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OpenConfigFolder()
    {
        var configPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Weasel", "config");
        Directory.CreateDirectory(configPath);
        Process.Start(new ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = $"\"{configPath}\"",
            UseShellExecute = true
        });
    }

    protected override void ExitThreadCore()
    {
        // Start a failsafe timer - if shutdown takes >15 seconds, force exit
        var failsafeTimer = new System.Threading.Timer(_ =>
        {
            _logger.LogWarning("Shutdown timeout exceeded - forcing exit");
            Environment.Exit(1);
        }, null, TimeSpan.FromSeconds(15), Timeout.InfiniteTimeSpan);

        try
        {
            ShutdownAsync().GetAwaiter().GetResult();
        }
        finally
        {
            failsafeTimer.Dispose();
            // Force exit immediately after cleanup attempts
            Environment.Exit(0);
        }
    }

    private async Task ShutdownAsync()
    {
        if (_isShuttingDown)
        {
            return;
        }
        _isShuttingDown = true;

        _logger.LogInformation("Shutting down Weasel...");
        _notifyIcon.Visible = false;

        try
        {
            // Stop the web server with a short timeout - don't wait too long
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await _webServerManager.StopAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Web server stop timed out, forcing shutdown...");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error stopping web server during shutdown");
        }
        finally
        {
            try
            {
                await _webServerManager.DisposeAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error disposing web server manager during shutdown");
            }

            // Stop the host with a very short timeout - we're exiting anyway
            try
            {
                using var hostCts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await _host.StopAsync(hostCts.Token);
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("Host stop timed out during shutdown - will force exit");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error stopping host during shutdown");
            }

            _notifyIcon.Dispose();
            _logger.LogInformation("Weasel shutdown complete.");
        }
    }

    private void Cleanup()
    {
        if (!_isShuttingDown)
        {
            ShutdownAsync().GetAwaiter().GetResult();
        }
    }
}


