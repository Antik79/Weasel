namespace WeaselHost.Infrastructure.Services;

public sealed class WindowsServiceManager : ISystemServiceManager
{
    public Task<IReadOnlyCollection<SystemServiceInfo>> GetServicesAsync(string? statusFilter = null, CancellationToken cancellationToken = default)
    {
        var services = ServiceController.GetServices();
        var list = services
            .Where(service => string.IsNullOrWhiteSpace(statusFilter) || string.Equals(service.Status.ToString(), statusFilter, StringComparison.OrdinalIgnoreCase))
            .OrderBy(service => service.DisplayName, StringComparer.OrdinalIgnoreCase)
            .Select(service => new SystemServiceInfo(
                service.ServiceName,
                service.DisplayName,
                service.Status.ToString(),
                service.ServiceType.ToString(),
                service.CanPauseAndContinue,
                service.CanShutdown,
                service.CanStop))
            .ToList()
            .AsReadOnly();

        return Task.FromResult<IReadOnlyCollection<SystemServiceInfo>>(list);
    }

    public Task StartAsync(string serviceName, CancellationToken cancellationToken = default)
    {
        using var controller = new ServiceController(serviceName);
        controller.Start();
        controller.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(10));
        return Task.CompletedTask;
    }

    public Task StopAsync(string serviceName, CancellationToken cancellationToken = default)
    {
        using var controller = new ServiceController(serviceName);
        controller.Stop();
        controller.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(10));
        return Task.CompletedTask;
    }

    public async Task RestartAsync(string serviceName, CancellationToken cancellationToken = default)
    {
        await StopAsync(serviceName, cancellationToken);
        await StartAsync(serviceName, cancellationToken);
    }
}


