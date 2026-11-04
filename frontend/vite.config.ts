import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  server: { proxy: { "/api/v1": "http://127.0.0.1:8000" } },
  preview: { proxy: { "/api/v1": "http://127.0.0.1:8000" } },
  optimizeDeps: {
    exclude: [
      "@parentreport/i18n/jsx-runtime",
      "@parentreport/i18n/jsx-dev-runtime",
    ],
  },
  resolve: {
    alias: {
      "@parentreport/i18n": decodeURIComponent(
        new URL("./src/i18n", import.meta.url).pathname,
      ).replace(/^\/([A-Za-z]:)/, "$1"),
    },
  },
  plugins: [react({ jsxImportSource: "@parentreport/i18n" }), tailwind()],
});
