namespace WeaselHost.Core.Configuration;

public class ApplicationMonitorOptions
{
    public bool Enabled { get; set; }

    public List<MonitoredApplication> Applications { get; set; } = new();

    public List<string> NotificationRecipients { get; set; } = new();
}

public class MonitoredApplication
{
    public string Id { get; set; } = Guid.NewGuid().ToString();

    public string Name { get; set; } = string.Empty;

    public string ExecutablePath { get; set; } = string.Empty;

    public string? Arguments { get; set; }

    public string? WorkingDirectory { get; set; }

    public bool Enabled { get; set; }

    public int CheckIntervalSeconds { get; set; } = 60;

    public int RestartDelaySeconds { get; set; } = 5;

    public string? LogPath { get; set; }

    public string? EventLogSource { get; set; }
}

