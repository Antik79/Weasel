using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

public class IntervalScreenshotService : BackgroundService
{
    private readonly IOptionsMonitor<WeaselHostOptions> _options;
    private readonly IScreenshotService _screenshotService;
    private readonly ILogger<IntervalScreenshotService> _logger;

    public IntervalScreenshotService(
        IOptionsMonitor<WeaselHostOptions> options,
        IScreenshotService screenshotService,
        ILogger<IntervalScreenshotService> logger)
    {
        _options = options;
        _screenshotService = screenshotService;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var options = _options.CurrentValue.Capture;
            
            if (!options.EnableIntervalCapture || options.IntervalSeconds <= 0)
            {
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                continue;
            }

            try
            {
                var path = await _screenshotService.CaptureAsync(stoppingToken);
                _logger.LogInformation("Interval screenshot saved to {Path}", path);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to capture interval screenshot");
            }

            await Task.Delay(TimeSpan.FromSeconds(options.IntervalSeconds), stoppingToken);
        }
    }
}
