import { useEffect, useState, type ReactNode } from 'react';

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
  treino: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  sino: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />,
};

export function Icone({ nome }: { nome: keyof typeof caminhos | string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {caminhos[nome]}
    </svg>
  );
}

export function Folha({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = overflow;
    };
  }, [aoFechar]);
  return (
    <div className="folha-fundo" onClick={aoFechar}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="cartao-cab">
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
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  sufixo?: string;
  dica?: ReactNode;
  obrigatorio?: boolean;
}) {
  return (
    <Campo rotulo={sufixo ? `${rotulo} (${sufixo})` : rotulo} dica={dica}>
      <input
        inputMode="decimal"
        value={valor}
        required={obrigatorio}
        onChange={(e) => aoMudar(e.target.value.replace(/[^\d.,-]/g, ''))}
      />
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
export function BotaoExcluir({ rotulo, aviso, aoConfirmar }: { rotulo: string; aviso: string; aoConfirmar: () => void }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 5000);
    return () => clearTimeout(t);
  }, [armado]);
  return (
    <button type="button" className="botao perigo" onClick={() => (armado ? aoConfirmar() : setArmado(true))}>
      {armado ? `${aviso} Toque de novo para confirmar.` : rotulo}
    </button>
  );
}
