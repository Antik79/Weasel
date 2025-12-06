# TODO

Track ongoing work and technical debt for the Weasel project.

## In Progress

- [ ] **Slow shutdown process** - Application takes too long to shut down
  - Investigation task: `.claude/tasks/slow-shutdown-investigation.md`
  - Following workflow template: Phase 1 (Investigation) in progress

## Technical Debt

### High Priority

- [ ] **Password change requires restart** - New login password doesn't work until server restart
  - Need to implement hot-reload for security settings OR
  - Show user confirmation dialog explaining restart is required, then auto-restart
  - Audit all settings to identify which require restart vs hot-reload
  - Document restart-required settings in UI with visual indicator
  - Add this check to implementation workflow template

### Medium Priority

### Low Priority

- [ ] **Bare catches in logging/cleanup** - Some remain in FileLoggerProvider.cs and Program.cs
  - Lower priority since these are in error handling paths

## Completed

- [x] ~~Duplicated monitoring code~~ - Created `BackgroundMonitoringServiceBase<T>` class, refactored DiskMonitorService and ApplicationMonitorService to inherit from it
- [x] ~~Background services lack activity logging~~ - Added periodic heartbeat logging to DiskMonitorService and ApplicationMonitorService (every 5 minutes when enabled)
- [x] ~~Inconsistent API responses~~ - Created `ApiError` record and `ResultExtensions` helper methods, updated all endpoints to use standardized format
- [x] ~~Theme system not utilized~~ - Implemented complete theme system with Weasel, Dark, and Light themes, added theme selector to Settings, theme preference persists to backend
- [x] ~~i18n system neglected~~ - Fixed fallback mechanism to use English for missing keys, English is now source of truth, other languages can be completed incrementally
- [x] ~~Bare catch blocks in services~~ - Fixed with specific exception types
- [x] ~~Nullable loggers~~ - All services now require ILogger<T>
- [x] ~~Magic numbers~~ - Centralized in WeaselConstants.cs
- [x] ~~Process disposal~~ - Fixed in ProcessService enumeration
- [x] ~~VNC pause delay setting missing from UI~~ - Added slider in Settings > VNC Recording
- [x] ~~Monitoring services not responding to config changes~~ - Fixed StartAsync pattern
- [x] ~~Email SSL handshake failure~~ - Fixed SmtpClient initialization
- [x] ~~Template consolidation~~ - Combined 11 templates into 5 workflow phases
- [x] ~~VNC status bar confusing indicators~~ - Split into separate Recording and Motion Detection badges
- [x] ~~Files page Select All~~ - Added Select all checkbox in Folders and Files panel headers
- [x] ~~Files page MIME type detection~~ - Added file type categorization with appropriate icons and actions
- [x] ~~Pagination labels too verbose~~ - Simplified pagination UI, removed "Items per page" label
- [x] ~~SMTP implicit SSL support~~ - Migrated to MailKit for proper port 465/587 support

## Feature Ideas

- [ ] Network adapter monitoring
- [ ] CPU/Memory usage alerts
- [ ] Scheduled tasks management
- [ ] Remote registry access

## Notes

- Always update this file when completing tasks or discovering new issues
- Move completed items to the "Completed" section with strikethrough
- Reference relevant template files for implementation guidance
