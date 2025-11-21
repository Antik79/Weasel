using WeaselHost.Core.Models;

namespace WeaselHost.Core.Abstractions;

public interface ISystemInfoService
{
    Task<SystemStatus> GetStatusAsync(CancellationToken cancellationToken = default);

    IAsyncEnumerable<EventLogEntryDto> ReadEventsAsync(
        EventLogQueryOptions options,
        CancellationToken cancellationToken = default);

    Task<List<NetworkAdapterInfo>> GetNetworkAdaptersAsync(CancellationToken cancellationToken = default);

    Task<NetworkAdapterStats?> GetNetworkAdapterStatsAsync(string adapterId, CancellationToken cancellationToken = default);

    bool IsRunningAsAdministrator();

    Task RestartAsAdministratorAsync(CancellationToken cancellationToken = default);

    void SetStartupOnBoot(bool enable);

    bool IsStartupOnBootEnabled();
}
