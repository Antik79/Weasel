# Implementation Plan - Weasel Refactor & Enhancements

The goal is to implement a wide range of user-requested features including a major refactor of the Settings and Files sections, adding i18n support, enhancing Disk Monitoring, and creating a new Application Monitor tool.

## User Review Required

> [!IMPORTANT]
> **Breaking Changes**:
> - The **Settings** screen will be significantly restructured. The "Screenshots" tab will be renamed to "General" and will house general application settings.
> - **Disk Monitoring** configuration will be moved from global settings to per-drive settings. Existing global configuration might be reset or need migration (we will attempt to map it if possible, but per-drive is a different model).

> [!NOTE]
> **i18n**: We will introduce a translation system. Initial language will be English (`en.json`).

## Proposed Changes

### Phase 1: Foundation & Settings Refactor

#### [NEW] `webui/src/i18n`
- Create directory for language files.
- `en.json`: Initial English translation file.
- `i18n.ts`: Simple translation hook/context.

#### [MODIFY] [webui/src/sections/Settings.tsx](file:///c:/Users/Antik/source/repos/Antik79/Weasel/webui/src/sections/Settings.tsx)
- Rename "Screenshots" tab to "General".
- Add "Language" selector.
- Add "Run Weasel as Administrator" toggle (calls `/api/system/admin/restart` if needed, or checks status).
- Add "Start Weasel with Windows" toggle.
- Move Screenshot settings (Folder, Pattern) to a "Screenshots" subsection within "General".
- **[NEW] Interval Screenshot**: Add "Interval (seconds)" and "Enable Interval Capture" toggle to Screenshot settings. Backend needs a background service for this.

#### [MODIFY] [WeaselHost.Infrastructure/Services/SystemInfoService.cs](file:///c:/Users/Antik/source/repos/Antik79/Weasel/WeaselHost.Infrastructure/Services/SystemInfoService.cs)
- Add method `SetStartupOnBoot(bool enable)` using Windows Registry (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`).

#### [MODIFY] [WeaselHost.Web/Program.cs](file:///c:/Users/Antik/source/repos/Antik79/Weasel/WeaselHost.Web/Program.cs)
- Map endpoint `POST /api/system/startup` to `SetStartupOnBoot`.
- Register `IntervalScreenshotService`.

#### [NEW] `WeaselHost.Infrastructure/Services/IntervalScreenshotService.cs`
- `IHostedService` that captures screenshots periodically if enabled.

### Phase 2: Files Section Overhaul

#### [MODIFY] [webui/src/sections/FileExplorer.tsx](file:///c:/Users/Antik/source/repos/Antik79/Weasel/webui/src/sections/FileExplorer.tsx)
- **Layout**: Move breadcrumbs to a new line below the toolbar.
- **Breadcrumbs**: Handle long paths with ellipsis/truncation.
- **Panels**: Make Directory Browser (left) and File Browser (right) resizable. Persist sizes in `localStorage`.
- **Icons**: Replace "Edit" with Pencil, "Tail" with Eye, "Rename" with "REN" (or icon if available).
- **Sorting**: Make table headers clickable to sort by Name, Size, Date.
- **Context Menu**: Add right-click menu for common actions (Open, Delete, Rename, Copy, Cut).
- **State**: Persist last visited path in `localStorage`.

### Phase 3: Disk Monitoring Enhancements

#### [MODIFY] [WeaselHost.Core/Configuration/WeaselHostOptions.cs](file:///c:/Users/Antik/source/repos/Antik79/Weasel/WeaselHost.Core/Configuration/WeaselHostOptions.cs)
- Update [DiskMonitoringOptions](file:///c:/Users/Antik/source/repos/Antik79/Weasel/WeaselHost.Core/Configuration/WeaselHostOptions.cs#76-88):
    - Remove global `CheckIntervalMinutes`, `ThresholdPercent`.
    - Add `List<FolderMonitorOptions> FolderMonitors`.
- Update [DriveMonitorConfig](file:///c:/Users/Antik/source/repos/Antik79/Weasel/webui/src/types.ts#108-114) (if exists) or create new structure to support per-drive `CheckInterval` and `Threshold` (MB/GB support).

#### [MODIFY] [WeaselHost.Infrastructure/Services/DiskMonitorService.cs](file:///c:/Users/Antik/source/repos/Antik79/Weasel/WeaselHost.Infrastructure/Services/DiskMonitorService.cs)
- Update logic to respect per-drive intervals and thresholds.
- Implement folder size monitoring.

#### [MODIFY] [webui/src/sections/Tools.tsx](file:///c:/Users/Antik/source/repos/Antik79/Weasel/webui/src/sections/Tools.tsx) (Disk Monitoring Tab)
- Remove global settings UI.
- Add "Folder Monitoring" section.
- Update Drive Configuration UI to support MB input for free space threshold.

### Phase 4: Application Monitor (New Tool)

#### [NEW] `WeaselHost.Core/Configuration/ApplicationMonitorOptions.cs`
- Define configuration for monitored apps: [Path](file:///c:/Users/Antik/source/repos/Antik79/Weasel/webui/src/sections/FileExplorer.tsx#70-74), `CheckIntervalSeconds`, `RestartDelaySeconds`, `LogPath`.

#### [NEW] `WeaselHost.Infrastructure/Services/ApplicationMonitorService.cs`
- Implement `IHostedService`.
- Logic: Check if process is running. If not, wait delay, then start.
- Check Windows Event Log for crashes (Application log, Error level, source matches app).
- Send email on crash.

#### [MODIFY] [WeaselHost.Web/Program.cs](file:///c:/Users/Antik/source/repos/Antik79/Weasel/WeaselHost.Web/Program.cs)
- Register `ApplicationMonitorService`.
- Map endpoints for App Monitor config and status.

#### [MODIFY] [webui/src/sections/Tools.tsx](file:///c:/Users/Antik/source/repos/Antik79/Weasel/webui/src/sections/Tools.tsx)
- Add "Application Monitor" tab.
- UI to add/remove monitored apps (use [FolderPicker](file:///c:/Users/Antik/source/repos/Antik79/Weasel/webui/src/components/FolderPicker.tsx#16-151) restricted to files or new `FilePicker`).
- Configure intervals/delays.

### Phase 5: Cleanup & Polish

#### [MODIFY] [webui/src/App.tsx](file:///c:/Users/Antik/source/repos/Antik79/Weasel/webui/src/App.tsx)
- Remove "Administrator Status" box from Overview (moved to Settings).
- Remove "Take Screenshot" button from header.

#### [MODIFY] [webui/src/utils/format.ts](file:///c:/Users/Antik/source/repos/Antik79/Weasel/webui/src/utils/format.ts)
- Add `cleanPath(path: string)` to replace `\\` with `\`. Apply this globally to path displays.

#### [MODIFY] `webui/src/sections/Tools.tsx` (Screenshots Tab)
- Replace "View"/"Download" text buttons with icons.

## Verification Plan

### Automated Tests
- Build frontend (`npm run build`).
- Build backend (`dotnet build`).

### Manual Verification
- **Settings**: Toggle Admin (restart), Toggle Startup (check Task Mgr/Reg), Change Language (verify text updates).
- **Files**: Resize panels, Right-click context menu, Sort files, Check breadcrumb layout.
- **Disk Monitor**: Add folder monitor, set drive threshold (MB), verify alerts.
- **App Monitor**: Add `notepad.exe`, kill it, verify it restarts. Check logs/email.
