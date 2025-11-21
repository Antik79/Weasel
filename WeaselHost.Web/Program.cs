using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WeaselHost.Core.Abstractions;
using WeaselHost.Core.Configuration;
using WeaselHost.Core.Models;
using WeaselHost.Infrastructure;
using WeaselHost.Infrastructure.Services;
using WeaselHost.Web.Logging;

namespace WeaselHost.Web;

public static class Program
{
    private const string CsrfHeaderName = "X-Weasel-Csrf";
    private const string AuthHeaderName = "X-Weasel-Token";

    public static async Task Main(string[] args)
    {
        var app = BuildWebApplication(args);
        await app.RunAsync();
    }

    public static WebApplication BuildWebApplication(
        string[]? args = null,
        Action<WebApplicationBuilder>? configureBuilder = null)
    {
        var builder = WebApplication.CreateBuilder(args ?? Array.Empty<string>());
        builder.Configuration
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
            .AddJsonFile(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Weasel", "config", "appsettings.json"), optional: true, reloadOnChange: true);

        configureBuilder?.Invoke(builder);

        builder.Services.Configure<WeaselHostOptions>(builder.Configuration.GetSection("WeaselHost"));
        builder.Services.AddWeaselHostServices();
        builder.Services.AddHostedService<IntervalScreenshotService>();

        // Configure JSON serialization to use camelCase
        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        });

        // Also configure for minimal APIs
        builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
        {
            options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        });

        builder.Services.AddCors();

        var app = builder.Build();
        
        // Add file logging provider after app is built so we can get the options monitor
        var optionsMonitor = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptionsMonitor<WeaselHostOptions>>();
        var fileLoggerProvider = new WeaselHost.Web.Logging.FileLoggerProvider(optionsMonitor);
        var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();
        loggerFactory.AddProvider(fileLoggerProvider);

        app.UseCors(x => x.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
        
        // Configure static files
        var wwwrootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (Directory.Exists(wwwrootPath))
        {
            app.UseDefaultFiles(new DefaultFilesOptions
            {
                FileProvider = new PhysicalFileProvider(wwwrootPath),
                RequestPath = ""
            });
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(wwwrootPath),
                RequestPath = ""
            });
        }
        else
        {
            // Fallback if wwwroot doesn't exist
            app.UseDefaultFiles();
            app.UseStaticFiles();
        }

        var api = app.MapGroup("/api");

        var system = api.MapGroup("/system");
        system.MapGet("/info", async (ISystemInfoService sys, CancellationToken ct) => Results.Ok(await sys.GetStatusAsync(ct)));
        system.MapGet("/status", async (ISystemInfoService sys, CancellationToken ct) => Results.Ok(await sys.GetStatusAsync(ct)));
        system.MapPost("/screenshot", async (IScreenshotService s, CancellationToken ct) => 
        {
            var path = await s.CaptureAsync(ct);
            return Results.Ok(new { path });
        });
        system.MapPost("/startup", (StartupRequest request, ISystemInfoService sys) => 
        {
            sys.SetStartupOnBoot(request.enabled);
            return Results.Ok();
        });
        system.MapGet("/startup", (ISystemInfoService sys) => Results.Ok(new { enabled = sys.IsStartupOnBootEnabled() }));
        system.MapGet("/admin/status", (ISystemInfoService sys) => Results.Ok(new { isAdministrator = sys.IsRunningAsAdministrator() }));
        system.MapPost("/admin/restart", async (ISystemInfoService sys, CancellationToken ct) =>
        {
            await sys.RestartAsAdministratorAsync(ct);
            return Results.Ok();
        });
        system.MapGet("/network/adapters", async (ISystemInfoService sys, CancellationToken ct) =>
        {
            var adapters = await sys.GetNetworkAdaptersAsync(ct);
            return Results.Ok(adapters);
        });
        system.MapGet("/network/stats/{adapterId}", async (string adapterId, ISystemInfoService sys, CancellationToken ct) =>
        {
            var stats = await sys.GetNetworkAdapterStatsAsync(adapterId, ct);
            if (stats == null)
            {
                return Results.NotFound();
            }
            return Results.Ok(stats);
        });
        system.MapGet("/events", async (ISystemInfoService sys, string logName, int max = 100, string? level = null, DateTimeOffset? since = null, DateTimeOffset? until = null, CancellationToken ct = default) =>
        {
            var options = new EventLogQueryOptions(logName, max, level, since, until);
            var events = new List<EventLogEntryDto>();
            await foreach (var entry in sys.ReadEventsAsync(options, ct))
            {
                events.Add(entry);
            }
            return Results.Ok(events);
        });

        var power = api.MapGroup("/power");
        power.MapPost("/shutdown", async (PowerRequest req, IPowerService p, CancellationToken ct) => 
        {
            await p.ShutdownAsync(req.force, ct);
            return Results.Ok();
        });
        power.MapPost("/restart", async (PowerRequest req, IPowerService p, CancellationToken ct) => 
        {
            await p.RestartAsync(req.force, ct);
            return Results.Ok();
        });
        power.MapPost("/lock", async (IPowerService p, CancellationToken ct) => 
        {
            await p.LockAsync(ct);
            return Results.Ok();
        });

        var fs = api.MapGroup("/fs");
        fs.MapGet("/", async (string? path, IFileSystemService fss, CancellationToken ct) => 
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return Results.Ok(await fss.GetDrivesAsync(ct));
            }
            return Results.Ok(await fss.GetChildrenAsync(path, ct));
        });
        fs.MapGet("/drives", async (IFileSystemService fss, CancellationToken ct) => 
        {
            return Results.Ok(await fss.GetDrivesAsync(ct));
        });
        fs.MapGet("/raw", async (string path, IFileSystemService fss, CancellationToken ct) =>
        {
            var stream = await fss.OpenReadAsync(path, ct);
            return Results.File(stream, "application/octet-stream", Path.GetFileName(path));
        });
        fs.MapGet("/content", async (string path, IFileSystemService fss, CancellationToken ct) =>
        {
            using var stream = await fss.OpenReadAsync(path, ct);
            using var reader = new StreamReader(stream);
            var content = await reader.ReadToEndAsync(ct);
            return Results.Ok(content);
        });
        fs.MapPost("/upload", async (HttpRequest request, IFileSystemService fss, CancellationToken ct) => 
        {
            var form = await request.ReadFormAsync(ct);
            var file = form.Files["file"];
            var path = form["path"].ToString();
            if (file == null || string.IsNullOrEmpty(path)) return Results.BadRequest();
            using var stream = file.OpenReadStream();
            await fss.SaveFileAsync(Path.Combine(path, file.FileName), stream, true, ct);
            return Results.Ok();
        });
        fs.MapDelete("/", async (string path, IFileSystemService fss, CancellationToken ct) => 
        {
            await fss.DeleteAsync(path, ct);
            return Results.Ok();
        });
        fs.MapPost("/rename", async (RenameRequest req, IFileSystemService fss, CancellationToken ct) => 
        {
            await fss.RenameAsync(req.Path, req.NewName, ct);
            return Results.Ok();
        });
        fs.MapPost("/directory", async (DirectoryRequest req, IFileSystemService fss, CancellationToken ct) => 
        {
            await fss.CreateDirectoryAsync(Path.Combine(req.ParentPath, req.Name), ct);
            return Results.Ok();
        });
        fs.MapPost("/file", async (FileWriteRequest req, IFileSystemService fss, CancellationToken ct) =>
        {
            using var stream = new MemoryStream(Encoding.UTF8.GetBytes(req.Content));
            await fss.SaveFileAsync(req.Path, stream, true, ct);
            return Results.Ok();
        });
        fs.MapPost("/write", async (FileWriteRequest req, IFileSystemService fss, CancellationToken ct) =>
        {
            using var stream = new MemoryStream(Encoding.UTF8.GetBytes(req.Content));
            await fss.SaveFileAsync(req.Path, stream, true, ct);
            return Results.Ok();
        });
        fs.MapPost("/zip", async (BulkZipRequest req, IFileSystemService fss, CancellationToken ct) =>
        {
            await fss.CreateZipAsync(req.SourcePaths, req.ZipFilePath, ct);
            return Results.Ok();
        });
        fs.MapPost("/bulk/zip", async (BulkZipRequest req, IFileSystemService fss, CancellationToken ct) =>
        {
            await fss.CreateZipAsync(req.SourcePaths, req.ZipFilePath, ct);
            return Results.Ok();
        });
        fs.MapPost("/unzip", async (UnzipRequest req, IFileSystemService fss, CancellationToken ct) =>
        {
            await fss.ExtractZipAsync(req.ZipFilePath, req.DestinationPath, ct);
            return Results.Ok();
        });
        fs.MapPost("/bulk/delete", async (BulkDeleteRequest req, IFileSystemService fss, CancellationToken ct) =>
        {
            foreach (var path in req.Paths)
            {
                await fss.DeleteAsync(path, ct);
            }
            return Results.Ok();
        });
        fs.MapPost("/bulk/copy", async (BulkCopyRequest req, IFileSystemService fss, CancellationToken ct) =>
        {
            foreach (var sourcePath in req.SourcePaths)
            {
                var fileName = Path.GetFileName(sourcePath);
                var destPath = Path.Combine(req.DestinationPath, fileName);
                await fss.CopyAsync(sourcePath, destPath, ct);
            }
            return Results.Ok();
        });
        fs.MapPost("/bulk/move", async (BulkMoveRequest req, IFileSystemService fss, CancellationToken ct) =>
        {
            foreach (var sourcePath in req.SourcePaths)
            {
                var fileName = Path.GetFileName(sourcePath);
                var destPath = Path.Combine(req.DestinationPath, fileName);
                await fss.MoveAsync(sourcePath, destPath, ct);
            }
            return Results.Ok();
        });
        fs.MapPost("/download/bulk", async (BulkDownloadRequest req, IFileSystemService fss, HttpContext context, CancellationToken ct) =>
        {
            var tempZip = Path.Combine(Path.GetTempPath(), $"bulk-download-{Guid.NewGuid()}.zip");
            try
            {
                await fss.CreateZipAsync(req.Paths, tempZip, ct);
                var stream = await fss.OpenReadAsync(tempZip, ct);
                return Results.File(stream, "application/zip", "download.zip");
            }
            finally
            {
                if (File.Exists(tempZip))
                {
                    try { File.Delete(tempZip); } catch { }
                }
            }
        });

        MapProcessEndpoints(api.MapGroup("/processes"));
        MapServiceEndpoints(api.MapGroup("/services"));
        MapPackageEndpoints(api.MapGroup("/packages"));
        MapSettingsEndpoints(api.MapGroup("/settings"));
        MapLogEndpoints(api.MapGroup("/logs"));
        MapDiskMonitoringEndpoints(api.MapGroup("/disk-monitoring"));
        MapApplicationMonitorEndpoints(api.MapGroup("/application-monitor"));

        // SPA fallback - serve index.html for all non-API routes
        app.MapFallbackToFile("index.html");

        return app;
    }

    private static void MapProcessEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/", async (IProcessService processService, CancellationToken cancellationToken) =>
        {
            var processes = await processService.GetProcessesAsync(cancellationToken);
            return Results.Ok(processes);
        });

        group.MapPost("/{pid:int}/terminate", async (int pid, IProcessService processService, CancellationToken cancellationToken) =>
        {
            await processService.TerminateAsync(pid, true, cancellationToken);
            return Results.Ok();
        });
        group.MapDelete("/{pid:int}", async (int pid, IProcessService processService, CancellationToken cancellationToken) =>
        {
            await processService.TerminateAsync(pid, true, cancellationToken);
            return Results.Ok();
        });
    }

    private static void MapServiceEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/", async (ISystemServiceManager serviceManager, string? status) =>
        {
            var services = await serviceManager.GetServicesAsync(status);
            return Results.Ok(services);
        });

        group.MapPost("/{serviceName}/start", async (string serviceName, ISystemServiceManager serviceManager, CancellationToken cancellationToken) =>
        {
            await serviceManager.StartAsync(serviceName, cancellationToken);
            return Results.Ok();
        });

        group.MapPost("/{serviceName}/stop", async (string serviceName, ISystemServiceManager serviceManager, CancellationToken cancellationToken) =>
        {
            await serviceManager.StopAsync(serviceName, cancellationToken);
            return Results.Ok();
        });

        group.MapPost("/{serviceName}/restart", async (string serviceName, ISystemServiceManager serviceManager, CancellationToken cancellationToken) =>
        {
            await serviceManager.RestartAsync(serviceName, cancellationToken);
            return Results.Ok();
        });
    }

    private static void MapPackageEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/", async (IPackageService packageService, CancellationToken cancellationToken) =>
        {
            var packages = await packageService.GetInstalledApplicationsAsync(cancellationToken);
            return Results.Ok(packages);
        });

        group.MapPost("/install", async (PackageRequest request, IPackageService packageService, CancellationToken cancellationToken) =>
        {
            var result = await packageService.InstallAsync(request.Identifier, cancellationToken);
            return Results.Ok(result);
        });

        group.MapPost("/uninstall", async (PackageRequest request, IPackageService packageService, CancellationToken cancellationToken) =>
        {
            var result = await packageService.UninstallAsync(request.Identifier, cancellationToken);
            return Results.Ok(result);
        });

        group.MapGet("/show", async (string identifier, IPackageService packageService, CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(identifier))
            {
                return Results.BadRequest(new { error = "Package identifier or moniker is required" });
            }

            var result = await packageService.ShowAsync(identifier, cancellationToken);
            return Results.Ok(result);
        });

        group.MapGet("/search", async (string query, IPackageService packageService, CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return Results.BadRequest(new { error = "Search query is required" });
            }
            
            // Create a cancellation token with a longer timeout for search operations (90 seconds)
            using var searchCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            searchCts.CancelAfter(TimeSpan.FromSeconds(90));
            
            try
            {
                var results = await packageService.SearchAsync(query, searchCts.Token);
                return Results.Ok(results);
            }
            catch (OperationCanceledException)
            {
                return Results.StatusCode(408); // Request Timeout
            }
        });
    }

    private static void MapSettingsEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/capture", (IOptionsMonitor<WeaselHostOptions> options) =>
            Results.Ok(options.CurrentValue.Capture));

        group.MapPut("/capture", async (CaptureOptions request, ISettingsStore settingsStore, IOptionsMonitor<WeaselHostOptions> optionsMonitor, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveCaptureSettingsAsync(request, cancellationToken);
            // Return the current value from options monitor to ensure it reflects saved config
            await Task.Delay(100, cancellationToken); // Small delay to allow config reload
            return Results.Ok(optionsMonitor.CurrentValue.Capture);
        });

        group.MapGet("/security", (IOptionsMonitor<WeaselHostOptions> options) =>
        {
            var security = options.CurrentValue.Security;
            return Results.Ok(new
            {
                requireAuthentication = security.RequireAuthentication,
                hasPassword = !string.IsNullOrWhiteSpace(security.Password)
            });
        });

        group.MapPut("/security", async (SecurityUpdateRequest request, ISettingsStore settingsStore, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveSecuritySettingsAsync(request.RequireAuthentication, request.Password, cancellationToken);
            return Results.Ok();
        });

        group.MapGet("/mail", (IOptionsMonitor<WeaselHostOptions> options) =>
            Results.Ok(options.CurrentValue.Smtp));

        group.MapPut("/mail", async (SmtpOptions request, ISettingsStore settingsStore, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveSmtpSettingsAsync(request, cancellationToken);
            return Results.Ok(request);
        });

        group.MapPost("/mail/test", async (TestEmailRequest request, IEmailService emailService, CancellationToken cancellationToken) =>
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Recipient))
                {
                    return Results.BadRequest(new { error = "Recipient email address is required." });
                }

                await emailService.SendTestEmailAsync(request.Recipient, cancellationToken);
                return Results.Ok(new { message = "Test email sent successfully" });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
            catch (System.Net.Mail.SmtpException ex)
            {
                return Results.BadRequest(new { error = $"SMTP error: {ex.Message}" });
            }
            catch (Exception ex)
            {
                return Results.Problem(
                    detail: ex.Message,
                    statusCode: 500,
                    title: "Failed to send test email"
                );
            }
        });

        group.MapGet("/logging", (IOptionsMonitor<WeaselHostOptions> options) =>
            Results.Ok(options.CurrentValue.Logging));

        group.MapPut("/logging", async (LoggingOptions request, ISettingsStore settingsStore, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveLoggingSettingsAsync(request, cancellationToken);
            return Results.Ok(request);
        });
    }

    private static void MapLogEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/", (IOptionsMonitor<WeaselHostOptions> options) =>
        {
            var folder = EnsureLogFolder(options.CurrentValue.Logging.Folder);
            var files = Directory.Exists(folder)
                ? Directory.GetFiles(folder, "*.log")
                    .Select(path => new LogFileDto(
                        Path.GetFileName(path),
                        new FileInfo(path).Length,
                        File.GetLastWriteTimeUtc(path)))
                    .OrderByDescending(file => file.LastModified)
                    .ToList()
                : new List<LogFileDto>();

            return Results.Ok(new { folder, files });
        });

        group.MapGet("/{fileName}", (string fileName, IOptionsMonitor<WeaselHostOptions> options) =>
        {
            var folder = EnsureLogFolder(options.CurrentValue.Logging.Folder);
            var safeName = Path.GetFileName(fileName);
            if (string.IsNullOrWhiteSpace(safeName))
            {
                return Results.BadRequest("Invalid file name.");
            }

            var path = Path.Combine(folder, safeName);
            if (!File.Exists(path))
            {
                return Results.NotFound();
            }

            var stream = File.OpenRead(path);
            return Results.File(stream, "text/plain", safeName, enableRangeProcessing: true);
        });
    }

    private static void MapDiskMonitoringEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/status", async (IDiskMonitorService monitor, CancellationToken cancellationToken) =>
        {
            var status = await monitor.GetStatusAsync(cancellationToken);
            return Results.Ok(status);
        });

        group.MapGet("/config", (IOptionsMonitor<WeaselHostOptions> options) =>
            Results.Ok(options.CurrentValue.DiskMonitoring));

        group.MapPut("/config", async (DiskMonitoringOptions request, IDiskMonitorService monitor, ISettingsStore settingsStore, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveDiskMonitoringSettingsAsync(request, cancellationToken);
            await monitor.UpdateConfigurationAsync(request, cancellationToken);
            return Results.Ok(request);
        });

        group.MapGet("/drives", () =>
        {
            var drives = DriveInfo.GetDrives()
                .Where(d => d.DriveType == DriveType.Fixed && d.IsReady)
                .Select(d => new { name = d.Name.TrimEnd('\\'), totalBytes = d.TotalSize, freeBytes = d.TotalFreeSpace })
                .ToList();
            return Results.Ok(drives);
        });
    }

    private static void MapApplicationMonitorEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/config", (IOptionsMonitor<WeaselHostOptions> options) =>
            Results.Ok(options.CurrentValue.ApplicationMonitor));

        group.MapPut("/config", async (ApplicationMonitorOptions request, ISettingsStore settingsStore, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveApplicationMonitorSettingsAsync(request, cancellationToken);
            return Results.Ok(request);
        });

        group.MapGet("/status", () =>
        {
            // Return basic status - could be enhanced to show which apps are running
            return Results.Ok(new { isEnabled = true });
        });
    }

    private static string EnsureLogFolder(string? configuredFolder)
    {
        var folder = string.IsNullOrWhiteSpace(configuredFolder)
            ? Path.Combine(AppContext.BaseDirectory, "logs")
            : configuredFolder;
        Directory.CreateDirectory(folder);
        return folder;
    }

    private record LogFileDto(string Name, long SizeBytes, DateTime LastModified);

    private record SecurityUpdateRequest(bool RequireAuthentication, string? Password);

    private record TestEmailRequest(string Recipient);

    private record FileWriteRequest(string Path, string Content);

    private record BulkDeleteRequest(List<string> Paths);

    private record BulkMoveRequest(List<string> SourcePaths, string DestinationPath);

    private record BulkCopyRequest(List<string> SourcePaths, string DestinationPath);

    private record BulkZipRequest(List<string> SourcePaths, string ZipFilePath);

    private record UnzipRequest(string ZipFilePath, string DestinationPath);

    private record BulkDownloadRequest(List<string> Paths);

    private record DirectoryRequest(string ParentPath, string Name);

    private record RenameRequest(string Path, string NewName);

    private record PackageRequest(string Identifier);

    private record StartupRequest(bool enabled);

    private record PowerRequest(bool force = false);

    private static string ResolvePath(string? path) =>
        string.IsNullOrWhiteSpace(path)
            ? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
            : path;

    private static bool TokensMatch(string provided, string expected)
    {
        var providedBytes = Encoding.UTF8.GetBytes(provided);
        var expectedBytes = Encoding.UTF8.GetBytes(expected);

        if (providedBytes.Length != expectedBytes.Length)
        {
            return false;
        }

        var result = CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes);
        Array.Clear(providedBytes);
        return result;
    }
}

