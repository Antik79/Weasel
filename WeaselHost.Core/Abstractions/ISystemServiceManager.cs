using WeaselHost.Core.Models;

namespace WeaselHost.Core.Abstractions;

public interface ISystemServiceManager
{
    Task<IReadOnlyCollection<SystemServiceInfo>> GetServicesAsync(string? statusFilter = null, CancellationToken cancellationToken = default);

    Task StartAsync(string serviceName, CancellationToken cancellationToken = default);

    Task StopAsync(string serviceName, CancellationToken cancellationToken = default);

    Task RestartAsync(string serviceName, CancellationToken cancellationToken = default);
}


