using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

public sealed class SettingsStore : ISettingsStore
{
    private readonly string _configPath;
    private readonly ILogger<SettingsStore> _logger;

    public SettingsStore(ILogger<SettingsStore> logger)
    {
        _logger = logger;
        _configPath = Path.Combine(AppContext.BaseDirectory, "config", "appsettings.json");
        _logger.LogInformation("SettingsStore initialized with config path: {ConfigPath}", _configPath);
    }

    public async Task SaveCaptureSettingsAsync(CaptureOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving capture settings: Folder={Folder}, Pattern={Pattern}, Interval={Interval}s",
                options.Folder, options.FileNamePattern, options.IntervalSeconds);

            JsonNode root;
            if (File.Exists(_configPath))
            {
                await using var stream = File.OpenRead(_configPath);
                var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
                root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
            }
            else
            {
                root = new JsonObject();
            }

            var WeaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
            root["WeaselHost"] = WeaselHostNode;

            var captureNode = WeaselHostNode["Capture"] as JsonObject ?? new JsonObject();
            captureNode["Folder"] = options.Folder;
            captureNode["TimedFolder"] = options.TimedFolder;
            captureNode["FileNamePattern"] = options.FileNamePattern;
            captureNode["EnableIntervalCapture"] = options.EnableIntervalCapture;
            captureNode["IntervalSeconds"] = options.IntervalSeconds;
            WeaselHostNode["Capture"] = captureNode;

            var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            await File.WriteAllTextAsync(_configPath, json, cancellationToken);
            // Force flush by writing again and waiting longer
            await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
            await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("Capture settings saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save capture settings");
            throw;
        }
    }

    public async Task SaveSecuritySettingsAsync(bool requireAuthentication, string? password, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving security settings: RequireAuth={RequireAuth}, PasswordSet={PasswordSet}",
                requireAuthentication, !string.IsNullOrWhiteSpace(password));

            JsonNode root;
            if (File.Exists(_configPath))
            {
                await using var stream = File.OpenRead(_configPath);
                var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
                root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
            }
            else
            {
                root = new JsonObject();
            }

            var weaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
            root["WeaselHost"] = weaselHostNode;

            var securityNode = weaselHostNode["Security"] as JsonObject ?? new JsonObject();
            securityNode["RequireAuthentication"] = requireAuthentication;
            if (!string.IsNullOrWhiteSpace(password))
            {
                securityNode["Password"] = password;
            }
            weaselHostNode["Security"] = securityNode;

            var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            await File.WriteAllTextAsync(_configPath, json, cancellationToken);
            // Force flush by writing again and waiting longer
            await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
            await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("Security settings saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save security settings");
            throw;
        }
    }

    public async Task SaveDiskMonitoringSettingsAsync(DiskMonitoringOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving disk monitoring settings: Enabled={Enabled}, Drives={DriveCount}, Folders={FolderCount}",
                options.Enabled, options.MonitoredDrives?.Count ?? 0, options.FolderMonitors?.Count ?? 0);

            JsonNode root;
            if (File.Exists(_configPath))
            {
                await using var stream = File.OpenRead(_configPath);
                var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
                root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
            }
            else
            {
                root = new JsonObject();
            }

            var weaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
            root["WeaselHost"] = weaselHostNode;

            var diskNode = weaselHostNode["DiskMonitoring"] as JsonObject ?? new JsonObject();
            diskNode["Enabled"] = options.Enabled;
            diskNode["MonitoredDrives"] = JsonNode.Parse(JsonSerializer.Serialize(options.MonitoredDrives)) ?? new JsonArray();
            diskNode["FolderMonitors"] = JsonNode.Parse(JsonSerializer.Serialize(options.FolderMonitors)) ?? new JsonArray();
            diskNode["NotificationRecipients"] = JsonNode.Parse(JsonSerializer.Serialize(options.NotificationRecipients)) ?? new JsonArray();

            weaselHostNode["DiskMonitoring"] = diskNode;

            var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            await File.WriteAllTextAsync(_configPath, json, cancellationToken);
            // Force flush by writing again and waiting longer
            await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
            await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("Disk monitoring settings saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save disk monitoring settings");
            throw;
        }
    }

    public async Task SaveSmtpSettingsAsync(SmtpOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving SMTP settings: Host={Host}, Port={Port}, SSL={EnableSsl}",
                options.Host, options.Port, options.EnableSsl);

            JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
            root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
        }
        else
        {
            root = new JsonObject();
        }

        var weaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
        root["WeaselHost"] = weaselHostNode;

        var smtpNode = weaselHostNode["Smtp"] as JsonObject ?? new JsonObject();
        smtpNode["Host"] = options.Host;
        smtpNode["Port"] = options.Port;
        smtpNode["EnableSsl"] = options.EnableSsl;
        smtpNode["Username"] = options.Username ?? (JsonNode?)null;
        smtpNode["Password"] = options.Password ?? (JsonNode?)null;
        smtpNode["FromAddress"] = options.FromAddress ?? (JsonNode?)null;
        smtpNode["FromName"] = options.FromName ?? (JsonNode?)null;
        weaselHostNode["Smtp"] = smtpNode;

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
        await File.WriteAllTextAsync(_configPath, json, cancellationToken);
        // Force flush by writing again and waiting longer
        await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
        await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("SMTP settings saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save SMTP settings");
            throw;
        }
    }

    public async Task SaveApplicationMonitorSettingsAsync(ApplicationMonitorOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving application monitor settings: Enabled={Enabled}, Apps={AppCount}",
                options.Enabled, options.Applications?.Count ?? 0);

            JsonNode root;
            if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
            root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
        }
        else
        {
            root = new JsonObject();
        }

        var weaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
        root["WeaselHost"] = weaselHostNode;

        var appMonitorNode = weaselHostNode["ApplicationMonitor"] as JsonObject ?? new JsonObject();
        appMonitorNode["Enabled"] = options.Enabled;
        appMonitorNode["Applications"] = JsonNode.Parse(JsonSerializer.Serialize(options.Applications)) ?? new JsonArray();
        appMonitorNode["NotificationRecipients"] = JsonNode.Parse(JsonSerializer.Serialize(options.NotificationRecipients)) ?? new JsonArray();

        weaselHostNode["ApplicationMonitor"] = appMonitorNode;

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
        await File.WriteAllTextAsync(_configPath, json, cancellationToken);
        // Force flush by writing again and waiting longer
        await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
        await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("Application monitor settings saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save application monitor settings");
            throw;
        }
    }

    public async Task SaveLoggingSettingsAsync(LoggingOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving logging settings: Folder={Folder}, Retention={RetentionDays}d, Level={MinLevel}",
                options.Folder, options.RetentionDays, options.MinimumLevel);

            JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
            root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
        }
        else
        {
            root = new JsonObject();
        }

        var weaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
        root["WeaselHost"] = weaselHostNode;

        var loggingNode = weaselHostNode["Logging"] as JsonObject ?? new JsonObject();
        loggingNode["Folder"] = options.Folder;
        loggingNode["RetentionDays"] = options.RetentionDays;
        loggingNode["MinimumLevel"] = options.MinimumLevel.ToString();
        loggingNode["MaxFileSizeBytes"] = options.MaxFileSizeBytes;
        loggingNode["MaxFilesPerDay"] = options.MaxFilesPerDay;
        loggingNode["EnableSizeRotation"] = options.EnableSizeRotation;
        
        // Save component-specific logging settings
        if (options.ComponentEnabled != null && options.ComponentEnabled.Count > 0)
        {
            var componentEnabledNode = new JsonObject();
            foreach (var kvp in options.ComponentEnabled)
            {
                componentEnabledNode[kvp.Key] = kvp.Value;
            }
            loggingNode["ComponentEnabled"] = componentEnabledNode;
        }

        // Save component-specific minimum log levels
        if (options.ComponentLevels != null && options.ComponentLevels.Count > 0)
        {
            var componentLevelsNode = new JsonObject();
            foreach (var kvp in options.ComponentLevels)
            {
                componentLevelsNode[kvp.Key] = kvp.Value.ToString();
            }
            loggingNode["ComponentLevels"] = componentLevelsNode;
        }

        weaselHostNode["Logging"] = loggingNode;

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
        await File.WriteAllTextAsync(_configPath, json, cancellationToken);
        // Force flush by writing again and waiting longer
        await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
        await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("Logging settings saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save logging settings");
            throw;
        }
    }

    public async Task SaveVncSettingsAsync(VncOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving VNC settings: Enabled={Enabled}, Port={Port}, AllowRemote={AllowRemote}",
                options.Enabled, options.Port, options.AllowRemote);

            JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
            root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
        }
        else
        {
            root = new JsonObject();
        }

        var weaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
        root["WeaselHost"] = weaselHostNode;

        var vncNode = weaselHostNode["Vnc"] as JsonObject ?? new JsonObject();
        vncNode["Enabled"] = options.Enabled;
        vncNode["Port"] = options.Port;
        vncNode["AllowRemote"] = options.AllowRemote;
        vncNode["AutoStart"] = options.AutoStart;
        // Store password only if provided (don't overwrite with null)
        if (!string.IsNullOrWhiteSpace(options.Password))
        {
            vncNode["Password"] = options.Password;
        }
        weaselHostNode["Vnc"] = vncNode;

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
        await File.WriteAllTextAsync(_configPath, json, cancellationToken);
        // Force flush by writing again and waiting longer
        await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
        await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("VNC settings saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save VNC settings");
            throw;
        }
    }

    public async Task SaveVncRecordingSettingsAsync(VncRecordingOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving VNC recording settings: RootFolder={RootFolder}, MaxDuration={MaxDuration}m, Retention={Retention}d",
                options.RootFolder, options.MaxRecordingDurationMinutes, options.RetentionDays);

            JsonNode root;
            if (File.Exists(_configPath))
            {
                await using var stream = File.OpenRead(_configPath);
                var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
                root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
            }
            else
            {
                root = new JsonObject();
            }

            var weaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
            root["WeaselHost"] = weaselHostNode;

            var vncNode = weaselHostNode["Vnc"] as JsonObject ?? new JsonObject();
            weaselHostNode["Vnc"] = vncNode;

            var recordingNode = vncNode["Recording"] as JsonObject ?? new JsonObject();
            recordingNode["RootFolder"] = options.RootFolder;
            recordingNode["MaxRecordingDurationMinutes"] = options.MaxRecordingDurationMinutes;
            recordingNode["RetentionDays"] = options.RetentionDays;
            recordingNode["EnableMotionDetection"] = options.EnableMotionDetection;
            recordingNode["MotionDetectionThresholdPercent"] = options.MotionDetectionThresholdPercent;
            recordingNode["MotionDetectionBlockSize"] = options.MotionDetectionBlockSize;
            recordingNode["RecordingFps"] = options.RecordingFps;
            recordingNode["UseProfileSubfolders"] = options.UseProfileSubfolders;
            vncNode["Recording"] = recordingNode;

            var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            await File.WriteAllTextAsync(_configPath, json, cancellationToken);
            // Force flush by writing again and waiting longer
            await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
            await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("VNC recording settings saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save VNC recording settings");
            throw;
        }
    }

    public async Task SaveUiPreferencesAsync(UiPreferencesOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving UI preferences: LogPanelCount={Count}",
                options.LogPanelExpanded?.Count ?? 0);

            JsonNode root;
            if (File.Exists(_configPath))
            {
                await using var stream = File.OpenRead(_configPath);
                var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
                root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
            }
            else
            {
                root = new JsonObject();
            }

            var weaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
            root["WeaselHost"] = weaselHostNode;

            var uiPrefsNode = weaselHostNode["UiPreferences"] as JsonObject ?? new JsonObject();
            uiPrefsNode["LogPanelExpanded"] = JsonNode.Parse(JsonSerializer.Serialize(options.LogPanelExpanded)) ?? new JsonObject();
            uiPrefsNode["Language"] = options.Language;
            uiPrefsNode["ScreenshotsFolderPageSize"] = options.ScreenshotsFolderPageSize;
            uiPrefsNode["FilesFolderPageSize"] = options.FilesFolderPageSize;
            uiPrefsNode["FilesFilesPageSize"] = options.FilesFilesPageSize;
            uiPrefsNode["PackagesPageSize"] = options.PackagesPageSize;

            weaselHostNode["UiPreferences"] = uiPrefsNode;

            var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            await File.WriteAllTextAsync(_configPath, json, cancellationToken);
            // Force flush by writing again and waiting longer
            await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
            await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("UI preferences saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save UI preferences");
            throw;
        }
    }

    public async Task SaveFileExplorerSettingsAsync(FileExplorerOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Saving File Explorer settings: HomeFolder={HomeFolder}", options.HomeFolder);

            JsonNode root;
            if (File.Exists(_configPath))
            {
                await using var stream = File.OpenRead(_configPath);
                var jsonDocOptions = new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
                root = await JsonNode.ParseAsync(stream, nodeOptions: null, jsonDocOptions, cancellationToken) ?? new JsonObject();
            }
            else
            {
                root = new JsonObject();
            }

            var weaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
            root["WeaselHost"] = weaselHostNode;

            var fileExplorerNode = weaselHostNode["FileExplorer"] as JsonObject ?? new JsonObject();
            fileExplorerNode["HomeFolder"] = options.HomeFolder;
            weaselHostNode["FileExplorer"] = fileExplorerNode;

            var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            await File.WriteAllTextAsync(_configPath, json, cancellationToken);
            // Force flush by writing again and waiting longer
            await File.WriteAllTextAsync(_configPath, json, CancellationToken.None);
            await Task.Delay(500, CancellationToken.None); // Give more time for file system and config reload

            _logger.LogInformation("File Explorer settings saved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save File Explorer settings");
            throw;
        }
    }
}


