using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WeaselHost.Core.Configuration;
using WeaselHost.Infrastructure;

namespace WeaselHost;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var host = BuildHost();
        host.Start();

        var webServerManager = host.Services.GetRequiredService<WebServerManager>();
        var browserLauncher = host.Services.GetRequiredService<BrowserLauncher>();
        var logger = host.Services.GetRequiredService<ILogger<TrayApplicationContext>>();
        var context = new TrayApplicationContext(webServerManager, browserLauncher, logger, host);
        
        Application.Run(context);

        // Application.Run will exit when ExitThread is called
        // The TrayApplicationContext handles cleanup and calls Environment.Exit(0)
        // This code is never reached due to Environment.Exit in TrayApplicationContext
    }

    private static IHost BuildHost()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.Configuration
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
            .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "config", "appsettings.json"), optional: true, reloadOnChange: true)
            .AddEnvironmentVariables();

        builder.Services.Configure<WeaselHostOptions>(builder.Configuration.GetSection("WeaselHost"));
        builder.Services.AddLogging(logging =>
        {
            logging.AddConsole();
            logging.AddDebug();
        });

        // Add WeaselHost services so they're available in the tray context menu
        builder.Services.AddWeaselHostServices();

        builder.Services.AddSingleton<WebServerManager>();
        builder.Services.AddSingleton<BrowserLauncher>();

        return builder.Build();
    }
}
