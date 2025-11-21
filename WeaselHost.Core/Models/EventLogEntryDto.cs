namespace WeaselHost.Core.Models;

public record EventLogEntryDto(
    string Provider,
    string Level,
    string Message,
    DateTimeOffset Timestamp,
    int EventId);

public record EventLogQueryOptions(
    string LogName,
    int MaxCount,
    string? LevelFilter,
    DateTimeOffset? SinceUtc,
    DateTimeOffset? UntilUtc);


