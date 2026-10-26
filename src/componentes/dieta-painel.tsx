// Peças visuais da aba Dieta (anel de kcal, barras dos macros, "Falta"), em SVG e CSS.
import type { ReactNode } from 'react';
import { estadoFalta, falta, fracaoAnel, partesBarra, type EstadoMacro, type FatiaKcal } from '../lib/dieta-painel';
import type { Saldo } from '../lib/dieta';
import { num } from '../lib/formato';

const CLASSE_ESTADO: Record<EstadoMacro, string> = { ok: 'bom', passou: 'ruim', falta: '' };

export function IconeSeta({ aberta }: { aberta?: boolean }) {
  return (
    <svg className={`ref-seta ${aberta ? 'aberta' : ''}`} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconeLapis() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

/** Anel grande: kcal do plano × meta do dia. Verde na meta, vermelho quando passa. */
export function AnelKcal({ plano, meta }: { plano: number | null; meta: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const f = plano === null ? 0 : fracaoAnel(plano, meta);
  const estado = plano === null ? null : estadoFalta(meta - plano, meta, 15);
  const texto =
    plano === null ? 'carregando o plano' : estado === 'ok' ? '✓ na meta' : estado === 'passou' ? `+${num(plano - meta, 0)} kcal acima` : `faltam ${num(meta - plano, 0)} kcal`;
  return (
    <div className="anel-kcal" role="img" aria-label={`Plano: ${plano === null ? 'carregando' : `${num(plano, 0)} kcal`} de ${num(meta, 0)} kcal da meta. ${texto}`}>
      <div className="anel-kcal-circulo">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={r} className="anel-kcal-trilho" />
          {f > 0 && <circle cx="60" cy="60" r={r} className={`anel-kcal-valor ${estado ? CLASSE_ESTADO[estado] : ''}`} strokeDasharray={`${f * c} ${c}`} transform="rotate(-90 60 60)" />}
        </svg>
        <div className="anel-kcal-centro" aria-hidden="true">
          <span className="anel-kcal-num numero">{plano === null ? '–' : num(plano, 0)}</span>
          <span className="anel-kcal-de numero">de {num(meta, 0)}</span>
          <span className="anel-kcal-un">kcal</span>
        </div>
      </div>
      <div className={`anel-kcal-status ${estado ? `estado-${CLASSE_ESTADO[estado] || 'neutro'}` : ''}`} aria-hidden="true">
        {texto}
      </div>
    </div>
  );
}

/** Barra compacta de um macro (plano / meta), na cor do macro; o que passou da meta em vermelho. */
export function BarraMacro({ nome, curto, classe, plano, meta }: { nome: string; curto: string; classe: string; plano: number | null; meta: number }) {
  const p = partesBarra(plano ?? 0, meta);
  const estado = plano === null ? null : estadoFalta(meta - plano, meta, 1);
  return (
    <div className={`barra-macro ${classe}`}>
      <div className="barra-macro-cab">
        <span className={`barra-macro-nome ${classe}`}>
          <span className="nome-longo">{nome}</span>
          <span className="nome-curto">{curto}</span>
        </span>
        <span className="barra-macro-valor numero">
          <b className={estado === 'passou' ? 'barra-passou' : ''}>{plano === null ? '–' : num(plano, 0)}</b>/{num(Math.max(meta, 0), 0)} g
          {estado === 'ok' && <span className="barra-ok"> ✓</span>}
        </span>
      </div>
      <div
        className="barra-macro-trilho"
        role="progressbar"
        aria-label={`${nome}: ${plano === null ? 'carregando' : num(plano, 0)} de ${num(meta, 0)} g`}
        aria-valuemin={0}
        aria-valuemax={Math.round(Math.max(meta, 0))}
        aria-valuenow={Math.round(Math.max(plano ?? 0, 0))}
      >
        {p.feito > 0 && <span className="barra-macro-feito" style={{ width: `${p.feito * 100}%` }} />}
        {p.excesso > 0 && <span className="barra-macro-excesso" style={{ width: `${p.excesso * 100}%` }} />}
      </div>
    </div>
  );
}

/** Linha do "Macros do dia": barra plano × meta (marca da meta) e meta · plano · falta. */
export function LinhaMacroMeta({
  nome,
  classe,
  plano,
  meta,
  sufixo,
  tolerancia,
  detalhe,
  maisEhBom,
}: {
  nome: string;
  classe: string;
  plano: number;
  meta: number;
  sufixo: string;
  tolerancia: number;
  detalhe?: ReactNode;
  /** Fibra: passar da referência também é ✓ (98% já conta) */
  maisEhBom?: boolean;
}) {
  const p = partesBarra(plano, meta);
  const f = maisEhBom && plano >= meta * 0.98 ? { classe: 'bom', texto: '✓' } : falta(meta - plano, meta, sufixo, tolerancia);
  const un = sufixo.trim();
  return (
    <div className="macro-meta">
      <div className="macro-meta-cab">
        <span className={`macro-meta-nome ${classe}`}>{nome}</span>
        <span className={`macro-meta-falta numero ${f.classe ? `estado-${f.classe}` : ''}`}>{f.texto === '✓' ? '✓ na meta' : f.classe === 'ruim' ? `${f.texto} acima` : `falta ${f.texto}`}</span>
      </div>
      <div className={`macro-meta-trilho ${classe} ${maisEhBom ? 'sem-teto' : ''}`} aria-hidden="true">
        {p.feito > 0 && <span className="barra-macro-feito" style={{ width: `${p.feito * 100}%` }} />}
        {p.excesso > 0 && <span className="barra-macro-excesso" style={{ width: `${p.excesso * 100}%` }} />}
        {p.marca !== null && p.marca < 0.999 && <span className="macro-meta-marca" style={{ left: `${p.marca * 100}%` }} />}
      </div>
      <div className="macro-meta-pes numero">
        <span>
          Plano <b>{num(plano, 0)}{un && ` ${un}`}</b>
        </span>
        <span>
          Meta <b>{num(meta, 0)}{un && ` ${un}`}</b>
        </span>
      </div>
      {detalhe && <div className="macro-meta-detalhe">{detalhe}</div>}
    </div>
  );
}

/** De onde vêm as kcal do plano: barra empilhada e a legenda com g e %. */
export function BarraKcal({ fatias }: { fatias: FatiaKcal[] }) {
  if (!fatias.length) return null;
  return (
    <div className="barra-kcal">
      <div className="barra-kcal-trilho" role="img" aria-label={fatias.map((f) => `${f.rotulo} ${num(f.fracao * 100, 0)}%`).join(', ')}>
        {fatias.map((f) => (
          <span key={f.chave} className={`barra-kcal-fatia fatia-${f.chave}`} style={{ width: `${f.fracao * 100}%` }} />
        ))}
      </div>
      <div className="barra-kcal-legenda numero">
        {fatias.map((f) => (
          <span key={f.chave}>
            <i className={`fatia-${f.chave}`} />
            <span className={f.classe}>{f.rotulo}</span> {num(f.fracao * 100, 0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

/** Proteína animal de cada refeição com alimentos × o corte do alvo (linha tracejada). */
export function ProteinaRefeicoes({ itens, corte }: { itens: { nome: string; g: number }[]; corte: number }) {
  if (!itens.length) return null;
  const escala = Math.max(corte * 1.6, ...itens.map((i) => i.g)) || 1;
  return (
    <div className="ptn-refeicoes">
      {itens.map((i, n) => {
        const ok = i.g >= corte;
        return (
          <div key={`${i.nome}-${n}`} className="ptn-ref">
            <span className="ptn-ref-nome">{i.nome}</span>
            <span className="ptn-ref-trilho" aria-hidden="true">
              <span className={`ptn-ref-barra ${ok ? 'ok' : ''}`} style={{ width: `${Math.min(i.g / escala, 1) * 100}%` }} />
              <span className="ptn-ref-corte" style={{ left: `${(corte / escala) * 100}%` }} />
            </span>
            <span className={`ptn-ref-valor numero ${ok ? 'estado-bom' : ''}`}>
              {num(i.g, 0)} g{ok ? ' ✓' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Quanto falta para a meta: Ptn A, Carb, Gord e kcal (rodapé fixo e o campo em foco). */
export function FaltaChips({ saldo, inline }: { saldo: Pick<Saldo, 'meta' | 'falta'>; inline?: boolean }) {
  const itens = [
    ['m-pa', 'Ptn A', saldo.falta.ptn_animal, saldo.meta.ptn_animal, ' g', 1],
    ['m-c', 'Carb', saldo.falta.carb, saldo.meta.carb, ' g', 1],
    ['m-g', 'Gord', saldo.falta.gord, saldo.meta.gord, ' g', 1],
    ['m-k', 'kcal', saldo.falta.kcal, saldo.meta.kcal, '', 15],
  ] as const;
  return (
    <div className={`falta-chips ${inline ? 'falta-chips-inline' : ''}`}>
      <span className="falta-chips-titulo">Falta</span>
      {itens.map(([cor, nome, valor, meta, suf, tol]) => {
        const f = falta(valor, meta, suf, tol);
        return (
          <span key={nome} className="falta-cel">
            <span className={`falta-rot ${cor}`}>{nome}</span>
            <b className={`falta-val numero ${f.classe ? `estado-${f.classe}` : ''}`}>{f.texto}</b>
          </span>
        );
      })}
    </div>
  );
}
