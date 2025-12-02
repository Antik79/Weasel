using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.Windows.Forms;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

public sealed class ScreenshotService : IScreenshotService
{
    private readonly IOptionsMonitor<WeaselHostOptions> _options;
    private readonly ILogger<ScreenshotService> _logger;

    public ScreenshotService(
        IOptionsMonitor<WeaselHostOptions> options,
        ILogger<ScreenshotService> logger)
    {
        _options = options;
        _logger = logger;
    }

    public Task<string> CaptureAsync(CancellationToken cancellationToken = default)
    {
        var captureOptions = _options.CurrentValue.Capture;
        var folder = string.IsNullOrWhiteSpace(captureOptions.Folder)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Weasel", "Screenshots")
            : captureOptions.Folder;

        return CaptureAsync(folder, cancellationToken);
    }

    public Task<string> CaptureAsync(string destinationFolder, CancellationToken cancellationToken = default)
    {
        var captureOptions = _options.CurrentValue.Capture;

        Directory.CreateDirectory(destinationFolder);

        var pattern = string.IsNullOrWhiteSpace(captureOptions.FileNamePattern)
            ? "yyyyMMdd_HHmmss"
            : captureOptions.FileNamePattern;

        var timestamp = DateTimeOffset.Now.ToString(pattern, CultureInfo.InvariantCulture);
        var sanitized = string.Join("_", timestamp.Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries));
        var fileName = sanitized.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
            ? sanitized
            : $"{sanitized}.png";

        var path = Path.Combine(destinationFolder, fileName);
        var bounds = SystemInformation.VirtualScreen;

        using var bitmap = new Bitmap(bounds.Width, bounds.Height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size);
        bitmap.Save(path, ImageFormat.Png);

        _logger.LogInformation("Screenshot captured to: {Path}", path);

        return Task.FromResult(path);
    }
}


