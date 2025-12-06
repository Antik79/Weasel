using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WeaselHost.Core.Abstractions;
using WeaselHost.Infrastructure.Services;

namespace WeaselHost.Infrastructure;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers all WeaselHost services with the dependency injection container.
    /// </summary>
    /// <param name="services">The service collection</param>
    /// <param name="registerHostedServices">If true, registers background monitoring services (ApplicationMonitor, DiskMonitor, IntervalScreenshot). Should only be true for the tray application host.</param>
    /// <returns>The service collection for chaining</returns>
    public static IServiceCollection AddWeaselHostServices(this IServiceCollection services, bool registerHostedServices = true)
    {
        services.AddSingleton<IFileSystemService, FileSystemService>();
        services.AddSingleton<IPackageService, PackageService>();
        services.AddSingleton<IPackageBundleService, PackageBundleService>();
        services.AddSingleton<ISystemInfoService, SystemInfoService>();
        services.AddSingleton<IPowerService, PowerService>();
        services.AddSingleton<IProcessService, ProcessService>();
        services.AddSingleton<ISystemServiceManager, WindowsServiceManager>();
        services.AddSingleton<IScreenshotService, ScreenshotService>();
        services.AddSingleton<ISettingsStore, SettingsStore>();
        services.AddSingleton<IEmailService, EmailService>();
        services.AddSingleton<IDiskMonitorService, DiskMonitorService>();
        services.AddSingleton<IVncService, VncService>();
        services.AddSingleton<IVncRecordingService, VncRecordingService>();
        services.AddSingleton<ITerminalService, TerminalService>();
        services.AddSingleton<ISystemMetricsService, SystemMetricsService>();

        // Only register hosted services in the tray application to prevent duplicate execution
        if (registerHostedServices)
        {
            services.AddHostedService(provider => (DiskMonitorService)provider.GetRequiredService<IDiskMonitorService>());
            services.AddHostedService<ApplicationMonitorService>();
            services.AddHostedService(provider => (SystemMetricsService)provider.GetRequiredService<ISystemMetricsService>());
        }

        return services;
    }
}


