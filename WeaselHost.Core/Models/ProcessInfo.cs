namespace WeaselHost.Core.Models;

public record ProcessInfo(
    int Id,
    string Name,
    long WorkingSetBytes,
    DateTimeOffset? StartTime,
    bool Responding,
    string? UserName,
    string? ExecutablePath);


