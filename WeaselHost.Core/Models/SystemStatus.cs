namespace WeaselHost.Core.Models;

public record SystemStatus(
    string Hostname,
    string IpAddress,
    double CpuUsagePercent,
    double MemoryUsagePercent,
    IReadOnlyCollection<DriveStatus> Drives,
    DateTimeOffset CapturedAt);

public record DriveStatus(
    string Name,
    long TotalBytes,
    long FreeBytes);

public record NetworkAdapterInfo(
    string Id,
    string Name,
    string Description,
    string Status,
    string? MacAddress,
    List<string> IpAddresses,
    long? SpeedBytesPerSecond);

public record NetworkAdapterStats(
    string AdapterId,
    long BytesReceived,
    long BytesSent,
    long PacketsReceived,
    long PacketsSent,
    DateTimeOffset CapturedAt);


