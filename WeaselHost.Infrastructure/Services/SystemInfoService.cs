using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Runtime.CompilerServices;
using System.Security.Principal;
using Microsoft.Win32;

namespace WeaselHost.Infrastructure.Services;

public sealed class SystemInfoService : ISystemInfoService, IDisposable
{
    private readonly PerformanceCounter _cpuCounter = new("Processor", "% Processor Time", "_Total");
    private readonly PerformanceCounter _memoryCounter = new("Memory", "% Committed Bytes In Use");

    public async Task<SystemStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        _ = _cpuCounter.NextValue();
        await Task.Delay(TimeSpan.FromMilliseconds(250), cancellationToken);
        var cpuUsage = Math.Round(_cpuCounter.NextValue(), 2);
        var memoryUsage = Math.Round(_memoryCounter.NextValue(), 2);

        var drives = DriveInfo.GetDrives()
            .Where(drive => drive.DriveType == DriveType.Fixed && drive.IsReady)
            .Select(drive => new DriveStatus(drive.Name, drive.TotalSize, drive.TotalFreeSpace))
            .ToList()
            .AsReadOnly();

        var hostname = Dns.GetHostName();
        var ipAddress = Dns.GetHostEntry(hostname).AddressList
            .FirstOrDefault(ip => ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
            ?.ToString() ?? "127.0.0.1";

        return new SystemStatus(hostname, ipAddress, cpuUsage, memoryUsage, drives, DateTimeOffset.UtcNow);
    }

    public async IAsyncEnumerable<EventLogEntryDto> ReadEventsAsync(EventLogQueryOptions options, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(options);
        await Task.Yield();
        var maxCount = Math.Clamp(options.MaxCount, 1, 500);
        var query = new EventLogQuery(options.LogName, PathType.LogName);
        using var reader = new EventLogReader(query);

        var emitted = 0;
        for (; ; )
        {
            cancellationToken.ThrowIfCancellationRequested();
            var record = reader.ReadEvent();
            if (record is null)
            {
                yield break;
            }

            using (record)
            {
                if (record.TimeCreated.HasValue)
                {
                    var timestamp = record.TimeCreated.Value.ToUniversalTime();
                    if (options.SinceUtc.HasValue && timestamp < options.SinceUtc.Value)
                    {
                        continue;
                    }

                    if (options.UntilUtc.HasValue && timestamp > options.UntilUtc.Value)
                    {
                        continue;
                    }
                }

                var level = options.LevelFilter;
                var recordLevel = record.LevelDisplayName ?? record.Level?.ToString() ?? "Info";
                if (!string.IsNullOrWhiteSpace(level) &&
                    !string.Equals(level, recordLevel, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                yield return new EventLogEntryDto(
                    record.ProviderName ?? "unknown",
                    recordLevel,
                    record.FormatDescription() ?? record.ToXml(),
                    record.TimeCreated?.ToUniversalTime() ?? DateTimeOffset.UtcNow,
                    record.Id);

                emitted++;
                if (emitted >= maxCount)
                {
                    yield break;
                }
            }
        }
    }

    public Task<List<NetworkAdapterInfo>> GetNetworkAdaptersAsync(CancellationToken cancellationToken = default)
    {
        var adapters = new List<NetworkAdapterInfo>();
        
        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
        {
            var ipProperties = adapter.GetIPProperties();
            var ipAddresses = new List<string>();
            
            foreach (var addr in ipProperties.UnicastAddresses)
            {
                if (addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork ||
                    addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
                {
                    ipAddresses.Add(addr.Address.ToString());
                }
            }

            adapters.Add(new NetworkAdapterInfo(
                adapter.Id,
                adapter.Name,
                adapter.Description,
                adapter.OperationalStatus.ToString(),
                adapter.GetPhysicalAddress().ToString(),
                ipAddresses,
                adapter.Speed > 0 ? (long?)adapter.Speed : null));
        }

        return Task.FromResult(adapters);
    }

    public Task<NetworkAdapterStats?> GetNetworkAdapterStatsAsync(string adapterId, CancellationToken cancellationToken = default)
    {
        var adapter = NetworkInterface.GetAllNetworkInterfaces()
            .FirstOrDefault(a => a.Id == adapterId);

        if (adapter == null)
        {
            return Task.FromResult<NetworkAdapterStats?>(null);
        }

        var stats = adapter.GetIPStatistics();
        
        return Task.FromResult<NetworkAdapterStats?>(new NetworkAdapterStats(
            adapter.Id,
            stats.BytesReceived,
            stats.BytesSent,
            stats.UnicastPacketsReceived + stats.NonUnicastPacketsReceived,
            stats.UnicastPacketsSent + stats.NonUnicastPacketsSent,
            DateTimeOffset.UtcNow));
    }

    public bool IsRunningAsAdministrator()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }

    public Task RestartAsAdministratorAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var exePath = Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule?.FileName;
            if (string.IsNullOrEmpty(exePath))
            {
                throw new InvalidOperationException("Could not determine executable path");
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = exePath,
                UseShellExecute = true,
                Verb = "runas" // Request elevation
            };

            Process.Start(startInfo);

            // Exit the current process after starting elevated one
            Task.Run(() =>
            {
                Task.Delay(500).Wait();
                Environment.Exit(0);
            });

            return Task.CompletedTask;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException("Failed to restart as administrator", ex);
        }
    }

    public void SetStartupOnBoot(bool enable)
    {
        const string runKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string appName = "Weasel";

        using var key = Registry.CurrentUser.OpenSubKey(runKey, true);
        if (key == null) return;

        if (enable)
        {
            var exePath = Environment.ProcessPath;
            if (!string.IsNullOrEmpty(exePath))
            {
                key.SetValue(appName, $"\"{exePath}\"");
            }
        }
        else
        {
            key.DeleteValue(appName, false);
        }
    }

    public bool IsStartupOnBootEnabled()
    {
        const string runKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string appName = "Weasel";

        using var key = Registry.CurrentUser.OpenSubKey(runKey, false);
        return key?.GetValue(appName) != null;
    }

    public void Dispose()
    {
        _cpuCounter.Dispose();
        _memoryCounter.Dispose();
    }
}


