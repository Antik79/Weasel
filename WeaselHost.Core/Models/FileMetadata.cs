namespace WeaselHost.Core.Models;

public record FileMetadata(
    string Name,
    string FullPath,
    long SizeBytes,
    DateTimeOffset CreatedAt,
    DateTimeOffset ModifiedAt,
    bool IsReadOnly,
    string? MimeType);


