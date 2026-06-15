import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Force a single React instance. Without this, Vite's dev pre-bundler can hand
  // @vercel/analytics/react its own copy of React, triggering "Invalid hook call"
  // errors on every load (the app still works, but the console fills with them).
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["@vercel/analytics/react"],
  },
});
