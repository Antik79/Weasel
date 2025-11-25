# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha] - 2025-01-23

This is the first pre-release of Weasel, a comprehensive Windows remote administration tool with a modern web-based interface.

### Added
- **Terminal Viewer**: Full PowerShell and CMD terminal access via web interface
  - Multiple concurrent terminal sessions
  - Popup mode for separate terminal windows
  - Full terminal emulation using xterm.js
  - WebSocket-based real-time terminal communication
- **Portable Mode**: Fully portable application architecture
  - All data stored in application directory (config, logs, screenshots)
  - Configuration loaded from `AppContext.BaseDirectory`
  - No %APPDATA% dependencies for portable operation
- **Versioning System**: Application version displayed in UI and exposed via API endpoint
- **Design System**: Comprehensive design template with reusable components (SubmenuNav, PageLayout, SectionPanel)
- **Structured Logging**: Component-specific log files with archive support
  - Per-component enable/disable toggles
  - Automatic log rotation (daily and size-based)
  - Archive support for old logs
  - Two-panel log browser interface
- **Log Viewer Redesign**: Logs section uses same layout as Files section with directory tree and file browser
- **Package Management Enhancements**:
  - Real-time log tailing during package installation
  - Uninstall/Update buttons in search results based on installation status
  - Improved package search with timeout handling
  - New `winget show` functionality for detailed package information
- **Application Monitor Enhancements**:
  - Compact collapsed view by default
  - Expandable configuration per application
  - Log tailing section with auto-refresh
  - Enhanced logging with event log entries
  - Dedicated notification recipient list
  - Ability to add processes from Task Manager
- **VNC Server**: Built-in VNC server for remote desktop access
  - Web-based VNC client using noVNC
  - Password authentication with DES encryption
  - Auto-start on application startup
  - Configurable port, password, and remote access
  - WebSocket proxy for web-based VNC client
  - Mouse and keyboard control
  - Pixel format conversion for different client formats
- **Storage Monitor**: Automated disk space and folder monitoring
  - Drive-level and folder-level monitoring
  - Configurable thresholds (over/under)
  - SMTP email notifications
- **UI Consistency Improvements**:
  - Consistent table styling with locked headers and column sorting
  - Toast notifications and confirmation dialogs replacing browser pop-ups
  - Standardized submenu navigation across all sections
  - Reduced spacing between main menu and submenu
- **Files Section Improvements**:
  - Drives moved to submenu (removed "Drives" box)
  - "Directories" renamed to "Folders"
  - Search and bookmark row moved below path row
  - Bulk operations (copy, move, delete, zip)
  - Integrated Monaco code editor for file editing
- **Packages Section Restructuring**:
  - Removed header, converted to submenu structure
  - "Search Packages" renamed to "Install Packages"
  - Consistent submenu layout matching other sections
- **Settings Section Improvements**:
  - Screenshots moved to submenu
  - VNC settings section with all configuration options
  - Component logging toggles for granular control
- **GitHub Actions Workflow**: Automated build and release pipeline
  - Builds portable ZIP packages
  - Generates SHA256 checksums
  - Creates GitHub Releases with release notes
  - Verifies all required components are included
- **Process Info**: Added `executablePath` field for better process identification

### Changed
- **Configuration System**: Fixed critical path mismatch for portable mode
  - Both read and write now use `AppContext.BaseDirectory` for config location
  - Ensures settings persist correctly in portable installations
- **VNC Settings UI**: Simplified VNC configuration
  - Removed "Enable VNC Server" toggle (always enabled)
  - Renamed "Auto-start VNC server when Weasel starts" to "Start automatically"
  - VNC can be started/stopped via tray menu or Tools section
- **UI Layout**: All pages now use consistent layout structure with standardized spacing
- **Tools Section**:
  - Added Terminal submenu item
  - Submenu order: Application Monitor, Storage Monitor, VNC, Terminal, Screenshots, Logs
  - "Disk Monitoring" renamed to "Storage Monitor"
- **Logging System**:
  - New folder structure: `Logs/[component]/[component]-[date].log` and `Logs/[component]/Archive/`
  - General logs in root `Logs/` folder
  - Component-specific logs in subfolders
  - Made JSON parser lenient (allows trailing commas and comments)
- **Package Management**: Improved search functionality with better timeout handling and JSON output parsing
- **File Explorer**: Enhanced with better resize handling and consistent styling
- **Application Monitor**: Redesigned with compact view and expandable details
- **Event Log Watcher**: Optimized to only process new entries, significantly reducing resource usage
- **Task Manager**: Updated icon from List to Activity icon for better visual consistency
- **Package Notifications**: Improved install/uninstall notification messages for better readability
- **File Explorer**: Replaced "REN" text button with FileEdit icon for consistency with context menu
- **System Dashboard**: Removed redundant Administrator Status panel (available in Settings)
- **Process Management**: Consolidated process viewing into System > Task Manager

### Fixed
- **Settings Persistence**: Fixed critical bug where settings were not persisting
  - Config file path mismatch between read and write operations
  - JSON parser now handles trailing commas gracefully
  - CancellationToken handling fixed in save operations
- **Terminal Popup**: Fixed terminal popup connection issue
  - Popup now creates new terminal session instead of reusing existing one
  - Each popup gets its own WebSocket connection
- **Screenshots Directory**: Auto-creates missing relative path directories
- **showToast Undefined**: Added missing import in Settings.tsx
- **Timed Screenshots**: Fixed saving of `EnableIntervalCapture` and `IntervalSeconds` settings
- **Winget Search**: Fixed timeout issues and improved output parsing
- **Logging**: Fixed log file creation and rotation
- **File Explorer Resize**: Fixed resize functionality to allow resizing in both directions
- **Folder Monitoring**: Fixed path input to use browse dialog instead of prompt, fixed double backslash display
- **VNC Server**:
  - Fixed authentication flow
  - Fixed pixel format conversion for different client formats
  - Added port conflict detection and error handling
  - Fixed WebSocket proxy connection issues
  - Fixed black screen issue in noVNC viewer
- **Favicon**: Fixed favicon not displaying in web UI by adding proper PNG favicon support
- **Application Monitor**: Fixed notification targeting to use dedicated recipient list
- **Event Log**: Fixed performance issue where entire event log was re-read every check interval
- **Build Errors**: Fixed various compilation and JSX syntax errors
- **GitHub Actions**: Fixed portable package to include all required components
  - Added proper publish configuration for wwwroot, config, and Resources folders
  - Added build verification steps to ensure completeness

### Removed
- **Browser Pop-ups**: Replaced `window.alert` and `window.confirm` with inline dialogs and toast notifications
- **Tools Section**: Removed redundant "Processes" tab (functionality consolidated into System > Task Manager)
- **Duplicate VNC Enable**: Removed redundant "Enable VNC Server" checkbox from settings

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

