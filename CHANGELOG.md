# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Files Page - Add to Application Monitor**: Added context menu option to add executables to Application Monitor
  - Right-click on executable files (.exe) in File Manager to add them to Application Monitor
  - Automatically configures executable path and working directory
  - Shows success/error toast notifications
  - Added translation keys for all new messages
- **Files Page - Log Panel**: Added File Operations Log panel to Files section
  - Displays file operation logs at the bottom of Files page
  - Consistent with log panels in other sections
  - Supports tailing and auto-refresh
- **LogPanel i18n Support**: Added internationalization to LogPanel component
  - All log panel messages now use translation system
  - Added translation keys for error states and empty states
  - Consistent with project i18n standards
- **Theme System**: Complete theme implementation with three themes
  - Added theme selector in Settings > General section
  - Three themes available: Weasel (default), Dark, and Light
  - Theme preference persists to backend configuration
  - All themes use CSS variables for consistent styling
- **API Error Standardization**: Standardized API error response format
  - Created `ApiError` record for consistent error structure
  - Added `ResultExtensions` helper methods for all error responses
  - All API endpoints now return consistent error format
  - Frontend automatically handles standardized error messages
- **Background Service Base Class**: Eliminated code duplication in monitoring services
  - Created `BackgroundMonitoringServiceBase<T>` abstract class
  - All monitoring services now inherit from base class
  - Reduces boilerplate code by ~50% for new services
- **Service Activity Logging**: Background services now show activity in LogPanel
  - DiskMonitorService logs periodic status (every 5 minutes when enabled)
  - ApplicationMonitorService logs periodic status (every 5 minutes when enabled)
  - Services log when disabled (every 10 minutes)
  - Users can now verify services are actively running
- **VNC Recording Settings**: Added "Pause Delay" slider in Settings > VNC Recording section
  - Allows users to configure how long to wait before pausing recording when no motion is detected
  - Range: 1-60 seconds (default: 10 seconds)
- **Files Page - Select All**: Added "Select all" checkbox in Folders and Files panel headers
  - Shows checkbox state (empty, partial, or checked) based on current selection
  - Clicking toggles between selecting all and clearing selection for that panel
- **Files Page - MIME Type Detection**: Added comprehensive file type categorization
  - Files categorized into: Image, Video, Audio, Archive, Code, Text, Executable, Document, Unknown
  - Each category has distinct icon and color for easy identification
  - Edit and Tail buttons only shown for editable text-based files
  - View button only shown for image files
  - Context menu respects file type capabilities
- **API Exit Endpoint**: Added `/api/system/admin/exit` endpoint for graceful application shutdown
  - Triggers proper shutdown sequence with all timing logs
  - Useful for programmatic testing and automation
- **System Overview Redesign**: Completely redesigned the System Overview dashboard
  - Added real-time CPU and Memory charts with historical data (5-minute rolling buffer)
  - Added Weasel Services status cards showing all service states at a glance:
    - VNC Server: connection count, port, auto-start status
    - Storage Monitor: monitored drives/folders, active alerts
    - Application Monitor: app counts, running status, recent restarts
    - Screenshot Service: interval settings, recent screenshots count
    - Terminal Sessions: active session count
    - VNC Recordings: total/recent recordings, storage usage
  - Added System Information section with hostname, OS version, uptime, RAM usage
  - Each service card has quick navigation to its dedicated page
  - Service status indicators with color-coded badges (running/enabled/warning/disabled)
  - New MetricChart component using Recharts for smooth chart rendering
  - New ServiceStatusCard component for consistent service display
  - Added new API endpoints: `/api/system/metrics` and `/api/system/weasel-status`
  - Created SystemMetricsService background service for metrics collection
  - Full i18n support with all new translation keys

### Changed
- **System Overview Service Cards Styling**: Updated ServiceStatusCard component to use standard `.panel` class
  - Service cards now match the visual style of Storage Monitor drive cards
  - Consistent with project theme system using proper CSS variables
  - Improved visual consistency across the application
- **Frontend Development Documentation**: Added comprehensive frontend development guidelines to CLAUDE.md
  - Documented i18n import patterns (correct path: `../i18n/i18n`)
  - Documented hash routing pattern (no react-router-dom)
  - Documented CSS styling patterns (use standard classes, correct variable names)
  - Documented model property verification requirements
  - Added frontend implementation checklist to workflow templates
- **API Error Responses**: Standardized all API error responses to use `ApiError` format
  - All endpoints now return consistent `{ message, code?, details? }` structure
  - Breaking change: Error response format changed (no backward compatibility required)
  - Frontend updated to handle new error format
- **Background Service Architecture**: Refactored monitoring services to use base class
  - DiskMonitorService and ApplicationMonitorService now inherit from `BackgroundMonitoringServiceBase<T>`
  - Breaking change: Service lifecycle management now handled by base class
  - Eliminated ~80 lines of duplicated code
- **i18n Fallback Mechanism**: Improved translation fallback system
  - Missing translation keys now automatically fall back to English
  - English (`en.json`) is the source of truth for all translations
  - Other languages (de, fr, nl) can be completed incrementally
- **VNC Status Bar**: Redesigned recording indicators for better clarity
  - Split combined indicator into separate "Recording" and "Motion Detection" badges
- **Pagination Component**: Simplified pagination UI across the application
  - Removed "Items per page" label for a cleaner, more compact design
  - Shows page navigation on left, page size selector on right
  - Recording badge shows red pulsing "REC" when actively recording, yellow "PAUSED" when paused
  - Motion badge shows green "Motion" when movement detected, gray "Still" when no motion
  - Motion detection indicator only shown when motion detection is enabled

### Fixed
- **Slow Shutdown**: Fixed application taking too long to shut down (high priority bug)
  - Fixed VncService blocking on `AcceptTcpClientAsync()` during shutdown - now uses cancellation token
  - Fixed WebServerManager timeout mismatch (internal 10s vs caller 5s) - reduced to 3s
  - Fixed DiskMonitorService `CalculateFolderSize()` blocking on large directories - now checks cancellation every 100 files
  - Added SHUTDOWN TIMING logs to all services for monitoring and debugging:
    - TrayApplicationContext logs each shutdown phase
    - WebServerManager logs app stop, lifetime task, and dispose times
    - BackgroundMonitoringServiceBase logs cancellation and task completion times
    - VncService logs each shutdown phase with detailed timing
  - Expected improvement: Shutdown should complete in < 5 seconds (was 15+ seconds)
- **VncService Lock Deadlock**: Fixed potential deadlock in VncService.StopAsync()
  - Server task wait moved outside lock to prevent deadlock
  - Added 2-second timeout for server task completion
- **Storage Monitor Crash**: Fixed crash when opening Storage Monitor tab
  - Resolved "Cannot read properties of undefined (reading 'border')" error
  - Added proper theme fallback to ensure theme is always defined
  - Storage Monitor now loads correctly without errors
- **LogPanel Error Handling**: Improved error messages and empty states in log panels
  - Added proper error handling for log file loading failures
  - Better empty state messages explaining when logs will appear
  - Distinguishes between "no log files" and "log file empty" states
  - All log panel messages now use i18n translation system
- **Form Field Accessibility**: Fixed accessibility warnings for form fields
  - Added `id` and `name` attributes to search input in Files section
  - Added `id` and `name` attributes to Application Monitor form fields
  - Resolves browser console accessibility warnings
- **Service Visibility**: Fixed background services appearing inactive in LogPanel
  - Services now log periodic "heartbeat" status messages when enabled
  - Users can verify services are actively monitoring
  - Services log status even when disabled (less frequently)
- **API Error Consistency**: Fixed inconsistent error response formats across endpoints
  - All endpoints now use standardized `ApiError` format
  - Frontend can handle errors consistently
- **Monitoring Services**: Fixed services not responding to configuration changes
  - ApplicationMonitorService and DiskMonitorService now check Enabled inside the loop
  - Services respond to enable/disable without requiring restart
- **SMTP Email**: Fixed email sending on port 465 (implicit SSL)
  - Migrated from System.Net.Mail.SmtpClient to MailKit for proper SSL/TLS support
  - Port 465 now uses implicit SSL (SslOnConnect) automatically
  - Port 587 uses STARTTLS as expected
  - Better error handling and connection logging

### Changed
- **Code Quality**: Refactored services for better maintainability
  - Replaced bare catch blocks with specific exception handling
  - Made all loggers required (non-nullable)
  - Centralized magic numbers in WeaselConstants.cs
  - Fixed Process disposal in enumeration loops
  - Eliminated code duplication with `BackgroundMonitoringServiceBase<T>`
  - Standardized API error responses across all endpoints

## [1.0.0-beta] - 2025-12-02

### Added

- **VNC Recording & Playback**:
  - Session recording with WebM format support
  - Motion detection with configurable pause delay (default: 10 seconds)
  - Smooth recording with delayed pause on inactivity
  - Profile-specific recording subfolders
  - Recording management interface
  - Configurable FPS, quality, and duration limits
- **VNC Multiple Server Profiles**:
  - Connect to internal Weasel VNC server or external VNC servers
  - Save multiple VNC server profiles with custom settings
  - Profile management (create, edit, rename, delete)
  - Per-profile connection settings (quality, compression, view-only, shared mode)
  - Support for VNC repeater connections
- **VNC Session Features**:
  - Screenshot capture from active VNC sessions
  - Send Ctrl+Alt+Delete to remote sessions
  - Full keyboard and mouse support via noVNC
  - Configurable recording options per profile
- **Settings Enhancements** (Phase 1-2):
  - Language preference now persists to backend configuration (not just localStorage)
  - Default log panel expansion state toggle in General settings
  - TimedFolder configuration for separate interval screenshot storage
  - Component logging for Files operations
  - Packages pagination size configuration
- **Package Manager - Bundle Management** (Phase 5):
  - Create bundles directly from "Add to bundle" dropdowns
  - Inline bundle creation with selected packages
  - Bundle rename functionality with inline editing
  - Enhanced Install All dialog with package selection checkboxes
  - Enhanced Delete dialog showing all packages in bundle
  - Selective package installation from bundles
  - Visual package count indicators
- **Package Manager UX Improvements** (Phase 4):
  - Pagination for Installed Packages tab (configurable page size)
  - Pagination for Search Results tab
  - Toast notifications now show package names instead of IDs
  - Confirmation dialog for package uninstall in Installed tab
  - Auto-reset pagination when filters change
- **Comprehensive Service Logging** (Phase 3):
  - FileSystemService: Logging for all file operations (read, write, delete, copy, move, zip)
  - PackageService: Enhanced logging for install/uninstall operations
  - PackageBundleService: Logging for all CRUD operations
  - ScreenshotService: Refactored with destination folder support
  - IntervalScreenshotService: Integrated TimedFolder configuration

### Fixed

- **VNC Authentication**:
  - Fixed password encoding issue causing authentication failures with custom VNC profiles
  - Removed double URL encoding that was corrupting passwords
  - VNC KeyEvent handling now correctly reads 4-byte key values (fixed IndexOutOfRangeException)
- **VNC WebSocket Proxy**:
  - Fixed proxy to support both internal Weasel VNC server and external VNC servers
  - Added proper host/port parameter handling for external connections
  - External VNC servers now connect correctly through WebSocket proxy
- **VNC Recording**:
  - Fixed recording stop to properly wait for final video chunk upload
  - Recordings now save correctly to profile-specific subfolders
  - Motion detection now uses configurable pause delay for smoother recordings
- **VNC Screenshot**:
  - Fixed screenshot upload to include required 'path' form field
  - Screenshots from VNC sessions now save correctly to Screenshots folder
- **Settings Persistence**:
  - Component-specific minimum log levels now save correctly
  - Language selection persists across browser sessions and localStorage clears
- **Screenshot Services**:
  - Interval screenshots now save to separate TimedFolder
  - Screenshot service supports custom destination folders

### Changed

- **VNC Motion Detection**:
  - Improved motion detection with delayed pause mechanism
  - Recording now pauses only after sustained inactivity (configurable delay)
  - Resume is immediate when motion detected
  - Results in smoother, less choppy recordings
  - New configuration option: `MotionDetectionPauseDelaySeconds` (default: 10)
- **Package Manager**:
  - Bundle creation workflow streamlined with inline inputs
  - Install All now shows package list with selection options
  - Delete confirmation shows package contents
  - All bundle actions provide better feedback
- **Screenshot Configuration**:
  - Added TimedFolder setting with fallback to main Folder
  - IntervalScreenshotService uses dedicated TimedFolder

## [1.0.0-beta] - 2024-11-25

This beta release includes critical VNC fixes and new UI customization features.

### Added
- **UI Preferences System**: Configurable log panel expansion states
  - All log panels default to collapsed for cleaner UI
  - Expansion state automatically saved and synced across devices
  - Backend storage in `config/appsettings.json`
  - Covers all 6 log panels: Screenshots, Terminal, VNC, DiskMonitor, ApplicationMonitor, Packages
- **Multilingual Support**: Added German (de), French (fr), and Dutch (nl) translations
  - Language switcher in UI header
  - Full translation coverage for all sections

### Fixed
- **VNC Color Rendering**: Fixed blueish hue bug when using external VNC clients (RealVNC)
  - Added missing RedShift assignment in pixel format parsing
  - Proper color channel mapping for different client pixel formats
  - Added comprehensive pixel format logging
- **VNC Screen Capture**: Improved error handling for Graphics.CopyFromScreen failures
  - Graceful handling of Win32Exception during desktop lock/unlock
  - Fallback mechanism using cached framebuffer
  - Screen capture remains stable during session transitions
- **VNC Logging**: Reduced log noise from normal disconnection events
  - Network errors now log at Debug level instead of Error
  - WebSocket proxy errors properly categorized
  - Only unexpected errors logged at Error level

### Changed
- **LogPanel Component**: Consolidated duplicate implementations into shared component
  - Single source of truth in `/components/LogPanel.tsx`
  - Reduced code duplication between Tools.tsx and PackageManager.tsx
  - Better maintainability and consistency

## [1.0.0-alpha] - 2024-11-23

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

