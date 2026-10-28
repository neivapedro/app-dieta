import { useId, type ReactNode } from 'react';
import { IconeChip, type CorChip } from './ui';

/**
 * Estado vazio: ícone (ou ilustração), título curto, texto e uma ação opcional.
 * `compacto` para dentro de um cartão que já tem título; sem ele, ocupa o cartão.
 */
export function EstadoVazio({
  icone,
  cor = 'marca',
  ilustracao,
  titulo,
  children,
  acao,
  compacto,
}: {
  icone?: string;
  cor?: CorChip;
  ilustracao?: ReactNode;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
  compacto?: boolean;
}) {
  return (
    <div className={`estado-vazio ${compacto ? 'compacto' : ''}`}>
      <div className="estado-vazio-arte">{ilustracao ?? <IconeChip nome={icone} cor={cor} />}</div>
      <div className="estado-vazio-titulo">{titulo}</div>
      {children && <p className="estado-vazio-texto">{children}</p>}
      {acao && <div className="estado-vazio-acao">{acao}</div>}
    </div>
  );
}

/** Ilustração das fotos vazias: o antes (contorno) e o depois (na cor da marca), lado a lado. */
export function IlustracaoFotos() {
  const id = `fv${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const pessoa = 'M30 30a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM16 62c0-10 6-18 14-18s14 8 14 18';
  return (
    <svg className="ilustracao-fotos" viewBox="0 0 156 84" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--marca-a)' }} />
          <stop offset="0.52" style={{ stopColor: 'var(--marca-m)' }} />
          <stop offset="1" style={{ stopColor: 'var(--marca-b)' }} />
        </linearGradient>
      </defs>
      {/* Antes */}
      <g transform="translate(8 4) rotate(-6 30 38)">
        <rect x="0" y="0" width="60" height="76" rx="10" className="ilu-moldura" />
        <path d={pessoa} transform="translate(0 4)" className="ilu-pessoa" />
      </g>
      {/* Seta */}
      <path d="M72 44h12m-4-4 4 4-4 4" className="ilu-seta" />
      {/* Depois */}
      <g transform="translate(88 4) rotate(5 30 38)">
        <rect x="0" y="0" width="60" height="76" rx="10" fill={`url(#${id})`} />
        <path d={pessoa} transform="translate(0 4)" className="ilu-pessoa-depois" />
        <path d="M46 10l1.4 3.6L51 15l-3.6 1.4L46 20l-1.4-3.6L41 15l3.6-1.4z" className="ilu-brilho" />
      </g>
    </svg>
  );
}
