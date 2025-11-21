# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

