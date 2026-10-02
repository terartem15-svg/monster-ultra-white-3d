import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // "@" — алиас на src/, синхронизирован с paths в tsconfig.app.json
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // three + R3F + GSAP — это ~1.6 МБ несжатого JS одним куском (≈ 470 КБ
    // gzip); для 3D-лендинга это ожидаемый размер, а не ошибка, поэтому
    // порог предупреждения поднят с запасом
    chunkSizeWarningLimit: 1800,
  },
})
