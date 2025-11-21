namespace WeaselHost.Infrastructure.Services;

public sealed class PowerService : IPowerService
{
    public Task RestartAsync(bool forceApplicationsToClose = false, CancellationToken cancellationToken = default)
    {
        var args = $"/r {(forceApplicationsToClose ? "/f " : string.Empty)}/t 0";
        return RunShutdownAsync(args, cancellationToken);
    }

    public Task ShutdownAsync(bool forceApplicationsToClose = false, CancellationToken cancellationToken = default)
    {
        var args = $"/s {(forceApplicationsToClose ? "/f " : string.Empty)}/t 0";
        return RunShutdownAsync(args, cancellationToken);
    }

    public Task LockAsync(CancellationToken cancellationToken = default)
    {
        return ProcessRunner.RunAsync("rundll32.exe", "user32.dll,LockWorkStation", cancellationToken);
    }

    private static async Task RunShutdownAsync(string arguments, CancellationToken cancellationToken)
    {
        var result = await ProcessRunner.RunAsync("shutdown.exe", arguments, cancellationToken);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException($"shutdown.exe failed: {result.StandardError}");
        }
    }
}


