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
        
        // Map category to component name
        var componentName = GetSubfolderForCategory(category);
        
        // Check if logging is enabled for this component
        // If the component is not in the dictionary, default to enabled (backward compatibility)
        if (options.ComponentEnabled.TryGetValue(componentName, out var isEnabled) && !isEnabled)
        {
            // Logging is disabled for this component, skip writing
            return;
        }
        
        var baseFolder = EnsureFolder(options.Folder);
        var datePrefix = DateTime.UtcNow.ToString("yyyyMMdd");
        string path;
        string folder;
        
        // Determine log file path based on component
        if (componentName == "General")
        {
            // General logs go to root: Logs/weasel-{yyyymmdd}.log
            folder = baseFolder;
            path = Path.Combine(folder, $"weasel-{datePrefix}.log");
        }
        else
        {
            // Component logs go to: Logs/{Component}/{Component}-{yyyymmdd}.log
            folder = Path.Combine(baseFolder, componentName);
            Directory.CreateDirectory(folder);
            path = Path.Combine(folder, $"{componentName}-{datePrefix}.log");
        }

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
            // Check if we need to archive old files (new day started)
            ArchiveOldFiles(folder, componentName, datePrefix, baseFolder);

            // If this is a General log write, also archive all component folders
            // This ensures inactive components get their old logs archived too
            if (componentName == "General")
            {
                ArchiveAllComponentFolders(baseFolder, datePrefix);
            }

            // Check if we need to rotate based on file size
            if (options.EnableSizeRotation && options.MaxFileSizeBytes > 0 && File.Exists(path))
            {
                var fileInfo = new FileInfo(path);
                if (fileInfo.Length + logEntry.Length > options.MaxFileSizeBytes)
                {
                    RotateFile(path, datePrefix, folder, componentName, options.MaxFilesPerDay);
                }
            }

            File.AppendAllText(path, logEntry);
        }

        PruneOldFiles(baseFolder, options.RetentionDays);
    }

    private static void ArchiveOldFiles(string folder, string componentName, string currentDatePrefix, string baseFolder)
    {
        try
        {
            // Don't archive if we're already in an Archive folder
            if (folder.EndsWith("Archive", StringComparison.OrdinalIgnoreCase) ||
                folder.Contains($"{Path.DirectorySeparatorChar}Archive{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            // Get all log files in the folder (excluding Archive subfolder)
            var logFiles = Directory.GetFiles(folder, "*.log", SearchOption.TopDirectoryOnly)
                .Where(f => !Path.GetDirectoryName(f)!.EndsWith("Archive", StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var file in logFiles)
            {
                var fileName = Path.GetFileName(file);
                string? fileDatePrefix = null;
                
                // Extract date prefix from filename
                if (componentName == "General")
                {
                    // Format: weasel-{yyyymmdd}.log or weasel-{yyyymmdd}.{rotation}.log
                    if (fileName.StartsWith("weasel-", StringComparison.OrdinalIgnoreCase))
                    {
                        var parts = fileName.Replace("weasel-", "").Split('.');
                        if (parts.Length > 0 && parts[0].Length == 8)
                        {
                            fileDatePrefix = parts[0];
                        }
                    }
                }
                else
                {
                    // Format: {Component}-{yyyymmdd}.log or {Component}-{yyyymmdd}.{rotation}.log
                    var prefix = $"{componentName}-";
                    if (fileName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    {
                        var parts = fileName.Substring(prefix.Length).Split('.');
                        if (parts.Length > 0 && parts[0].Length == 8)
                        {
                            fileDatePrefix = parts[0];
                        }
                    }
                }
                
                // If file date is different from current date, move to Archive
                if (fileDatePrefix != null && fileDatePrefix != currentDatePrefix)
                {
                    var archiveFolder = componentName == "General" 
                        ? Path.Combine(baseFolder, "Archive")
                        : Path.Combine(folder, "Archive");
                    Directory.CreateDirectory(archiveFolder);
                    
                    var archivePath = Path.Combine(archiveFolder, fileName);
                    try
                    {
                        if (File.Exists(archivePath))
                        {
                            File.Delete(archivePath);
                        }
                        File.Move(file, archivePath);
                    }
                    catch
                    {
                        // Ignore move errors
                    }
                }
            }
        }
        catch
        {
            // Ignore archive errors
        }
    }

    private static void ArchiveAllComponentFolders(string baseFolder, string currentDatePrefix)
    {
        try
        {
            if (!Directory.Exists(baseFolder))
            {
                return;
            }

            // Get all subdirectories (component folders) except Archive
            var componentFolders = Directory.GetDirectories(baseFolder)
                .Where(dir => !Path.GetFileName(dir).Equals("Archive", StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var componentFolder in componentFolders)
            {
                var componentName = Path.GetFileName(componentFolder);
                ArchiveOldFiles(componentFolder, componentName, currentDatePrefix, baseFolder);
            }
        }
        catch
        {
            // Ignore errors - archiving is best-effort
        }
    }

    private static void RotateFile(string currentPath, string datePrefix, string folder, string componentName, int maxFilesPerDay)
    {
        try
        {
            // Determine filename pattern based on component
            string basePattern = componentName == "General" 
                ? $"weasel-{datePrefix}"
                : $"{componentName}-{datePrefix}";
            
            // Find the highest rotation number for today's files
            var pattern = $"{basePattern}.*.log";
            var existingRotated = Directory.GetFiles(folder, pattern)
                .Select(f => Path.GetFileName(f))
                .Where(f => f.StartsWith($"{basePattern}.", StringComparison.OrdinalIgnoreCase))
                .Select(f =>
                {
                    // Extract number from filename like "Component-20250101.3.log"
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
                var oldestRotated = Path.Combine(folder, $"{basePattern}.1.log");
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
                    var oldFile = Path.Combine(folder, $"{basePattern}.{i}.log");
                    var newFile = Path.Combine(folder, $"{basePattern}.{i - 1}.log");
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
            var rotatedPath = Path.Combine(folder, $"{basePattern}.{nextRotation}.log");
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

    internal static string GetComponentName(string category)
    {
        // Map logger categories to subfolders
        if (category.Contains("VncService", StringComparison.OrdinalIgnoreCase) || 
            category.Contains("Vnc", StringComparison.OrdinalIgnoreCase))
        {
            return "VNC";
        }
        
        if (category.Contains("DiskMonitorService", StringComparison.OrdinalIgnoreCase) || 
            category.Contains("DiskMonitor", StringComparison.OrdinalIgnoreCase))
        {
            return "DiskMonitor";
        }
        
        if (category.Contains("ApplicationMonitorService", StringComparison.OrdinalIgnoreCase) || 
            category.Contains("ApplicationMonitor", StringComparison.OrdinalIgnoreCase))
        {
            return "ApplicationMonitor";
        }
        
        if (category.Contains("ScreenshotService", StringComparison.OrdinalIgnoreCase) ||
            category.Contains("IntervalScreenshotService", StringComparison.OrdinalIgnoreCase) ||
            category.Contains("Screenshot", StringComparison.OrdinalIgnoreCase))
        {
            return "Screenshots";
        }

        if (category.Contains("TerminalService", StringComparison.OrdinalIgnoreCase) ||
            category.Contains("Terminal", StringComparison.OrdinalIgnoreCase))
        {
            return "Terminal";
        }

        if (category.Contains("PackageService", StringComparison.OrdinalIgnoreCase) ||
            category.Contains("Package", StringComparison.OrdinalIgnoreCase))
        {
            return "Packages";
        }

        if (category.Contains("EmailService", StringComparison.OrdinalIgnoreCase) ||
            category.Contains("Email", StringComparison.OrdinalIgnoreCase))
        {
            return "EmailService";
        }

        if (category.Contains("PackageBundleService", StringComparison.OrdinalIgnoreCase) ||
            category.Contains("PackageBundle", StringComparison.OrdinalIgnoreCase))
        {
            return "PackageBundles";
        }

        if (category.Contains("SettingsStore", StringComparison.OrdinalIgnoreCase) ||
            category.Contains("Settings", StringComparison.OrdinalIgnoreCase))
        {
            return "Settings";
        }

        // Default to General for other categories
        return "General";
    }

    internal LogLevel GetMinimumLevelForComponent(string componentName)
    {
        var options = _optionsMonitor.CurrentValue.Logging;
        if (options != null && options.ComponentLevels.TryGetValue(componentName, out var level))
        {
            return level;
        }
        return GetMinimumLevel();
    }

    private static string GetSubfolderForCategory(string category) => GetComponentName(category);

    private static void PruneOldFiles(string baseFolder, int retentionDays)
    {
        if (retentionDays <= 0)
        {
            return;
        }

        var threshold = DateTime.UtcNow.AddDays(-retentionDays);
        
        // Prune files in root folder (general logs)
        PruneFilesInFolder(baseFolder, threshold, "weasel-*.log");
        
        // Prune files in Archive folder (general archive)
        var archiveFolder = Path.Combine(baseFolder, "Archive");
        if (Directory.Exists(archiveFolder))
        {
            PruneFilesInFolder(archiveFolder, threshold, "weasel-*.log");
        }
        
        // Prune files in component folders and their Archive subfolders
        foreach (var componentFolder in Directory.GetDirectories(baseFolder))
        {
            var folderName = Path.GetFileName(componentFolder);
            if (folderName.Equals("Archive", StringComparison.OrdinalIgnoreCase))
            {
                continue; // Skip root Archive folder, already handled
            }
            
            // Prune component logs
            var componentPattern = $"{folderName}-*.log";
            PruneFilesInFolder(componentFolder, threshold, componentPattern);
            
            // Prune component archive logs
            var componentArchiveFolder = Path.Combine(componentFolder, "Archive");
            if (Directory.Exists(componentArchiveFolder))
            {
                PruneFilesInFolder(componentArchiveFolder, threshold, componentPattern);
            }
        }
    }
    
    private static void PruneFilesInFolder(string folder, DateTime threshold, string pattern)
    {
        if (!Directory.Exists(folder))
        {
            return;
        }
        
        foreach (var file in Directory.EnumerateFiles(folder, pattern))
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

        public bool IsEnabled(LogLevel logLevel)
        {
            var component = FileLoggerProvider.GetComponentName(_category);
            return logLevel >= _provider.GetMinimumLevelForComponent(component);
        }

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

