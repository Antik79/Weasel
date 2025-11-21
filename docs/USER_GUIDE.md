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

### Disk Monitoring

Weasel can monitor your disk space and send email alerts when space runs low.

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
2.  **Enable Monitoring**: In the `DiskMonitoring` section:
    - Set `Enabled` to `true`.
    - Set `ThresholdPercent` (e.g., `10` for 10%).
    - Add email addresses to `NotificationRecipients`.

## Using the Web Interface

To access the Weasel console:
1.  Right-click the Weasel icon in the system tray.
2.  Select **Open Dashboard**.
3.  Or, open a browser and navigate to `http://localhost:7780`.

### Features

- **File Explorer**: Browse drives and folders. Upload, download, rename, and delete files. You can also zip/unzip files and perform bulk operations.
- **System Status**: View real-time CPU and memory usage, uptime, and OS details.
- **Processes**: View running processes. You can terminate unresponsive applications.
- **Services**: Manage Windows services (Start, Stop, Restart).
- **Packages**: List installed applications. Install or uninstall software using `winget`.
- **Power**: Remotely shutdown, restart, or lock the computer.
- **Screenshots**: Capture a screenshot of the remote desktop.

## Troubleshooting

- **Cannot connect**: Check your firewall settings. Ensure port 7780 is allowed.
- **Email alerts not working**: Verify your SMTP settings. If using Gmail, you may need to generate an "App Password".
- **Logs**: Check the `logs` folder in the application directory for detailed error messages.
