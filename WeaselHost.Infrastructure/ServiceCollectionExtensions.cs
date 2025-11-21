using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WeaselHost.Core.Abstractions;
using WeaselHost.Infrastructure.Services;

namespace WeaselHost.Infrastructure;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddWeaselHostServices(this IServiceCollection services)
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
            services.AddHostedService(provider => (DiskMonitorService)provider.GetRequiredService<IDiskMonitorService>());
            services.AddHostedService<ApplicationMonitorService>();
            services.AddSingleton<IVncService, VncService>();

            return services;
    }
}


