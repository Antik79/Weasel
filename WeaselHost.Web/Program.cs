using System.Diagnostics;
using System.Linq;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Configuration;
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
            .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "config", "appsettings.json"), optional: true, reloadOnChange: true);

        configureBuilder?.Invoke(builder);

        builder.Services.Configure<WeaselHostOptions>(builder.Configuration.GetSection("WeaselHost"));
        // Don't register hosted services in the web server - only the tray app should run monitoring services
        builder.Services.AddWeaselHostServices(registerHostedServices: false);

        // Configure JSON serialization to use camelCase and handle enums as strings
        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
            options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

        // Also configure for minimal APIs
        builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
        {
            options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
            options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

        builder.Services.AddCors();

        // Configure minimum log level from configuration before building the app
        var options = new WeaselHostOptions();
        builder.Configuration.GetSection("WeaselHost").Bind(options);
        builder.Logging.SetMinimumLevel(options.Logging.MinimumLevel);

        var app = builder.Build();
        
        // Enable WebSockets
        app.UseWebSockets();
        
        // Add file logging provider after app is built so we can get the options monitor
        var optionsMonitor = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptionsMonitor<WeaselHostOptions>>();
        var fileLoggerProvider = new WeaselHost.Web.Logging.FileLoggerProvider(optionsMonitor);
        var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();
        loggerFactory.AddProvider(fileLoggerProvider);

        app.UseCors(x => x.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
        app.UseWebSockets();
        
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

        // Authentication middleware - must be after static files but before API routes
        var security = app.Services.GetRequiredService<IOptionsMonitor<WeaselHostOptions>>().CurrentValue.Security;
        if (security.RequireAuthentication && !string.IsNullOrWhiteSpace(security.Password))
        {
            app.Use(async (context, next) =>
            {
                // Exclude static files, health check, favicon, and the main page from authentication
                // This allows the login page to be displayed
                var path = context.Request.Path.Value ?? "";
                if (path.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase) ||
                    path == "/health" ||
                    path == "/favicon.ico" ||
                    path == "/favicon.png" ||
                    path == "/" ||
                    path.StartsWith("/index.html", StringComparison.OrdinalIgnoreCase) ||
                    path.StartsWith("/vnc-viewer", StringComparison.OrdinalIgnoreCase) ||
                    path.StartsWith("/terminal-popup", StringComparison.OrdinalIgnoreCase) ||
                    path.StartsWith("/api/vnc/ws", StringComparison.OrdinalIgnoreCase) ||
                    path.StartsWith("/api/terminal/ws", StringComparison.OrdinalIgnoreCase))
                {
                    await next();
                    return;
                }

                // For all other routes (especially API routes), require authentication
                // Try header first (preferred method)
                var tokenValue = context.Request.Headers[AuthHeaderName].FirstOrDefault();

                // Fallback to query parameter for direct browser access (screenshots, file downloads)
                if (string.IsNullOrWhiteSpace(tokenValue))
                {
                    tokenValue = context.Request.Query["token"].FirstOrDefault();
                }

                // Validate the token (same validation for both methods)
                if (string.IsNullOrWhiteSpace(tokenValue) || !TokensMatch(tokenValue!, security.Password!))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    await context.Response.WriteAsync("Authentication required.");
                    return;
                }

                await next();
            });
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
        system.MapGet("/version", (IOptionsMonitor<WeaselHostOptions> options) => 
        {
            var version = options.CurrentValue.Version;
            var assembly = System.Reflection.Assembly.GetExecutingAssembly();
            var buildDate = assembly.GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
                .FirstOrDefault() is System.Reflection.AssemblyInformationalVersionAttribute attr 
                    ? attr.InformationalVersion 
                    : assembly.GetName().Version?.ToString() ?? version;
            return Results.Ok(new { version, buildDate });
        });
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
            using var reader = new StreamReader(stream, detectEncodingFromByteOrderMarks: true);
            var content = await reader.ReadToEndAsync(ct);
            // Normalize line endings to \n for consistent display in Monaco Editor
            content = content.Replace("\r\n", "\n").Replace("\r", "\n");
            return Results.Text(content, "text/plain; charset=utf-8");
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
            // Normalize line endings to Windows format (\r\n) when saving
            var normalizedContent = req.Content.Replace("\r\n", "\n").Replace("\r", "\n").Replace("\n", Environment.NewLine);
            using var stream = new MemoryStream(Encoding.UTF8.GetBytes(normalizedContent));
            await fss.SaveFileAsync(req.Path, stream, true, ct);
            return Results.Ok();
        });
        fs.MapPost("/write", async (FileWriteRequest req, IFileSystemService fss, CancellationToken ct) =>
        {
            // Normalize line endings to Windows format (\r\n) when saving
            var normalizedContent = req.Content.Replace("\r\n", "\n").Replace("\r", "\n").Replace("\n", Environment.NewLine);
            using var stream = new MemoryStream(Encoding.UTF8.GetBytes(normalizedContent));
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
        MapPackageBundleEndpoints(api.MapGroup("/packages/bundles"));
        MapSettingsEndpoints(api.MapGroup("/settings"));
        MapLogEndpoints(api.MapGroup("/logs"));
        MapDiskMonitoringEndpoints(api.MapGroup("/disk-monitoring"));
        MapApplicationMonitorEndpoints(api.MapGroup("/application-monitor"));
        MapVncEndpoints(api.MapGroup("/vnc"));
        MapTerminalEndpoints(api.MapGroup("/terminal"));

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

    private static void MapPackageBundleEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/", async (IPackageBundleService bundleService, CancellationToken cancellationToken) =>
        {
            var bundles = await bundleService.GetAllBundlesAsync(cancellationToken);
            return Results.Ok(bundles);
        });

        group.MapGet("/{bundleId}", async (string bundleId, IPackageBundleService bundleService, CancellationToken cancellationToken) =>
        {
            var bundle = await bundleService.GetBundleAsync(bundleId, cancellationToken);
            if (bundle == null)
            {
                return Results.NotFound();
            }
            return Results.Ok(bundle);
        });

        group.MapPost("/", async (CreateBundleRequest req, IPackageBundleService bundleService, CancellationToken cancellationToken) =>
        {
            var bundle = await bundleService.CreateBundleAsync(req.Name, req.Description ?? "", cancellationToken);
            return Results.Ok(bundle);
        });

        group.MapPut("/{bundleId}", async (string bundleId, UpdateBundleRequest req, IPackageBundleService bundleService, CancellationToken cancellationToken) =>
        {
            try
            {
                List<WeaselHost.Core.Models.BundlePackage>? packages = null;
                if (req.Packages != null)
                {
                    packages = req.Packages.Select(p => new WeaselHost.Core.Models.BundlePackage(p.Id, p.Name, p.Version, p.Publisher)).ToList();
                }
                var bundle = await bundleService.UpdateBundleAsync(bundleId, req.Name, req.Description, packages, cancellationToken);
                return Results.Ok(bundle);
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
        });

        group.MapDelete("/{bundleId}", async (string bundleId, IPackageBundleService bundleService, CancellationToken cancellationToken) =>
        {
            await bundleService.DeleteBundleAsync(bundleId, cancellationToken);
            return Results.Ok();
        });

        group.MapPost("/{bundleId}/install", async (string bundleId, IPackageBundleService bundleService, IPackageService packageService, CancellationToken cancellationToken) =>
        {
            try
            {
                var results = await bundleService.InstallBundleAsync(bundleId, packageService, cancellationToken);
                return Results.Ok(results);
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
        });
    }

    private static void MapSettingsEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/capture", (IOptionsMonitor<WeaselHostOptions> options) =>
            Results.Ok(options.CurrentValue.Capture));

        group.MapPut("/capture", async (CaptureOptions request, ISettingsStore settingsStore, IOptionsMonitor<WeaselHostOptions> optionsMonitor, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            try
            {
                await settingsStore.SaveCaptureSettingsAsync(request, cancellationToken);
                // Return the current value from options monitor to ensure it reflects saved config
                await Task.Delay(100, cancellationToken); // Small delay to allow config reload
                return Results.Ok(optionsMonitor.CurrentValue.Capture);
            }
            catch (Exception ex)
            {
                var logger = loggerFactory.CreateLogger("CaptureSettings");
                logger.LogError(ex, "Failed to save capture settings");
                return Results.Problem($"Failed to save settings: {ex.Message}", statusCode: 500);
            }
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

        group.MapPut("/logging", async (LoggingOptions request, ISettingsStore settingsStore, IOptionsMonitor<WeaselHostOptions> optionsMonitor, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveLoggingSettingsAsync(request, cancellationToken);
            // Wait a bit for config to reload
            await Task.Delay(500, cancellationToken);
            return Results.Ok(optionsMonitor.CurrentValue.Logging);
        });

        group.MapGet("/ui-preferences", (IOptionsMonitor<WeaselHostOptions> options) =>
            Results.Ok(options.CurrentValue.UiPreferences));

        group.MapPut("/ui-preferences", async (UiPreferencesOptions request, ISettingsStore settingsStore, IOptionsMonitor<WeaselHostOptions> optionsMonitor, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveUiPreferencesAsync(request, cancellationToken);
            // Wait a bit for config to reload
            await Task.Delay(500, cancellationToken);
            return Results.Ok(optionsMonitor.CurrentValue.UiPreferences);
        });

        group.MapGet("/file-explorer", (IOptionsMonitor<WeaselHostOptions> options) =>
            Results.Ok(options.CurrentValue.FileExplorer));

        group.MapPut("/file-explorer", async (FileExplorerOptions request, ISettingsStore settingsStore, IOptionsMonitor<WeaselHostOptions> optionsMonitor, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveFileExplorerSettingsAsync(request, cancellationToken);
            // Wait a bit for config to reload
            await Task.Delay(500, cancellationToken);
            return Results.Ok(optionsMonitor.CurrentValue.FileExplorer);
        });
    }

    private static void MapLogEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/", (IOptionsMonitor<WeaselHostOptions> options, string? subfolder) =>
        {
            var baseFolder = EnsureLogFolder(options.CurrentValue.Logging.Folder);
            
            // Determine target folder - handle root, component folders, and Archive subfolders
            string folder;
            string? pattern = null;
            
            if (string.IsNullOrWhiteSpace(subfolder))
            {
                // Root level - show general logs (weasel-*.log)
                folder = baseFolder;
                pattern = "weasel-*.log";
            }
            else
            {
                // Handle subfolder paths like "VNC", "VNC/Archive", "Archive"
                var parts = subfolder.Split('/', StringSplitOptions.RemoveEmptyEntries)
                    .Where(p => !string.IsNullOrWhiteSpace(p))
                    .Select(p => Path.GetFileName(p)) // Sanitize each part
                    .ToArray();
                
                if (parts.Length == 0)
                {
                    folder = baseFolder;
                    pattern = "weasel-*.log";
                }
                else if (parts.Length == 1)
                {
                    if (parts[0].Equals("Archive", StringComparison.OrdinalIgnoreCase))
                    {
                        // Root Archive folder
                        folder = Path.Combine(baseFolder, "Archive");
                        pattern = "weasel-*.log";
                    }
                    else
                    {
                        // Component folder (e.g., "VNC")
                        folder = Path.Combine(baseFolder, parts[0]);
                        pattern = $"{parts[0]}-*.log";
                    }
                }
                else if (parts.Length == 2 && parts[1].Equals("Archive", StringComparison.OrdinalIgnoreCase))
                {
                    // Component Archive folder (e.g., "VNC/Archive")
                    folder = Path.Combine(baseFolder, parts[0], "Archive");
                    pattern = $"{parts[0]}-*.log";
                }
                else
                {
                    return Results.BadRequest("Invalid subfolder path.");
                }
            }
            
            if (!Directory.Exists(folder))
            {
                var emptySubfolders = string.IsNullOrWhiteSpace(subfolder) 
                    ? GetLogSubfolders(baseFolder) 
                    : new List<string>();
                return Results.Ok(new { folder, files = new List<LogFileDto>(), subfolders = emptySubfolders });
            }
            
            // Get log files matching the pattern
            var files = Directory.GetFiles(folder, pattern ?? "*.log", SearchOption.TopDirectoryOnly)
                .Select(path => new LogFileDto(
                    Path.GetFileName(path),
                    new FileInfo(path).Length,
                    File.GetLastWriteTimeUtc(path)))
                .OrderByDescending(file => file.LastModified)
                .ToList();

            // Get subfolders only at root level
            var resultSubfolders = string.IsNullOrWhiteSpace(subfolder) ? GetLogSubfolders(baseFolder) : new List<string>();

            return Results.Ok(new { folder, files, subfolders = resultSubfolders });
        });
        
        group.MapGet("/subfolders", (IOptionsMonitor<WeaselHostOptions> options) =>
        {
            var baseFolder = EnsureLogFolder(options.CurrentValue.Logging.Folder);
            var subfolders = GetLogSubfolders(baseFolder);
            return Results.Ok(subfolders);
        });

        group.MapGet("/{fileName}", (string fileName, IOptionsMonitor<WeaselHostOptions> options, string? subfolder) =>
        {
            var baseFolder = EnsureLogFolder(options.CurrentValue.Logging.Folder);
            
            // Determine target folder - same logic as GET /
            string folder;
            if (string.IsNullOrWhiteSpace(subfolder))
            {
                folder = baseFolder;
            }
            else
            {
                var parts = subfolder.Split('/', StringSplitOptions.RemoveEmptyEntries)
                    .Where(p => !string.IsNullOrWhiteSpace(p))
                    .Select(p => Path.GetFileName(p))
                    .ToArray();
                
                if (parts.Length == 0)
                {
                    folder = baseFolder;
                }
                else if (parts.Length == 1)
                {
                    if (parts[0].Equals("Archive", StringComparison.OrdinalIgnoreCase))
                    {
                        folder = Path.Combine(baseFolder, "Archive");
                    }
                    else
                    {
                        folder = Path.Combine(baseFolder, parts[0]);
                    }
                }
                else if (parts.Length == 2 && parts[1].Equals("Archive", StringComparison.OrdinalIgnoreCase))
                {
                    folder = Path.Combine(baseFolder, parts[0], "Archive");
                }
                else
                {
                    return Results.BadRequest("Invalid subfolder path.");
                }
            }
            
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

        group.MapPut("/config", async (DiskMonitoringOptions request, IDiskMonitorService monitor, ISettingsStore settingsStore, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            try
            {
                await settingsStore.SaveDiskMonitoringSettingsAsync(request, cancellationToken);
                await monitor.UpdateConfigurationAsync(request, cancellationToken);
                return Results.Ok(request);
            }
            catch (Exception ex)
            {
                var logger = loggerFactory.CreateLogger("DiskMonitoringConfig");
                logger.LogError(ex, "Failed to save disk monitoring configuration");
                return Results.Problem($"Failed to save configuration: {ex.Message}", statusCode: 500);
            }
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

        group.MapPut("/config", async (ApplicationMonitorOptions request, ISettingsStore settingsStore, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            try
            {
                await settingsStore.SaveApplicationMonitorSettingsAsync(request, cancellationToken);
                return Results.Ok(request);
            }
            catch (Exception ex)
            {
                var logger = loggerFactory.CreateLogger("ApplicationMonitorConfig");
                logger.LogError(ex, "Failed to save application monitor configuration");
                return Results.Problem($"Failed to save configuration: {ex.Message}", statusCode: 500);
            }
        });

        group.MapGet("/status", () =>
        {
            // Return basic status - could be enhanced to show which apps are running
            return Results.Ok(new { isEnabled = true });
        });
    }

    private static void MapVncEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/status", async (IVncService vncService, CancellationToken cancellationToken) =>
        {
            var status = await vncService.GetStatusAsync(cancellationToken);
            return Results.Ok(status);
        });

        group.MapGet("/config", (IOptionsMonitor<WeaselHostOptions> options) =>
        {
            var vnc = options.CurrentValue.Vnc;
            // Don't return password in config
            return Results.Ok(new
            {
                enabled = vnc.Enabled,
                port = vnc.Port,
                allowRemote = vnc.AllowRemote,
                hasPassword = !string.IsNullOrWhiteSpace(vnc.Password),
                autoStart = vnc.AutoStart
            });
        });

        group.MapGet("/password", (IOptionsMonitor<WeaselHostOptions> options) =>
        {
            var vnc = options.CurrentValue.Vnc;
            return Results.Ok(new { password = vnc.Password ?? "" });
        });

        group.MapPut("/config", async (VncConfigRequest request, ISettingsStore settingsStore, IOptionsMonitor<WeaselHostOptions> optionsMonitor, IVncService vncService, CancellationToken cancellationToken) =>
        {
            var currentVnc = optionsMonitor.CurrentValue.Vnc;
            var vncOptions = new VncOptions
            {
                Enabled = request.Enabled,
                Port = request.Port,
                AllowRemote = request.AllowRemote,
                AutoStart = request.AutoStart ?? currentVnc.AutoStart,
                // Only update password if provided
                Password = string.IsNullOrWhiteSpace(request.Password) ? currentVnc.Password : request.Password
            };

            await settingsStore.SaveVncSettingsAsync(vncOptions, cancellationToken);
            
            // If VNC was enabled and is now disabled, stop the server
            if (currentVnc.Enabled && !request.Enabled)
            {
                await vncService.StopAsync(cancellationToken);
            }
            // If VNC was disabled and is now enabled, start the server
            else if (!currentVnc.Enabled && request.Enabled)
            {
                try
                {
                    await vncService.StartAsync(vncOptions.Port, vncOptions.Password, vncOptions.AllowRemote, cancellationToken);
                }
                catch (InvalidOperationException ex)
                {
                    return Results.BadRequest(new { error = ex.Message });
                }
            }
            // If VNC is running and settings changed, restart it
            else if (request.Enabled)
            {
                var status = await vncService.GetStatusAsync(cancellationToken);
                if (status.IsRunning)
                {
                    await vncService.StopAsync(cancellationToken);
                    await Task.Delay(500, cancellationToken); // Brief delay before restart
                }
                try
                {
                    await vncService.StartAsync(vncOptions.Port, vncOptions.Password, vncOptions.AllowRemote, cancellationToken);
                }
                catch (InvalidOperationException ex)
                {
                    return Results.BadRequest(new { error = ex.Message });
                }
            }

            return Results.Ok(new
            {
                enabled = vncOptions.Enabled,
                port = vncOptions.Port,
                allowRemote = vncOptions.AllowRemote,
                hasPassword = !string.IsNullOrWhiteSpace(vncOptions.Password),
                autoStart = vncOptions.AutoStart
            });
        });

        group.MapPost("/start", async (IVncService vncService, IOptionsMonitor<WeaselHostOptions> optionsMonitor, CancellationToken cancellationToken) =>
        {
            var vnc = optionsMonitor.CurrentValue.Vnc;
            if (!vnc.Enabled)
            {
                return Results.BadRequest(new { error = "VNC is not enabled. Please enable it in settings first." });
            }

            try
            {
                await vncService.StartAsync(vnc.Port, vnc.Password, vnc.AllowRemote, cancellationToken);
                return Results.Ok(new { message = "VNC server started" });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        group.MapPost("/stop", async (IVncService vncService, CancellationToken cancellationToken) =>
        {
            await vncService.StopAsync(cancellationToken);
            return Results.Ok(new { message = "VNC server stopped" });
        });

        // WebSocket endpoint for noVNC client
        group.MapGet("/ws", async (HttpContext context, IOptionsMonitor<WeaselHostOptions> optionsMonitor, IVncService vncService, ILoggerFactory loggerFactory) =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                return Results.BadRequest("WebSocket request required");
            }

            var logger = loggerFactory.CreateLogger("VncWebSocket");
            var query = context.Request.Query;
            var targetHost = query["host"].ToString();
            var targetPortStr = query["port"].ToString();

            // Determine if this is a connection to the internal Weasel VNC server or an external server
            var status = await vncService.GetStatusAsync();
            string vncHost;
            int vncPort;

            // Check if target host is localhost/127.0.0.1 - if so, this is the internal server
            var isInternalServer = string.IsNullOrEmpty(targetHost) ||
                                   targetHost == "localhost" ||
                                   targetHost == "127.0.0.1" ||
                                   targetHost == "::1";

            if (isInternalServer)
            {
                // Connecting to internal Weasel VNC server
                if (!status.IsRunning)
                {
                    logger.LogWarning("VNC WebSocket connection attempted but internal server is not running");
                    return Results.BadRequest("VNC server is not running");
                }

                vncHost = "127.0.0.1";
                vncPort = status.Port;

                if (!string.IsNullOrEmpty(targetPortStr) && int.TryParse(targetPortStr, out var requestedPort))
                {
                    if (requestedPort != vncPort)
                    {
                        logger.LogWarning("VNC WebSocket connection attempted with wrong port: {AttemptedPort}, expected {ExpectedPort}", requestedPort, vncPort);
                        return Results.BadRequest("Invalid VNC port");
                    }
                }
            }
            else
            {
                // Connecting to external VNC server - use the provided host and port
                if (string.IsNullOrEmpty(targetHost))
                {
                    logger.LogWarning("VNC WebSocket connection attempted without host parameter");
                    return Results.BadRequest("Host parameter is required for external VNC servers");
                }

                if (string.IsNullOrEmpty(targetPortStr) || !int.TryParse(targetPortStr, out vncPort))
                {
                    logger.LogWarning("VNC WebSocket connection attempted without valid port parameter");
                    return Results.BadRequest("Valid port parameter is required for external VNC servers");
                }

                vncHost = targetHost;
                logger.LogInformation("Connecting to external VNC server at {Host}:{Port}", vncHost, vncPort);
            }

            logger.LogInformation("Accepting VNC WebSocket connection, proxying to {Host}:{Port}", vncHost, vncPort);
            var webSocket = await context.WebSockets.AcceptWebSocketAsync();
            await ProxyWebSocketToVnc(webSocket, vncHost, vncPort, context.RequestAborted, logger);
            return Results.Empty;
        });

        // VNC Recording endpoints
        group.MapGet("/recordings/config", (IOptionsMonitor<WeaselHostOptions> options) =>
        {
            var recording = options.CurrentValue.Vnc.Recording;
            return Results.Ok(recording);
        });

        group.MapPut("/recordings/config", async (VncRecordingOptions request, ISettingsStore settingsStore, CancellationToken cancellationToken) =>
        {
            await settingsStore.SaveVncRecordingSettingsAsync(request, cancellationToken);
            return Results.Ok(request);
        });

        group.MapGet("/recordings", async (string? profileId, IVncRecordingService recordingService, CancellationToken cancellationToken) =>
        {
            var recordings = await recordingService.GetRecordingsAsync(profileId, cancellationToken);
            return Results.Ok(recordings);
        });

        group.MapGet("/recordings/sessions", async (IVncRecordingService recordingService, CancellationToken cancellationToken) =>
        {
            var sessions = await recordingService.GetActiveSessionsAsync(cancellationToken);
            return Results.Ok(sessions);
        });

        group.MapGet("/recordings/sessions/{sessionId}", async (string sessionId, IVncRecordingService recordingService, CancellationToken cancellationToken) =>
        {
            var session = await recordingService.GetSessionAsync(sessionId, cancellationToken);
            return session != null ? Results.Ok(session) : Results.NotFound();
        });

        group.MapPost("/recordings/start", async (StartRecordingRequest request, IVncRecordingService recordingService, CancellationToken cancellationToken) =>
        {
            var session = await recordingService.StartRecordingAsync(request.ProfileId, request.ProfileName, cancellationToken);
            return Results.Ok(session);
        });

        group.MapPost("/recordings/stop/{sessionId}", async (string sessionId, IVncRecordingService recordingService, CancellationToken cancellationToken) =>
        {
            await recordingService.StopRecordingAsync(sessionId, cancellationToken);
            return Results.Ok(new { message = "Recording stopped" });
        });

        group.MapPost("/recordings/chunk/{sessionId}", async (string sessionId, HttpContext context, IVncRecordingService recordingService, CancellationToken cancellationToken) =>
        {
            using var ms = new MemoryStream();
            await context.Request.Body.CopyToAsync(ms, cancellationToken);
            var chunkData = ms.ToArray();
            await recordingService.ReceiveChunkAsync(sessionId, chunkData, cancellationToken);
            return Results.Ok();
        });

        group.MapPost("/recordings/frame-stats/{sessionId}", async (string sessionId, FrameStatsRequest request, IVncRecordingService recordingService, CancellationToken cancellationToken) =>
        {
            await recordingService.UpdateFrameStatsAsync(sessionId, request.MotionDetected, cancellationToken);
            return Results.Ok();
        });

        group.MapDelete("/recordings/{recordingId}", async (string recordingId, IVncRecordingService recordingService, CancellationToken cancellationToken) =>
        {
            await recordingService.DeleteRecordingAsync(recordingId, cancellationToken);
            return Results.Ok(new { message = "Recording deleted" });
        });

        group.MapPost("/recordings/cleanup", async (IVncRecordingService recordingService, CancellationToken cancellationToken) =>
        {
            var deletedCount = await recordingService.CleanupOldRecordingsAsync(cancellationToken);
            return Results.Ok(new { message = $"Deleted {deletedCount} old recordings" });
        });

        group.MapGet("/recordings/download/{recordingId}", async (string recordingId, IVncRecordingService recordingService, IOptionsMonitor<WeaselHostOptions> options, CancellationToken cancellationToken) =>
        {
            var recordings = await recordingService.GetRecordingsAsync(null, cancellationToken);
            var recording = recordings.FirstOrDefault(r => r.RecordingId == recordingId);

            if (recording == null || !File.Exists(recording.FilePath))
            {
                return Results.NotFound();
            }

            var fileName = Path.GetFileName(recording.FilePath);
            return Results.File(recording.FilePath, "video/webm", fileName);
        });
    }

    private static void MapTerminalEndpoints(RouteGroupBuilder group)
    {
        group.MapPost("/create", async (CreateTerminalRequest request, ITerminalService terminalService, CancellationToken cancellationToken) =>
        {
            var shellType = request.ShellType?.ToLowerInvariant() ?? "cmd";
            if (shellType != "cmd" && shellType != "powershell")
            {
                return Results.BadRequest(new { error = "Invalid shell type. Must be 'cmd' or 'powershell'" });
            }

            try
            {
                var session = await terminalService.CreateTerminalAsync(shellType, cancellationToken);
                return Results.Ok(new { id = session.Id, processId = session.ProcessId, shellType = session.ShellType });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        group.MapPost("/{id}/resize", async (string id, ResizeTerminalRequest request, ITerminalService terminalService, CancellationToken cancellationToken) =>
        {
            try
            {
                await terminalService.ResizeTerminalAsync(id, request.Rows, request.Cols, cancellationToken);
                return Results.Ok();
            }
            catch (InvalidOperationException)
            {
                return Results.NotFound(new { error = "Terminal session not found" });
            }
        });

        group.MapDelete("/{id}", async (string id, ITerminalService terminalService, CancellationToken cancellationToken) =>
        {
            try
            {
                await terminalService.CloseTerminalAsync(id, cancellationToken);
                return Results.Ok();
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        group.MapGet("/ws", async (HttpContext context, ITerminalService terminalService, ILoggerFactory loggerFactory) =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                return Results.BadRequest("WebSocket request required");
            }

            var logger = loggerFactory.CreateLogger("TerminalWebSocket");
            var query = context.Request.Query;
            var sessionId = query["id"].ToString();

            if (string.IsNullOrEmpty(sessionId))
            {
                return Results.BadRequest("Terminal session ID required");
            }

            var isActive = await terminalService.IsTerminalActiveAsync(sessionId);
            if (!isActive)
            {
                logger.LogWarning("Terminal WebSocket connection attempted for inactive session {SessionId}", sessionId);
                return Results.BadRequest("Terminal session not found or inactive");
            }

            logger.LogInformation("Accepting terminal WebSocket connection for session {SessionId}", sessionId);
            var webSocket = await context.WebSockets.AcceptWebSocketAsync();
            await ProxyWebSocketToTerminal(webSocket, sessionId, terminalService, context.RequestAborted, logger);
            return Results.Empty;
        });
    }

    private static async Task ProxyWebSocketToTerminal(WebSocket webSocket, string sessionId, ITerminalService terminalService, CancellationToken cancellationToken, ILogger logger)
    {
        var inputWriter = terminalService.GetTerminalInputWriter(sessionId);
        var outputReader = terminalService.GetTerminalOutputReader(sessionId);

        if (inputWriter == null || outputReader == null)
        {
            logger.LogError("Terminal streams not available for session {SessionId}", sessionId);
            await webSocket.CloseAsync(WebSocketCloseStatus.InternalServerError, "Terminal streams not available", cancellationToken);
            return;
        }

        try
        {
            // Start reading from terminal output and sending to WebSocket
            var receiveFromTerminal = Task.Run(async () =>
            {
                var buffer = new char[4096];
                try
                {
                    while (!cancellationToken.IsCancellationRequested && webSocket.State == WebSocketState.Open)
                    {
                        // Use ReadAsync with cancellation token
                        var charsRead = await outputReader.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false);
                        if (charsRead == 0)
                        {
                            // Process may have exited
                            logger.LogInformation("Terminal output stream closed for session {SessionId}", sessionId);
                            break;
                        }

                        // Convert char buffer to bytes (UTF-8)
                        var encoding = System.Text.Encoding.UTF8;
                        var bytes = encoding.GetBytes(buffer, 0, charsRead);

                        if (webSocket.State == WebSocketState.Open)
                        {
                            await webSocket.SendAsync(
                                new ArraySegment<byte>(bytes),
                                WebSocketMessageType.Text,
                                true,
                                cancellationToken);
                        }
                    }
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error reading from terminal output for session {SessionId}", sessionId);
                }
            }, cancellationToken);

            // Start reading from WebSocket and writing to terminal input
            var receiveFromWebSocket = Task.Run(async () =>
            {
                var buffer = new byte[4096];
                try
                {
                    while (!cancellationToken.IsCancellationRequested && webSocket.State == WebSocketState.Open)
                    {
                        var result = await webSocket.ReceiveAsync(
                            new ArraySegment<byte>(buffer),
                            cancellationToken);

                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            logger.LogInformation("WebSocket client closed connection for session {SessionId}", sessionId);
                            break;
                        }

                        if (result.MessageType == WebSocketMessageType.Text && result.Count > 0)
                        {
                            // Handle resize messages (JSON format: {"type":"resize","rows":24,"cols":80})
                            var message = System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count);
                            if (message.StartsWith("{\"type\":\"resize\"", StringComparison.OrdinalIgnoreCase))
                            {
                                try
                                {
                                    var resizeData = System.Text.Json.JsonSerializer.Deserialize<ResizeMessage>(message);
                                    if (resizeData != null && resizeData.Type == "resize")
                                    {
                                        await terminalService.ResizeTerminalAsync(sessionId, resizeData.Rows, resizeData.Cols, cancellationToken);
                                        continue;
                                    }
                                }
                                catch
                                {
                                    // Ignore JSON parse errors
                                }
                            }

                            // Send to terminal input
                            var text = System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count);
                            await inputWriter.WriteAsync(text);
                            await inputWriter.FlushAsync();
                        }
                    }
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error reading from WebSocket for session {SessionId}", sessionId);
                }
            }, cancellationToken);

            await Task.WhenAny(receiveFromTerminal, receiveFromWebSocket);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error in terminal WebSocket proxy for session {SessionId}", sessionId);
        }
        finally
        {
            if (webSocket.State == WebSocketState.Open)
            {
                try
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Connection closed", cancellationToken);
                }
                catch
                {
                    // Ignore close errors
                }
            }
        }
    }

    private record CreateTerminalRequest(string? ShellType);
    private record ResizeTerminalRequest(int Rows, int Cols);
    private record ResizeMessage(string Type, int Rows, int Cols);

    private static async Task ProxyWebSocketToVnc(WebSocket webSocket, string targetHost, int targetPort, CancellationToken cancellationToken, ILogger logger)
    {
        TcpClient? vncClient = null;
        NetworkStream? vncStream = null;
        try
        {
            logger.LogInformation("Connecting to VNC server at {Host}:{Port}", targetHost, targetPort);
            // Connect to VNC server
            vncClient = new TcpClient();
            await vncClient.ConnectAsync(targetHost, targetPort);
            vncStream = vncClient.GetStream();
            logger.LogInformation("Connected to VNC server, starting proxy");

            // Start bidirectional proxying
            var receiveFromVnc = Task.Run(async () =>
            {
                var buffer = new byte[65536]; // 64KB buffer
                long totalBytesSent = 0;
                try
                {
                    while (!cancellationToken.IsCancellationRequested && vncClient!.Connected && webSocket.State == WebSocketState.Open)
                    {
                        var bytesRead = await vncStream!.ReadAsync(buffer, cancellationToken);
                        if (bytesRead == 0)
                        {
                            logger.LogInformation("VNC server closed connection");
                            break;
                        }

                        if (webSocket.State == WebSocketState.Open)
                        {
                            // Forward all data from VNC server to WebSocket client
                            // Use endOfMessage=true for each chunk to ensure proper framing
                            await webSocket.SendAsync(
                                new ArraySegment<byte>(buffer, 0, bytesRead),
                                WebSocketMessageType.Binary,
                                endOfMessage: true,
                                cancellationToken);
                            totalBytesSent += bytesRead;


                        }
                    }
                    logger.LogInformation("VNC to WebSocket proxy ended. Total bytes sent: {Total}", totalBytesSent);
                }
                catch (OperationCanceledException)
                {
                    logger.LogInformation("VNC read operation cancelled");
                }
                catch (IOException ex) when (ex.InnerException is SocketException socketEx &&
                                              (socketEx.ErrorCode == 10053 || socketEx.ErrorCode == 10054 || socketEx.ErrorCode == 995))
                {
                    // Connection closed/aborted - this is expected during disconnection
                    logger.LogDebug("VNC connection closed during proxy (socket error {ErrorCode})",
                        ((SocketException)ex.InnerException).ErrorCode);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Unexpected error receiving from VNC server");
                }
            }, cancellationToken);

            var receiveFromWebSocket = Task.Run(async () =>
            {
                var buffer = new byte[4096];
                long totalBytesReceived = 0;
                try
                {
                    while (!cancellationToken.IsCancellationRequested && webSocket.State == WebSocketState.Open && vncClient!.Connected)
                    {
                        var result = await webSocket.ReceiveAsync(
                            new ArraySegment<byte>(buffer),
                            cancellationToken);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            logger.LogInformation("WebSocket client closed connection");
                            break;
                        }
                        if (vncClient.Connected)
                        {
                            totalBytesReceived += result.Count;

                            await vncStream!.WriteAsync(new ArraySegment<byte>(buffer, 0, result.Count), cancellationToken);
                            await vncStream.FlushAsync(cancellationToken);
                        }
                    }
                    logger.LogInformation("WebSocket to VNC proxy ended. Total bytes received: {Total}", totalBytesReceived);
                }
                catch (OperationCanceledException)
                {
                    logger.LogInformation("WebSocket read operation cancelled");
                }
                catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
                {
                    // WebSocket closed unexpectedly - this is expected during disconnection
                    logger.LogDebug("WebSocket closed prematurely during proxy");
                }
                catch (IOException ex) when (ex.InnerException is SocketException socketEx &&
                                              (socketEx.ErrorCode == 10053 || socketEx.ErrorCode == 10054 || socketEx.ErrorCode == 995))
                {
                    // Connection closed/aborted - this is expected during disconnection
                    logger.LogDebug("WebSocket connection closed during proxy (socket error {ErrorCode})",
                        ((SocketException)ex.InnerException).ErrorCode);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Unexpected error receiving from WebSocket client");
                }
            }, cancellationToken);

            await Task.WhenAny(receiveFromVnc, receiveFromWebSocket);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error in VNC WebSocket proxy");
            throw;
        }
        finally
        {
            logger.LogInformation("Closing VNC WebSocket proxy connection");
            vncStream?.Close();
            vncClient?.Close();
            if (webSocket.State == WebSocketState.Open)
            {
                try
                {
                    await webSocket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "Connection closed",
                        cancellationToken);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Error closing WebSocket");
                }
            }
        }
    }

    private static string EnsureLogFolder(string? configuredFolder)
    {
        var folder = string.IsNullOrWhiteSpace(configuredFolder)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Weasel", "Logs")
            : configuredFolder;
        
        // Expand environment variables in the path (e.g., %APPDATA%)
        if (!string.IsNullOrWhiteSpace(folder))
        {
            folder = Environment.ExpandEnvironmentVariables(folder);
        }
        
        Directory.CreateDirectory(folder);
        return folder;
    }
    
    private static List<string> GetLogSubfolders(string baseFolder)
    {
        if (!Directory.Exists(baseFolder))
        {
            return new List<string>();
        }
        
        // Return component folders and Archive folder
        return Directory.GetDirectories(baseFolder)
            .Select(d => Path.GetFileName(d)!)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .OrderBy(name => name == "Archive" ? "" : name) // Archive first, then alphabetically
            .ToList();
    }

    private record LogFileDto(string Name, long SizeBytes, DateTime LastModified);

    private record SecurityUpdateRequest(bool RequireAuthentication, string? Password);

    private record VncConfigRequest(bool Enabled, int Port, bool AllowRemote, string? Password, bool? AutoStart);

    private record StartRecordingRequest(string ProfileId, string ProfileName);

    private record FrameStatsRequest(bool MotionDetected);

    private record TestEmailRequest(string Recipient);

    private record FileWriteRequest(string Path, string Content);

    private record BulkDeleteRequest(List<string> Paths);

    private record BulkMoveRequest(List<string> SourcePaths, string DestinationPath);

    private record BulkCopyRequest(List<string> SourcePaths, string DestinationPath);

    private record BulkZipRequest(List<string> SourcePaths, string ZipFilePath);

    private record UnzipRequest(string ZipFilePath, string DestinationPath);

    private record BulkDownloadRequest(List<string> Paths);

    private record CreateBundleRequest(string Name, string? Description);

    private record UpdateBundleRequest(string? Name, string? Description, List<BundlePackageRequest>? Packages);

    private record BundlePackageRequest(string Id, string Name, string? Version, string? Publisher);

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

