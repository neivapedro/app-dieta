// Peças visuais do painel da Análise, em SVG e CSS (sem a biblioteca de gráficos:
// aparecem na hora, inclusive sem internet).
import type { ReactNode } from 'react';
import { num, pct } from '../lib/formato';
import { Numero, useContagem } from './movimento';
import type { ProgressoMeta } from '../lib/painel';

/** Linha pequena da evolução de uma medida (últimos pontos), com o último ponto marcado. */
export function Sparkline({ valores, tom }: { valores: number[]; tom?: string }) {
  if (valores.length < 2) return <div className="spark spark-vazia" aria-hidden="true" />;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const L = 100;
  const A = 32;
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * L, A - 3 - ((v - min) / faixa) * (A - 6)] as const);
  const linha = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const [ux, uy] = pts[pts.length - 1];
  return (
    <div className={`spark ${tom ?? ''}`} aria-hidden="true">
      <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none">
        <polygon points={`0,${A} ${linha} ${L},${A}`} className="spark-area" />
        <polyline points={linha} className="spark-linha" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="spark-ponto" style={{ left: `${ux}%`, top: `${(uy / A) * 100}%` }} />
    </div>
  );
}

/** Cartão de indicador: valor grande, variação colorida e a linha da evolução. */
export function Kpi({
  rotulo,
  valor,
  variacao,
  classe,
  legenda,
  valores,
  numero,
}: {
  rotulo: string;
  valor: ReactNode;
  /** Valor numérico: conta até ele ao aparecer (no lugar de `valor`), formatado a cada quadro */
  numero?: { valor: number; formato: (n: number) => string };
  variacao?: ReactNode;
  /** bom / ruim / '' — a cor da variação e da linha */
  classe?: string;
  legenda?: ReactNode;
  valores?: number[];
}) {
  return (
    <div className="kpi">
      <div className="kpi-rotulo">{rotulo}</div>
      <div className="kpi-valor numero">{numero ? <Numero valor={numero.valor} formato={numero.formato} /> : valor}</div>
      {variacao !== undefined && <div className={`kpi-variacao numero ${classe ?? ''}`}>{variacao}</div>}
      {valores && <Sparkline valores={valores} tom={classe} />}
      {legenda && <div className="kpi-legenda">{legenda}</div>}
    </div>
  );
}

/** Anel de porcentagem (adesão). Sem dado, mostra o traço e o motivo. */
export function Anel({ fracao, rotulo, detalhe, tom }: { fracao: number | null; rotulo: string; detalhe?: string; tom?: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const f = fracao === null ? 0 : Math.min(Math.max(fracao, 0), 1);
  // O anel se desenha de 0 até o valor ao aparecer, junto com o número do centro
  const { ref, valor: pctAnim } = useContagem<HTMLDivElement>(fracao === null ? 0 : f * 100);
  const fa = Math.min(Math.max(pctAnim / 100, 0), 1);
  return (
    <div ref={ref} className="anel" role="img" aria-label={`${rotulo}: ${fracao === null ? 'sem dados' : pct(f, 0)}${detalhe ? `, ${detalhe}` : ''}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="anel-trilho" />
        {fracao !== null && <circle cx="32" cy="32" r={r} className={`anel-valor ${tom ?? ''}`} strokeDasharray={`${fa * c} ${c}`} transform="rotate(-90 32 32)" />}
        <text x="32" y="36" textAnchor="middle" className="anel-texto">
          {fracao === null ? '–' : `${Math.round(fa * 100)}%`}
        </text>
      </svg>
      <div className="anel-rotulo">{rotulo}</div>
      {detalhe && <div className="anel-detalhe">{detalhe}</div>}
    </div>
  );
}

/** Cor do anel pela faixa: 80%+ bom, abaixo de 50% atenção. */
export function tomAdesao(f: number | null): string {
  if (f === null) return '';
  return f >= 0.8 ? 'bom' : f < 0.5 ? 'ruim' : 'aviso';
}

/** Barra do caminho até a meta: início, agora e meta, com a % percorrida. */
export function BarraMeta({ nome, p, fmt, rotuloAtual = 'Agora' }: { nome: string; p: ProgressoMeta; fmt: (n: number) => string; /** "Final" depois do fim do projeto */ rotuloAtual?: string }) {
  return (
    <div className="meta-linha">
      <div className="meta-cab">
        <span className="meta-nome">{nome}</span>
        <span className={`meta-pct numero ${p.alcancada ? 'bom' : ''}`}>{p.alcancada ? 'Meta alcançada' : `${pct(p.fracao, 0)} do caminho`}</span>
      </div>
      <div className="meta-trilho" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fracao * 100)} aria-label={`${nome}: ${pct(p.fracao, 0)} do caminho até a meta`}>
        <div className={`meta-feito ${p.alcancada ? 'bom' : ''}`} style={{ width: `${p.fracao * 100}%` }} />
      </div>
      <div className="meta-pes numero">
        <span>Início {fmt(p.inicio)}</span>
        <span>
          <b>
            {rotuloAtual} {fmt(p.atual)}
          </b>
        </span>
        <span>Meta {fmt(p.meta)}</span>
      </div>
      {/* Diferença de porcentagem é em pontos percentuais (22,5% → 15% faltam 7,5 p.p.) */}
      {!p.alcancada && <div className="meta-falta">Faltam {fmt(p.falta).replace(/%$/, ' p.p.')}</div>}
    </div>
  );
}

/** Mapa de calor 0 a 3 (náusea): linhas = fases, colunas = dias depois da dose. */
export function MapaCalor({ colunas, linhas, max = 3 }: { colunas: string[]; linhas: { rotulo: string; valores: (number | null)[] }[]; max?: number }) {
  return (
    <div className="calor" style={{ gridTemplateColumns: `minmax(64px, auto) repeat(${colunas.length}, minmax(0, 1fr))` }}>
      <span />
      {colunas.map((c) => (
        <span key={c} className="calor-cab">
          {c}
        </span>
      ))}
      {linhas.map((l, n) => (
        <div key={`${l.rotulo}-${n}`} className="calor-linha">
          <span className="calor-rotulo">{l.rotulo}</span>
          {l.valores.map((v, i) => (
            <span
              key={i}
              className={`calor-celula ${v === null ? 'vazia' : ''}`}
              style={v === null ? undefined : { ['--intensidade' as string]: `${Math.round(Math.min(v / max, 1) * 85 + 8)}%` }}
              title={v === null ? 'sem registro' : `${colunas[i]}: ${num(v, 1)}`}
            >
              {v === null ? '·' : num(v, 1)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Variações desde o início em barras que saem do centro (melhora em verde, piora em vermelho). */
export function Variacoes({ itens }: { itens: { nome: string; delta: number | null; texto: string; classe: string; escala: number }[] }) {
  return (
    <div className="variacoes">
      {itens.map((it) => {
        const f = it.delta === null ? 0 : Math.min(Math.abs(it.delta) / it.escala, 1);
        const esquerda = it.delta !== null && it.delta < 0;
        return (
          <div key={it.nome} className="variacao">
            <span className="variacao-nome">{it.nome}</span>
            <span className="variacao-trilho" aria-hidden="true">
              <span className="variacao-meio" />
              {it.delta !== null && f > 0 && (
                <span className={`variacao-barra ${it.classe || 'neutra'}`} style={esquerda ? { right: '50%', width: `${f * 50}%` } : { left: '50%', width: `${f * 50}%` }} />
              )}
            </span>
            <span className={`variacao-valor numero ${it.classe}`}>{it.texto}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Doses do ciclo em barras: as aplicadas cheias, as previstas claras (tracejadas se dependem de subir). */
export function LinhaDoses({
  feitas,
  previstas,
}: {
  feitas: { numero: number; dose: number; data: string }[];
  previstas: { numero: number; dose: number; data: string; hipotese: boolean }[];
}) {
  const todas = [...feitas.map((d) => ({ ...d, tipo: 'feita' as const })), ...previstas.map((d) => ({ ...d, tipo: d.hipotese ? ('hipotese' as const) : ('prevista' as const) }))];
  if (!todas.length) return null;
  const max = Math.max(...todas.map((d) => d.dose));
  // Linha do "hoje" entre a última dose aplicada e a próxima
  const hoje = (feitas.length / todas.length) * 100;
  return (
    <div className="doses">
      <div className="doses-barras" role="img" aria-label={`${feitas.length} doses aplicadas e ${previstas.length} previstas`}>
        {todas.map((d) => (
          <span key={`${d.tipo}-${d.numero}`} className={`dose-barra ${d.tipo}`} style={{ height: `${(d.dose / max) * 100}%` }} title={`${d.numero}ª · ${num(d.dose, 2)} mg`} />
        ))}
        {feitas.length > 0 && previstas.length > 0 && <span className="doses-hoje" style={{ left: `${hoje}%` }} />}
      </div>
      <div className="doses-eixo numero">
        <span>1ª</span>
        {feitas.length > 0 && previstas.length > 0 && hoje > 12 && hoje < 88 && (
          <span className="doses-eixo-hoje" style={{ left: `${hoje}%` }}>
            hoje
          </span>
        )}
        <span>{todas.length}ª</span>
      </div>
      <div className="doses-legenda">
        <span>
          <i className="dose-barra feita" /> aplicadas
        </span>
        {previstas.some((d) => !d.hipotese) && (
          <span>
            <i className="dose-barra prevista" /> previstas
          </span>
        )}
        {previstas.some((d) => d.hipotese) && (
          <span>
            <i className="dose-barra hipotese" /> se subir
          </span>
        )}
      </div>
    </div>
  );
}

/** Seletor compacto (pílulas), para o período da adesão e a medida do gráfico. */
export function Pilulas<T extends string>({ opcoes, valor, aoMudar, rotulo }: { opcoes: [T, string][]; valor: T; aoMudar: (v: T) => void; rotulo: string }) {
  return (
    <div className="pilulas" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([k, r]) => (
        <button key={k} type="button" role="radio" aria-checked={valor === k} className={valor === k ? 'ativo' : ''} onClick={() => aoMudar(k)}>
          {r}
        </button>
      ))}
    </div>
  );
}
