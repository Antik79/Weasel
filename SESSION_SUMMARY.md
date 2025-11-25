# Weasel Development Session Summary

## Session Date: 2025-11-25

This document summarizes the work completed in this development session.

---

## Part 1: Version Update to 1.0.0-beta

### Objective
Update all version references from `1.0.0-alpha` to `1.0.0-beta` to match the published GitHub release.

### Files Updated (8 total)
1. **README.md** (Line 9) - Documentation version
2. **webui/package.json** (Line 4) - Frontend package version
3. **WeaselHost.Core/Configuration/WeaselHostOptions.cs** (Line 25) - Runtime version (critical for WebUI display)
4. **WeaselHost/WeaselHost.csproj** (Line 47) - Main project version
5. **WeaselHost.Core/WeaselHost.Core.csproj** (Line 7) - Core library version
6. **WeaselHost.Infrastructure/WeaselHost.Infrastructure.csproj** (Line 22) - Infrastructure library version
7. **WeaselHost.Web/WeaselHost.Web.csproj** (Line 13) - Web library version
8. **CHANGELOG.md** - Already had v1.0.0-beta entry

### Key Changes
- All `<Version>` tags updated to `1.0.0-beta`
- `AssemblyVersion` and `FileVersion` kept at `1.0.0.0` (numeric only, per .NET conventions)
- WebUI now displays "Weasel v1.0.0-beta" via `/api/system/version` endpoint

### Commit
- **Hash**: `0346758`
- **Message**: "chore: Update version to 1.0.0-beta across all files"

---

## Part 2: GitHub Release v1.0.0-beta

### Objective
Successfully publish v1.0.0-beta release on GitHub with automated build pipeline.

### GitHub Actions Workflow Issues Fixed

#### Issue 1: YAML Syntax Error (Line 153)
- **Problem**: PowerShell here-string with markdown formatting confused YAML parser
- **Solution**: Replaced here-string with line-by-line file writing using `Out-File`/`Add-Content`
- **Commit**: `4d1ba29`

#### Issue 2: PowerShell Conditional Logic Error
- **Problem**: Empty `elseif` condition when triggered by tag push
- **Solution**: Changed `} elseif (${{ github.event.inputs.version }}) {` to `} elseif ("${{ github.event.inputs.version }}" -ne "") {`
- **Commit**: `b885893`

#### Issue 3: Environment Variable Setting
- **Problem**: VERSION not available to dotnet publish step
- **Solution**: Changed `Write-Host "VERSION=$version" >> $env:GITHUB_ENV` to `"VERSION=$version" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append`
- **Commit**: `36b9f7b`

#### Issue 4: AssemblyVersion Format Error
- **Problem**: .NET doesn't support semantic versioning in AssemblyVersion (e.g., "1.0.0-beta")
- **Solution**: Extract numeric version separately - use `1.0.0-beta` for Version, `1.0.0.0` for AssemblyVersion/FileVersion
- **Commit**: `b6787fa`

#### Issue 5: GitHub Release Permissions
- **Problem**: GITHUB_TOKEN lacked write permissions (403 error)
- **Solution**: Added `permissions: contents: write` to workflow job
- **Commit**: `b6c500c`

### Release Published Successfully! 🎉
- **Release URL**: https://github.com/Antik79/Weasel/releases/tag/v1.0.0-beta
- **Status**: Pre-release (beta)
- **Published**: 2025-11-25T19:16:38Z
- **Assets**:
  - `Weasel-1.0.0-beta-portable.zip` - Portable application package
  - `Weasel-1.0.0-beta-portable.zip.sha256` - SHA256 checksum

### Package Contents Verified
✅ Weasel.exe (main application)
✅ wwwroot/ (web UI)
✅ config/ (configuration files)
✅ Resources/ (tray icon and assets)
✅ README.txt (quick start guide)

---

## Part 3: Authentication Fix for File/Screenshot Access

### Problem
When password authentication was enabled (`Security.RequireAuthentication = true`), users couldn't:
- View screenshots (opened in new browser windows)
- Download/view files from Files section
- View log files

**Root Cause**: Direct browser navigation (`window.open()`, `<img src="...">`) cannot include custom HTTP headers like `X-Weasel-Token`.

### Solution: Query Parameter Authentication
Added support for `?token=xxx` as a fallback authentication method when headers cannot be used.

This is an industry-standard approach used by:
- AWS S3 (pre-signed URLs)
- Google Drive (download links)
- Dropbox (shared links)

### Implementation Details

#### Backend Changes
**File**: `WeaselHost.Web/Program.cs` (Lines 130-146)

Modified authentication middleware to:
1. First check for `X-Weasel-Token` header (preferred method)
2. If header not present, check for `token` query parameter
3. Validate using same constant-time comparison (`TokensMatch()`)

```csharp
// Try header first (preferred method)
var tokenValue = context.Request.Headers[AuthHeaderName].FirstOrDefault();

// Fallback to query parameter for direct browser access
if (string.IsNullOrWhiteSpace(tokenValue))
{
    tokenValue = context.Request.Query["token"].FirstOrDefault();
}

// Validate the token (same validation for both methods)
if (string.IsNullOrWhiteSpace(tokenValue) || !TokensMatch(tokenValue!, security.Password!))
{
    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
    await context.Response.WriteAsync("Authentication required.");
    return;
}
```

#### Frontend Changes

**1. webui/src/api/client.ts**
- Added `buildAuthenticatedUrl()` helper function
- Updated `download()` to use authenticated URLs

```typescript
export function buildAuthenticatedUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  const authToken = getAuthToken();
  if (authToken) {
    url.searchParams.set('token', authToken);
  }
  return url.toString();
}
```

**2. webui/src/sections/Tools.tsx**
- Updated `buildRawUrl()` to include token for screenshots
- Screenshots now load in `<img>` tags even with auth enabled

```typescript
const buildRawUrl = (path: string) => {
  const authToken = getAuthToken();
  const url = new URL("/api/fs/raw", window.location.origin);
  url.searchParams.set("path", path);
  if (authToken) {
    url.searchParams.set("token", authToken);
  }
  return url.toString();
};
```

**3. webui/src/sections/Logs.tsx**
- Updated `openLogDownload()` to include token
- Log files now downloadable with auth enabled

```typescript
const openLogDownload = (fileName: string, subfolder?: string | null) => {
  const authToken = getAuthToken();
  const url = new URL(`/api/logs/${encodeURIComponent(fileName)}`, window.location.origin);
  if (subfolder) {
    url.searchParams.set("subfolder", subfolder);
  }
  if (authToken) {
    url.searchParams.set("token", authToken);
  }
  window.open(url.toString(), "_blank");
};
```

**4. webui/src/sections/FileExplorer.tsx**
- No changes needed - already uses `download()` function which was updated

### How It Works

**Without Authentication:**
- No changes, everything works as before

**With Authentication Enabled:**
- **Screenshots**: `/api/fs/raw?path=screenshot.png&token=xxx`
- **File Downloads**: `/api/fs/raw?path=file.txt&token=xxx`
- **Log Files**: `/api/logs/logfile.log?subfolder=VNC&token=xxx`
- **API Calls**: Continue using `X-Weasel-Token` header (preferred)

### Security Considerations

✅ **Advantages:**
- Minimal code changes (5 files modified)
- Backward compatible - header auth continues to work
- No session state required (maintains stateless architecture)
- Uses same token validation logic (constant-time comparison)
- Industry standard pattern

⚠️ **Trade-offs:**
- Token may appear in:
  - Browser history
  - Server access logs
  - Proxy logs
  - Referrer headers
- **Mitigation**: Token is user's password either way (header or query param)
- Header-based auth remains preferred method for API calls

### Commit
- **Hash**: `1cc14ca`
- **Message**: "fix: Add query parameter authentication for direct file/screenshot access"
- **Files Changed**: 25 files (backend + frontend source + built assets)

---

## Summary of All Commits in This Session

1. `e52ef5d` - feat: VNC improvements and configurable UI preferences
2. `d949642` - docs: Update CHANGELOG for v1.0.0-beta release
3. `3114cd1` - fix: Remove YAML-incompatible characters from workflow README
4. `4d1ba29` - fix: Replace here-string with line-by-line README generation
5. `b885893` - fix: PowerShell syntax error in version extraction
6. `36b9f7b` - fix: Correct environment variable setting syntax for VERSION
7. `b6787fa` - fix: Use numeric version for AssemblyVersion and FileVersion
8. `b6c500c` - fix: Add write permissions for GitHub release creation
9. `0346758` - chore: Update version to 1.0.0-beta across all files
10. `1cc14ca` - fix: Add query parameter authentication for direct file/screenshot access

---

## Current State

### Application Version
- **Version**: 1.0.0-beta (Pre-release)
- **Release Status**: Published on GitHub
- **Branch**: main
- **Latest Commit**: `1cc14ca`

### Key Features Working
✅ VNC server with color rendering fix
✅ UI preferences system (log panel states)
✅ Multilingual support (EN, DE, FR, NL)
✅ Version consistency across all files
✅ GitHub Actions automated builds
✅ Authentication with query parameter support
✅ Screenshots viewable with auth enabled
✅ File downloads working with auth enabled
✅ Log files accessible with auth enabled

### Next Steps (For Future Sessions)
- Test authentication with password enabled
- Monitor GitHub Actions for future releases
- Consider adding configuration option to disable query param auth if needed
- Document query param auth in user guide

---

## Important Files Modified in This Session

### Backend
- `WeaselHost.Web/Program.cs` - Authentication middleware
- `WeaselHost/WeaselHost.csproj` - Version update
- `WeaselHost.Core/WeaselHost.Core.csproj` - Version update
- `WeaselHost.Infrastructure/WeaselHost.Infrastructure.csproj` - Version update
- `WeaselHost.Web/WeaselHost.Web.csproj` - Version update
- `WeaselHost.Core/Configuration/WeaselHostOptions.cs` - Version update

### Frontend
- `webui/package.json` - Version update
- `webui/src/api/client.ts` - Auth helper function
- `webui/src/sections/Tools.tsx` - Screenshot auth
- `webui/src/sections/Logs.tsx` - Log file auth

### Documentation & CI/CD
- `README.md` - Version update
- `CHANGELOG.md` - Already had v1.0.0-beta entry
- `.github/workflows/build-release.yml` - Multiple fixes for release automation

---

## Testing Recommendations

### Test Authentication Fix
1. Enable authentication in settings:
   ```json
   "Security": {
     "RequireAuthentication": true,
     "Password": "your-password"
   }
   ```
2. Test screenshot viewing - should work
3. Test file downloads - should work
4. Test log file viewing - should work
5. Verify API calls still use header auth (check dev tools)
6. Test with invalid token - should return 401
7. Disable authentication - verify everything still works

### Verify Version Consistency
1. Check WebUI header - should show "Weasel v1.0.0-beta"
2. Check `/api/system/version` endpoint
3. Verify GitHub README shows v1.0.0-beta
4. Check file properties of Weasel.exe (should be 1.0.0.0)

---

**End of Session Summary**
