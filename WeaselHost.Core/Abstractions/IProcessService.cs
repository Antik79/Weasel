using WeaselHost.Core.Models;

namespace WeaselHost.Core.Abstractions;

public interface IProcessService
{
    Task<IReadOnlyCollection<ProcessInfo>> GetProcessesAsync(CancellationToken cancellationToken = default);

    Task TerminateAsync(int processId, bool force = true, CancellationToken cancellationToken = default);
}


