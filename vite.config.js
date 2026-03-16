import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  // GitHub Pages에서 서브경로/정적 배포 시 자산 경로가 깨지지 않도록 상대 경로 사용
  base: "./",
  server: {
    host: true,
    port: 5173,
    open: true,
    strictPort: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        upload: resolve(__dirname, "upload.html")
      }
    }
  }
});
