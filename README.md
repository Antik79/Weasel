<div align="center">
  <img src="assets/weasel-logo.png" alt="Weasel Logo" width="250" />
</div>

# Weasel

Weasel is a Windows-based remote system administration tool that runs as a system tray application. It provides a modern web-based console for managing files, processes, services, system information, and more on Windows machines.

**Version**: 1.0.0-beta (Pre-release)

## Features

### Core Functionality
- **System Tray Application**: Runs unobtrusively in the background with context menu access.
- **Web-Based Console**: Modern React + TypeScript frontend for a responsive user experience.
- **Portable Mode**: Fully portable - stores all data (config, logs, screenshots) in the application directory.

### File & System Management
- **File Explorer**: Browse, upload, download, edit, and manage files with a modern two-panel interface.
  - Bulk operations (copy, move, delete, zip)
  - Integrated Monaco code editor for file editing
  - Bookmark favorite locations
  - File search capabilities
- **Process Management**: View and terminate running processes, add to Application Monitor.
- **Service Management**: Start, stop, and restart Windows services.
- **System Information**: View real-time CPU, memory, disk, and network metrics.
- **Power Control**: Shutdown, restart, or lock the machine remotely.

### Advanced Tools
- **Terminal Viewer**: PowerShell and CMD terminal access via web interface.
  - Multiple concurrent sessions
  - Popup mode for separate terminal windows
  - Full terminal emulation with xterm.js
- **Package Management**: Install, uninstall, and update applications via `winget`.
  - Search and browse available packages
  - View installed applications
  - Real-time installation log tailing
  - Package bundles for batch installations
  - Bundle management (create, rename, export/import)
  - Selective package installation from bundles
- **Storage Monitor**: Automated disk space and folder size monitoring with email alerts.
  - Configurable thresholds (over/under)
  - Drive and folder-level monitoring
  - SMTP email notifications
- **Application Monitor**: Monitor and automatically restart applications.
  - Configurable check intervals and restart delays
  - Detailed logging with event log integration
  - Email notifications for application failures
- **VNC Server & Client**: Built-in VNC server and web-based VNC client for remote desktop access.
  - Integrated VNC server with password authentication
  - Web-based VNC client (noVNC) with full keyboard/mouse support
  - Multiple VNC server profiles (connect to internal or external VNC servers)
  - VNC session recording with motion detection
  - Screenshot capture from VNC sessions
  - Auto-start on application launch
  - Configurable port and access control
  - Send Ctrl+Alt+Delete to remote sessions
- **Screenshot Capture**: Manual and timed screenshot capture.
  - Configurable capture intervals
  - Custom filename patterns
  - Automatic storage in configured directory
- **Logs Viewer**: Browse and view component-specific logs.
  - Two-panel interface (folders/files)
  - Automatic log rotation and archiving
  - Per-component logging control
  - Real-time log tailing

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

Configuration is loaded from two locations (latter takes precedence):
- `appsettings.json` (bundled with application)
- `config/appsettings.json` (external, user-editable)

In **portable mode**, all settings and data are stored relative to the application directory:
- Configuration: `.\config\appsettings.json`
- Logs: `.\Logs\`
- Screenshots: `.\Screenshots\`

### Key Settings

- **Remote Access**: Set `WeaselHost:WebServer:AllowRemote` to `true` to allow external connections.
- **Security**: Set `WeaselHost:Security:RequireAuthentication` to `true` and configure `Password` to require authentication via `X-Weasel-Token` header.
- **HTTPS**: Configure `CertificatePath` and `CertificatePassword` to enable HTTPS.
- **VNC Server**: Configure in Settings → VNC. Set port, password, auto-start, and remote access options. Start/stop from Tools → VNC or tray icon menu.
- **Terminal**: Accessible via Tools → Terminal. Supports PowerShell and CMD with multiple concurrent sessions.
- **Logging**: Configure in Settings → Logging. Set log folder, retention days, and enable/disable per-component logging.
- **Storage Monitor**: Configure in Tools → Storage Monitor. Set disk space thresholds and folder monitoring rules.
- **Application Monitor**: Configure in Tools → Application Monitor. Add applications to monitor with auto-restart capabilities.

See the following guides for more detailed information:

- [User Guide](docs/USER_GUIDE.md): Installation, configuration, and usage instructions.
- [Developer Guide](docs/DEVELOPER_GUIDE.md): Architecture, build instructions, and API documentation.
- [Deployment Guide](docs/DEPLOYMENT.md): Detailed deployment steps.
