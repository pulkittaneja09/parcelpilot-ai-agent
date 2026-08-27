import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The FastAPI backend does not register CORSMiddleware, and we are not allowed
 * to modify it. So in development we proxy API calls through the Vite dev
 * server: the browser only ever talks to http://localhost:5173, which makes
 * every request same-origin and removes the need for CORS headers entirely.
 *
 * The proxy target is read from VITE_API_BASE_URL so there is a single place
 * to configure the backend location.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": { target, changeOrigin: true },
        "/health": { target, changeOrigin: true },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
  };
});
