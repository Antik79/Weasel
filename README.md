<div align="center">
  <img src="assets/weasel-logo.png" alt="Weasel Logo" width="200" />
</div>

# Weasel

Weasel is a Windows-based remote system administration tool that runs as a system tray application. It provides a modern web-based console for managing files, processes, services, system information, and more on Windows machines.

**Version**: 1.0.0-alpha

## Features

- **System Tray Application**: Runs unobtrusively in the background.
- **Web-Based Console**: React + TypeScript frontend for a responsive user experience.
- **File Management**: Browse, upload, download, and manage files with a modern two-panel interface.
- **Process Management**: View and terminate running processes.
- **Service Management**: Control Windows services.
- **System Information**: View real-time system metrics and hardware details.
- **Power Control**: Shutdown, restart, or lock the machine remotely.
- **Package Management**: Install, uninstall, and update applications via `winget` with real-time log tailing.
- **Storage Monitor**: Automated monitoring and alerting for disk space and folder usage.
- **Application Monitor**: Monitor and automatically restart applications with detailed logging.
- **Remote Desktop (VNC)**: Built-in VNC server for remote desktop access with auto-start capability.
- **Screenshot Capture**: Manual and timed screenshot capture with configurable intervals.
- **Structured Logging**: Component-specific log files with archive support and granular control.

## Architecture

The solution follows a clean architecture pattern:

- **WeaselHost**: The main Windows tray application.
- **WeaselHost.Core**: Domain models and interfaces.
- **WeaselHost.Infrastructure**: Service implementations.
- **WeaselHost.Web**: ASP.NET Core web application (API).
- **webui**: React TypeScript Single Page Application (SPA).

## Getting Started

### Prerequisites

- .NET 8.0 SDK
- Node.js (for building the frontend)

### Running Locally

1.  **Start the Backend**:
    ```powershell
    dotnet run --project WeaselHost
    ```
    This starts the tray app and web server on `http://localhost:7780`.

2.  **Start the Frontend (Development)**:
    ```powershell
    cd webui
    npm install
    npm run dev
    ```
    Access the UI at `http://localhost:5173`.

## Installation

### Download from GitHub Releases

Pre-built installers and portable packages are available on the [GitHub Releases](https://github.com/Antik79/Weasel/releases) page:

- **MSI Installer**: Recommended for standard installations. Includes automatic startup configuration and uninstaller.
- **Portable ZIP**: Extract and run. No installation required. Ideal for temporary use or testing.

### Building from Source

To build the full application (Backend + Frontend):

**Note**: The frontend is automatically built when you build the backend. No manual `npm run build` step is required.

1.  **Publish Backend** (automatically builds frontend):
    ```powershell
    dotnet publish Weasel.sln -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true /p:EnableCompressionInSingleFile=true
    ```

The output executable will be in `WeaselHost\bin\Release\net8.0-windows\win-x64\publish\`.

**Manual Frontend Build** (only needed for development):
If you need to build the frontend separately (e.g., for development with `npm run dev`):
```powershell
cd webui
npm install
npm run build
```

## Configuration

Configuration is loaded from `appsettings.json` and `config/appsettings.json`.

Key settings include:
- **Remote Access**: Set `WeaselHost:WebServer:AllowRemote` to `true` to allow external connections.
- **Security**: Set `WeaselHost:Security:RequireAuthentication` to `true` to require an `X-Weasel-Token` header.
- **HTTPS**: Configure `CertificatePath` and `CertificatePassword` to enable HTTPS.
- **VNC Server**: Enable and configure the built-in VNC server for remote desktop access in Settings → VNC. The server can be started/stopped from Tools → VNC.
- **Logging**: Configure component-specific logging in Settings → Logging. Logs are stored in `%APPDATA%\Weasel\Logs\` with component-specific subfolders.

See the following guides for more detailed information:

- [User Guide](docs/USER_GUIDE.md): Installation, configuration, and usage instructions.
- [Developer Guide](docs/DEVELOPER_GUIDE.md): Architecture, build instructions, and API documentation.
- [Deployment Guide](docs/DEPLOYMENT.md): Detailed deployment steps.
