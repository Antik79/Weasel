using WeaselHost.Core.Models;

namespace WeaselHost.Core.Abstractions;

public interface IVncRecordingService
{
    Task<VncRecordingSession> StartRecordingAsync(string profileId, string profileName, CancellationToken cancellationToken = default);
    Task StopRecordingAsync(string sessionId, CancellationToken cancellationToken = default);
    Task<VncRecordingSession?> GetSessionAsync(string sessionId, CancellationToken cancellationToken = default);
    Task<List<VncRecordingSession>> GetActiveSessionsAsync(CancellationToken cancellationToken = default);
    Task<List<RecordingMetadata>> GetRecordingsAsync(string? profileId = null, CancellationToken cancellationToken = default);
    Task DeleteRecordingAsync(string recordingId, CancellationToken cancellationToken = default);
    Task<int> CleanupOldRecordingsAsync(CancellationToken cancellationToken = default);
    Task ReceiveChunkAsync(string sessionId, byte[] chunkData, CancellationToken cancellationToken = default);
    Task UpdateFrameStatsAsync(string sessionId, bool motionDetected, CancellationToken cancellationToken = default);
}
