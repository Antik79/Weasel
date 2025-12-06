using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.Linq;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.DependencyInjection;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;
using ShutdownStopwatch = System.Diagnostics.Stopwatch;

namespace WeaselHost;

public sealed class TrayApplicationContext : ApplicationContext
{
    private readonly WebServerManager _webServerManager;
    private readonly BrowserLauncher _browserLauncher;
    private readonly ILogger<TrayApplicationContext> _logger;
    private readonly NotifyIcon _notifyIcon;
    private readonly IHost _host;
    private readonly IServiceProvider _serviceProvider;
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
        _serviceProvider = host.Services;
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
        
        // Application Monitor submenu
        var appMonitorMenu = new ToolStripMenuItem("Application Monitor");
        var appMonitorToggle = new ToolStripMenuItem("Global Monitor", null, async (_, _) => await ToggleApplicationMonitorGlobalAsync());
        appMonitorMenu.DropDownItems.Add(appMonitorToggle);
        appMonitorMenu.DropDownItems.Add(new ToolStripSeparator());
        appMonitorMenu.DropDownItems.Add("Configure Applications...", null, (_, _) => OpenConsoleToTab("tools", "application-monitor"));
        menu.Items.Add(appMonitorMenu);

        // Storage Monitor submenu
        var storageMonitorMenu = new ToolStripMenuItem("Storage Monitor");
        var storageMonitorToggle = new ToolStripMenuItem("Global Monitor", null, async (_, _) => await ToggleStorageMonitorGlobalAsync());
        storageMonitorMenu.DropDownItems.Add(storageMonitorToggle);
        storageMonitorMenu.DropDownItems.Add(new ToolStripSeparator());
        storageMonitorMenu.DropDownItems.Add("Configure Monitors...", null, (_, _) => OpenConsoleToTab("tools", "storage-monitor"));
        menu.Items.Add(storageMonitorMenu);
        
        // VNC Server toggle
        var vncMenuItem = new ToolStripMenuItem("VNC Server");
        var vncToggleItem = new ToolStripMenuItem("Start VNC Server", null, async (_, _) => await ToggleVncServerAsync());
        vncMenuItem.DropDownItems.Add(vncToggleItem);
        vncMenuItem.DropDownItems.Add(new ToolStripSeparator());
        vncMenuItem.DropDownItems.Add("Configure...", null, (_, _) => OpenConsoleToTab("settings", "vnc"));
        menu.Items.Add(vncMenuItem);
        
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => 
        {
            ExitThread();
        });
        
        // Update menu items on opening
        menu.Opening += (_, _) => UpdateMenuItems(menu, appMonitorMenu, storageMonitorMenu, vncMenuItem);

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

    private void OpenConsoleToTab(string tab, string? subTab = null)
    {
        var baseUri = _webServerManager.DashboardUri;
        var url = subTab != null ? $"{baseUri}#/{tab}/{subTab}" : $"{baseUri}#/{tab}";
        _browserLauncher.Open(new Uri(url));
    }

    private void UpdateMenuItems(ContextMenuStrip menu, ToolStripMenuItem appMonitorMenu, ToolStripMenuItem storageMonitorMenu, ToolStripMenuItem vncMenuItem)
    {
        try
        {
            var optionsMonitor = _serviceProvider.GetRequiredService<IOptionsMonitor<WeaselHostOptions>>();
            var options = optionsMonitor.CurrentValue;
            
            // Update Application Monitor global toggle
            var appMonitorGlobalItem = appMonitorMenu.DropDownItems[0] as ToolStripMenuItem;
            if (appMonitorGlobalItem != null)
            {
                appMonitorGlobalItem.Checked = options.ApplicationMonitor.Enabled;
                appMonitorGlobalItem.Text = $"Global Monitor ({(options.ApplicationMonitor.Enabled ? "Enabled" : "Disabled")})";
            }
            
            // Update per-application toggles
            // Remove old per-application items (keep global toggle and separator and configure item)
            while (appMonitorMenu.DropDownItems.Count > 3)
            {
                appMonitorMenu.DropDownItems.RemoveAt(1); // Remove items before the separator
            }
            
            if (options.ApplicationMonitor.Applications != null && options.ApplicationMonitor.Applications.Count > 0)
            {
                // Insert per-application toggles before the separator
                for (int i = 0; i < options.ApplicationMonitor.Applications.Count; i++)
                {
                    var app = options.ApplicationMonitor.Applications[i];
                    var appId = app.Id;
                    var appName = string.IsNullOrWhiteSpace(app.Name) ? app.ExecutablePath : app.Name;
                    var appItem = new ToolStripMenuItem($"{appName} {(app.Enabled ? "✓" : "✗")}")
                    {
                        Checked = app.Enabled
                    };
                    appItem.Click += async (_, _) => await ToggleApplicationMonitorItemAsync(appId);
                    appMonitorMenu.DropDownItems.Insert(1 + i, appItem);
                }
                // Add separator before configure if we have applications
                if (appMonitorMenu.DropDownItems.Count > 1 + options.ApplicationMonitor.Applications.Count)
                {
                    appMonitorMenu.DropDownItems.Insert(1 + options.ApplicationMonitor.Applications.Count, new ToolStripSeparator());
                }
            }
            
            // Update Storage Monitor global toggle
            var storageMonitorGlobalItem = storageMonitorMenu.DropDownItems[0] as ToolStripMenuItem;
            if (storageMonitorGlobalItem != null)
            {
                storageMonitorGlobalItem.Checked = options.DiskMonitoring.Enabled;
                storageMonitorGlobalItem.Text = $"Global Monitor ({(options.DiskMonitoring.Enabled ? "Enabled" : "Disabled")})";
            }
            
            // Update per-drive/folder toggles
            // Remove old per-drive/folder items (keep global toggle and separator and configure item)
            while (storageMonitorMenu.DropDownItems.Count > 3)
            {
                storageMonitorMenu.DropDownItems.RemoveAt(1); // Remove items before the separator
            }
            
            int itemIndex = 1;
            
            // Add drive monitors
            if (options.DiskMonitoring.MonitoredDrives != null && options.DiskMonitoring.MonitoredDrives.Count > 0)
            {
                foreach (var drive in options.DiskMonitoring.MonitoredDrives)
                {
                    var driveItem = new ToolStripMenuItem($"{drive.DriveName} {(drive.Enabled ? "✓" : "✗")}")
                    {
                        Checked = drive.Enabled
                    };
                    driveItem.Click += async (_, _) => await ToggleStorageMonitorDriveAsync(drive.DriveName);
                    storageMonitorMenu.DropDownItems.Insert(itemIndex++, driveItem);
                }
            }
            
            // Add folder monitors
            if (options.DiskMonitoring.FolderMonitors != null && options.DiskMonitoring.FolderMonitors.Count > 0)
            {
                if (itemIndex > 1)
                {
                    storageMonitorMenu.DropDownItems.Insert(itemIndex++, new ToolStripSeparator());
                }
                foreach (var folder in options.DiskMonitoring.FolderMonitors)
                {
                    var folderName = Path.GetFileName(folder.Path) ?? folder.Path;
                    var folderItem = new ToolStripMenuItem($"{folderName} {(folder.Enabled ? "✓" : "✗")}")
                    {
                        Checked = folder.Enabled
                    };
                    folderItem.Click += async (_, _) => await ToggleStorageMonitorFolderAsync(folder.Path);
                    storageMonitorMenu.DropDownItems.Insert(itemIndex++, folderItem);
                }
            }
            
            // Add separator before configure if we have monitors
            if (itemIndex > 1 && storageMonitorMenu.DropDownItems.Count > itemIndex)
            {
                storageMonitorMenu.DropDownItems.Insert(itemIndex, new ToolStripSeparator());
            }
            
            // Update VNC Server toggle
            var vncToggleItem = vncMenuItem.DropDownItems[0] as ToolStripMenuItem;
            if (vncToggleItem != null)
            {
                try
                {
                    var vncService = _serviceProvider.GetService<IVncService>();
                    if (vncService != null)
                    {
                        // Use ConfigureAwait(false) to avoid deadlock in UI context
                        var status = vncService.GetStatusAsync(CancellationToken.None).ConfigureAwait(false).GetAwaiter().GetResult();
                        vncToggleItem.Checked = status.IsRunning;
                        vncToggleItem.Text = status.IsRunning ? "Stop VNC Server" : "Start VNC Server";
                    }
                    else
                    {
                        // Fallback to config if service not available
                        vncToggleItem.Checked = options.Vnc.Enabled;
                        vncToggleItem.Text = options.Vnc.Enabled ? "Stop VNC Server" : "Start VNC Server";
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to get VNC status for menu update");
                    // Fallback to config
                    vncToggleItem.Checked = options.Vnc.Enabled;
                    vncToggleItem.Text = options.Vnc.Enabled ? "Stop VNC Server" : "Start VNC Server";
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update tray menu items");
        }
    }

    private async Task ToggleApplicationMonitorGlobalAsync()
    {
        try
        {
            var optionsMonitor = _serviceProvider.GetRequiredService<IOptionsMonitor<WeaselHostOptions>>();
            var settingsStore = _serviceProvider.GetRequiredService<ISettingsStore>();
            var options = optionsMonitor.CurrentValue;
            
            var newConfig = new ApplicationMonitorOptions
            {
                Enabled = !options.ApplicationMonitor.Enabled,
                Applications = options.ApplicationMonitor.Applications,
                NotificationRecipients = options.ApplicationMonitor.NotificationRecipients
            };
            
            await settingsStore.SaveApplicationMonitorSettingsAsync(newConfig, CancellationToken.None);
            
            _notifyIcon.ShowBalloonTip(
                2000,
                "Weasel",
                $"Application Monitor {(newConfig.Enabled ? "enabled" : "disabled")}.",
                ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle Application Monitor");
            MessageBox.Show($"Failed to toggle Application Monitor: {ex.Message}", "Weasel", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task ToggleStorageMonitorGlobalAsync()
    {
        try
        {
            var optionsMonitor = _serviceProvider.GetRequiredService<IOptionsMonitor<WeaselHostOptions>>();
            var settingsStore = _serviceProvider.GetRequiredService<ISettingsStore>();
            var diskMonitorService = _serviceProvider.GetRequiredService<IDiskMonitorService>();
            var options = optionsMonitor.CurrentValue;
            
            var newConfig = new DiskMonitoringOptions
            {
                Enabled = !options.DiskMonitoring.Enabled,
                MonitoredDrives = options.DiskMonitoring.MonitoredDrives ?? new List<DriveMonitorConfig>(),
                FolderMonitors = options.DiskMonitoring.FolderMonitors ?? new List<FolderMonitorOptions>(),
                NotificationRecipients = options.DiskMonitoring.NotificationRecipients ?? new List<string>()
            };
            
            await settingsStore.SaveDiskMonitoringSettingsAsync(newConfig, CancellationToken.None);
            await diskMonitorService.UpdateConfigurationAsync(newConfig, CancellationToken.None);
            
            _notifyIcon.ShowBalloonTip(
                2000,
                "Weasel",
                $"Storage Monitor {(newConfig.Enabled ? "enabled" : "disabled")}.",
                ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle Storage Monitor");
            MessageBox.Show($"Failed to toggle Storage Monitor: {ex.Message}", "Weasel", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task ToggleApplicationMonitorItemAsync(string applicationId)
    {
        try
        {
            var optionsMonitor = _serviceProvider.GetRequiredService<IOptionsMonitor<WeaselHostOptions>>();
            var settingsStore = _serviceProvider.GetRequiredService<ISettingsStore>();
            var options = optionsMonitor.CurrentValue;
            
            var app = options.ApplicationMonitor.Applications?.FirstOrDefault(a => a.Id == applicationId);
            if (app == null) return;
            
            app.Enabled = !app.Enabled;
            
            var newConfig = new ApplicationMonitorOptions
            {
                Enabled = options.ApplicationMonitor.Enabled,
                Applications = options.ApplicationMonitor.Applications ?? new List<MonitoredApplication>(),
                NotificationRecipients = options.ApplicationMonitor.NotificationRecipients ?? new List<string>()
            };
            
            await settingsStore.SaveApplicationMonitorSettingsAsync(newConfig, CancellationToken.None);
            
            var appName = string.IsNullOrWhiteSpace(app.Name) ? app.ExecutablePath : app.Name;
            _notifyIcon.ShowBalloonTip(
                2000,
                "Weasel",
                $"Application Monitor: {appName} {(app.Enabled ? "enabled" : "disabled")}.",
                ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle Application Monitor item");
            MessageBox.Show($"Failed to toggle application: {ex.Message}", "Weasel", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task ToggleStorageMonitorDriveAsync(string driveName)
    {
        try
        {
            var optionsMonitor = _serviceProvider.GetRequiredService<IOptionsMonitor<WeaselHostOptions>>();
            var settingsStore = _serviceProvider.GetRequiredService<ISettingsStore>();
            var diskMonitorService = _serviceProvider.GetRequiredService<IDiskMonitorService>();
            var options = optionsMonitor.CurrentValue;
            
            var drive = options.DiskMonitoring.MonitoredDrives?.FirstOrDefault(d => d.DriveName == driveName);
            if (drive == null) return;
            
            drive.Enabled = !drive.Enabled;
            
            var newConfig = new DiskMonitoringOptions
            {
                Enabled = options.DiskMonitoring.Enabled,
                MonitoredDrives = options.DiskMonitoring.MonitoredDrives ?? new List<DriveMonitorConfig>(),
                FolderMonitors = options.DiskMonitoring.FolderMonitors ?? new List<FolderMonitorOptions>(),
                NotificationRecipients = options.DiskMonitoring.NotificationRecipients ?? new List<string>()
            };
            
            await settingsStore.SaveDiskMonitoringSettingsAsync(newConfig, CancellationToken.None);
            await diskMonitorService.UpdateConfigurationAsync(newConfig, CancellationToken.None);
            
            _notifyIcon.ShowBalloonTip(
                2000,
                "Weasel",
                $"Storage Monitor: {driveName} {(drive.Enabled ? "enabled" : "disabled")}.",
                ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle Storage Monitor drive");
            MessageBox.Show($"Failed to toggle drive monitor: {ex.Message}", "Weasel", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task ToggleStorageMonitorFolderAsync(string folderPath)
    {
        try
        {
            var optionsMonitor = _serviceProvider.GetRequiredService<IOptionsMonitor<WeaselHostOptions>>();
            var settingsStore = _serviceProvider.GetRequiredService<ISettingsStore>();
            var diskMonitorService = _serviceProvider.GetRequiredService<IDiskMonitorService>();
            var options = optionsMonitor.CurrentValue;
            
            var folder = options.DiskMonitoring.FolderMonitors?.FirstOrDefault(f => f.Path == folderPath);
            if (folder == null) return;
            
            folder.Enabled = !folder.Enabled;
            
            var newConfig = new DiskMonitoringOptions
            {
                Enabled = options.DiskMonitoring.Enabled,
                MonitoredDrives = options.DiskMonitoring.MonitoredDrives ?? new List<DriveMonitorConfig>(),
                FolderMonitors = options.DiskMonitoring.FolderMonitors ?? new List<FolderMonitorOptions>(),
                NotificationRecipients = options.DiskMonitoring.NotificationRecipients ?? new List<string>()
            };
            
            await settingsStore.SaveDiskMonitoringSettingsAsync(newConfig, CancellationToken.None);
            await diskMonitorService.UpdateConfigurationAsync(newConfig, CancellationToken.None);
            
            var folderName = Path.GetFileName(folderPath) ?? folderPath;
            _notifyIcon.ShowBalloonTip(
                2000,
                "Weasel",
                $"Storage Monitor: {folderName} {(folder.Enabled ? "enabled" : "disabled")}.",
                ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle Storage Monitor folder");
            MessageBox.Show($"Failed to toggle folder monitor: {ex.Message}", "Weasel", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task ToggleVncServerAsync()
    {
        try
        {
            var vncService = _serviceProvider.GetRequiredService<IVncService>();
            var optionsMonitor = _serviceProvider.GetRequiredService<IOptionsMonitor<WeaselHostOptions>>();
            var settingsStore = _serviceProvider.GetRequiredService<ISettingsStore>();
            var options = optionsMonitor.CurrentValue;
            
            var status = await vncService.GetStatusAsync(CancellationToken.None);
            
            if (status.IsRunning)
            {
                await vncService.StopAsync(CancellationToken.None);
                _notifyIcon.ShowBalloonTip(2000, "Weasel", "VNC server stopped.", ToolTipIcon.Info);
            }
            else
            {
                if (!options.Vnc.Enabled)
                {
                    // Enable VNC first
                    var vncOptions = new VncOptions
                    {
                        Enabled = true,
                        Port = options.Vnc.Port,
                        AllowRemote = options.Vnc.AllowRemote,
                        AutoStart = options.Vnc.AutoStart,
                        Password = options.Vnc.Password
                    };
                    await settingsStore.SaveVncSettingsAsync(vncOptions, CancellationToken.None);
                }
                
                await vncService.StartAsync(options.Vnc.Port, options.Vnc.Password, options.Vnc.AllowRemote, CancellationToken.None);
                _notifyIcon.ShowBalloonTip(2000, "Weasel", "VNC server started.", ToolTipIcon.Info);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle VNC server");
            MessageBox.Show($"Failed to toggle VNC server: {ex.Message}", "Weasel", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
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

        var totalStopwatch = ShutdownStopwatch.StartNew();
        _logger.LogInformation("Shutting down Weasel...");
        _notifyIcon.Visible = false;

        try
        {
            // Stop the web server with a short timeout - don't wait too long
            var webServerStopwatch = ShutdownStopwatch.StartNew();
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await _webServerManager.StopAsync(cts.Token);
            webServerStopwatch.Stop();
            _logger.LogInformation("SHUTDOWN TIMING: WebServerManager.StopAsync completed in {ElapsedMs}ms", webServerStopwatch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("SHUTDOWN TIMING: Web server stop timed out after 5000ms, forcing shutdown...");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error stopping web server during shutdown");
        }
        finally
        {
            try
            {
                var disposeStopwatch = ShutdownStopwatch.StartNew();
                await _webServerManager.DisposeAsync();
                disposeStopwatch.Stop();
                _logger.LogInformation("SHUTDOWN TIMING: WebServerManager.DisposeAsync completed in {ElapsedMs}ms", disposeStopwatch.ElapsedMilliseconds);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error disposing web server manager during shutdown");
            }

            // Stop the host with a very short timeout - we're exiting anyway
            try
            {
                var hostStopwatch = ShutdownStopwatch.StartNew();
                using var hostCts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await _host.StopAsync(hostCts.Token);
                hostStopwatch.Stop();
                _logger.LogInformation("SHUTDOWN TIMING: IHost.StopAsync completed in {ElapsedMs}ms", hostStopwatch.ElapsedMilliseconds);
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("SHUTDOWN TIMING: Host stop timed out after 2000ms - will force exit");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error stopping host during shutdown");
            }

            _notifyIcon.Dispose();
            totalStopwatch.Stop();
            _logger.LogInformation("SHUTDOWN TIMING: Total shutdown completed in {ElapsedMs}ms", totalStopwatch.ElapsedMilliseconds);
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


