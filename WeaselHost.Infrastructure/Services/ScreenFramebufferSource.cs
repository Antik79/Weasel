using System.ComponentModel;
using System.Drawing;
using System.Drawing.Imaging;
using Microsoft.Extensions.Logging;

namespace WeaselHost.Infrastructure.Services;

public class ScreenFramebufferSource : IDisposable
{
    private readonly object _lock = new();
    private Rectangle _bounds;
    private readonly ILogger<ScreenFramebufferSource> _logger;
    private VncFramebuffer? _lastSuccessfulCapture;

    public ScreenFramebufferSource(ILogger<ScreenFramebufferSource> logger)
    {
        _logger = logger;
        UpdateBounds();
    }

    private void UpdateBounds()
    {
        var primaryScreen = System.Windows.Forms.Screen.PrimaryScreen;
        if (primaryScreen == null)
        {
            throw new InvalidOperationException("Primary screen is not available");
        }
        _bounds = primaryScreen.Bounds;
    }

    public VncFramebuffer Capture()
    {
        lock (_lock)
        {
            UpdateBounds();

            var width = _bounds.Width;
            var height = _bounds.Height;

            try
            {
                using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppRgb);
                using var graphics = Graphics.FromImage(bitmap);

                // Capture the entire screen - can fail during desktop transitions
                try
                {
                    graphics.CopyFromScreen(_bounds.X, _bounds.Y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
                }
                catch (Win32Exception ex) when (ex.NativeErrorCode == 6) // ERROR_INVALID_HANDLE
                {
                    _logger.LogWarning("Screen capture temporarily unavailable (handle invalid), returning fallback. This is normal during desktop lock/unlock or session transitions.");

                    // Return last successful capture if available, otherwise black screen
                    if (_lastSuccessfulCapture != null &&
                        _lastSuccessfulCapture.Width == width &&
                        _lastSuccessfulCapture.Height == height)
                    {
                        return _lastSuccessfulCapture;
                    }

                    // Return black screen as fallback
                    var blackScreen = new byte[width * height * 3];
                    return new VncFramebuffer(width, height, blackScreen);
                }

                // Convert to RGB array
                var data = bitmap.LockBits(
                    new Rectangle(0, 0, width, height),
                    ImageLockMode.ReadOnly,
                    PixelFormat.Format32bppRgb);

                try
                {
                    var bytes = new byte[width * height * 4];
                    System.Runtime.InteropServices.Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);

                    // Convert BGRA to RGB
                    var rgb = new byte[width * height * 3];
                    for (int i = 0; i < width * height; i++)
                    {
                        rgb[i * 3] = bytes[i * 4 + 2];     // R
                        rgb[i * 3 + 1] = bytes[i * 4 + 1]; // G
                        rgb[i * 3 + 2] = bytes[i * 4];     // B
                    }

                    var framebuffer = new VncFramebuffer(width, height, rgb);
                    _lastSuccessfulCapture = framebuffer; // Cache for fallback
                    return framebuffer;
                }
                finally
                {
                    bitmap.UnlockBits(data);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error during screen capture");

                // Return last successful capture if available, otherwise black screen
                if (_lastSuccessfulCapture != null &&
                    _lastSuccessfulCapture.Width == width &&
                    _lastSuccessfulCapture.Height == height)
                {
                    return _lastSuccessfulCapture;
                }

                // Return black screen as fallback
                var blackScreen = new byte[width * height * 3];
                return new VncFramebuffer(width, height, blackScreen);
            }
        }
    }

    public void Dispose()
    {
        // Cleanup if needed
    }
}

public class VncFramebuffer
{
    public int Width { get; }
    public int Height { get; }
    public byte[] PixelData { get; }

    public VncFramebuffer(int width, int height, byte[] pixelData)
    {
        Width = width;
        Height = height;
        PixelData = pixelData;
    }

    public byte[] GetPixelData() => PixelData;
}

