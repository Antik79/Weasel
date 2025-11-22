# Weasel Design System

This document outlines the design system and component usage guidelines for the Weasel web UI.

## Overview

The Weasel design system provides a consistent, modern interface for remote system administration. It uses a dark theme with slate colors and cyan accents.

## Color Palette

### Background Colors
- `--color-bg-primary`: Primary background (#030712)
- `--color-bg-secondary`: Secondary background (#0f172a)
- `--color-bg-tertiary`: Tertiary background (#1e293b)
- `--color-bg-panel`: Panel background (rgba(15, 23, 42, 0.8))
- `--color-bg-modal`: Modal background (#0f172a)
- `--color-bg-submenu`: Submenu background (rgba(15, 23, 42, 0.5))

### Text Colors
- `--color-text-primary`: Primary text (#ffffff)
- `--color-text-secondary`: Secondary text (#e2e8f0)
- `--color-text-tertiary`: Tertiary text (#cbd5e1)
- `--color-text-muted`: Muted text (#94a3b8)

### Border Colors
- `--color-border-default`: Default border (rgba(148, 163, 184, 0.3))
- `--color-border-hover`: Hover border (rgba(148, 163, 184, 0.4))
- `--color-border-active`: Active border (#38bdf8)
- `--color-border-muted`: Muted border (rgba(148, 163, 184, 0.12))

### Accent Colors
- `--color-accent-primary`: Primary accent (#38bdf8)
- `--color-accent-hover`: Hover accent (#0ea5e9)
- `--color-accent-active`: Active accent (#2563eb)

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
3. **Colors**: Use CSS variables for colors, never hardcode hex values
4. **Submenus**: All sections with multiple views should use `SubmenuNav`
5. **Panels**: Use `SectionPanel` for grouped content sections
6. **Layout**: Use `PageLayout` as the wrapper for page content

## Migration Guide

When updating existing pages:

1. Replace custom submenu implementations with `SubmenuNav`
2. Wrap page content in `PageLayout`
3. Replace custom panel divs with `SectionPanel`
4. Update spacing to use `space-y-3` between submenu and content
5. Ensure main menu to submenu spacing is `space-y-4`

