namespace WeaselHost.Core.Abstractions;

public interface IScreenshotService
{
    Task<string> CaptureAsync(CancellationToken cancellationToken = default);
    Task<string> CaptureAsync(string destinationFolder, CancellationToken cancellationToken = default);
}


