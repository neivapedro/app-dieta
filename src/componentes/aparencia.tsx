import '../estilos/aparencia.css';
import { useState } from 'react';
import { CORES_APP, escolherCorDoApp, lerCorDoApp, type CorApp } from '../lib/cor-app';
import { definirVibracao, vibracaoLigada, vibrarLeve } from '../lib/haptico';

/**
 * Perfil → Aparência → Cor do app: cinco degradês para a cor da marca (botões, aba ativa, destaques).
 * Vale só neste aparelho e muda na hora; o ícone e a tela de abertura do app não mudam.
 */
export function CorDoApp() {
  const [cor, setCor] = useState<CorApp>(() => lerCorDoApp());
  const atual = CORES_APP.find((c) => c.id === cor) ?? CORES_APP[0];
  return (
    <div className="cor-app">
      <div className="cor-app-cab">
        <span className="pf-icone pf-cor-marca" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z" />
            <circle cx="7.5" cy="11" r="1.2" />
            <circle cx="10.5" cy="7.2" r="1.2" />
            <circle cx="15.2" cy="7.6" r="1.2" />
          </svg>
        </span>
        <span className="pf-texto">
          <span className="pf-rotulo" id="cor-app-rotulo">
            Cor do app
          </span>
          <span className="pf-sub">Só neste aparelho</span>
        </span>
        <span className="pf-valor">{atual.nome}</span>
      </div>
      <div className="cor-app-opcoes" role="radiogroup" aria-labelledby="cor-app-rotulo">
        {CORES_APP.map((c) => {
          const marcada = c.id === cor;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={marcada}
              className={`cor-app-opcao${marcada ? ' ativo' : ''}`}
              onClick={() => {
                escolherCorDoApp(c.id);
                setCor(c.id);
              }}
            >
              <span className="cor-app-amostra" data-cor-previa={c.id} aria-hidden="true">
                {marcada && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </span>
              <span className="cor-app-nome">{c.nome}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Perfil → Aparência → Vibração: toque tátil leve ao marcar e salvar (iPhone com iOS 18+ ou Android). Vale só neste aparelho. */
export function VibracaoDoApp() {
  const [ligada, setLigada] = useState(() => vibracaoLigada());
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      className="vibracao-linha"
      onClick={() => {
        const nova = !ligada;
        definirVibracao(nova);
        setLigada(nova);
        // O toque de confirmação só quando acabou de ligar
        if (nova) vibrarLeve();
      }}
    >
      <span className="pf-icone pf-cor-marca" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8v8M5 6v12M22 8v8M19 6v12M9 5h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        </svg>
      </span>
      <span className="pf-texto">
        <span className="pf-rotulo">Vibração ao tocar</span>
        <span className="pf-sub">Só neste aparelho</span>
      </span>
      <span className={`vibracao-chave${ligada ? ' ligada' : ''}`} aria-hidden="true">
        <span />
      </span>
    </button>
  );
}
