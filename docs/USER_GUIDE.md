# Weasel User Guide

Weasel is a powerful remote system administration tool for Windows. This guide will help you install, configure, and use Weasel effectively.

## Installation

### Portable Installation (Recommended)

1.  **Download**: Get the latest portable ZIP from [GitHub Releases](https://github.com/Antik79/Weasel/releases).
2.  **Extract**: Extract the ZIP file to a folder of your choice (e.g., `C:\Tools\Weasel` or a USB drive).
3.  **Run**: Double-click `Weasel.exe` to start the application. You will see a weasel icon in your system tray.

### What's Included

The portable package includes:
- **Weasel.exe** - Main tray application with embedded web server
- **wwwroot/** - Web UI (React-based console)
- **config/** - Configuration files
- **Resources/** - Application resources (tray icon)

All data (configuration, logs, screenshots) is stored in the application directory, making Weasel fully portable.

## Configuration

### Portable Mode

Weasel operates in **portable mode** by default. All settings and data are stored relative to the executable location:
- **Configuration**: `.\config\appsettings.json`
- **Logs**: `.\Logs\` (with component-specific subfolders)
- **Screenshots**: `.\Screenshots\`

This means you can move the entire Weasel folder to another location or USB drive without losing any settings.

### Configuration File

Weasel creates a configuration file at `config/appsettings.json` relative to the executable. You can edit this file to customize the behavior, or use the Settings page in the web interface.

### Enabling Remote Access

By default, Weasel only allows connections from the local machine (`localhost`). To access it from other computers:

1.  Open `config/appsettings.json`.
2.  Find the `WebServer` section.
3.  Set `AllowRemote` to `true`.
4.  (Optional) Change the `Port` if needed (default is `7780`).

### Security

It is highly recommended to enable authentication when allowing remote access.

1.  In `config/appsettings.json`, find the `Security` section.
2.  Set `RequireAuthentication` to `true`.
3.  Set a strong `Password`.
4.  Restart Weasel.

When accessing the web interface, you will need to provide this password (or use it in the `X-Weasel-Token` header for API access).

### Storage Monitor

Weasel can monitor your disk space and folder sizes, sending email alerts when thresholds are exceeded.

1.  **Configure SMTP**: You must first configure email settings in the `Smtp` section of `appsettings.json`.
    ```json
    "Smtp": {
      "Host": "smtp.gmail.com",
      "Port": 587,
      "EnableSsl": true,
      "Username": "your-email@gmail.com",
      "Password": "your-app-password",
      "FromAddress": "your-email@gmail.com"
    }
    ```
2.  **Enable Monitoring**: Navigate to Tools → Storage Monitor:
    - Enable monitoring for specific drives
    - Set threshold percentages or byte limits
    - Configure folder monitoring with "Over" or "Under" threshold direction
    - Add email addresses to notification recipients

### VNC Server

Weasel includes a built-in VNC server for remote desktop access.

1.  **Configure VNC**: Navigate to Settings → VNC:
    - Set the port (default: 5900)
    - Set a password for authentication
    - Enable "Allow Remote" if you want external connections
    - Enable "Auto Start" to start the server when Weasel starts
2.  **Start Server**: Navigate to Tools → VNC and click "Start Server"
3.  **Connect**: Click "Connect" to open a web-based VNC client, or use any VNC viewer to connect to the configured port

### Logging

Weasel provides structured logging with component-specific log files.

1.  **Configure Logging**: Navigate to Settings → Logging:
    - Set log folder location (default: `%APPDATA%\Weasel\Logs`)
    - Configure retention days and file size limits
    - Enable/disable logging for specific components (VNC, Application Monitor, Storage Monitor, etc.)
2.  **View Logs**: Navigate to Tools → Logs:
    - Browse log folders by component
    - View and download log files
    - Logs are automatically archived when rotated

## Using the Web Interface

To access the Weasel console:
1.  Right-click the Weasel icon in the system tray.
2.  Select **Open Dashboard**.
3.  Or, open a browser and navigate to `http://localhost:7780`.

### Features

- **File Explorer**: Browse drives and folders with a modern two-panel interface. Upload, download, rename, delete, zip/unzip files, and perform bulk operations. Drives are accessible via the submenu.
- **System Status**: View real-time CPU and memory usage, uptime, and OS details.
- **Task Manager**: View running processes. You can terminate unresponsive applications and add them to Application Monitor.
- **Services**: Manage Windows services (Start, Stop, Restart).
- **Terminal**: Access PowerShell and CMD terminals via the web interface.
  - Multiple concurrent terminal sessions
  - Switch between PowerShell and CMD
  - Popup mode for separate terminal windows
  - Full terminal emulation with command history and auto-completion
  - Real-time output via WebSocket connection
- **Packages**:
  - View installed applications
  - Search and install packages via `winget`
  - Uninstall or update installed packages
  - View installation logs in real-time
  - Save packages and create bundles
- **Application Monitor**: Monitor applications and automatically restart them if they stop. Configure check intervals, restart delays, and view detailed logs with event log integration.
- **Storage Monitor**: Monitor disk space and folder sizes with configurable thresholds and email alerts.
- **VNC**: Built-in VNC server for remote desktop access with web-based noVNC client. Configure port, password, and auto-start options.
- **Screenshots**: Capture screenshots manually or on a timed interval. Configure destination folder and filename patterns.
- **Logs**: Browse component-specific log files with a file browser interface. View logs in real-time with auto-refresh. Logs are organized by component with automatic rotation and archiving.
- **Power**: Remotely shutdown, restart, or lock the computer.

## Troubleshooting

- **Cannot connect**: Check your firewall settings. Ensure port 7780 (web server) and port 5900 (VNC, if enabled) are allowed.
- **Email alerts not working**: Verify your SMTP settings. If using Gmail, you may need to generate an "App Password".
- **VNC server won't start**: Check if the port is already in use. Try changing the port in Settings → VNC. Ensure the port is not blocked by firewall.
- **Terminal not connecting**: Ensure WebSocket connections are allowed through your firewall. Check the Logs section for terminal-specific errors.
- **Settings not saving**: In portable mode, ensure the `config` folder is writable. Check for trailing commas or syntax errors in `config/appsettings.json`.
- **Logs**: In portable mode, logs are stored in `.\Logs\` (relative to Weasel.exe). Logs are organized by component (VNC, ApplicationMonitor, StorageMonitor, Terminal, etc.). Use the Logs section in the web interface to browse and view logs.
- **Package installation fails**: Check the installation log in the Packages section. Ensure `winget` is installed and accessible from the command line.
