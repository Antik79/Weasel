namespace WeaselHost.Core.Configuration;

public class VncOptions
{
    public bool Enabled { get; set; } = true;

    public int Port { get; set; } = 5900;

    public string? Password { get; set; }

    public bool AllowRemote { get; set; } = false;

    public bool AutoStart { get; set; } = false;

    public VncRecordingOptions Recording { get; set; } = new();
}

