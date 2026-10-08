import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// No GitHub Pages o app fica em /app-dieta/ (BASE_PATH vem do workflow de publicação)
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
});
