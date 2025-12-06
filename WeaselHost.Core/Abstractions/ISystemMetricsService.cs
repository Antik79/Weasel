using WeaselHost.Core.Models;

namespace WeaselHost.Core.Abstractions;

/// <summary>
/// Service for collecting and providing system metrics with historical data.
/// </summary>
public interface ISystemMetricsService
{
    /// <summary>
    /// Gets the current system metrics including historical data for charts.
    /// </summary>
    Task<SystemMetrics> GetMetricsAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets the aggregated status of all Weasel services.
    /// </summary>
    Task<WeaselServicesStatus> GetWeaselServicesStatusAsync(CancellationToken cancellationToken = default);
}
