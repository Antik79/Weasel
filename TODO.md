# TODO

Track ongoing work and technical debt for the Weasel project.

## In Progress

(None currently)

## Technical Debt

### High Priority

- [ ] **Duplicated monitoring code** - StartAsync/StopAsync identical in DiskMonitorService and ApplicationMonitorService
  - Consider creating `BackgroundMonitoringServiceBase` class
  - See `.claude/templates/02-implementation.md` for base class pattern

### Medium Priority

- [ ] **Inconsistent API responses** - Different error formats across endpoints in Program.cs
  - Should use consistent `ApiError` record format
  - See `.claude/templates/02-implementation.md` for API response standards

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

## Feature Ideas

- [ ] Network adapter monitoring
- [ ] CPU/Memory usage alerts
- [ ] Scheduled tasks management
- [ ] Remote registry access

## Notes

- Always update this file when completing tasks or discovering new issues
- Move completed items to the "Completed" section with strikethrough
- Reference relevant template files for implementation guidance
