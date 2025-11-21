# Theme System

This directory contains the centralized theme system for the Weasel UI application.

## Structure

- **`theme.ts`** - TypeScript theme definitions and type interfaces
- **`theme.css`** - CSS custom properties (CSS variables) for theme values
- **`components.css`** - Reusable component classes that use theme variables
- **`useTheme.ts`** - React hook for accessing theme values in TypeScript
- **`index.ts`** - Barrel export for easy imports

## Usage

### In CSS

All theme values are available as CSS custom properties:

```css
.my-component {
  background: var(--color-bg-panel);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}
```

### In TypeScript/React

Use the `useTheme` hook to access theme values:

```typescript
import { useTheme } from '../theme';

function MyComponent() {
  const theme = useTheme();
  
  return (
    <div style={{ 
      backgroundColor: theme.colors.background.panel,
      color: theme.colors.text.primary 
    }}>
      Content
    </div>
  );
}
```

### Using Component Classes

Pre-defined component classes are available in `components.css`:

- `.btn-outline` - Outlined button style
- `.btn-primary` - Primary button style
- `.panel` - Panel container
- `.panel-title` - Panel title text
- `.submenu-container` - Submenu container
- `.submenu-tab` - Submenu tab button (with `.active` modifier)
- `.input-text` - Text input field
- `.icon-btn` - Icon button
- `.checkbox`, `.radio` - Form controls
- `.modal`, `.modal-backdrop`, `.modal-header`, `.modal-body` - Modal components
- `.screenshot-card`, `.screenshot-thumb` - Screenshot components

## Customization

To change the theme:

1. **Update CSS Variables**: Modify values in `theme.css`
2. **Update TypeScript Types**: Modify `defaultTheme` in `theme.ts` to match
3. **Rebuild**: Run `npm run build` to see changes

## Future Enhancements

- Theme switching (light/dark mode)
- Multiple theme presets
- Runtime theme customization
- Theme persistence in localStorage

