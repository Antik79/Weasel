# Weasel Deployment Guide

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

## 5. Updating
1. Place the new published folder beside the old install.
2. Stop the tray icon via the context menu (Exit).
3. Replace binaries and restart via Start menu or Run key.

## 6. Optional Hardening
- Change the default port, enable HTTPS, and configure Windows Firewall rules.
- Restrict access to the config directory (`config\appsettings.json`) via NTFS ACLs.
- Consider wrapping the single-file EXE inside an MSI for managed deployments.


