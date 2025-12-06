namespace WeaselHost.Core.Models;

/// <summary>
/// System metrics with historical data for charting.
/// </summary>
public record SystemMetrics(
    SystemStatus Current,
    IReadOnlyCollection<MetricPoint> CpuHistory,
    IReadOnlyCollection<MetricPoint> MemoryHistory);

/// <summary>
/// A single data point for metric history.
/// </summary>
public record MetricPoint(
    double Value,
    DateTimeOffset Timestamp);
