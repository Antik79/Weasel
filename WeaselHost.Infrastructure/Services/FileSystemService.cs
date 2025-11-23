using System.IO.Compression;

namespace WeaselHost.Infrastructure.Services;

public sealed class FileSystemService : IFileSystemService
{
    public Task<IReadOnlyCollection<FileSystemItem>> GetDrivesAsync(CancellationToken cancellationToken = default)
    {
        var drives = DriveInfo.GetDrives()
            .Where(d => d.DriveType is DriveType.Fixed or DriveType.Removable)
            .Select(d => new FileSystemItem(
                d.Name,
                d.Name,
                true,
                d.IsReady ? d.TotalSize : 0,
                DateTimeOffset.UtcNow))
            .OrderBy(d => d.Name, StringComparer.OrdinalIgnoreCase)
            .ToList()
            .AsReadOnly();

        return Task.FromResult<IReadOnlyCollection<FileSystemItem>>(drives);
    }

    public Task<IReadOnlyCollection<FileSystemItem>> GetChildrenAsync(string directoryPath, CancellationToken cancellationToken = default)
    {
        var path = NormalizePath(directoryPath);
        if (!Directory.Exists(path))
        {
            // For relative paths (like .\Screenshots), create the directory if it doesn't exist
            if (directoryPath.StartsWith(".\\") || directoryPath.StartsWith("./"))
            {
                try
                {
                    Directory.CreateDirectory(path);
                }
                catch
                {
                    // If we can't create it, return empty list
                    return Task.FromResult<IReadOnlyCollection<FileSystemItem>>(Array.Empty<FileSystemItem>());
                }
            }
            else
            {
                throw new DirectoryNotFoundException($"Directory '{path}' was not found.");
            }
        }

        var items = Directory.EnumerateFileSystemEntries(path)
            .Select(CreateItem)
            .OrderByDescending(item => item.IsDirectory)
            .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .ToList()
            .AsReadOnly();

        return Task.FromResult<IReadOnlyCollection<FileSystemItem>>(items);
    }

    public Task<FileMetadata> GetMetadataAsync(string path, CancellationToken cancellationToken = default)
    {
        var fullPath = NormalizePath(path);

        if (File.Exists(fullPath))
        {
            var info = new FileInfo(fullPath);
            return Task.FromResult(new FileMetadata(
                info.Name,
                info.FullName,
                info.Length,
                info.CreationTimeUtc,
                info.LastWriteTimeUtc,
                info.IsReadOnly,
                null));
        }

        if (Directory.Exists(fullPath))
        {
            var info = new DirectoryInfo(fullPath);
            return Task.FromResult(new FileMetadata(
                info.Name,
                info.FullName,
                0,
                info.CreationTimeUtc,
                info.LastWriteTimeUtc,
                info.Attributes.HasFlag(FileAttributes.ReadOnly),
                null));
        }

        throw new FileNotFoundException("The requested path could not be resolved.", fullPath);
    }

    public Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default)
    {
        var fullPath = NormalizePath(path);
        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException("File not found.", fullPath);
        }

        Stream stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Task.FromResult(stream);
    }

    public async Task SaveFileAsync(string path, Stream content, bool overwrite = true, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(content);

        var fullPath = NormalizePath(path);
        var directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var mode = overwrite ? FileMode.Create : FileMode.CreateNew;
        await using var fileStream = new FileStream(fullPath, mode, FileAccess.Write, FileShare.None);
        await content.CopyToAsync(fileStream, cancellationToken);
    }

    public Task CreateDirectoryAsync(string path, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(NormalizePath(path));
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        var fullPath = NormalizePath(path);
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
            return Task.CompletedTask;
        }

        if (Directory.Exists(fullPath))
        {
            Directory.Delete(fullPath, true);
            return Task.CompletedTask;
        }

        throw new FileNotFoundException("Path not found.", fullPath);
    }

    public Task RenameAsync(string path, string newName, CancellationToken cancellationToken = default)
    {
        var fullPath = NormalizePath(path);
        if (string.IsNullOrWhiteSpace(newName))
        {
            throw new ArgumentException("A new name must be provided.", nameof(newName));
        }

        var parent = Path.GetDirectoryName(fullPath) ?? fullPath;
        var destination = Path.Combine(parent, newName);

        if (File.Exists(fullPath))
        {
            File.Move(fullPath, destination, overwrite: false);
            return Task.CompletedTask;
        }

        if (Directory.Exists(fullPath))
        {
            Directory.Move(fullPath, destination);
            return Task.CompletedTask;
        }

        throw new FileNotFoundException("Path not found.", fullPath);
    }

    public Task MoveAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default)
    {
        var source = NormalizePath(sourcePath);
        var destination = NormalizePath(destinationPath);

        if (File.Exists(source))
        {
            var destDir = Path.GetDirectoryName(destination);
            if (!string.IsNullOrEmpty(destDir))
            {
                Directory.CreateDirectory(destDir);
            }
            File.Move(source, destination, overwrite: true);
            return Task.CompletedTask;
        }

        if (Directory.Exists(source))
        {
            if (Directory.Exists(destination))
            {
                throw new IOException($"Destination directory '{destination}' already exists.");
            }
            Directory.Move(source, destination);
            return Task.CompletedTask;
        }

        throw new FileNotFoundException("Source path not found.", source);
    }

    public async Task CopyAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default)
    {
        var source = NormalizePath(sourcePath);
        var destination = NormalizePath(destinationPath);

        if (File.Exists(source))
        {
            var destDir = Path.GetDirectoryName(destination);
            if (!string.IsNullOrEmpty(destDir))
            {
                Directory.CreateDirectory(destDir);
            }
            File.Copy(source, destination, overwrite: true);
            return;
        }

        if (Directory.Exists(source))
        {
            if (Directory.Exists(destination))
            {
                throw new IOException($"Destination directory '{destination}' already exists.");
            }

            Directory.CreateDirectory(destination);
            await CopyDirectoryAsync(source, destination, cancellationToken);
            return;
        }

        throw new FileNotFoundException("Source path not found.", source);
    }

    private async Task CopyDirectoryAsync(string sourceDir, string destDir, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(destDir);

        foreach (var file in Directory.GetFiles(sourceDir))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var fileName = Path.GetFileName(file);
            var destFile = Path.Combine(destDir, fileName);
            File.Copy(file, destFile, overwrite: true);
        }

        foreach (var subDir in Directory.GetDirectories(sourceDir))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var dirName = Path.GetFileName(subDir);
            var destSubDir = Path.Combine(destDir, dirName);
            await CopyDirectoryAsync(subDir, destSubDir, cancellationToken);
        }
    }

    public async Task<string> CreateZipAsync(IEnumerable<string> sourcePaths, string zipFilePath, CancellationToken cancellationToken = default)
    {
        var zipPath = NormalizePath(zipFilePath);
        var zipDir = Path.GetDirectoryName(zipPath);
        if (!string.IsNullOrEmpty(zipDir))
        {
            Directory.CreateDirectory(zipDir);
        }

        if (File.Exists(zipPath))
        {
            File.Delete(zipPath);
        }

        using var archive = ZipFile.Open(zipPath, ZipArchiveMode.Create);

        foreach (var sourcePath in sourcePaths)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var source = NormalizePath(sourcePath);
            var entryName = Path.GetFileName(source);

            if (File.Exists(source))
            {
                archive.CreateEntryFromFile(source, entryName);
            }
            else if (Directory.Exists(source))
            {
                await AddDirectoryToZipAsync(archive, source, entryName + "/", cancellationToken);
            }
        }

        return zipPath;
    }

    private async Task AddDirectoryToZipAsync(ZipArchive archive, string directoryPath, string entryPrefix, CancellationToken cancellationToken)
    {
        foreach (var file in Directory.GetFiles(directoryPath))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var entryName = entryPrefix + Path.GetFileName(file);
            archive.CreateEntryFromFile(file, entryName);
        }

        foreach (var subDir in Directory.GetDirectories(directoryPath))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var dirName = Path.GetFileName(subDir);
            var newPrefix = entryPrefix + dirName + "/";
            await AddDirectoryToZipAsync(archive, subDir, newPrefix, cancellationToken);
        }
    }

    public Task ExtractZipAsync(string zipFilePath, string destinationPath, CancellationToken cancellationToken = default)
    {
        var zipPath = NormalizePath(zipFilePath);
        var destPath = NormalizePath(destinationPath);

        if (!File.Exists(zipPath))
        {
            throw new FileNotFoundException("Zip file not found.", zipPath);
        }

        Directory.CreateDirectory(destPath);
        ZipFile.ExtractToDirectory(zipPath, destPath, overwriteFiles: true);
        return Task.CompletedTask;
    }

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new ArgumentException("Path cannot be empty.", nameof(path));
        }

        return Path.GetFullPath(path);
    }

    private static FileSystemItem CreateItem(string candidatePath)
    {
        if (Directory.Exists(candidatePath))
        {
            var info = new DirectoryInfo(candidatePath);
            return new FileSystemItem(info.Name, info.FullName, true, 0, info.LastWriteTimeUtc);
        }

        var fileInfo = new FileInfo(candidatePath);
        return new FileSystemItem(fileInfo.Name, fileInfo.FullName, false, fileInfo.Length, fileInfo.LastWriteTimeUtc);
    }
}


