namespace WeaselHost.Core.Models;

public class VncRecordingSession
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ProfileId { get; set; } = string.Empty;
    public string ProfileName { get; set; } = string.Empty;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? StoppedAt { get; set; }
    public string OutputPath { get; set; } = string.Empty;
    public RecordingState State { get; set; }
    public long FileSizeBytes { get; set; }
    public int ChunksReceived { get; set; }
    public bool MotionDetectionEnabled { get; set; }
    public int FramesRecorded { get; set; }
    public int FramesSkipped { get; set; }
}

public enum RecordingState
{
    Starting,
    Recording,
    Paused,
    Stopped,
    Error
}

public class RecordingMetadata
{
    public string RecordingId { get; set; } = string.Empty;
    public string ProfileId { get; set; } = string.Empty;
    public string ProfileName { get; set; } = string.Empty;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? StoppedAt { get; set; }
    public TimeSpan Duration { get; set; }
    public long FileSizeBytes { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public string Codec { get; set; } = string.Empty;
    public int Fps { get; set; }
    public bool MotionDetectionEnabled { get; set; }
    public int FramesRecorded { get; set; }
    public int FramesSkipped { get; set; }
}
