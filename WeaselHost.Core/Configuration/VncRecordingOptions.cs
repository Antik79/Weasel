namespace WeaselHost.Core.Configuration;

public class VncRecordingOptions
{
    public string RootFolder { get; set; } = Path.Combine(AppContext.BaseDirectory, "Recordings");
    public int MaxRecordingDurationMinutes { get; set; } = 120;
    public int RetentionDays { get; set; } = 30;
    public bool EnableMotionDetection { get; set; } = false;
    public int MotionDetectionThresholdPercent { get; set; } = 5;
    public int MotionDetectionBlockSize { get; set; } = 32;
    public int MotionDetectionPauseDelaySeconds { get; set; } = 10;
    public int RecordingFps { get; set; } = 5;
    public bool UseProfileSubfolders { get; set; } = true;
}
