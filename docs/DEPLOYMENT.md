# Weasel Deployment Guide

## Installation Options

### Option 1: Pre-built Portable Package (Recommended)

Download the latest portable ZIP from [GitHub Releases](https://github.com/Antik79/Weasel/releases):

- **Portable ZIP**: Extract to any location and run `Weasel.exe`. No installation required.
  - Includes: Weasel.exe, wwwroot (web UI), config folder, and Resources (tray icon)
  - All data stored in application directory (fully portable)
  - Can be run from USB drive or any folder

### Option 2: Build from Source

**Note**: The frontend is automatically built during the publish process. No manual `npm run build` step is required.

## 1. Prerequisites

- .NET 8.0 SDK
- Node.js (for building the frontend)

## 2. Publish the Application

```powershell
dotnet publish WeaselHost/WeaselHost.csproj `
  -c Release `
  -r win-x64 `
  --self-contained true `
  /p:PublishSingleFile=true `
  /p:IncludeNativeLibrariesForSelfExtract=true `
  /p:EnableCompressionInSingleFile=true
```

The resulting portable package will be in `WeaselHost\bin\Release\net8.0-windows\win-x64\publish\` and includes:
- **Weasel.exe** - Single-file executable with embedded .NET runtime
- **wwwroot/** - Web UI assets (automatically built and included)
- **config/** - Configuration folder
- **Resources/** - Application resources (tray icon)

## 3. Portable Mode Configuration

Weasel operates in **portable mode** by default. All data is stored relative to the application directory:

- **Configuration**: `.\config\appsettings.json`
- **Logs**: `.\Logs\` (with component-specific subfolders)
- **Screenshots**: `.\Screenshots\`

This makes Weasel fully portable - you can move the entire folder to another location, USB drive, or computer without losing any settings.

## 4. Configure Startup (Optional)

To run Weasel on Windows startup:

### Option 1: Registry Run Key (Current User)
```powershell
reg add HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v Weasel /t REG_SZ /d "C:\Path\To\Weasel.exe"
```

### Option 2: Scheduled Task
```powershell
schtasks /Create /SC ONLOGON /TN Weasel /TR "C:\Path\To\Weasel.exe" /RL HIGHEST
```

## 5. Network & Security

### Basic Configuration
- **Default binding**: `http://127.0.0.1:7780` (localhost only)
- **Remote access**: Set `WeaselHost:WebServer:AllowRemote=true` in `config\appsettings.json`
- **Port configuration**: Change `Port` in the WebServer section if needed

### Authentication
- **Enable authentication**: Set `WeaselHost:Security:RequireAuthentication=true`
- **Set password**: Configure `Password` in the Security section
- **Client access**: Clients must include the `X-Weasel-Token` header with the configured password

### Rate Limiting
- Adjust `RequestsPerMinute` and `QueueLimit` in the Security section
- Helps prevent abuse and DoS attacks

### HTTPS Configuration
- Set `UseHttps=true`
- Configure `CertificatePath` and `CertificatePassword`
- Recommended for remote access deployments

## 6. Terminal Configuration

The Terminal feature is enabled by default and accessible at `/api/terminal`:
- Supports PowerShell and CMD sessions
- Uses WebSocket for real-time communication
- No additional configuration required
- Sessions are automatically cleaned up when closed

## 7. Remote Desktop (VNC) Configuration

Weasel includes a built-in VNC server for remote desktop access:

### Configuration Options
- **Port**: Default 5900, configurable in Settings → VNC
- **Password**: Required for authentication
- **Auto-start**: Can start automatically when Weasel starts
- **Allow Remote**: Enable to allow connections from other computers

### Setup Steps
1. Navigate to **Settings → VNC** in the web interface
2. Set a strong password for VNC access
3. Configure the port (default: 5900)
4. Enable "Start automatically" if desired
5. Enable "Allow Remote" for network access (local only by default)
6. Start the server from **Tools → VNC** or the tray icon menu

### Connecting to VNC
- **Web-based client**: Use the built-in noVNC client from Tools → VNC
- **External clients**: Use TightVNC, RealVNC, UltraVNC, or any VNC viewer
  - Connect to `localhost:5900` (local) or `your-ip-address:5900` (remote)
  - Enter the configured password when prompted

### Security Best Practices
- Always use a strong password (minimum 8 characters)
- Only enable "Allow Remote" when needed
- Configure Windows Firewall to restrict VNC port access
- Use HTTPS for the web console when accessing remotely

## 8. Updating Weasel

To update to a new version:

1. **Download** the latest portable ZIP from GitHub Releases
2. **Stop Weasel** by right-clicking the tray icon and selecting "Exit"
3. **Backup** your `config` folder (optional, but recommended)
4. **Extract** the new version to a temporary location
5. **Copy** the new `Weasel.exe` and `wwwroot` folder to your installation directory
6. **Keep** your existing `config` folder (your settings)
7. **Restart** Weasel by running `Weasel.exe`

**Note**: Your configuration, logs, and screenshots are preserved in the portable folders.

## 9. Optional Hardening

For production or remote deployments:

- **Change default port**: Use a non-standard port to reduce exposure
- **Enable HTTPS**: Protect traffic with SSL/TLS encryption
- **Configure Windows Firewall**: Create rules to restrict access to specific IPs
- **Restrict config access**: Use NTFS ACLs to protect `config\appsettings.json`
- **Use strong passwords**: For both authentication and VNC access
- **Enable authentication**: Always require authentication for remote access
- **Regular updates**: Keep Weasel updated to the latest version

## 10. Automated Builds and Releases

The project includes a GitHub Actions workflow (`.github/workflows/build-release.yml`) that automatically builds and publishes releases.

### Workflow Features
- Builds the application when a version tag is pushed (e.g., `v1.0.0`)
- Creates portable ZIP packages with all required components
- Generates SHA256 checksums for verification
- Creates GitHub Release with release notes from `CHANGELOG.md`
- Verifies package completeness before publishing

### Creating a New Release
1. Update `CHANGELOG.md` with the new version and changes
2. Update version numbers in project files (if needed)
3. Create and push a version tag:
   ```powershell
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. The workflow automatically builds and publishes the release to GitHub

### Package Verification
The workflow automatically verifies that the portable package includes:
- Weasel.exe (single-file executable)
- wwwroot/ (complete web UI)
- config/ (configuration folder)
- Resources/ (tray icon)
- README.txt (portable mode instructions)


