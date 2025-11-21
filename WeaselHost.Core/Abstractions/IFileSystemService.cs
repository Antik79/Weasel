using WeaselHost.Core.Models;

namespace WeaselHost.Core.Abstractions;

public interface IFileSystemService
{
    Task<IReadOnlyCollection<FileSystemItem>> GetDrivesAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<FileSystemItem>> GetChildrenAsync(
        string directoryPath,
        CancellationToken cancellationToken = default);

    Task<FileMetadata> GetMetadataAsync(
        string path,
        CancellationToken cancellationToken = default);

    Task<Stream> OpenReadAsync(
        string path,
        CancellationToken cancellationToken = default);

    Task SaveFileAsync(
        string path,
        Stream content,
        bool overwrite = true,
        CancellationToken cancellationToken = default);

    Task CreateDirectoryAsync(
        string path,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(
        string path,
        CancellationToken cancellationToken = default);

    Task RenameAsync(
        string path,
        string newName,
        CancellationToken cancellationToken = default);

    Task MoveAsync(
        string sourcePath,
        string destinationPath,
        CancellationToken cancellationToken = default);

    Task CopyAsync(
        string sourcePath,
        string destinationPath,
        CancellationToken cancellationToken = default);

    Task<string> CreateZipAsync(
        IEnumerable<string> sourcePaths,
        string zipFilePath,
        CancellationToken cancellationToken = default);

    Task ExtractZipAsync(
        string zipFilePath,
        string destinationPath,
        CancellationToken cancellationToken = default);
}


