using System.Drawing;
using System.Drawing.Imaging;

namespace WeaselHost.Infrastructure.Services;

public class ScreenFramebufferSource : IDisposable
{
    private readonly object _lock = new();
    private Rectangle _bounds;

    public ScreenFramebufferSource()
    {
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

            using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppRgb);
            using var graphics = Graphics.FromImage(bitmap);
            
            // Capture the entire screen
            graphics.CopyFromScreen(_bounds.X, _bounds.Y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);

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

                return new VncFramebuffer(width, height, rgb);
            }
            finally
            {
                bitmap.UnlockBits(data);
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

