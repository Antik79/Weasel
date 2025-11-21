namespace WeaselHost.Infrastructure.Services;

public sealed class ProcessService : IProcessService
{
    public Task<IReadOnlyCollection<ProcessInfo>> GetProcessesAsync(CancellationToken cancellationToken = default)
    {
        var list = new List<ProcessInfo>();
        foreach (var process in Process.GetProcesses().OrderBy(p => p.ProcessName, StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                var startTime = SafeGetStartTime(process);
                var executablePath = SafeGetExecutablePath(process);
                list.Add(new ProcessInfo(
                    process.Id,
                    process.ProcessName,
                    process.WorkingSet64,
                    startTime,
                    process.Responding,
                    null,
                    executablePath));
            }
            catch
            {
                // Ignore processes we can't inspect
            }
        }

        return Task.FromResult<IReadOnlyCollection<ProcessInfo>>(list);
    }

    public Task TerminateAsync(int processId, bool force = true, CancellationToken cancellationToken = default)
    {
        var process = Process.GetProcessById(processId);
        process.Kill(force);
        return Task.CompletedTask;
    }

    private static DateTimeOffset? SafeGetStartTime(Process process)
    {
        try
        {
            return process.StartTime.ToUniversalTime();
        }
        catch
        {
            return null;
        }
    }

    private static string? SafeGetExecutablePath(Process process)
    {
        try
        {
            return process.MainModule?.FileName;
        }
        catch
        {
            return null;
        }
    }
}


