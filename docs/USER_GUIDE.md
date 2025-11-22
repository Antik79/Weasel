# Weasel User Guide

Weasel is a powerful remote system administration tool for Windows. This guide will help you install, configure, and use Weasel effectively.

## Installation

1.  **Download**: Get the latest release of Weasel.
2.  **Install**: Weasel is a portable application. Extract the zip file to a folder of your choice (e.g., `C:\Tools\Weasel`).
3.  **Run**: Double-click `Weasel.exe` to start the application. You will see a weasel icon in your system tray.

## Configuration

Weasel creates a configuration file at `config/appsettings.json` relative to the executable. You can edit this file to customize the behavior.

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
- **Packages**: 
  - View installed applications
  - Search and install packages via `winget`
  - Uninstall or update installed packages
  - View installation logs in real-time
  - Save packages and create bundles
- **Application Monitor**: Monitor applications and automatically restart them if they stop. Configure check intervals, restart delays, and view detailed logs.
- **Storage Monitor**: Monitor disk space and folder sizes with configurable thresholds and email alerts.
- **VNC**: Built-in VNC server for remote desktop access with web-based client.
- **Screenshots**: Capture screenshots manually or on a timed interval. Configure destination folder and filename patterns.
- **Logs**: Browse component-specific log files with a file browser interface. View logs in real-time with auto-refresh.
- **Power**: Remotely shutdown, restart, or lock the computer.

## Troubleshooting

- **Cannot connect**: Check your firewall settings. Ensure port 7780 (web server) and port 5900 (VNC, if enabled) are allowed.
- **Email alerts not working**: Verify your SMTP settings. If using Gmail, you may need to generate an "App Password".
- **VNC server won't start**: Check if the port is already in use. Try changing the port in Settings → VNC. Ensure the port is not blocked by firewall.
- **Logs**: Check the `%APPDATA%\Weasel\Logs` folder for detailed error messages. Logs are organized by component (VNC, ApplicationMonitor, StorageMonitor, etc.).
- **Package installation fails**: Check the installation log in the Packages section. Ensure `winget` is installed and accessible.
