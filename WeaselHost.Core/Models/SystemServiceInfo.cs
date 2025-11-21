namespace WeaselHost.Core.Models;

public record SystemServiceInfo(
    string ServiceName,
    string DisplayName,
    string Status,
    string ServiceType,
    bool CanPauseAndContinue,
    bool CanShutdown,
    bool CanStop);


