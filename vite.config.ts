import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: "dist/web",
    target: "es2022",
    rollupOptions: {
      input: {
        main: "index.html",
        dashboard: "dashboard.html",
        community: "community.html",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4319,
    proxy: {
      "/api": "http://127.0.0.1:18140",
      "/auth": "http://127.0.0.1:18140",
      "/share": "http://127.0.0.1:18140",
    },
  },
});
