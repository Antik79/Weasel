namespace WeaselHost.Core.Abstractions;

public interface ITerminalService
{
    Task<TerminalSession> CreateTerminalAsync(string shellType, CancellationToken cancellationToken = default);
    
    Task ResizeTerminalAsync(string sessionId, int rows, int cols, CancellationToken cancellationToken = default);
    
    Task CloseTerminalAsync(string sessionId, CancellationToken cancellationToken = default);
    
    Task<bool> IsTerminalActiveAsync(string sessionId, CancellationToken cancellationToken = default);
    
    Stream? GetTerminalInputStream(string sessionId);
    
    Stream? GetTerminalOutputStream(string sessionId);
    
    System.IO.StreamReader? GetTerminalOutputReader(string sessionId);
    
    System.IO.StreamWriter? GetTerminalInputWriter(string sessionId);
    
    /// <summary>
    /// Gets all currently active terminal sessions.
    /// </summary>
    IReadOnlyList<TerminalSession> GetActiveSessions();
}

public record TerminalSession(
    string Id,
    int ProcessId,
    string ShellType,
    DateTime CreatedAt);

