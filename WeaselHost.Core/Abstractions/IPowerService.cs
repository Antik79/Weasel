namespace WeaselHost.Core.Abstractions;

public interface IPowerService
{
    Task RestartAsync(bool forceApplicationsToClose = false, CancellationToken cancellationToken = default);

    Task ShutdownAsync(bool forceApplicationsToClose = false, CancellationToken cancellationToken = default);

    Task LockAsync(CancellationToken cancellationToken = default);
}


