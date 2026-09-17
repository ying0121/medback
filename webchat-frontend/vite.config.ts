import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // "spa" mode: normal SPA build for local dev testing (npm run build:spa)
  // any other mode (default production): IIFE embed build (npm run build)
  const isSpa = mode === "spa";
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = (env.VITE_BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      // Proxy API to the backend for Twilio/token calls during local Vite dev.
      // WebSocket connects directly to VITE_BACKEND_URL (not proxied) so
      // offline backend correctly shows Offline instead of a false Online.
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    define: isSpa ? {} : {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: isSpa ? {} : {
      // Single self-contained IIFE — no module system, no global leakage,
      // fully isolated from host page jQuery/$  and other globals.
      lib: {
        entry: path.resolve(__dirname, "src/main.tsx"),
        name: "MedicalChatbot",
        formats: ["iife"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "medical-chatbot.iife.js",
          inlineDynamicImports: true,
        },
      },
    },
  };
});
