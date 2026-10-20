import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 用相对路径：同一份构建既能在本地根路径跑，也能挂在 GitHub Pages 的 /walknote/ 子路径下
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5190 },
})
