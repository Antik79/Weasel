using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Web.Logging;

internal sealed class FileLoggerProvider : ILoggerProvider
{
    private readonly IOptionsMonitor<WeaselHostOptions> _optionsMonitor;
    private readonly object _lock = new();

    public FileLoggerProvider(IOptionsMonitor<WeaselHostOptions> optionsMonitor)
    {
        _optionsMonitor = optionsMonitor;
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(categoryName, this);

    public void Dispose()
    {
    }

    internal void Write(LogLevel level, string category, string message, Exception? exception)
    {
        var options = _optionsMonitor.CurrentValue.Logging;
        var folder = EnsureFolder(options.Folder);
        var datePrefix = DateTime.UtcNow.ToString("yyyyMMdd");
        var baseFileName = $"weasel-{datePrefix}.log";
        var path = Path.Combine(folder, baseFileName);

        var builder = new StringBuilder()
            .Append(DateTime.UtcNow.ToString("O"))
            .Append(" [")
            .Append(level)
            .Append("] ")
            .Append(category)
            .Append(" - ")
            .Append(message);

        if (exception is not null)
        {
            builder.AppendLine()
                .Append(exception);
        }

        var logEntry = builder.AppendLine().ToString();

        lock (_lock)
        {
            // Check if we need to rotate based on file size
            if (options.EnableSizeRotation && options.MaxFileSizeBytes > 0 && File.Exists(path))
            {
                var fileInfo = new FileInfo(path);
                if (fileInfo.Length + logEntry.Length > options.MaxFileSizeBytes)
                {
                    RotateFile(path, datePrefix, folder, options.MaxFilesPerDay);
                }
            }

            File.AppendAllText(path, logEntry);
        }

        PruneOldFiles(folder, options.RetentionDays);
    }

    private static void RotateFile(string currentPath, string datePrefix, string folder, int maxFilesPerDay)
    {
        try
        {
            // Find the highest rotation number for today's files
            var pattern = $"weasel-{datePrefix}.*.log";
            var existingRotated = Directory.GetFiles(folder, pattern)
                .Select(f => Path.GetFileName(f))
                .Where(f => f.StartsWith($"weasel-{datePrefix}.", StringComparison.OrdinalIgnoreCase))
                .Select(f =>
                {
                    // Extract number from filename like "weasel-20250101.3.log"
                    var parts = f.Split('.');
                    if (parts.Length >= 3 && int.TryParse(parts[1], out var num))
                    {
                        return num;
                    }
                    return 0;
                })
                .Where(n => n > 0)
                .DefaultIfEmpty(0)
                .Max();

            // Determine the next rotation number
            var nextRotation = existingRotated + 1;

            // If we have a max files limit, check if we need to delete the oldest
            if (maxFilesPerDay > 0 && nextRotation > maxFilesPerDay)
            {
                // Delete the oldest rotated file (rotation number 1)
                var oldestRotated = Path.Combine(folder, $"weasel-{datePrefix}.1.log");
                if (File.Exists(oldestRotated))
                {
                    try
                    {
                        File.Delete(oldestRotated);
                    }
                    catch
                    {
                        // Ignore deletion errors
                    }
                }

                // Shift all existing rotated files down by 1
                for (int i = 2; i <= existingRotated; i++)
                {
                    var oldFile = Path.Combine(folder, $"weasel-{datePrefix}.{i}.log");
                    var newFile = Path.Combine(folder, $"weasel-{datePrefix}.{i - 1}.log");
                    if (File.Exists(oldFile))
                    {
                        try
                        {
                            File.Move(oldFile, newFile, overwrite: true);
                        }
                        catch
                        {
                            // Ignore move errors
                        }
                    }
                }

                // The current file becomes rotation number maxFilesPerDay
                nextRotation = maxFilesPerDay;
            }

            // Rotate the current file
            var rotatedPath = Path.Combine(folder, $"weasel-{datePrefix}.{nextRotation}.log");
            if (File.Exists(currentPath))
            {
                File.Move(currentPath, rotatedPath, overwrite: true);
            }
        }
        catch
        {
            // If rotation fails, we'll just append to the existing file
            // This prevents logging from breaking if rotation has issues
        }
    }

    internal LogLevel GetMinimumLevel() =>
        _optionsMonitor.CurrentValue.Logging?.MinimumLevel ?? LogLevel.Information;

    internal string GetFolder() => EnsureFolder(_optionsMonitor.CurrentValue.Logging.Folder);

    private static string EnsureFolder(string? requested)
    {
        var folder = string.IsNullOrWhiteSpace(requested)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Weasel", "Logs")
            : requested;
        
        // Expand environment variables in the path (e.g., %APPDATA%)
        if (!string.IsNullOrWhiteSpace(folder))
        {
            folder = Environment.ExpandEnvironmentVariables(folder);
        }
        
        Directory.CreateDirectory(folder);
        return folder;
    }

    private static void PruneOldFiles(string folder, int retentionDays)
    {
        if (retentionDays <= 0)
        {
            return;
        }

        var threshold = DateTime.UtcNow.AddDays(-retentionDays);
        foreach (var file in Directory.EnumerateFiles(folder, "weasel-*.log"))
        {
            try
            {
                var info = new FileInfo(file);
                if (info.LastWriteTimeUtc < threshold)
                {
                    info.Delete();
                }
            }
            catch
            {
                // ignore best-effort cleanup
            }
        }
    }

    private sealed class FileLogger : ILogger
    {
        private readonly string _category;
        private readonly FileLoggerProvider _provider;

        public FileLogger(string category, FileLoggerProvider provider)
        {
            _category = category;
            _provider = provider;
        }

        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NoopScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= _provider.GetMinimumLevel();

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var message = formatter(state, exception);
            _provider.Write(logLevel, _category, message, exception);
        }
    }

    private sealed class NoopScope : IDisposable
    {
        public static readonly NoopScope Instance = new();

        public void Dispose()
        {
        }
    }
}

