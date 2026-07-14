import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 배포: dist/ → 서버 /var/www/edim/edim-static/ (nginx가 /cpq /plm 을 index.html로 fallback)
export default defineConfig({
  base: '/edim-static/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
