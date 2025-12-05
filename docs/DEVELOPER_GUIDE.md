# Weasel Developer Guide

This guide provides information for developers working on the Weasel project.

## Project Overview

Weasel is a remote system administration tool consisting of:
- **WeaselHost**: A .NET 8 Windows tray application that hosts an ASP.NET Core web server.
- **webui**: A React + TypeScript Single Page Application (SPA) that serves as the user interface.

## Architecture

The solution follows a Clean Architecture pattern:

### Backend (.NET)

- **WeaselHost**: The entry point. It manages the system tray icon, application lifecycle, and hosts the web server.
- **WeaselHost.Core**: Contains the domain entities, interfaces (Abstractions), and configuration models. This project has no dependencies on infrastructure.
- **WeaselHost.Infrastructure**: Implements the interfaces defined in Core. This includes file system operations, system info retrieval, and Windows service management.
- **WeaselHost.Web**: The ASP.NET Core web application. It defines the API endpoints and serves the static frontend files.

### Frontend (React)

- Located in the `webui` directory.
- Built with Vite, React, TypeScript, and Tailwind CSS.
- Uses SWR for data fetching.
- Uses Monaco Editor for file editing.

## Development Environment Setup

### Prerequisites

- **.NET 8.0 SDK**: [Download here](https://dotnet.microsoft.com/download/dotnet/8.0)
- **Node.js**: [Download here](https://nodejs.org/) (LTS recommended)
- **Visual Studio 2022** or **VS Code**

### Running Locally

1.  **Start the Backend**:
    ```powershell
    dotnet run --project WeaselHost
    ```
    - This starts the tray application.
    - The web server will listen on `http://localhost:7780` (default).
    - Configuration is loaded from `appsettings.json` or `config/appsettings.json`.

2.  **Start the Frontend**:
    ```powershell
    cd webui
    npm install
    npm run dev
    ```
    - The development server runs on `http://localhost:5173`.
    - It proxies API requests to `http://localhost:7780`.

## Project Structure

```
Weasel/
├── WeaselHost/                 # Tray application entry point
├── WeaselHost.Core/            # Interfaces and Models
│   ├── Abstractions/           # Service interfaces
│   ├── Configuration/          # Configuration classes (WeaselHostOptions)
│   └── Models/                 # DTOs
├── WeaselHost.Infrastructure/  # Service implementations
├── WeaselHost.Web/             # API and Web Server
│   └── Program.cs              # API Endpoint definitions
├── webui/                      # React Frontend
└── docs/                       # Documentation
```

## API Endpoints

The API is defined in `WeaselHost.Web/Program.cs`. Key groups include:

- `/api/fs`: File system operations (browse, read, write, upload, bulk actions).
- `/api/system`: System information, event logs, screenshots, version.
- `/api/processes`: Process management.
- `/api/services`: Windows service management.
- `/api/power`: Power control (shutdown, restart, lock).
- `/api/packages`: Winget package management (install, uninstall, search, show).
- `/api/packages/bundles`: Package bundle management (CRUD operations, install bundles).
- `/api/disk-monitoring`: Storage monitoring and configuration (drives and folders).
- `/api/application-monitor`: Application monitoring and configuration.
- `/api/vnc`: VNC server management (start, stop, status, configuration).
- `/api/terminal`: Terminal session management (create, list, delete, WebSocket endpoint).
- `/api/logs`: Log file browsing and retrieval (with subfolder support).
- `/api/settings`: Application configuration (general, capture, logging, VNC, etc.).

## Key Components

### Storage Monitor
Implemented in `DiskMonitorService.cs`. It runs as a hosted service (`IHostedService`), periodically checking disk space and folder sizes based on `DiskMonitoringOptions`. It supports both "Over" and "Under" threshold directions for folder monitoring. It sends email alerts via SMTP if thresholds are breached.

### Email Service
Implemented in `EmailService.cs` using **MailKit** library. Supports both implicit SSL (port 465) and STARTTLS (port 587):
- Port 465: Uses `SecureSocketOptions.SslOnConnect` (implicit SSL)
- Port 587: Uses `SecureSocketOptions.StartTls` (explicit TLS)
- Port 25: Uses `SecureSocketOptions.StartTlsWhenAvailable` or plain
- Automatic security option detection based on port number

### Application Monitor
Implemented in `ApplicationMonitorService.cs`. It runs as a hosted service, periodically checking if monitored applications are running. If an application is not running, it automatically restarts it after a configured delay. It includes detailed logging with event log entries.

### VNC Server & Client
Implemented in `VncService.cs`, `VncConnectionHandler.cs`, and `VncRecordingService.cs`. The VNC system includes both a server and web-based client:

**VNC Server** (`VncService.cs`):
- Implements RFB protocol for remote desktop access
- Password authentication using DES encryption
- Pixel format conversion for different client formats
- Screen capture and framebuffer management
- Keyboard and mouse input handling
- Auto-start capability on application startup

**VNC Client** (React + noVNC):
- Web-based VNC client using noVNC library
- Multiple server profile support (internal Weasel server + external VNC servers)
- Profile management with custom connection settings
- WebSocket proxy for bridging browser to TCP VNC servers (`/api/vnc/ws`)
- Full keyboard/mouse support including Ctrl+Alt+Delete
- Screenshot capture from active sessions

**VNC Recording** (`VncRecordingService.cs`):
- Session recording to WebM format
- Motion detection with configurable pause delay (default: 10 seconds)
- Profile-specific recording subfolders
- Automatic recording stop on max duration or disconnect
- Recording metadata and file size tracking
- Chunk-based upload for real-time recording

### Terminal Service
Implemented in `TerminalService.cs`. Provides PowerShell and CMD terminal access via WebSocket connections. Features include:
- Multiple concurrent terminal sessions
- Process-based terminal emulation (PowerShell.exe, cmd.exe)
- Real-time output streaming via WebSocket
- Session management (create, list, delete)
- Automatic cleanup of terminated sessions
- Support for both interactive commands and scripts

### Logging
Implemented via `FileLoggerProvider.cs`. Provides structured logging with:
- Component-specific log files in subfolders
- Automatic log rotation (daily and size-based)
- Archive support for old logs
- Per-component enable/disable toggles
- Per-component minimum log level configuration
- Log files stored in `.\Logs\`
- Comprehensive logging in all service implementations:
  - **FileSystemService**: All file operations (read, write, delete, copy, move, zip)
  - **PackageService**: Install/uninstall operations with success/failure tracking
  - **PackageBundleService**: All CRUD operations on bundles
  - **ScreenshotService**: Screenshot capture with destination path logging
  - **IntervalScreenshotService**: Timed screenshot capture to TimedFolder

### Authentication
Implemented via middleware in `Program.cs`. If `Security.RequireAuthentication` is true, requests must include the `X-Weasel-Token` header matching the configured password.

## Frontend Components

### Reusable Components

- **SubmenuNav**: Consistent submenu navigation (`webui/src/components/SubmenuNav.tsx`)
- **PageLayout**: Standard page layout wrapper (`webui/src/components/PageLayout.tsx`)
- **SectionPanel**: Consistent panel/section container (`webui/src/components/SectionPanel.tsx`)
- **Table**: Reusable table component with sorting and locked headers (`webui/src/components/Table.tsx`)
- **ConfirmDialog**: Confirmation dialog component (`webui/src/components/ConfirmDialog.tsx`)
- **Toast**: Toast notification system (exported from `App.tsx`)
- **FilePicker**: File selection dialog (`webui/src/components/FilePicker.tsx`)
- **FolderPicker**: Folder selection dialog (`webui/src/components/FolderPicker.tsx`)
- **VncViewer**: VNC client component using noVNC (`webui/src/components/VncViewer.tsx`)
- **TerminalViewer**: Terminal emulator component using xterm.js (`webui/src/components/TerminalViewer.tsx`)
  - Full terminal emulation with command history
  - WebSocket-based real-time communication
  - Support for PowerShell and CMD
  - Popup mode for separate terminal windows
- **LogPanel**: Shared log panel component (`webui/src/components/LogPanel.tsx`)
  - Collapsible log display with expansion state persistence
  - Auto-refresh capability with configurable intervals
  - Component-specific log display
- **Pagination**: Reusable pagination component for large data sets (`webui/src/components/Pagination.tsx`)
  - Compact design with page navigation on left, size selector on right
  - Auto-hides navigation when only one page
  - Supports page sizes: 25, 50, 100, All

### File Type System

The File Explorer uses a MIME type categorization system (`webui/src/sections/FileExplorer.tsx`):

| Category | Extensions | Icon | Actions |
|----------|------------|------|---------|
| Image | png, jpg, gif, bmp, webp, svg, ico, tiff | Image (green) | View, Download |
| Video | mp4, webm, mkv, avi, mov, wmv, flv | Video (pink) | Download only |
| Audio | mp3, wav, ogg, flac, aac, wma, m4a | Music (purple) | Download only |
| Archive | zip, rar, 7z, tar, gz, bz2, xz, tgz | FileArchive (amber) | Unzip (zip), Download |
| Code | js, ts, cs, py, java, cpp, go, rs, rb, php, etc. | FileCode (blue) | Edit, Tail, Download |
| Text | txt, md, log, json, xml, yml, ini, cfg, csv | FileText (slate) | Edit, Tail, Download |
| Executable | exe, msi, bat, cmd, ps1, sh, dll | Cog (red) | Download only |
| Document | pdf, doc, docx, xls, xlsx, ppt, pptx | FileText (orange) | Download only |
| Unknown | * | File (slate) | Download only |

Key functions:
- `getFileCategory(filePath)`: Returns the file category
- `canEditFile(filePath)`: Returns true for code/text files
- `canTailFile(filePath)`: Returns true for code/text files
- `getFileIcon(filePath)`: Returns icon component and color class

### Layout Patterns

- **Two-Panel Layout**: Used in Files and Logs sections for hierarchical data browsing
- **Submenu Navigation**: All sections with multiple views use `SubmenuNav` for consistency
- **Breadcrumbs**: Path navigation for hierarchical structures

## Key Dependencies

### Backend (.NET)
- **MailKit**: Modern email library for SMTP with proper SSL/TLS support
- **WGet.NET**: Windows package manager (winget) integration
- **System.ServiceProcess.ServiceController**: Windows service management
- **System.Diagnostics.PerformanceCounter**: Performance monitoring

### Frontend (npm)
- **@novnc/novnc**: VNC client library
- **@xterm/xterm**: Terminal emulator
- **@monaco-editor/react**: Code editor
- **swr**: Data fetching with caching
- **lucide-react**: Icon library

## Building for Release

See [DEPLOYMENT.md](DEPLOYMENT.md) for build instructions.

## Contributing

1.  Follow the Clean Architecture separation of concerns.
2.  Define interfaces in `Core` before implementing in `Infrastructure`.
3.  Keep the `Web` project focused on API definition and request handling.
