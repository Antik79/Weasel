namespace WeaselHost.Core.Abstractions;

public interface IScreenshotService
{
    Task<string> CaptureAsync(CancellationToken cancellationToken = default);
}


