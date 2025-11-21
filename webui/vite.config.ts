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
    emptyOutDir: true
  }
});


