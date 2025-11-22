# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha] - 2025-01-21

### Added
- **Versioning System**: Application version displayed in UI and exposed via API endpoint
- **Design System**: Comprehensive design template with reusable components (SubmenuNav, PageLayout, SectionPanel)
- **Structured Logging**: Component-specific log files with archive support and per-component enable/disable toggles
- **Log Viewer Redesign**: Logs section now uses same layout as Files section with directory tree and file browser
- **Package Management Enhancements**:
  - Log tailing during package installation
  - Uninstall/Update buttons in search results based on installation status
  - Improved package search with timeout handling
- **Application Monitor Enhancements**:
  - Compact collapsed view by default
  - Expandable configuration per application
  - Log tailing section with auto-refresh
  - Enhanced logging with event log entries
- **VNC Server**: Built-in VNC server for remote desktop access
  - Auto-start on application startup
  - Configurable port, password, and remote access
  - WebSocket proxy for web-based VNC client
- **UI Consistency Improvements**:
  - Consistent table styling with locked headers and column sorting
  - Toast notifications and confirmation dialogs replacing browser pop-ups
  - Standardized submenu navigation across all sections
  - Reduced spacing between main menu and submenu
- **Files Section Improvements**:
  - Drives moved to submenu (removed "Drives" box)
  - "Directories" renamed to "Folders"
  - Search and bookmark row moved below path row
- **Packages Section Restructuring**:
  - Removed header, converted to submenu structure
  - "Search Packages" renamed to "Install Packages"
  - Consistent submenu layout matching other sections
- **Settings Section Improvements**:
  - Screenshots moved to submenu
  - VNC settings section with all configuration options
  - Component logging toggles for granular control

### Changed
- **UI Layout**: All pages now use consistent layout structure with standardized spacing
- **Tools Section**: 
  - Submenu order: Application Monitor, Storage Monitor, VNC, Screenshots, Logs
  - "Disk Monitoring" renamed to "Storage Monitor"
- **Logging System**: 
  - New folder structure: `Logs/[component]/[component]-[date].log` and `Logs/[component]/Archive/`
  - General logs in root `Logs/` folder
  - Component-specific logs in subfolders
- **Package Management**: Improved search functionality with better timeout handling and JSON output parsing
- **File Explorer**: Enhanced with better resize handling and consistent styling
- **Application Monitor**: Redesigned with compact view and expandable details

### Fixed
- **Timed Screenshots**: Fixed saving of `EnableIntervalCapture` and `IntervalSeconds` settings
- **Winget Search**: Fixed timeout issues and improved output parsing
- **Logging**: Fixed log file creation in new `%APPDATA%` location
- **File Explorer Resize**: Fixed resize functionality to allow resizing in both directions
- **Folder Monitoring**: Fixed path input to use browse dialog instead of prompt, fixed double backslash display
- **VNC Server**: 
  - Fixed authentication flow
  - Fixed pixel format conversion for different client formats
  - Added port conflict detection and error handling
  - Fixed WebSocket proxy connection issues
- **Build Errors**: Fixed various compilation and JSX syntax errors

### Removed
- **Browser Pop-ups**: Replaced `window.alert` and `window.confirm` with inline dialogs and toast notifications

## [Unreleased]

### Added
- **Installer Distribution**: Automated GitHub Actions workflow for building MSI installers and portable ZIP packages
- **Remote Desktop (VNC)**: Built-in VNC server for remote desktop access, configurable via Settings and Tools sections
- **VNC Management**: Start/stop VNC server, configure port, password, and remote access settings
- **Application Monitor**: Dedicated notification recipient list for application monitoring alerts
- **Task Manager**: Ability to add processes directly to Application Monitor from the Task Manager interface
- **Process Info**: Added `executablePath` field to process information for better process identification
- **Package Management**: New `winget show` functionality for detailed package information lookup
- **API Documentation**: Comprehensive endpoint verification document (`ENDPOINT_VERIFICATION.md`)

### Changed
- **Event Log Watcher**: Optimized to only process new entries, significantly reducing resource usage
- **Task Manager**: Updated icon from List to Activity icon for better visual consistency
- **Packages Section**: Replaced ineffective search functionality with `winget show` for reliable package lookup
- **Package Notifications**: Improved install/uninstall notification messages for better readability
- **File Explorer**: Replaced "REN" text button with FileEdit icon for consistency with context menu
- **System Dashboard**: Removed redundant Administrator Status panel (available in Settings)
- **Process Management**: Consolidated process viewing into System > Task Manager, removed duplicate Processes tab from Tools

### Fixed
- **Favicon**: Fixed favicon not displaying in web UI by adding proper PNG favicon support
- **Application Monitor**: Fixed notification targeting to use dedicated recipient list instead of SMTP from address
- **Event Log**: Fixed performance issue where entire event log was re-read every check interval

### Removed
- **Tools Section**: Removed redundant "Processes" tab (functionality consolidated into System > Task Manager)

## [Previous Versions]

### Features
- Remote device console with system monitoring
- File system management and exploration
- Screenshot capture with timed intervals
- Disk space monitoring with configurable thresholds
- Application monitoring with automatic restart
- Windows service management
- Package management via winget
- Event log viewing and filtering
- Network adapter monitoring
- Process management and termination
- Email notifications for alerts
- Internationalization (i18n) support
- Theme system with CSS variables
- Startup on boot configuration
- Administrator privilege management

### Technical Details
- Backend: .NET 8.0 (C#)
- Frontend: React with TypeScript, Vite
- UI Framework: Tailwind CSS
- Icons: Lucide React
- State Management: SWR for data fetching
- Build System: Vite for frontend, MSBuild for backend

