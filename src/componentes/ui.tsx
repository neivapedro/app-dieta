import { useEffect, useRef, useState, type ReactNode } from 'react';
import { travarRolagem } from '../lib/trava-rolagem';
import { useArrastarFolha, useSaidaFolha } from './movimento';

const caminhos: Record<string, ReactNode> = {
  inicio: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  ciclo: (
    <>
      <path d="m18 2 4 4M17 7l3-3M19 9 8.7 19.3a2.4 2.4 0 0 1-3.4 0l-.6-.6a2.4 2.4 0 0 1 0-3.4L15 5" />
      <path d="m9 11 4 4M5 19l-3 3M14 4l6 6" />
    </>
  ),
  diario: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  medidas: (
    <>
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z" />
      <path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />
    </>
  ),
  analise: <path d="M3 3v18h18M7 15l4-4 3 3 6-6" />,
  perfil: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  fechar: <path d="M18 6 6 18M6 6l12 12" />,
  dieta: <path d="M3 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zm0 0v7" />,
  treino: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  livro: <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />,
  sino: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />,
  // Início (checklist e cartões do "Hoje")
  check: <path d="M20 6 9 17l-5-5" />,
  gota: <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />,
  lua: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  balanca: (
    <>
      <circle cx="12" cy="5" r="3" />
      <path d="M6.5 8a2 2 0 0 0-1.9 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.93-2.54L19.4 9.5A2 2 0 0 0 17.48 8z" />
    </>
  ),
  enjoo: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M16 16s-1.5-2-4-2-4 2-4 2M9 9h.01M15 9h.01" />
    </>
  ),
  alvo: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
};

export function Icone({ nome }: { nome: keyof typeof caminhos | string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {caminhos[nome]}
    </svg>
  );
}

export type CorChip = 'marca' | 'azul' | 'roxo' | 'rosa' | 'ciano' | 'laranja' | 'verde' | 'indigo';

/** Ícone do título de um cartão: quadradinho colorido (classe .icone-chip em estilos.css). */
export function IconeChip({ nome, cor = 'marca', children }: { nome?: string; cor?: CorChip; children?: ReactNode }) {
  return (
    <span className={`icone-chip ${cor}`} aria-hidden="true">
      {children ?? (nome ? <Icone nome={nome} /> : null)}
    </span>
  );
}

export function Folha({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', esc);
    const soltar = travarRolagem();
    return () => {
      document.removeEventListener('keydown', esc);
      soltar();
    };
  }, [aoFechar]);
  const fundoRef = useRef<HTMLDivElement>(null);
  const folhaRef = useRef<HTMLDivElement>(null);
  // Foco: entra na folha ao abrir (sem roubar um campo com foco automático), o Tab fica dentro
  // dela e, ao fechar, volta para o botão que a abriu
  useEffect(() => {
    const folha = folhaRef.current;
    const antes = document.activeElement as HTMLElement | null;
    if (folha && !folha.contains(document.activeElement)) folha.focus({ preventScroll: true });
    const tab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !folha) return;
      const focaveis = [...folha.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
        (x) => x.offsetParent !== null,
      );
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === folha)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (!folha.contains(document.activeElement)) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    folha?.addEventListener('keydown', tab);
    return () => {
      folha?.removeEventListener('keydown', tab);
      if (antes && antes.isConnected && antes !== document.body) antes.focus({ preventScroll: true });
    };
  }, []);
  // Arrasta para baixo pela alça/cabeçalho para fechar; ao sair, desce deslizando
  const { eventos, desloc } = useArrastarFolha(folhaRef, fundoRef, aoFechar);
  useSaidaFolha(fundoRef, folhaRef, desloc);
  return (
    <div className="folha-fundo" ref={fundoRef} onClick={aoFechar}>
      <div className="folha" ref={folhaRef} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="folha-alca" aria-hidden="true" {...eventos} />
        <div className="cartao-cab folha-cab" {...eventos}>
          <h2>{titulo}</h2>
          <button className="icone-botao" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** `grupo` para conteúdos com botões (ex.: Escolhas): um <label> repassaria o clique ao 1º botão. */
export function Campo({ rotulo, dica, grupo, children }: { rotulo: string; dica?: ReactNode; grupo?: boolean; children: ReactNode }) {
  const conteudo = (
    <>
      <span>{rotulo}</span>
      {children}
      {dica && <small>{dica}</small>}
    </>
  );
  return grupo ? (
    <div className="campo" role="group" aria-label={rotulo}>
      {conteudo}
    </div>
  ) : (
    <label className="campo">{conteudo}</label>
  );
}

/** Input numérico que aceita vírgula (teclado decimal no celular). */
export function CampoNumero({
  rotulo,
  valor,
  aoMudar,
  sufixo,
  dica,
  obrigatorio,
  permitirNegativo,
  placeholder,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  sufixo?: string;
  dica?: ReactNode;
  obrigatorio?: boolean;
  /** Por padrão o sinal de menos não entra (peso, medidas, doses) */
  permitirNegativo?: boolean;
  placeholder?: string;
}) {
  return (
    <Campo rotulo={sufixo ? `${rotulo} (${sufixo})` : rotulo} dica={dica}>
      {permitirNegativo ? (
        // O teclado decimal do iPhone não tem o sinal de menos: botão ± ao lado; "−" tipográfico vira "-"
        <div className="linha" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <input
            inputMode="decimal"
            value={valor}
            required={obrigatorio}
            placeholder={placeholder}
            style={{ minWidth: 0, flex: 1 }}
            onChange={(e) => aoMudar(e.target.value.replace(/[\u2212\u2013\u2014]/g, '-').replace(/[^\d.,-]/g, ''))}
          />
          <button
            type="button"
            className="botao pequeno"
            style={{ flex: 'none' }}
            aria-label="Trocar o sinal (positivo ou negativo)"
            onClick={() => aoMudar(valor.trim().startsWith('-') ? valor.trim().slice(1) : `-${valor.trim()}`)}
          >
            ±
          </button>
        </div>
      ) : (
        <input inputMode="decimal" value={valor} required={obrigatorio} placeholder={placeholder} onChange={(e) => aoMudar(e.target.value.replace(/[^\d.,]/g, ''))} />
      )}
    </Campo>
  );
}

export function Escolhas<T extends string | number>({
  opcoes,
  valor,
  aoMudar,
  permitirVazio,
}: {
  opcoes: { valor: T; rotulo: string }[];
  valor: T | null;
  aoMudar: (v: T | null) => void;
  permitirVazio?: boolean;
}) {
  return (
    <div className="escolhas" role="radiogroup">
      {opcoes.map((o) => (
        <button
          type="button"
          key={String(o.valor)}
          role="radio"
          aria-checked={valor === o.valor}
          className={valor === o.valor ? 'ativo' : ''}
          onClick={() => aoMudar(permitirVazio && valor === o.valor ? null : o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Bloco({ rotulo, valor, classe }: { rotulo: string; valor: ReactNode; classe?: string }) {
  return (
    <div className="bloco">
      <div className="rotulo">{rotulo}</div>
      <div className={`valor ${classe ?? ''}`}>{valor}</div>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="mudo" style={{ padding: '8px 0' }}>{children}</p>;
}

/** Exclusão em dois toques: o primeiro pede confirmação, o segundo executa. */
export function BotaoExcluir({ rotulo, aviso, aoConfirmar }: { rotulo: string; aviso: string; aoConfirmar: () => unknown }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 5000);
    return () => clearTimeout(t);
  }, [armado]);
  return (
    <button type="button" className="botao perigo" onClick={() => (armado ? void Promise.resolve(aoConfirmar()).catch(() => undefined) : setArmado(true))}>
      {armado ? `${aviso} Toque de novo para confirmar.` : rotulo}
    </button>
  );
}

/** No lugar do gráfico quando o arquivo dele não pôde ser baixado (sem internet). */
export function SemGrafico() {
  return <p className="mudo">Gráfico indisponível sem internet. Ele volta quando a conexão voltar.</p>;
}
