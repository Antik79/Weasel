# TODO

Track ongoing work and technical debt for the Weasel project.

## In Progress

(None currently)

## Technical Debt

### High Priority

- [ ] **Duplicated monitoring code** - StartAsync/StopAsync identical in DiskMonitorService and ApplicationMonitorService
  - Consider creating `BackgroundMonitoringServiceBase` class
  - See `.claude/templates/02-implementation.md` for base class pattern

- [ ] **Slow shutdown process** - Application takes too long to shut down
  - Investigate which services are blocking shutdown
  - Implement graceful cancellation with appropriate timeouts
  - Consider adding shutdown progress indication

- [ ] **Password change requires restart** - New login password doesn't work until server restart
  - Need to implement hot-reload for security settings OR
  - Show user confirmation dialog explaining restart is required, then auto-restart
  - Audit all settings to identify which require restart vs hot-reload
  - Document restart-required settings in UI with visual indicator
  - Add this check to implementation workflow template

### Medium Priority

- [ ] **Background services lack activity logging** - LogPanel shows empty for services with no events
  - ApplicationMonitorService only logs when apps need restart or errors occur
  - DiskMonitorService only logs when thresholds are breached
  - Services should log periodic "heartbeat" or status messages when enabled
  - Example: "ApplicationMonitor: Checked 3 applications, all running" every N minutes
  - This helps users confirm the service is actively monitoring
  - Add logging requirements to implementation workflow template

- [ ] **Inconsistent API responses** - Different error formats across endpoints in Program.cs
  - Should use consistent `ApiError` record format
  - See `.claude/templates/02-implementation.md` for API response standards

- [ ] **Theme system not utilized** - Started theme work but not fully implemented
  - Implement proper CSS variables/theming system
  - Create default themes: "Weasel" (current), "Dark", "Light"
  - Make all colors and styling configurable via theme
  - Add theme selector in Settings
  - Add theming requirements to implementation workflow template

- [ ] **i18n system neglected** - Internationalization started but incomplete
  - Audit all hardcoded strings in UI
  - Complete translation files for supported languages
  - Add i18n requirements to implementation workflow template
  - Ensure all new UI text uses translation system

### Low Priority

- [ ] **Bare catches in logging/cleanup** - Some remain in FileLoggerProvider.cs and Program.cs
  - Lower priority since these are in error handling paths

## Completed

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
