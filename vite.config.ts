import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Versão desta publicação: vai no service worker, no versao.json e no próprio app
const VERSAO = (process.env.GITHUB_SHA ?? '').slice(0, 7) || Date.now().toString(36);

// O service worker ganha uma versão própria a cada publicação, para o iPhone
// perceber a atualização e trocar o cache (antes era um nome fixo).
// O versao.json deixa o app conferir sozinho se há versão nova no ar.
function serviceWorkerVersionado(): Plugin {
  return {
    name: 'sw-versionado',
    apply: 'build',
    generateBundle() {
      const versao = VERSAO;
      this.emitFile({ type: 'asset', fileName: 'versao.json', source: JSON.stringify({ versao }) });
      const fonte = readFileSync(resolve(__dirname, 'pwa/sw.js'), 'utf8').replace("'__VERSAO__'", `'${versao}'`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: fonte });
    },
  };
}

// No GitHub Pages o app fica em /app-dieta/ (BASE_PATH vem do workflow de publicação)
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), serviceWorkerVersionado()],
  define: { __VERSAO_APP__: JSON.stringify(VERSAO) },
});
