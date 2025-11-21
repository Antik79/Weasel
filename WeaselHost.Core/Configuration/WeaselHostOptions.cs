using System.IO;
using Microsoft.Extensions.Logging;

namespace WeaselHost.Core.Configuration;

public class WeaselHostOptions
{
    public WebServerOptions WebServer { get; set; } = new();

    public SecurityOptions Security { get; set; } = new();

    public CaptureOptions Capture { get; set; } = new();

    public LoggingOptions Logging { get; set; } = new();
    public DiskMonitoringOptions DiskMonitoring { get; set; } = new();
    public ApplicationMonitorOptions ApplicationMonitor { get; set; } = new();
    public SmtpOptions Smtp { get; set; } = new();
    public string? CertificatePassword { get; set; }
}

public class WebServerOptions
{
    public int Port { get; set; } = 7780;

    public string Host { get; set; } = "0.0.0.0";

    public bool AllowRemote { get; set; } = true;

    public bool UseHttps { get; set; } = false;

    public string GetUrl()
    {
        var bindHost = AllowRemote ? Host : "127.0.0.1";
        return $"{(UseHttps ? "https" : "http")}://{bindHost}:{Port}";
    }
}

public class SecurityOptions
{
    public bool RequireAuthentication { get; set; }

    public string? Password { get; set; }

    public bool EnableCsrfProtection { get; set; } = true;

    public bool EnableRequestLogging { get; set; } = true;

    public bool EnableRateLimiting { get; set; } = true;

    public int RequestsPerMinute { get; set; } = 120;

    public int QueueLimit { get; set; } = 20;
}

public class CaptureOptions
{
    public string Folder { get; set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Weasel", "Screenshots");

    public string FileNamePattern { get; set; } = "yyyyMMdd_HHmmss";
    public bool EnableIntervalCapture { get; set; }
    public int IntervalSeconds { get; set; } = 60;
}

public class LoggingOptions
{
    public string Folder { get; set; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Weasel", "Logs");

    public int RetentionDays { get; set; } = 14;

    public LogLevel MinimumLevel { get; set; } = LogLevel.Information;

    /// <summary>
    /// Maximum file size in bytes before rotation. Set to 0 to disable size-based rotation.
    /// Default: 10 MB
    /// </summary>
    public long MaxFileSizeBytes { get; set; } = 10 * 1024 * 1024; // 10 MB

    /// <summary>
    /// Maximum number of rotated files to keep per day. Set to 0 for unlimited.
    /// Default: 5
    /// </summary>
    public int MaxFilesPerDay { get; set; } = 5;

    /// <summary>
    /// Enable rotation by file size. If false, only daily rotation occurs.
    /// Default: true
    /// </summary>
    public bool EnableSizeRotation { get; set; } = true;
}

public class DiskMonitoringOptions
{
    public bool Enabled { get; set; }

    public List<DriveMonitorConfig> MonitoredDrives { get; set; } = new();

    public List<FolderMonitorOptions> FolderMonitors { get; set; } = new();

    public List<string> NotificationRecipients { get; set; } = new();
}

public class DriveMonitorConfig
{
    public string DriveName { get; set; } = string.Empty;

    public bool Enabled { get; set; }

    public int CheckIntervalMinutes { get; set; } = 15;

    public double? ThresholdPercent { get; set; }

    public long? ThresholdBytes { get; set; }
}

public class FolderMonitorOptions
{
    public string Path { get; set; } = string.Empty;

    public bool Enabled { get; set; }

    public int CheckIntervalMinutes { get; set; } = 15;

    public long ThresholdBytes { get; set; }

    /// <summary>
    /// Direction of threshold check. "Over" means alert when folder size exceeds threshold.
    /// "Under" means alert when folder size falls below threshold.
    /// Default: "Over"
    /// </summary>
    public string ThresholdDirection { get; set; } = "Over";
}

public class SmtpOptions
{
    public string Host { get; set; } = "smtp.gmail.com";

    public int Port { get; set; } = 587;

    public bool EnableSsl { get; set; } = true;

    public string? Username { get; set; }

    public string? Password { get; set; }

    public string? FromAddress { get; set; }

    public string? FromName { get; set; } = "Weasel Disk Monitor";

    public string? TestRecipient { get; set; }
}


