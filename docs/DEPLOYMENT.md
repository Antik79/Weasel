# Weasel Deployment Guide

## Installation Options

### Option 1: Pre-built Installer (Recommended)

Download the latest release from [GitHub Releases](https://github.com/Antik79/Weasel/releases):

- **MSI Installer**: Double-click to install. Includes automatic startup configuration and uninstaller support.
- **Portable ZIP**: Extract to any location and run `Weasel.exe`. No installation required.

### Option 2: Build from Source

## 1. Build the Web UI
```powershell
cd webui
npm install
npm run build
```
The Vite build emits static assets into `WeaselHost.Web/wwwroot`, which are automatically copied into the tray application's output during publish.

## 2. Publish the Tray Application
```powershell
cd ..
dotnet publish Weasel.sln `
  -c Release `
  -r win-x64 `
  --self-contained true `
  /p:PublishSingleFile=true `
  /p:IncludeNativeLibrariesForSelfExtract=true `
  /p:EnableCompressionInSingleFile=true
```
The resulting payload lives under `WeaselHost\bin\Release\net8.0-windows\win-x64\publish\`.

## 3. Configure Startup
Pick one of the following so the agent runs after reboot:
- **Registry Run key**  
  `reg add HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v Weasel /t REG_SZ /d "C:\Path\To\WeaselHost.exe"`
- **Scheduled task**  
  `schtasks /Create /SC ONLOGON /TN Weasel /TR "C:\Path\To\WeaselHost.exe" /RL HIGHEST`

## 4. Network & Security
- Default binding is `http://127.0.0.1:7780`. To expose beyond localhost, set `WeaselHost:WebServer:AllowRemote=true` in `config\appsettings.json` and choose the desired host.
- To enforce a shared secret, set `WeaselHost:Security:RequireAuthentication=true` and provide `SharedSecret`. Clients must pass the token via the `X-Weasel-Token` header.
- Adjust rate limiting with `RequestsPerMinute` and `QueueLimit`.
- Replace the bundled `favicon.ico` with a signed certificate (`UseHttps=true`) and populate `CertificatePath`/`CertificatePassword` for HTTPS.

## 5. Remote Desktop (VNC) Configuration

Weasel includes a built-in VNC server for remote desktop access:

1. **Enable VNC Server**: 
   - Navigate to **Settings → Remote Desktop** or **Tools → Remote Desktop**
   - Check "Enable VNC server"
   - Configure port (default: 5900)
   - Set a strong password

2. **Remote Access**:
   - Enable "Allow remote connections" to allow access from other computers on your network
   - **Security Warning**: Only enable remote access if you have a strong password and proper firewall configuration

3. **Connect**:
   - Use any VNC client (e.g., TightVNC, RealVNC, UltraVNC)
   - Connect to `your-ip-address:5900` (or your configured port)
   - Enter the password you set

4. **Configuration File**:
   - VNC settings are stored in `config\appsettings.json` under `WeaselHost:Vnc`
   - Settings include: `Enabled`, `Port`, `Password`, `AllowRemote`

**Security Best Practices**:
- Always use a strong password for VNC access
- Consider enabling remote access only when needed
- Configure Windows Firewall to restrict VNC port access if needed
- Use HTTPS for the web console when accessing remotely

## 6. Updating
1. Place the new published folder beside the old install.
2. Stop the tray icon via the context menu (Exit).
3. Replace binaries and restart via Start menu or Run key.

## 7. Optional Hardening
- Change the default port, enable HTTPS, and configure Windows Firewall rules.
- Restrict access to the config directory (`config\appsettings.json`) via NTFS ACLs.
- For managed deployments, use the MSI installer from GitHub Releases which includes proper installation and uninstallation support.

## 8. Automated Builds and Releases

The project includes a GitHub Actions workflow (`.github/workflows/build-release.yml`) that automatically:
- Builds the application when a version tag is pushed (e.g., `v1.0.0`)
- Creates both MSI installer and portable ZIP packages
- Generates SHA256 checksums for verification
- Creates a GitHub Release with release notes from `CHANGELOG.md`

To create a new release:
1. Update `CHANGELOG.md` with the new version and changes
2. Create and push a version tag: `git tag v1.0.0 && git push origin v1.0.0`
3. The workflow will automatically build and publish the release


