import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

// npm run build       -> dist/ con datos de demostración (hosting estático / Vercel)
// npm run build:rest  -> dist/ conectado al backend Express (lo sirve apps/server)
// npm run build:gas   -> dist-gas/index.html en un solo archivo, para pegar como Index.html en Apps Script
export default defineConfig(({ mode }) => ({
  plugins: [vue(), ...(mode === 'gas' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'gas' ? 'dist-gas' : 'dist' },
  server: { proxy: { '/api': 'http://localhost:3000' } }, // en desarrollo, /api va al servidor Express
}))
