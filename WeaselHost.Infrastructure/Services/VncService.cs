using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;

namespace WeaselHost.Infrastructure.Services;

public sealed class VncService : IVncService, IDisposable
{
    private readonly ILogger<VncService>? _logger;
    private readonly IOptionsMonitor<WeaselHostOptions> _optionsMonitor;
    private readonly object _lock = new();
    private bool _isRunning;
    private int _port;
    private bool _allowRemote;
    private string? _password;
    private int _connectionCount;
    private CancellationTokenSource? _cancellationTokenSource;
    private Task? _serverTask;
    private TcpListener? _listener;
    private readonly List<VncConnectionHandler> _connections = new();

    public VncService(
        IOptionsMonitor<WeaselHostOptions> optionsMonitor,
        ILogger<VncService>? logger = null)
    {
        _optionsMonitor = optionsMonitor;
        _logger = logger;
    }

    public Task StartAsync(int port, string? password, bool allowRemote, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            if (_isRunning)
            {
                _logger?.LogWarning("VNC server is already running on port {Port}", _port);
                return Task.CompletedTask;
            }

            _port = port;
            _allowRemote = allowRemote;
            _password = password;
            _connectionCount = 0;
            _cancellationTokenSource = new CancellationTokenSource();
            _isRunning = true;

            _logger?.LogInformation("Starting VNC server on port {Port} (Remote: {AllowRemote})", port, allowRemote);

            _serverTask = Task.Run(async () => await RunServerAsync(_cancellationTokenSource.Token), _cancellationTokenSource.Token);

            return Task.CompletedTask;
        }
    }

    private async Task RunServerAsync(CancellationToken cancellationToken)
    {
        try
        {
            var ipAddress = _allowRemote ? IPAddress.Any : IPAddress.Loopback;
            _listener = new TcpListener(ipAddress, _port);
            _listener.Start();

            _logger?.LogInformation("VNC server listening on {Address}:{Port}", ipAddress, _port);

            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    var client = await _listener.AcceptTcpClientAsync();
                    _ = Task.Run(async () => await HandleClientAsync(client, cancellationToken), cancellationToken);
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        _logger?.LogError(ex, "Error accepting VNC client connection");
                    }
                }
            }
        }
        catch (SocketException ex) when (ex.SocketErrorCode == SocketError.AddressAlreadyInUse || ex.SocketErrorCode == SocketError.AccessDenied)
        {
            lock (_lock)
            {
                _isRunning = false;
                _connectionCount = 0;
                _listener?.Stop();
                _listener = null;
            }
            var errorMsg = ex.SocketErrorCode == SocketError.AddressAlreadyInUse
                ? $"Port {_port} is already in use. Please choose a different port."
                : $"Access denied binding to port {_port}. Please check permissions or choose a different port.";
            _logger?.LogError(ex, "VNC server error: {Error}", errorMsg);
            throw new InvalidOperationException(errorMsg, ex);
        }
        catch (Exception ex)
        {
            lock (_lock)
            {
                _isRunning = false;
                _connectionCount = 0;
                _listener?.Stop();
                _listener = null;
            }
            _logger?.LogError(ex, "VNC server error");
            throw;
        }
        finally
        {
            lock (_lock)
            {
                if (_isRunning)
                {
                    _isRunning = false;
                    _connectionCount = 0;
                    _listener?.Stop();
                    _listener = null;
                }
            }
            _logger?.LogInformation("VNC server stopped");
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        VncConnectionHandler? handler = null;
        try
        {
            lock (_lock)
            {
                _connectionCount++;
            }

            _logger?.LogInformation("VNC client connected from {EndPoint}. Total connections: {Count}", 
                client.Client.RemoteEndPoint, _connectionCount);

            handler = new VncConnectionHandler(client, _password, _logger);
            lock (_lock)
            {
                _connections.Add(handler);
            }

            await handler.HandleAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error handling VNC client");
        }
        finally
        {
            handler?.Dispose();
            lock (_lock)
            {
                _connections.Remove(handler!);
                _connectionCount = Math.Max(0, _connectionCount - 1);
            }
            _logger?.LogInformation("VNC client disconnected. Total connections: {Count}", _connectionCount);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            if (!_isRunning)
            {
                return Task.CompletedTask;
            }

            _logger?.LogInformation("Stopping VNC server");

            _cancellationTokenSource?.Cancel();
            _listener?.Stop();
            
            foreach (var connection in _connections.ToList())
            {
                connection.Dispose();
            }
            _connections.Clear();
            
            _isRunning = false;

            return _serverTask ?? Task.CompletedTask;
        }
    }

    public Task<VncStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            return Task.FromResult(new VncStatus(
                _isRunning,
                _port,
                _connectionCount,
                _allowRemote));
        }
    }

    public Task<int> GetConnectionCountAsync(CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            return Task.FromResult(_connectionCount);
        }
    }

    public void Dispose()
    {
        StopAsync().GetAwaiter().GetResult();
        _cancellationTokenSource?.Dispose();
        _listener?.Stop();
        foreach (var connection in _connections)
        {
            connection.Dispose();
        }
    }
}

