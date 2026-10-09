import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// O service worker ganha uma versão própria a cada publicação, para o iPhone
// perceber a atualização e trocar o cache (antes era um nome fixo).
function serviceWorkerVersionado(): Plugin {
  return {
    name: 'sw-versionado',
    apply: 'build',
    generateBundle() {
      const versao = (process.env.GITHUB_SHA ?? '').slice(0, 10) || Date.now().toString(36);
      const fonte = readFileSync(resolve(__dirname, 'pwa/sw.js'), 'utf8').replace("'__VERSAO__'", `'${versao}'`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: fonte });
    },
  };
}

// No GitHub Pages o app fica em /app-dieta/ (BASE_PATH vem do workflow de publicação)
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), serviceWorkerVersionado()],
});
