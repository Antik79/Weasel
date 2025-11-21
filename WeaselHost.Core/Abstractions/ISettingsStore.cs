using WeaselHost.Core.Configuration;

namespace WeaselHost.Core.Abstractions;

public interface ISettingsStore
{
    Task SaveCaptureSettingsAsync(CaptureOptions options, CancellationToken cancellationToken = default);

    Task SaveSecuritySettingsAsync(bool requireAuthentication, string? password, CancellationToken cancellationToken = default);

    Task SaveSmtpSettingsAsync(SmtpOptions options, CancellationToken cancellationToken = default);

    Task SaveDiskMonitoringSettingsAsync(DiskMonitoringOptions options, CancellationToken cancellationToken = default);

    Task SaveApplicationMonitorSettingsAsync(ApplicationMonitorOptions options, CancellationToken cancellationToken = default);

    Task SaveLoggingSettingsAsync(LoggingOptions options, CancellationToken cancellationToken = default);

    Task SaveVncSettingsAsync(VncOptions options, CancellationToken cancellationToken = default);
}


