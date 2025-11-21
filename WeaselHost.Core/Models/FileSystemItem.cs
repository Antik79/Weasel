namespace WeaselHost.Core.Models;

public record FileSystemItem(
    string Name,
    string FullPath,
    bool IsDirectory,
    long SizeBytes,
    DateTimeOffset ModifiedAt);


