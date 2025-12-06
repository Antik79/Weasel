using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Pipes;
using Microsoft.Extensions.Logging;
using WeaselHost.Core.Abstractions;

namespace WeaselHost.Infrastructure.Services;

public sealed class TerminalService : ITerminalService, IDisposable
{
    private readonly ILogger<TerminalService> _logger;
    private readonly ConcurrentDictionary<string, TerminalSessionInfo> _sessions = new();
    private readonly object _lock = new();
    private bool _disposed;

    public TerminalService(ILogger<TerminalService> logger)
    {
        _logger = logger;
    }

    public Task<TerminalSession> CreateTerminalAsync(string shellType, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            if (_disposed)
            {
                throw new ObjectDisposedException(nameof(TerminalService));
            }

            var sessionId = Guid.NewGuid().ToString();
            var process = CreateShellProcess(shellType);
            
            process.Start();
            
            var session = new TerminalSession(
                sessionId,
                process.Id,
                shellType,
                DateTime.UtcNow);

            var sessionInfo = new TerminalSessionInfo
            {
                Session = session,
                Process = process,
                StandardInput = process.StandardInput,
                StandardOutput = process.StandardOutput,
                StandardError = process.StandardError
            };

            _sessions[sessionId] = sessionInfo;

            // Monitor process exit
            process.Exited += (sender, e) =>
            {
                _logger.LogInformation("Terminal process {ProcessId} exited for session {SessionId}", process.Id, sessionId);
                _sessions.TryRemove(sessionId, out _);
                process.Dispose();
            };

            process.EnableRaisingEvents = true;

            _logger.LogInformation("Created terminal session {SessionId} with process {ProcessId} (shell: {ShellType})", 
                sessionId, process.Id, shellType);

            return Task.FromResult(session);
        }
    }

    public Task ResizeTerminalAsync(string sessionId, int rows, int cols, CancellationToken cancellationToken = default)
    {
        if (!_sessions.TryGetValue(sessionId, out var sessionInfo))
        {
            throw new InvalidOperationException($"Terminal session {sessionId} not found");
        }

        // Windows doesn't support dynamic terminal resizing for cmd.exe or PowerShell
        // This is a placeholder for future implementation if needed
        _logger.LogDebug("Resize requested for terminal {SessionId} to {Rows}x{Cols} (not implemented on Windows)", 
            sessionId, rows, cols);

        return Task.CompletedTask;
    }

    public Task CloseTerminalAsync(string sessionId, CancellationToken cancellationToken = default)
    {
        if (!_sessions.TryGetValue(sessionId, out var sessionInfo))
        {
            return Task.CompletedTask;
        }

        try
        {
            if (!sessionInfo.Process.HasExited)
            {
                sessionInfo.Process.Kill();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error closing terminal session {SessionId}", sessionId);
        }
        finally
        {
            _sessions.TryRemove(sessionId, out _);
            sessionInfo.Process.Dispose();
            _logger.LogInformation("Closed terminal session {SessionId}", sessionId);
        }

        return Task.CompletedTask;
    }

    public Task<bool> IsTerminalActiveAsync(string sessionId, CancellationToken cancellationToken = default)
    {
        if (!_sessions.TryGetValue(sessionId, out var sessionInfo))
        {
            return Task.FromResult(false);
        }

        return Task.FromResult(!sessionInfo.Process.HasExited);
    }

    public Stream? GetTerminalInputStream(string sessionId)
    {
        if (!_sessions.TryGetValue(sessionId, out var sessionInfo))
        {
            return null;
        }

        return sessionInfo.StandardInput?.BaseStream;
    }

    public Stream? GetTerminalOutputStream(string sessionId)
    {
        if (!_sessions.TryGetValue(sessionId, out var sessionInfo))
        {
            return null;
        }

        // Combine stdout and stderr for terminal output
        return sessionInfo.StandardOutput?.BaseStream;
    }

    public StreamReader? GetTerminalOutputReader(string sessionId)
    {
        if (!_sessions.TryGetValue(sessionId, out var sessionInfo))
        {
            return null;
        }

        return sessionInfo.StandardOutput;
    }

    public StreamWriter? GetTerminalInputWriter(string sessionId)
    {
        if (!_sessions.TryGetValue(sessionId, out var sessionInfo))
        {
            return null;
        }

        return sessionInfo.StandardInput;
    }

    public IReadOnlyList<TerminalSession> GetActiveSessions()
    {
        return _sessions.Values
            .Where(s => !s.Process.HasExited)
            .Select(s => s.Session)
            .ToList()
            .AsReadOnly();
    }

    private Process CreateShellProcess(string shellType)
    {
        var process = new Process();
        process.StartInfo.UseShellExecute = false;
        process.StartInfo.RedirectStandardInput = true;
        process.StartInfo.RedirectStandardOutput = true;
        process.StartInfo.RedirectStandardError = true;
        process.StartInfo.CreateNoWindow = true;
        process.StartInfo.WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

        if (shellType.Equals("powershell", StringComparison.OrdinalIgnoreCase))
        {
            process.StartInfo.FileName = "powershell.exe";
            process.StartInfo.Arguments = "-NoExit -NoLogo";
        }
        else
        {
            // Default to cmd.exe
            var comSpec = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
            process.StartInfo.FileName = comSpec;
            process.StartInfo.Arguments = "/K"; // Keep cmd.exe running interactively
        }

        return process;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        lock (_lock)
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;

            foreach (var (sessionId, sessionInfo) in _sessions.ToArray())
            {
                try
                {
                    if (!sessionInfo.Process.HasExited)
                    {
                        sessionInfo.Process.Kill();
                    }
                    sessionInfo.Process.Dispose();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error disposing terminal session {SessionId}", sessionId);
                }
            }

            _sessions.Clear();
        }
    }

    internal class TerminalSessionInfo
    {
        public TerminalSession Session { get; set; } = null!;
        public Process Process { get; set; } = null!;
        public StreamWriter? StandardInput { get; set; }
        public StreamReader? StandardOutput { get; set; }
        public StreamReader? StandardError { get; set; }
    }
}

