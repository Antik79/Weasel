using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace WeaselHost;

public sealed class BrowserLauncher
{
    private readonly ILogger<BrowserLauncher> _logger;

    public BrowserLauncher(ILogger<BrowserLauncher> logger)
    {
        _logger = logger;
    }

    public void Open(Uri uri)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = uri.ToString(),
                UseShellExecute = true
            };

            Process.Start(psi);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to open default browser for {Uri}", uri);
            throw;
        }
    }
}


