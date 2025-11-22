namespace WeaselHost.Core.Abstractions;

public interface IVncService
{
    Task StartAsync(int port, string? password, bool allowRemote, CancellationToken cancellationToken = default);
    Task StopAsync(CancellationToken cancellationToken = default);
    Task<VncStatus> GetStatusAsync(CancellationToken cancellationToken = default);
    Task<int> GetConnectionCountAsync(CancellationToken cancellationToken = default);
}

public record VncStatus(
    bool IsRunning,
    int Port,
    int ConnectionCount,
    bool AllowRemote);

