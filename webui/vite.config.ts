import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Plugin to suppress harmless CSS minification warnings from esbuild
const suppressCssWarnings = () => {
  return {
    name: "suppress-css-warnings",
    buildStart() {
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        const message = args[0]?.toString() || "";
        // Suppress the specific CSS minification warning
        if (message.includes("Expected identifier but found") && message.includes("css-syntax-error")) {
          return;
        }
        originalWarn.apply(console, args);
      };
    }
  };
};

export default defineConfig({
  plugins: [react(), suppressCssWarnings()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:7780"
    }
  },
  build: {
    outDir: path.resolve(__dirname, "../WeaselHost.Web/wwwroot"),
    emptyOutDir: true,
    target: "esnext",
    chunkSizeWarningLimit: 600,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    },
    rollupOptions: {
        output: {
        manualChunks: (id) => {
          // Keep i18n and theme files in main bundle since they use React hooks
          // This must be checked BEFORE node_modules to prevent splitting
          // Normalize path separators for cross-platform compatibility
          const normalizedId = id.replace(/\\/g, "/");
          if (normalizedId.includes("/i18n/") || normalizedId.includes("/theme/") || 
              normalizedId.includes("i18n.ts") || normalizedId.includes("useTheme")) {
            return undefined;
          }
          
          // Vendor chunks for better caching and code splitting
          if (id.includes("node_modules")) {
            // React core - keep in main bundle for lazy loading to work
            // Don't split React - it needs to be available for lazy components
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
              return undefined; // Keep React in main bundle
            }
            // SWR and its dependencies use React hooks, must stay with React in main bundle
            if (id.includes("swr") || id.includes("use-sync-external-store")) {
              return undefined; // Keep SWR and use-sync-external-store in main bundle
            }
            // UI libraries
            if (id.includes("lucide-react")) {
              return "vendor-ui";
            }
            // Monaco Editor
            if (id.includes("monaco-editor") || id.includes("@monaco-editor")) {
              return "vendor-editor";
            }
            // Terminal
            if (id.includes("xterm")) {
              return "vendor-terminal";
            }
            // VNC
            if (id.includes("@novnc") || id.includes("novnc")) {
              return "vendor-vnc";
            }
            // Other utilities
            return "vendor-utils";
          }
        }
      }
    }
  },
  optimizeDeps: {
    include: ["@novnc/novnc", "novnc"]
  }
});


