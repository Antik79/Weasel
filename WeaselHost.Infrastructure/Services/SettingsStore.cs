using System.Text.Json;
using System.Text.Json.Nodes;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

public sealed class SettingsStore : ISettingsStore
{
    private readonly string _configPath;

    public SettingsStore()
    {
        _configPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Weasel", "config", "appsettings.json");
    }

    public async Task SaveCaptureSettingsAsync(CaptureOptions options, CancellationToken cancellationToken = default)
    {
        JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            root = await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken) ?? new JsonObject();
        }
        else
        {
            root = new JsonObject();
        }

        var WeaselHostNode = root["WeaselHost"] as JsonObject ?? new JsonObject();
        root["WeaselHost"] = WeaselHostNode;

        var captureNode = WeaselHostNode["Capture"] as JsonObject ?? new JsonObject();
        captureNode["Folder"] = options.Folder;
        captureNode["FileNamePattern"] = options.FileNamePattern;
        captureNode["EnableIntervalCapture"] = options.EnableIntervalCapture;
        captureNode["IntervalSeconds"] = options.IntervalSeconds;
        WeaselHostNode["Capture"] = captureNode;

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
        await File.WriteAllTextAsync(_configPath, json, cancellationToken);
        // Force flush by writing again and waiting longer
        await File.WriteAllTextAsync(_configPath, json, cancellationToken);
        await Task.Delay(500, cancellationToken); // Give more time for file system and config reload
    }

    public async Task SaveSecuritySettingsAsync(bool requireAuthentication, string? password, CancellationToken cancellationToken = default)
    {
        JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            root = await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken) ?? new JsonObject();
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
    }

    public async Task SaveDiskMonitoringSettingsAsync(DiskMonitoringOptions options, CancellationToken cancellationToken = default)
    {
        JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            root = await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken) ?? new JsonObject();
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
    }

    public async Task SaveSmtpSettingsAsync(SmtpOptions options, CancellationToken cancellationToken = default)
    {
        JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            root = await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken) ?? new JsonObject();
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
        
        // Ensure file is fully written and flushed to disk
        await Task.Delay(100, cancellationToken);
    }

    public async Task SaveApplicationMonitorSettingsAsync(ApplicationMonitorOptions options, CancellationToken cancellationToken = default)
    {
        JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            root = await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken) ?? new JsonObject();
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
        await Task.Delay(100, cancellationToken); // Ensure file is flushed before config reload
    }

    public async Task SaveLoggingSettingsAsync(LoggingOptions options, CancellationToken cancellationToken = default)
    {
        JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            root = await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken) ?? new JsonObject();
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

        weaselHostNode["Logging"] = loggingNode;

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
        await File.WriteAllTextAsync(_configPath, json, cancellationToken);
        await Task.Delay(100, cancellationToken); // Ensure file is flushed before config reload
    }

    public async Task SaveVncSettingsAsync(VncOptions options, CancellationToken cancellationToken = default)
    {
        JsonNode root;
        if (File.Exists(_configPath))
        {
            await using var stream = File.OpenRead(_configPath);
            root = await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken) ?? new JsonObject();
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
        // Store password only if provided (don't overwrite with null)
        if (!string.IsNullOrWhiteSpace(options.Password))
        {
            vncNode["Password"] = options.Password;
        }
        weaselHostNode["Vnc"] = vncNode;

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
        await File.WriteAllTextAsync(_configPath, json, cancellationToken);
        await Task.Delay(100, cancellationToken); // Ensure file is flushed before config reload
    }
}


