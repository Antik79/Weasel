# API Endpoint Verification

This document lists all API endpoints that the frontend calls and verifies they exist in the backend.

## ✅ System Endpoints (`/api/system`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `GET /api/system/status` | `GET /api/system/status` | ✅ Exists |
| `GET /api/system/info` | `GET /api/system/info` | ✅ Exists |
| `POST /api/system/screenshot` | `POST /api/system/screenshot` | ✅ Exists |
| `GET /api/system/startup` | `GET /api/system/startup` | ✅ Exists |
| `POST /api/system/startup` | `POST /api/system/startup` | ✅ Exists |
| `GET /api/system/admin/status` | `GET /api/system/admin/status` | ✅ Exists |
| `POST /api/system/admin/restart` | `POST /api/system/admin/restart` | ✅ Exists |
| `GET /api/system/network/adapters` | `GET /api/system/network/adapters` | ✅ **Added** |
| `GET /api/system/network/stats/{adapterId}` | `GET /api/system/network/stats/{adapterId}` | ✅ **Added** |
| `GET /api/system/events` | `GET /api/system/events` | ✅ **Added** |

## ✅ File System Endpoints (`/api/fs`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `GET /api/fs?path=...` | `GET /api/fs?path=...` | ✅ Exists |
| `GET /api/fs/drives` | `GET /api/fs/drives` | ✅ **Added** |
| `GET /api/fs/raw?path=...` | `GET /api/fs/raw?path=...` | ✅ Exists |
| `GET /api/fs/content?path=...` | `GET /api/fs/content?path=...` | ✅ **Added** |
| `POST /api/fs/upload` | `POST /api/fs/upload` | ✅ Exists |
| `DELETE /api/fs?path=...` | `DELETE /api/fs?path=...` | ✅ Exists |
| `POST /api/fs/rename` | `POST /api/fs/rename` | ✅ Exists |
| `POST /api/fs/directory` | `POST /api/fs/directory` | ✅ Exists |
| `POST /api/fs/file` | `POST /api/fs/file` | ✅ Exists |
| `POST /api/fs/write` | `POST /api/fs/write` | ✅ **Added** (alias) |
| `POST /api/fs/zip` | `POST /api/fs/zip` | ✅ Exists |
| `POST /api/fs/bulk/zip` | `POST /api/fs/bulk/zip` | ✅ **Added** (alias) |
| `POST /api/fs/unzip` | `POST /api/fs/unzip` | ✅ Exists |
| `POST /api/fs/bulk/delete` | `POST /api/fs/bulk/delete` | ✅ **Added** |
| `POST /api/fs/bulk/copy` | `POST /api/fs/bulk/copy` | ✅ **Added** |
| `POST /api/fs/bulk/move` | `POST /api/fs/bulk/move` | ✅ **Added** |
| `POST /api/fs/download/bulk` | `POST /api/fs/download/bulk` | ✅ **Added** |

## ✅ Process Endpoints (`/api/processes`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `GET /api/processes` | `GET /api/processes` | ✅ Exists |
| `POST /api/processes/{pid}/terminate` | `POST /api/processes/{pid}/terminate` | ✅ Exists |
| `DELETE /api/processes/{pid}` | `DELETE /api/processes/{pid}` | ✅ **Added** (alias) |

## ✅ Service Endpoints (`/api/services`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `GET /api/services?status=...` | `GET /api/services?status=...` | ✅ Exists |
| `POST /api/services/{name}/start` | `POST /api/services/{name}/start` | ✅ Exists |
| `POST /api/services/{name}/stop` | `POST /api/services/{name}/stop` | ✅ Exists |
| `POST /api/services/{name}/restart` | `POST /api/services/{name}/restart` | ✅ Exists |

## ✅ Package Endpoints (`/api/packages`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `GET /api/packages` | `GET /api/packages` | ✅ **Added** |
| `POST /api/packages/install` | `POST /api/packages/install` | ✅ **Added** |
| `POST /api/packages/uninstall` | `POST /api/packages/uninstall` | ✅ **Added** |

## ✅ Settings Endpoints (`/api/settings`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `GET /api/settings/capture` | `GET /api/settings/capture` | ✅ Exists |
| `PUT /api/settings/capture` | `PUT /api/settings/capture` | ✅ Exists |
| `GET /api/settings/security` | `GET /api/settings/security` | ✅ Exists |
| `PUT /api/settings/security` | `PUT /api/settings/security` | ✅ Exists |
| `GET /api/settings/mail` | `GET /api/settings/mail` | ✅ Exists |
| `PUT /api/settings/mail` | `PUT /api/settings/mail` | ✅ Exists |
| `POST /api/settings/mail/test` | `POST /api/settings/mail/test` | ✅ Exists |

## ✅ Log Endpoints (`/api/logs`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `GET /api/logs` | `GET /api/logs` | ✅ Exists |
| `GET /api/logs/{fileName}` | `GET /api/logs/{fileName}` | ✅ Exists |

## ✅ Disk Monitoring Endpoints (`/api/disk-monitoring`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `GET /api/disk-monitoring/status` | `GET /api/disk-monitoring/status` | ✅ Exists |
| `GET /api/disk-monitoring/config` | `GET /api/disk-monitoring/config` | ✅ Exists |
| `PUT /api/disk-monitoring/config` | `PUT /api/disk-monitoring/config` | ✅ Exists |
| `GET /api/disk-monitoring/drives` | `GET /api/disk-monitoring/drives` | ✅ Exists |

## ✅ Application Monitor Endpoints (`/api/application-monitor`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `GET /api/application-monitor/status` | `GET /api/application-monitor/status` | ✅ Exists |
| `GET /api/application-monitor/config` | `GET /api/application-monitor/config` | ✅ Exists |
| `PUT /api/application-monitor/config` | `PUT /api/application-monitor/config` | ✅ Exists |

## ✅ Power Endpoints (`/api/power`)

| Frontend Call | Backend Endpoint | Status |
|--------------|-----------------|--------|
| `POST /api/power/restart` | `POST /api/power/restart` | ✅ **Fixed** (now accepts JSON body) |
| `POST /api/power/shutdown` | `POST /api/power/shutdown` | ✅ **Fixed** (now accepts JSON body) |
| `POST /api/power/lock` | `POST /api/power/lock` | ✅ Exists |

## Summary

- **Total Endpoints Verified**: 50+
- **Newly Added**: 12 endpoints
- **Fixed**: 2 endpoints (power endpoints now accept JSON body)
- **All endpoints verified**: ✅

## Notes

1. JSON serialization is configured to use camelCase for all responses
2. Power endpoints now accept JSON body: `{ "force": true }` instead of query parameters
3. Process termination supports both `POST /api/processes/{pid}/terminate` and `DELETE /api/processes/{pid}`
4. File write supports both `/api/fs/file` and `/api/fs/write` (aliases)
5. Bulk zip supports both `/api/fs/zip` and `/api/fs/bulk/zip` (aliases)

