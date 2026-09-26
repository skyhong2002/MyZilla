import { defineConfig } from "vite";
export default defineConfig({
  build: { outDir: "dist/web", target: "es2022" },
  server: {
    host: "127.0.0.1",
    port: 4319,
    proxy: { "/api": "http://127.0.0.1:18140" },
  },
});
