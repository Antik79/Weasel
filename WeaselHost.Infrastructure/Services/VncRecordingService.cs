using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;
using WeaselHost.Core.Models;

namespace WeaselHost.Infrastructure.Services;

public class VncRecordingService : IVncRecordingService
{
    private readonly ILogger<VncRecordingService> _logger;
    private readonly IOptionsMonitor<WeaselHostOptions> _options;
    private readonly ConcurrentDictionary<string, VncRecordingSession> _activeSessions = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _fileLocks = new();

    public VncRecordingService(
        ILogger<VncRecordingService> logger,
        IOptionsMonitor<WeaselHostOptions> options)
    {
        _logger = logger;
        _options = options;
    }

    public Task<VncRecordingSession> StartRecordingAsync(string profileId, string profileName, CancellationToken cancellationToken = default)
    {
        var config = _options.CurrentValue.Vnc.Recording;
        var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        var sanitizedProfileName = SanitizeFileName(profileName);

        // Determine output folder
        var outputFolder = config.UseProfileSubfolders
            ? Path.Combine(config.RootFolder, sanitizedProfileName)
            : config.RootFolder;

        // Create folder if doesn't exist
        Directory.CreateDirectory(outputFolder);

        var filename = $"{timestamp}_{sanitizedProfileName}.webm";
        var outputPath = Path.Combine(outputFolder, filename);

        var session = new VncRecordingSession
        {
            Id = Guid.NewGuid().ToString(),
            ProfileId = profileId,
            ProfileName = profileName,
            StartedAt = DateTimeOffset.Now,
            OutputPath = outputPath,
            State = RecordingState.Starting,
            MotionDetectionEnabled = config.EnableMotionDetection
        };

        _activeSessions[session.Id] = session;
        _fileLocks[session.Id] = new SemaphoreSlim(1, 1);

        // Update state to Recording
        session.State = RecordingState.Recording;

        _logger.LogInformation("VNC recording started: SessionId={SessionId}, Profile={ProfileName}, OutputPath={OutputPath}",
            session.Id, session.ProfileName, session.OutputPath);

        // Schedule auto-stop based on max duration
        if (config.MaxRecordingDurationMinutes > 0)
        {
            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromMinutes(config.MaxRecordingDurationMinutes), cancellationToken);
                if (_activeSessions.ContainsKey(session.Id))
                {
                    _logger.LogWarning("VNC recording max duration reached: SessionId={SessionId}", session.Id);
                    await StopRecordingAsync(session.Id, cancellationToken);
                }
            }, cancellationToken);
        }

        return Task.FromResult(session);
    }

    public async Task StopRecordingAsync(string sessionId, CancellationToken cancellationToken = default)
    {
        if (!_activeSessions.TryRemove(sessionId, out var session))
        {
            _logger.LogWarning("Attempted to stop non-existent recording session: {SessionId}", sessionId);
            return;
        }

        session.StoppedAt = DateTimeOffset.Now;
        session.State = RecordingState.Stopped;

        var duration = session.StoppedAt.Value - session.StartedAt;

        // Get file size
        if (File.Exists(session.OutputPath))
        {
            var fileInfo = new FileInfo(session.OutputPath);
            session.FileSizeBytes = fileInfo.Length;

            // Save metadata JSON
            await SaveMetadataAsync(session, cancellationToken);
        }

        _logger.LogInformation("VNC recording stopped: SessionId={SessionId}, Duration={Duration}, Size={SizeBytes}",
            session.Id, duration, session.FileSizeBytes);

        // Remove file lock
        if (_fileLocks.TryRemove(sessionId, out var fileLock))
        {
            fileLock.Dispose();
        }
    }

    public Task<VncRecordingSession?> GetSessionAsync(string sessionId, CancellationToken cancellationToken = default)
    {
        _activeSessions.TryGetValue(sessionId, out var session);
        return Task.FromResult(session);
    }

    public Task<List<VncRecordingSession>> GetActiveSessionsAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_activeSessions.Values.ToList());
    }

    public Task<List<RecordingMetadata>> GetRecordingsAsync(string? profileId = null, CancellationToken cancellationToken = default)
    {
        var config = _options.CurrentValue.Vnc.Recording;
        var recordings = new List<RecordingMetadata>();

        if (!Directory.Exists(config.RootFolder))
        {
            return Task.FromResult(recordings);
        }

        // Search for .webm files
        var webmFiles = Directory.GetFiles(config.RootFolder, "*.webm", SearchOption.AllDirectories);

        foreach (var webmFile in webmFiles)
        {
            var metadataFile = Path.ChangeExtension(webmFile, ".metadata.json");

            if (File.Exists(metadataFile))
            {
                try
                {
                    var json = File.ReadAllText(metadataFile);
                    var metadata = JsonSerializer.Deserialize<RecordingMetadata>(json);

                    if (metadata != null)
                    {
                        // Filter by profileId if specified
                        if (profileId == null || metadata.ProfileId == profileId)
                        {
                            recordings.Add(metadata);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to load metadata from {MetadataFile}", metadataFile);
                }
            }
        }

        return Task.FromResult(recordings.OrderByDescending(r => r.StartedAt).ToList());
    }

    public Task DeleteRecordingAsync(string recordingId, CancellationToken cancellationToken = default)
    {
        var config = _options.CurrentValue.Vnc.Recording;

        if (!Directory.Exists(config.RootFolder))
        {
            return Task.CompletedTask;
        }

        // Find metadata file with matching recordingId
        var metadataFiles = Directory.GetFiles(config.RootFolder, "*.metadata.json", SearchOption.AllDirectories);

        foreach (var metadataFile in metadataFiles)
        {
            try
            {
                var json = File.ReadAllText(metadataFile);
                var metadata = JsonSerializer.Deserialize<RecordingMetadata>(json);

                if (metadata?.RecordingId == recordingId)
                {
                    // Delete .webm file
                    var webmFile = Path.ChangeExtension(metadataFile, ".webm");
                    if (File.Exists(webmFile))
                    {
                        File.Delete(webmFile);
                        _logger.LogInformation("Deleted recording file: {WebmFile}", webmFile);
                    }

                    // Delete metadata file
                    File.Delete(metadataFile);
                    _logger.LogInformation("Deleted recording metadata: {MetadataFile}", metadataFile);

                    break;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete recording {RecordingId}", recordingId);
            }
        }

        return Task.CompletedTask;
    }

    public Task<int> CleanupOldRecordingsAsync(CancellationToken cancellationToken = default)
    {
        var config = _options.CurrentValue.Vnc.Recording;
        var cutoffDate = DateTime.Now.AddDays(-config.RetentionDays);
        var deletedCount = 0;

        if (!Directory.Exists(config.RootFolder))
        {
            return Task.FromResult(deletedCount);
        }

        var metadataFiles = Directory.GetFiles(config.RootFolder, "*.metadata.json", SearchOption.AllDirectories);

        foreach (var metadataFile in metadataFiles)
        {
            try
            {
                var json = File.ReadAllText(metadataFile);
                var metadata = JsonSerializer.Deserialize<RecordingMetadata>(json);

                if (metadata != null && metadata.StartedAt < cutoffDate)
                {
                    // Delete .webm file
                    var webmFile = Path.ChangeExtension(metadataFile, ".webm");
                    if (File.Exists(webmFile))
                    {
                        File.Delete(webmFile);
                    }

                    // Delete metadata file
                    File.Delete(metadataFile);
                    deletedCount++;

                    _logger.LogInformation("Cleaned up old recording: {RecordingId}, StartedAt={StartedAt}",
                        metadata.RecordingId, metadata.StartedAt);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process metadata file during cleanup: {MetadataFile}", metadataFile);
            }
        }

        _logger.LogInformation("Cleanup completed: Deleted {Count} old recordings", deletedCount);
        return Task.FromResult(deletedCount);
    }

    public async Task ReceiveChunkAsync(string sessionId, byte[] chunkData, CancellationToken cancellationToken = default)
    {
        if (!_activeSessions.TryGetValue(sessionId, out var session))
        {
            _logger.LogWarning("Received chunk for non-existent session: {SessionId}", sessionId);
            return;
        }

        if (!_fileLocks.TryGetValue(sessionId, out var fileLock))
        {
            _logger.LogError("File lock not found for session: {SessionId}", sessionId);
            return;
        }

        await fileLock.WaitAsync(cancellationToken);
        try
        {
            // Append chunk to file
            await using var fileStream = new FileStream(session.OutputPath, FileMode.Append, FileAccess.Write, FileShare.None);
            await fileStream.WriteAsync(chunkData, cancellationToken);

            // Update session stats
            session.ChunksReceived++;
            session.FileSizeBytes += chunkData.Length;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "VNC recording chunk upload failed: SessionId={SessionId}", sessionId);
            session.State = RecordingState.Error;
        }
        finally
        {
            fileLock.Release();
        }
    }

    public Task UpdateFrameStatsAsync(string sessionId, bool motionDetected, CancellationToken cancellationToken = default)
    {
        if (_activeSessions.TryGetValue(sessionId, out var session))
        {
            if (motionDetected)
            {
                session.FramesRecorded++;
                if (session.State == RecordingState.Paused)
                {
                    session.State = RecordingState.Recording;
                }
            }
            else
            {
                session.FramesSkipped++;
                if (session.State == RecordingState.Recording && session.MotionDetectionEnabled)
                {
                    session.State = RecordingState.Paused;
                }
            }
        }

        return Task.CompletedTask;
    }

    private async Task SaveMetadataAsync(VncRecordingSession session, CancellationToken cancellationToken)
    {
        var metadata = new RecordingMetadata
        {
            RecordingId = session.Id,
            ProfileId = session.ProfileId,
            ProfileName = session.ProfileName,
            StartedAt = session.StartedAt,
            StoppedAt = session.StoppedAt,
            Duration = session.StoppedAt.HasValue ? session.StoppedAt.Value - session.StartedAt : TimeSpan.Zero,
            FileSizeBytes = session.FileSizeBytes,
            FilePath = session.OutputPath,
            Codec = "VP9/VP8/H264", // Browser-dependent
            Fps = _options.CurrentValue.Vnc.Recording.RecordingFps,
            MotionDetectionEnabled = session.MotionDetectionEnabled,
            FramesRecorded = session.FramesRecorded,
            FramesSkipped = session.FramesSkipped
        };

        var metadataPath = Path.ChangeExtension(session.OutputPath, ".metadata.json");
        var json = JsonSerializer.Serialize(metadata, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(metadataPath, json, cancellationToken);
    }

    private static string SanitizeFileName(string fileName)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        return string.Join("_", fileName.Split(invalidChars, StringSplitOptions.RemoveEmptyEntries)).TrimEnd('.');
    }
}
