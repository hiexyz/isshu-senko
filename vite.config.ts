import { defineConfig } from 'vite'

// Lolipop Now / local: /
// GitHub Pages: BASE_PATH=/isshu-senko/ npm run build
export default defineConfig({
  base: process.env.BASE_PATH || '/',
})
