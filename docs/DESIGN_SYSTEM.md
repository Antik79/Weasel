# Weasel Design System

This document outlines the design system and component usage guidelines for the Weasel web UI.

## Overview

The Weasel design system provides a consistent, modern interface for remote system administration. It supports three themes: **Weasel** (default dark blue), **Dark** (pure dark), and **Light** (light theme). Users can switch themes in Settings > General.

**IMPORTANT**: All colors must use CSS variables from the theme system. Never hardcode hex colors or use inline styles with colors.

## Theme System

The application uses a CSS variable-based theme system that dynamically applies colors to the document root. Themes are defined in `webui/src/theme/theme.ts` and applied via `useTheme()` hook.

### Available Themes

1. **Weasel** (default) - Dark blue theme with slate colors and cyan accents
2. **Dark** - Pure dark theme with neutral grays and blue accents
3. **Light** - Light theme with light backgrounds and dark text

### Theme Implementation

- Themes are applied via CSS variables set on `document.documentElement`
- Theme preference is persisted to backend (`UiPreferences.Theme`)
- Theme switching is instant and requires no page reload
- All Tailwind classes automatically use theme CSS variables

### Using Themes in Components

```tsx
// GOOD - uses Tailwind classes that map to theme variables
<div className="bg-slate-900 text-slate-100">
<div className="text-sky-400">

// BAD - hardcoded colors
<div style={{ backgroundColor: '#1e293b' }}>
<div className="text-[#38bdf8]">
```

## Color Palette

All colors are defined as CSS variables that change based on the selected theme. The following variables are available:

### Background Colors
- `--color-bg-primary`: Primary background
- `--color-bg-secondary`: Secondary background
- `--color-bg-tertiary`: Tertiary background
- `--color-bg-panel`: Panel background
- `--color-bg-modal`: Modal background
- `--color-bg-submenu`: Submenu background

### Text Colors
- `--color-text-primary`: Primary text
- `--color-text-secondary`: Secondary text
- `--color-text-tertiary`: Tertiary text
- `--color-text-muted`: Muted text

### Border Colors
- `--color-border-default`: Default border
- `--color-border-hover`: Hover border
- `--color-border-active`: Active border
- `--color-border-muted`: Muted border

### Accent Colors
- `--color-accent-primary`: Primary accent
- `--color-accent-hover`: Hover accent
- `--color-accent-active`: Active accent

### State Colors
- `--color-success`: Success state (green)
- `--color-warning`: Warning state (amber/yellow)
- `--color-error`: Error state (red)
- `--color-info`: Info state (blue)

## Spacing

The design system uses consistent spacing variables:
- `--spacing-xs`: 0.25rem (4px)
- `--spacing-sm`: 0.5rem (8px)
- `--spacing-md`: 1rem (16px)
- `--spacing-lg`: 1.5rem (24px)
- `--spacing-xl`: 2rem (32px)

### Layout Spacing Guidelines
- Main menu to submenu: `space-y-4` (1rem / 16px)
- Submenu to content: `space-y-3` (0.75rem / 12px)
- Section spacing: `space-y-4` (1rem / 16px)
- Panel internal spacing: `var(--spacing-md)` (1rem / 16px)

## Components

### SubmenuNav

Reusable submenu navigation component for consistent tab navigation across sections.

**Location**: `webui/src/components/SubmenuNav.tsx`

**Usage**:
```tsx
import SubmenuNav, { SubmenuItem } from "../components/SubmenuNav";

const items: SubmenuItem[] = [
  { id: "overview", label: "Overview", icon: <GaugeCircle size={16} /> },
  { id: "tasks", label: "Tasks", icon: <Activity size={16} /> }
];

<SubmenuNav 
  items={items} 
  activeId={activeTab} 
  onSelect={setActiveTab} 
/>
```

**Props**:
- `items`: Array of submenu items with `id`, `label`, and optional `icon`
- `activeId`: Currently active item ID
- `onSelect`: Callback when item is selected
- `className`: Optional additional CSS classes

### PageLayout

Standard page layout wrapper for consistent page structure.

**Location**: `webui/src/components/PageLayout.tsx`

**Usage**:
```tsx
import PageLayout from "../components/PageLayout";

<PageLayout>
  <SubmenuNav ... />
  <SectionPanel ... />
</PageLayout>
```

**Props**:
- `children`: Page content
- `className`: Optional additional CSS classes

### SectionPanel

Consistent panel/section container with optional title.

**Location**: `webui/src/components/SectionPanel.tsx`

**Usage**:
```tsx
import SectionPanel from "../components/SectionPanel";

<SectionPanel title="System Information">
  {/* Panel content */}
</SectionPanel>
```

**Props**:
- `title`: Optional panel title
- `children`: Panel content
- `className`: Optional additional CSS classes
- `headerClassName`: Optional CSS classes for header
- `bodyClassName`: Optional CSS classes for body

## CSS Classes

### Buttons

- `.btn-outline`: Outlined button style
- `.btn-primary`: Primary button style

### Panels

- `.panel`: Standard panel container
- `.panel-title`: Panel title styling

### Submenu

- `.submenu-container`: Submenu container
- `.submenu-tab`: Submenu tab button
- `.submenu-tab.active`: Active submenu tab

### Inputs

- `.input-text`: Text input styling

### Icons

- `.icon-btn`: Icon button styling

### Tables

- Use the `Table` component for consistent table styling
- Tables include locked headers and column sorting
- Located in `webui/src/components/Table.tsx`

**Usage**:
```tsx
import Table, { TableColumn } from "../components/Table";

const columns: TableColumn<DataType>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "status", label: "Status", sortable: false }
];

<Table
  data={items}
  columns={columns}
  onSort={(key, direction) => {...}}
/>
```

### ToggleBar

Replacement for checkbox-based toggle controls with a modern sliding toggle design.

**Location**: `webui/src/components/ToggleBar.tsx`

**Usage**:
```tsx
import ToggleBar from "../components/ToggleBar";

<ToggleBar
  enabled={isEnabled}
  onChange={setIsEnabled}
  label="Enable Feature"
  description="Optional description text"
/>
```

**Props**:

- `enabled`: Current toggle state (boolean)
- `onChange`: Callback when toggle state changes
- `label`: Optional label text
- `description`: Optional description text
- `disabled`: Optional disabled state

**Best Practices**:

- Use for binary on/off settings
- Always provide a clear label
- Use description for additional context when needed
- Replace `<input type="checkbox">` with ToggleBar for better UX

### VncViewer

Web-based VNC client component using noVNC for remote desktop connections.

**Location**: `webui/src/components/VncViewer.tsx`

**Usage**:
```tsx
import VncViewer from "../components/VncViewer";

<VncViewer
  host="192.168.1.100"
  port={5900}
  password="secret"
  viewOnly={false}
  shared={true}
  quality={6}
  compression={2}
  onDisconnect={() => {...}}
  onScreenshot={(dataUrl) => {...}}
  profileId="profile-123"
  profileName="My VNC Server"
  enableRecording={true}
  recordingOptions={recordingConfig}
/>
```

**Props**:

- `host`: VNC server hostname or IP
- `port`: VNC server port
- `password`: Optional VNC password
- `viewOnly`: Disable keyboard/mouse input (default: false)
- `shared`: Allow multiple connections (default: false)
- `quality`: Image quality 0-9 (0=best, default: 6)
- `compression`: Compression level 0-9 (0=none, default: 2)
- `onDisconnect`: Callback when connection closes
- `onScreenshot`: Callback when screenshot captured
- `profileId`: Optional profile identifier for recordings
- `profileName`: Optional profile name for recordings
- `enableRecording`: Enable session recording (default: false)
- `recordingOptions`: Recording configuration object

**Features**:

- Full keyboard and mouse support
- Screenshot capture
- Session recording with motion detection
- Ctrl+Alt+Delete support
- Connection status display
- Automatic reconnection handling

### LogPanel

Collapsible log panel component for displaying component-specific logs.

**Location**: `webui/src/components/LogPanel.tsx`

**Usage**:
```tsx
import LogPanel from "../components/LogPanel";

<LogPanel
  title="VNC Server Logs"
  logs={logEntries}
  isExpanded={isPanelExpanded}
  onToggleExpanded={setIsPanelExpanded}
  maxHeight="400px"
/>
```

**Props**:

- `title`: Panel title text
- `logs`: Array of log entry strings
- `isExpanded`: Current expansion state
- `onToggleExpanded`: Callback to toggle expansion
- `maxHeight`: Optional maximum height when expanded

**Best Practices**:

- Save expansion state to localStorage per panel
- Use for component-specific operational logs
- Limit log array to recent entries (e.g., last 100)
- Provide clear, timestamped log messages

### FolderPicker

Dialog component for selecting folders from the file system.

**Location**: `webui/src/components/FolderPicker.tsx`

**Usage**:
```tsx
import FolderPicker from "../components/FolderPicker";

<FolderPicker
  isOpen={showPicker}
  currentPath={selectedFolder}
  onSelect={(path) => {...}}
  onClose={() => setShowPicker(false)}
  title="Select Folder"
/>
```

**Props**:

- `isOpen`: Whether dialog is visible
- `currentPath`: Initially selected folder path
- `onSelect`: Callback with selected folder path
- `onClose`: Callback to close dialog
- `title`: Optional dialog title

### FilePicker

Dialog component for selecting files from the file system.

**Location**: `webui/src/components/FilePicker.tsx`

**Usage**: Similar to FolderPicker but for file selection

- Supports file filtering by extension
- Shows file size and modification date
- Includes file preview for supported types

### Pagination

The Pagination component provides consistent navigation controls for large datasets across the application.

**Location**: `webui/src/components/Pagination.tsx`

**Features**:

- Page size selector (25/50/100/All options)
- Current page indicator with total items count
- Previous/Next navigation buttons
- Automatic hiding when showing all items (pageSize === 0)
- Automatic hiding when only one page exists
- LocalStorage persistence for user preferences

**Usage**:
```tsx
import Pagination from "../components/Pagination";

// State
const [currentPage, setCurrentPage] = useState(1);
const [pageSize, setPageSize] = useState(() => {
  const saved = localStorage.getItem('weasel.section.pageSize');
  return saved ? parseInt(saved) : 50;
});

// Pagination logic
const paginatedData = useMemo(() => {
  if (pageSize === 0) return allData; // Show all
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return allData.slice(start, end);
}, [allData, pageSize, currentPage]);

// Handler
const handlePageSizeChange = (size: number) => {
  setPageSize(size);
  setCurrentPage(1); // Reset to page 1
  localStorage.setItem('weasel.section.pageSize', size.toString());
};

// Component
<Pagination
  currentPage={currentPage}
  totalItems={allData.length}
  pageSize={pageSize}
  onPageChange={setCurrentPage}
  onPageSizeChange={handlePageSizeChange}
/>
```

**Props**:

- `currentPage`: Current page number (1-indexed)
- `totalItems`: Total number of items in the dataset
- `pageSize`: Number of items per page (0 = show all)
- `onPageChange`: Callback when page changes
- `onPageSizeChange`: Optional callback when page size changes

**Best Practices**:

- Always reset `currentPage` to 1 when changing `pageSize`
- Persist page size preferences to localStorage with a unique key per section
- Use pageSize === 0 to represent "Show All" mode
- Hide pagination controls when `totalPages <= 1` or `pageSize === 0`
- Use default page size of 50 for text data, 25 for images
- Remove `maxHeight` constraints from tables/grids when using pagination

**Common Sections Using Pagination**:

- Package Manager (installed and search results)
- File Explorer (folders and files panels)
- Logs (folders and files panels)
- Task Manager
- Service Manager
- Screenshots (captured and timed)

### Dialogs and Notifications

- **ConfirmDialog**: Reusable confirmation dialog component
- **Toast**: Toast notification system (imported from `App.tsx`)
- Replace all `window.confirm()` and `window.alert()` calls with these components

**Usage**:
```tsx
import ConfirmDialog from "../components/ConfirmDialog";
import { showToast } from "../App";

// Confirmation
<ConfirmDialog
  isOpen={confirmDialog.isOpen}
  title="Confirm Action"
  message="Are you sure?"
  variant="danger"
  onConfirm={() => {...}}
  onCancel={() => setConfirmDialog({...isOpen: false})}
/>

// Toast
showToast("Operation successful", "success");
```

## Layout Structure

All pages should follow this structure:

```
<div className="app-shell space-y-4">
  <header>...</header>
  <nav>Main Menu</nav>
  <main className="space-y-3">
    <SubmenuNav ... />
    <PageLayout>
      <SectionPanel>...</SectionPanel>
    </PageLayout>
  </main>
</div>
```

## Two-Panel Layout Pattern

For sections that need to display hierarchical data (like Files and Logs), use a two-panel layout with a resizable divider:

### Structure
- **Left Panel**: Shows folders/directories (typically 33% width, resizable)
- **Resizer**: Draggable divider between panels
- **Right Panel**: Shows files/items (remaining width)

### Implementation Example
```tsx
<div ref={containerRef} className="flex flex-row gap-2" style={{ height: 'calc(100vh - 140px)', minHeight: '600px' }}>
  {/* Left Panel - Folders */}
  <div className="panel flex flex-col overflow-hidden" style={{ width: `${leftPanelWidth}%`, minWidth: '250px' }}>
    <div className="flex items-center justify-between mb-2 flex-shrink-0">
      <h3 className="panel-title mb-0">Folders</h3>
      {/* Sorting options */}
    </div>
    <div className="divide-y divide-slate-800 overflow-y-auto flex-1 pr-2">
      {/* Folder items */}
    </div>
  </div>

  {/* Resizer */}
  <div className="w-2 cursor-col-resize bg-slate-900 hover:bg-sky-500/50 ..." onMouseDown={startResizing}>
    <div className="h-8 w-1 bg-slate-600 rounded-full" />
  </div>

  {/* Right Panel - Files */}
  <div className="panel flex-1 flex flex-col overflow-hidden" style={{ minWidth: '400px' }}>
    {/* File list with sorting and search */}
  </div>
</div>
```

### Features
- **Breadcrumbs**: Path navigation at the top
- **Sorting**: Per-panel sorting options (Name, Size, Date)
- **Search**: Filter items in the right panel
- **Resizable**: Users can adjust panel widths (persisted to localStorage)

## Best Practices

1. **Consistency**: Always use the provided components for navigation and panels
2. **Spacing**: Use the spacing variables and Tailwind classes consistently
3. **Colors**: Use CSS variables for colors via Tailwind classes, never hardcode hex values or use inline styles
4. **Theme Support**: All components must work with all three themes (Weasel, Dark, Light)
5. **Submenus**: All sections with multiple views should use `SubmenuNav`
6. **Panels**: Use `SectionPanel` for grouped content sections
7. **Layout**: Use `PageLayout` as the wrapper for page content
8. **Testing**: Test components with all theme variants to ensure readability

## Migration Guide

When updating existing pages:

1. Replace custom submenu implementations with `SubmenuNav`
2. Wrap page content in `PageLayout`
3. Replace custom panel divs with `SectionPanel`
4. Update spacing to use `space-y-3` between submenu and content
5. Ensure main menu to submenu spacing is `space-y-4`
6. Replace hardcoded colors with Tailwind classes that use theme variables
7. Test with all three themes to ensure proper contrast and readability

