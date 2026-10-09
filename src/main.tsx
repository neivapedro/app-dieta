import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProvedorDados } from './dados/contexto';
import { registrarServiceWorker, vigiarVersaoNova } from './lib/notificacoes';
import './estilos.css';

if (!import.meta.env.VITE_DEMO) {
  registrarServiceWorker();
  vigiarVersaoNova();
}

// Logo após uma publicação, o app aberto pode pedir um arquivo da versão antiga
// (já apagado do servidor). Recarrega uma vez para pegar a versão nova.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  try {
    if (sessionStorage.getItem('recarregou-versao')) return;
    sessionStorage.setItem('recarregou-versao', '1');
  } catch {
    /* sem armazenamento: recarrega mesmo assim */
  }
  location.reload();
});
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('recarregou-versao'), 10000));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorDados>
      <App />
    </ProvedorDados>
  </StrictMode>,
);
