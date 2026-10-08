import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProvedorDados } from './dados/contexto';
import { registrarServiceWorker } from './lib/notificacoes';
import './estilos.css';

registrarServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorDados>
      <App />
    </ProvedorDados>
  </StrictMode>,
);
