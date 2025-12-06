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

### General Settings

Navigate to Settings → General to configure:

- **Language**: Choose your preferred language (English, German, French, Dutch). Selection persists to backend configuration.
- **Log Panel Defaults**: Set whether log panels should be expanded or collapsed by default across all sections.
- **Packages Page Size**: Configure the number of packages displayed per page in the Package Manager.

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

### VNC Server & Client

Weasel includes a built-in VNC server and web-based VNC client for remote desktop access.

#### Built-in VNC Server

1.  **Configure VNC Server**: Navigate to Settings → VNC:
    - Set the port (default: 5900)
    - Set a password for authentication
    - Enable "Allow Remote" if you want external connections
    - Enable "Auto Start" to start the server when Weasel starts
2.  **Start Server**: Navigate to Tools → VNC and click "Start Server"
3.  **Connect**: Use the default VNC profile to connect to the internal server

#### VNC Client with Multiple Profiles

Connect to the internal Weasel VNC server or external VNC servers using saved profiles:

1.  **Default Profile**: Pre-configured profile for connecting to the internal Weasel VNC server
2.  **Custom Profiles**: Create profiles for external VNC servers:
    - Click "Add VNC Profile" in Tools → VNC
    - Enter server details (name, host, port)
    - Configure connection settings:
      - **View Only**: Disable mouse/keyboard input
      - **Shared**: Allow multiple simultaneous connections
      - **Quality**: 0-9 (0=best quality, 9=best compression)
      - **Compression**: 0-9 (0=no compression, 9=max compression)
      - **Password**: Optional, can be prompted on connection
      - **Repeater ID**: For VNC repeater connections
3.  **Connect**: Click "Connect" on any profile to open the web-based VNC viewer in a new window

#### VNC Viewer Features

The VNC viewer window provides:
- **Screenshot**: Capture the current screen and save to Screenshots folder
- **Ctrl+Alt+Delete**: Send Ctrl+Alt+Delete to the remote session
- **Record**: Start/stop session recording (if recording is enabled for the profile)
- **Disconnect**: Close the VNC connection

#### VNC Recording

Record VNC sessions to WebM video files:

1.  **Configure Recording**: Navigate to Settings → VNC → Recording:
    - **Root Folder**: Where recordings are saved (default: `.\Recordings\`)
    - **Use Profile Subfolders**: Save recordings in profile-specific folders
    - **Max Duration**: Maximum recording length in minutes
    - **Retention Days**: Automatic deletion of old recordings
    - **Enable Motion Detection**: Pause recording when no activity
    - **Motion Detection Threshold**: Sensitivity (1-100%)
    - **Pause Delay**: Seconds of inactivity before pausing (default: 10)
    - **Recording FPS**: Frames per second for recording
2.  **Enable for Profile**: Edit a VNC profile and check "Enable Recording"
3.  **Start Recording**: Click "Record" button during an active VNC session
4.  **Stop Recording**: Click "Stop" button or disconnect from the session

Recordings are automatically saved with timestamps and can be played back in any WebM-compatible video player.

### System Overview

The System Overview dashboard provides real-time monitoring of your system and all Weasel services in one place.

#### Real-Time Metrics

Navigate to **System → Overview** to see:

- **CPU Usage Chart**: Real-time CPU utilization with 5-minute rolling history
- **Memory Usage Chart**: Real-time memory utilization with 5-minute rolling history
- **System Information**: Hostname, IP address, current CPU and memory percentages

The charts automatically update every 5 seconds and maintain a rolling buffer of the last 60 data points (5 minutes of history).

#### Weasel Services Status

The dashboard displays status cards for all Weasel services:

- **VNC Server**: Shows running status, port, active connections, active recordings, and auto-start setting
- **Storage Monitor**: Shows enabled status, monitored drives/folders count, active alerts, and last check time
- **Application Monitor**: Shows enabled status, total/enabled/running application counts, and recent restarts
- **Screenshot Service**: Shows interval capture status, interval setting, and recent/total screenshot counts
- **Terminal Sessions**: Shows active session count
- **VNC Recordings**: Shows total/recent recordings count and storage usage

Each service card includes:
- Status indicator with color-coded badge (Running/Enabled/Disabled/Warning)
- Key metrics and configuration values
- Quick navigation link to the service's configuration page in Tools

Click on any service card or use the external link icon to navigate to the corresponding Tools section for detailed configuration.

#### Storage Overview

The Storage section displays all available drives with:
- Visual progress bars showing usage percentage
- Color-coded indicators (green/yellow/red based on usage thresholds)
- Used and total capacity for each drive

#### Network Information

The Network section shows:
- Active network adapter selection
- Adapter status, MAC address, and speed
- IP addresses assigned to the adapter
- Real-time throughput statistics (bytes/packets sent and received)

Select a network adapter from the dropdown to view detailed information and statistics.

### Logging

Weasel provides structured logging with component-specific log files.

1.  **Configure Logging**: Navigate to Settings → Logging:
    - Set log folder location (default: `%APPDATA%\Weasel\Logs`)
    - Configure retention days and file size limits
    - Enable/disable logging for specific components (VNC, Application Monitor, Storage Monitor, Files, Packages, etc.)
    - Set minimum log levels per component
2.  **View Logs**: Navigate to Tools → Logs:
    - Browse log folders by component
    - View and download log files
    - Logs are automatically archived when rotated
    - Control log panel expansion with default state in Settings → General

### Screenshots

Configure screenshot capture options in Settings → Screenshots:

- **Folder**: Main folder for manual screenshots (default: `.\Screenshots\`)
- **Timed Folder**: Separate folder for interval screenshots (default: fallback to main Folder)
- **Filename Pattern**: Customize screenshot filename format (e.g., `yyyyMMdd_HHmmss`)
- **Enable Interval Capture**: Toggle automatic timed screenshots
- **Interval Seconds**: Set the capture frequency for timed screenshots

This allows you to keep manual screenshots separate from automatically captured ones.

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
  - View installed applications with pagination
  - Search and install packages via `winget`
  - Uninstall or update installed packages
  - View installation logs in real-time
  - Create and manage package bundles:
    - Create bundles directly from search results
    - Add multiple packages to bundles
    - Rename bundles with inline editing
    - Export/import bundles for sharing
    - Install bundles with selective package selection
    - View package contents before deletion
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
