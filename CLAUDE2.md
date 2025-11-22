# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Weasel is a Windows-based remote system administration tool that runs as a system tray application. It provides a web-based console for managing files, processes, services, system information, and more on Windows machines. The application consists of a .NET backend with an embedded web server and a React TypeScript frontend.

## Architecture

### High-Level Structure

The solution follows a clean architecture pattern with clear separation of concerns:

- **WeaselHost** - Main entry point, Windows tray application that bootstraps the embedded web server
- **WeaselHost.Core** - Core domain models, abstractions (interfaces), and configuration classes
- **WeaselHost.Infrastructure** - Concrete implementations of all services (file system, process management, Windows services, etc.)
- **WeaselHost.Web** - ASP.NET Core web application with minimal API endpoints
- **webui** - React TypeScript SPA with Vite, Tailwind CSS, and Monaco editor

### Key Architectural Patterns

1. **Embedded Web Server**: The tray application (`WeaselHost`) hosts the ASP.NET Core web app (`WeaselHost.Web`) in-process via `WebServerManager.cs`. The web server can be stopped/restarted independently via the tray context menu.

2. **Dependency Injection**: All services are registered through `ServiceCollectionExtensions.AddWeaselHostServices()` in the Infrastructure layer. Both the tray app and web app share the same DI container.

3. **Configuration Hierarchy**: Settings are loaded from two locations (latter takes precedence):
   - `appsettings.json` (bundled in application)
   - `config/appsettings.json` (external, user-editable)

   The configuration is bound to `WeaselHostOptions` with hot-reload support via `IOptionsMonitor<T>`.

4. **Security Middleware**: Authentication, CSRF protection, and rate limiting are implemented as ASP.NET middleware in `WeaselHost.Web/Program.cs:ConfigureApplication()`. Authentication uses a custom header (`X-Weasel-Token`) with constant-time comparison.

5. **Static File Serving**: The React SPA is built into `WeaselHost.Web/wwwroot` and copied to the output directory during publish. The web app serves it via `UseStaticFiles()` with a fallback route for client-side routing.

### Service Layer

All business logic is abstracted through interfaces in `WeaselHost.Core/Abstractions/`:
- `IFileSystemService` - File/directory operations, zip/unzip, bulk operations
- `IProcessService` - Process listing and termination
- `ISystemServiceManager` - Windows service control
- `ISystemInfoService` - System metrics, event logs, network adapters
- `IPowerService` - Shutdown, restart, lock
- `IPackageService` - Application installation/uninstallation via winget
- `IScreenshotService` - Screen capture
- `IEmailService` - SMTP email notifications
- `IDiskMonitorService` - Hosted service that monitors disk space and sends alerts
- `ISettingsStore` - Persists configuration changes to `config/appsettings.json`

Implementations live in `WeaselHost.Infrastructure/Services/`.

## Build & Development Commands

### Backend (.NET)

**Note**: The frontend is automatically built as part of the .NET build process. No manual `npm run build` step is required.

```powershell
# Restore and build the solution (automatically builds frontend)
dotnet restore
dotnet build

# Run in debug mode (opens tray icon, automatically builds frontend)
dotnet run --project WeaselHost

# Run tests (if any are added)
dotnet test

# Publish single-file executable (automatically builds frontend)
dotnet publish Weasel.sln `
  -c Release `
  -r win-x64 `
  --self-contained true `
  /p:PublishSingleFile=true `
  /p:IncludeNativeLibrariesForSelfExtract=true `
  /p:EnableCompressionInSingleFile=true
```

Output: `WeaselHost\bin\Release\net8.0-windows\win-x64\publish\Weasel.exe`

### Frontend (React + TypeScript)

```powershell
cd webui

# Install dependencies
npm install

# Development server with hot reload (proxies API to localhost:7780)
npm run dev

# Production build (outputs to ../WeaselHost.Web/wwwroot)
npm run build

# Preview production build
npm run preview
```

### Full Deployment Build

From repository root:

**Note**: The frontend is automatically built during the publish step. No manual frontend build is required.

```powershell
# Publish the backend (automatically builds frontend and includes assets)
dotnet publish Weasel.sln `
  -c Release `
  -r win-x64 `
  --self-contained true `
  /p:PublishSingleFile=true `
  /p:IncludeNativeLibrariesForSelfExtract=true `
  /p:EnableCompressionInSingleFile=true
```

**Manual Frontend Build** (only needed for development):
If you need to build the frontend separately for development:
```powershell
cd webui
npm install
npm run build
```

## Development Workflow

### Running the Full Stack Locally

1. Start the backend:
   ```powershell
   dotnet run --project WeaselHost
   ```
   This starts the tray app and web server on `http://localhost:7780`

2. Start the frontend dev server:
   ```powershell
   cd webui
   npm run dev
   ```
   This serves the UI on `http://localhost:5173` with API proxy to backend

3. Access the UI at `http://localhost:5173` during development

### Working with Configuration

- Runtime configuration: `config/appsettings.json` (created automatically if missing)
- Default values: `WeaselHost.Core/Configuration/WeaselHostOptions.cs`
- To test configuration changes, either:
  - Edit `config/appsettings.json` manually (changes reload automatically)
  - Use the Settings API endpoints (`/api/settings/*`) which call `ISettingsStore.Save*Async()`

### Adding New API Endpoints

1. Define request/response DTOs in `WeaselHost.Core/Models/` (or as records in `Program.cs`)
2. Add interface to `WeaselHost.Core/Abstractions/`
3. Implement service in `WeaselHost.Infrastructure/Services/`
4. Register service in `ServiceCollectionExtensions.AddWeaselHostServices()`
5. Map endpoints in `WeaselHost.Web/Program.cs` in a `Map*Endpoints()` method
6. Call the new endpoint from React UI via SWR or fetch

### Working with the Frontend

- API client code: `webui/src/api/`
- UI components: `webui/src/components/`
- Page sections: `webui/src/sections/`
- Type definitions: `webui/src/types.ts`
- The app uses SWR for data fetching with automatic revalidation
- Monaco editor is integrated for file editing

## Security Considerations

- **Authentication**: When `Security.RequireAuthentication=true`, all API endpoints except `/health`, `/`, and static assets require the `X-Weasel-Token` header matching `Security.Password`. Token comparison uses `CryptographicOperations.FixedTimeEquals()`.
- **CSRF Protection**: When enabled (and auth is disabled), non-GET requests require the `X-Weasel-Csrf` header.
- **Rate Limiting**: Controlled via `Security.EnableRateLimiting`, `RequestsPerMinute`, and `QueueLimit`.
- **CORS**: Configured to allow any origin (for local development). Tighten for production deployments.

## Important Implementation Details

1. **Path Resolution**: The `ResolvePath()` helper in `WeaselHost.Web/Program.cs` defaults to the user profile directory when no path is provided.

2. **File Upload**: Multipart form uploads are handled via `/api/fs/upload` with `IFormFile`.

3. **Bulk Operations**: File operations support bulk delete/move/copy/zip via `/api/fs/bulk/*` endpoints with cancellation token support.

4. **Background Services**: `DiskMonitorService` runs as an `IHostedService` and periodically checks disk space, sending email alerts via `IEmailService` when thresholds are exceeded.

5. **Logging**: Custom file logger (`FileLoggerProvider`) writes to the configured `Logging.Folder` with automatic file rotation based on `RetentionDays`.

6. **Tray Icon Lifecycle**: The `TrayApplicationContext` manages the application lifetime. It starts/stops the web server and properly disposes resources on exit via `ShutdownAsync()`.

7. **Web Server Manager**: `WebServerManager.cs` creates and manages the ASP.NET Core `WebApplication` instance. It handles starting, stopping, restarting, and provides the dashboard URI for browser launching.

## Testing Notes

- To run a single test file (when tests are added): `dotnet test --filter "FullyQualifiedName~NameOfTestClass"`
- Integration tests should use `WebApplication.BuildWebApplication()` with a custom `configureBuilder` action to override configuration
