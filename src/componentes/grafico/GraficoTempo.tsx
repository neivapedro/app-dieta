// Gráfico de tempo em SVG: linhas, áreas, barras e degraus em até dois eixos, faixa (leque),
// referências, marcos, mira sincronizada por toque, zoom por pinça/faixa e tela cheia.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { diaSemanaCurto } from '../../lib/datas';
import { extensaoDias, indicesVisiveis, prepararPontos, resumoSerie, unirDias, valorNoDia, valorVigente, type SerieDias } from '../../lib/grafico-dados';
import {
  caminhoArea,
  caminhoBarra,
  caminhoDegrau,
  caminhoFaixa,
  caminhoLinha,
  casasDoPasso,
  dataCurta,
  deDiaNum,
  dominioY,
  escalaLinear,
  formatarNumero,
  indiceMaisProximo,
  janelaInteira,
  janelaParaPeriodo,
  limitarJanela,
  paraDiaNum,
  posicaoDica,
  ticksAlinhados,
  ticksDatas,
  zoomJanela,
  type Janela,
  type Ticks,
} from '../../lib/grafico-escalas';
import { BarraZoom } from './BarraZoom';
import { corCss, IconeExpandir, TelaCheia, useDesenhoInicial, useGesto, useIdSvg, useLargura } from './comum';
import { useMargemGrupo, useSincronia } from './sincronia';
import type { Marco, Periodo, PropsGraficoTempo, Serie } from './tipos';

const ZOOM_MINIMO = 7; // dias
const ALTURA_FAIXA_ZOOM = 44;
const larguraTexto = (t: string) => t.length * 6.3 + 2;
const PRIORIDADE_MARCO: Record<NonNullable<Marco['tipo']>, number> = { decisao: 0, dose: 1, atipico: 2, nota: 3, medicao: 4 };

const comUnidade = (texto: string, unidade?: string) => (!unidade ? texto : unidade === '%' ? `${texto}%` : `${texto} ${unidade}`);

export function GraficoTempo(props: PropsGraficoTempo) {
  const [cheia, setCheia] = useState(false);
  // Zoom sem controle de fora: guardado aqui (vale para o gráfico e para a tela cheia)
  const [interno, setInterno] = useState<Periodo | null>(null);
  const controlado = props.periodo !== undefined;
  const periodo = controlado ? props.periodo ?? null : interno;
  const { aoMudarPeriodo } = props;
  const mudar = useCallback(
    (p: Periodo | null) => {
      if (!controlado) setInterno(p);
      aoMudarPeriodo?.(p);
    },
    [controlado, aoMudarPeriodo],
  );
  const fechar = useCallback(() => setCheia(false), []);
  return (
    <>
      <Nucleo {...props} periodo={periodo} aoMudarPeriodo={mudar} aoExpandir={props.expandivel ? () => setCheia(true) : undefined} />
      {cheia && (
        <TelaCheia titulo={props.titulo} aoFechar={fechar}>
          {(h) => <Nucleo {...props} periodo={periodo} aoMudarPeriodo={mudar} alturaDisponivel={h} telaCheia />}
        </TelaCheia>
      )}
    </>
  );
}

interface PropsNucleo extends PropsGraficoTempo {
  aoExpandir?: () => void;
  telaCheia?: boolean;
  /** tela cheia: altura toda disponível (cabeçalho e faixa de zoom saem dela) */
  alturaDisponivel?: number;
}

interface SeriePrep {
  s: Serie;
  i: number;
  cor: string;
  eixo: 'esq' | 'dir';
  d: SerieDias;
}

interface FaixaPrep {
  id: string;
  nome: string;
  cor: string;
  eixo: 'esq' | 'dir';
  dias: number[];
  min: number[];
  max: number[];
  dMax: SerieDias;
}

function Nucleo(p: PropsNucleo) {
  const { titulo, sincronia, aoTocarData, aoTocarMarco, aoMudarPeriodo, permitirZoom } = p;
  const [corpoRef, largura] = useLargura<HTMLDivElement>();
  const idg = useIdSvg('gt');
  const { data: dataMira, setData } = useSincronia(sincronia);
  const [fixo, setFixo] = useState(false);
  const [marcoAberto, setMarcoAberto] = useState<number | null>(null);
  const [janelaGesto, setJanelaGesto] = useState<Janela | null>(null);
  const [foco, setFoco] = useState(false);
  const animar = useDesenhoInicial(largura > 0);
  const raiz = useRef<HTMLDivElement>(null);

  // ---------- dados ----------
  const series = useMemo<SeriePrep[]>(
    () => p.series.map((s, i) => ({ s, i, cor: corCss(s.cor, i), eixo: s.eixo ?? 'esq', d: prepararPontos(s.pontos) })),
    [p.series],
  );
  const faixas = useMemo<FaixaPrep[]>(
    () =>
      (p.faixas ?? []).map((f) => {
        const pts = f.pontos.filter((q) => /^\d{4}-\d{2}-\d{2}/.test(q.data) && Number.isFinite(q.min) && Number.isFinite(q.max)).map((q) => ({ dia: paraDiaNum(q.data), min: Math.min(q.min, q.max), max: Math.max(q.min, q.max) })).sort((a, b) => a.dia - b.dia);
        return {
          id: f.id,
          nome: f.nome,
          cor: corCss(f.cor ?? 'neutro'),
          eixo: f.eixo ?? 'esq',
          dias: pts.map((q) => q.dia),
          min: pts.map((q) => q.min),
          max: pts.map((q) => q.max),
          dMax: prepararPontos(pts.map((q) => ({ data: deDiaNum(q.dia), valor: q.max }))),
        };
      }),
    [p.faixas],
  );
  const referencias = useMemo(() => p.referencias ?? [], [p.referencias]);

  const extensao = useMemo(() => extensaoDias([...series.map((s) => s.d.dias.filter((_, i) => s.d.valores[i] !== null)), ...faixas.map((f) => f.dias)]), [series, faixas]);
  const janelaProp = useMemo<Janela | null>(() => (p.periodo ? { de: paraDiaNum(p.periodo.de), ate: paraDiaNum(p.periodo.ate) } : null), [p.periodo]);
  // Tudo o que dá para ver (dados + período pedido de fora)
  const total = useMemo<Janela | null>(() => {
    if (!extensao) return janelaProp;
    if (!janelaProp) return extensao;
    return { de: Math.min(extensao.de, janelaProp.de), ate: Math.max(extensao.ate, janelaProp.ate) };
  }, [extensao, janelaProp]);
  const janela: Janela | null = janelaGesto ?? janelaProp ?? total;
  const ampliado = !!(janela && total && !janelaInteira(janela, total));

  // Datas onde a mira pode parar (alguma série ou faixa tem valor)
  const diasMira = useMemo(
    () => unirDias([...series.map((s) => s.d.dias.filter((_, i) => s.d.valores[i] !== null)), ...faixas.map((f) => f.dias)]),
    [series, faixas],
  );

  // ---------- geometria ----------
  const temBarra = series.some((s) => s.s.tipo === 'barra');
  const legendaVisivel = p.legenda ?? series.length + faixas.length > 1;
  const temCab = legendaVisivel || !!p.aoExpandir || (permitirZoom && ampliado);
  const zoomLigado = !!permitirZoom && !!total && total.ate - total.de >= ZOOM_MINIMO;
  const alturaSvg = p.alturaDisponivel
    ? Math.max(160, p.alturaDisponivel - (temCab ? 40 : 0) - (zoomLigado ? ALTURA_FAIXA_ZOOM + 6 : 0) - 4)
    : p.altura ?? 220;

  // Eixos Y (não dependem da largura); as margens saem dos rótulos
  const eixos = useMemo(() => {
    if (!janela) return null;
    const vis = janela.ate - janela.de;
    const folgaDias = temBarra ? Math.max(0.6, vis * 0.02) : vis === 0 ? 1 : 0;

    // Valores visíveis por eixo
    const valores: Record<'esq' | 'dir', number[]> = { esq: [], dir: [] };
    const comZero = { esq: false, dir: false };
    const usado = { esq: false, dir: false };
    for (const s of series) {
      usado[s.eixo] = true;
      if (s.s.tipo === 'barra' || s.s.tipo === 'degrau') comZero[s.eixo] = true;
      const [a, b] = indicesVisiveis(s.d.dias, janela);
      for (let i = a; i <= b; i++) if (s.d.valores[i] !== null) valores[s.eixo].push(s.d.valores[i]!);
    }
    for (const f of faixas) {
      usado[f.eixo] = true;
      const [a, b] = indicesVisiveis(f.dias, janela);
      for (let i = a; i <= b; i++) valores[f.eixo].push(f.min[i], f.max[i]);
    }
    for (const r of referencias) {
      const e = r.eixo ?? 'esq';
      if (Number.isFinite(r.valor)) valores[e].push(r.valor);
    }
    const temEsq = usado.esq || !usado.dir;
    const temDir = usado.dir;

    const temMarcos = (p.marcos ?? []).some((m) => {
      const d = paraDiaNum(m.data);
      return d >= janela.de - folgaDias && d <= janela.ate + folgaDias;
    });
    const mt = 10;
    const mb = (temMarcos ? 20 : 4) + 18;
    const plotH = Math.max(40, alturaSvg - mt - mb);
    const alvo = Math.max(2, Math.min(6, Math.round(plotH / 46)));

    let tEsq: Ticks | null = null;
    let tDir: Ticks | null = null;
    // Eixo só de séries sem casas decimais (náusea, contagens): marcas inteiras
    const inteiro = (e: 'esq' | 'dir') => series.some((s) => s.eixo === e) && series.filter((s) => s.eixo === e).every((s) => s.s.casas === 0);
    if (temEsq) tEsq = dominioY(valores.esq, { comZero: comZero.esq, alvo, inteiro: inteiro('esq') });
    if (temDir) {
      if (tEsq) {
        const vs = valores.dir.length ? valores.dir : [0, 1];
        let lo = Math.min(...vs);
        let hi = Math.max(...vs);
        if (comZero.dir) lo = Math.min(0, lo);
        const folga = (hi - lo) * 0.06;
        if (!comZero.dir || lo < 0) lo -= folga;
        hi += folga;
        tDir = ticksAlinhados(lo, hi, tEsq.valores.length - 1);
      } else tDir = dominioY(valores.dir, { comZero: comZero.dir, alvo, inteiro: inteiro('dir') });
    }
    const fmtEsq = p.formatoEsq ?? ((v: number) => formatarNumero(v, casasDoPasso(tEsq?.passo ?? 1)));
    const fmtDir = p.formatoDir ?? ((v: number) => formatarNumero(v, casasDoPasso(tDir?.passo ?? 1)));
    const rotEsq = tEsq ? tEsq.valores.map(fmtEsq) : [];
    const rotDir = tDir ? tDir.valores.map(fmtDir) : [];
    const ml = tEsq ? Math.ceil(Math.max(...rotEsq.map(larguraTexto))) + 8 : 10;
    const mr = tDir ? Math.ceil(Math.max(...rotDir.map(larguraTexto))) + 8 : 12;
    const ysEsq = tEsq ? escalaLinear([tEsq.min, tEsq.max], [mt + plotH, mt]) : null;
    const ysDir = tDir ? escalaLinear([tDir.min, tDir.max], [mt + plotH, mt]) : null;
    const ys = (e: 'esq' | 'dir') => (e === 'dir' ? ysDir ?? ysEsq! : ysEsq ?? ysDir!);
    return { mt, mb, plotH, ml, mr, folgaDias, ys, tEsq, tDir, rotEsq, rotDir, temMarcos };
  }, [janela, series, faixas, referencias, p.marcos, alturaSvg, temBarra, p.formatoEsq, p.formatoDir]);

  // Gráficos do mesmo grupo usam as mesmas margens e folga: a mira cai na mesma vertical em todos
  const [mlG, mrG, folgaG] = useMargemGrupo(sincronia, eixos ? [eixos.ml, eixos.mr, eixos.folgaDias] : null);

  const geo = useMemo(() => {
    if (!eixos || !janela || largura <= 0) return null;
    const ml = mlG;
    const mr = mrG;
    const dom: Janela = { de: janela.de - folgaG, ate: janela.ate + folgaG };
    const plotW = Math.max(40, largura - ml - mr);
    const xs = escalaLinear([dom.de, dom.ate], [ml, ml + plotW]);
    return { ...eixos, ml, mr, dom, plotW, xs };
  }, [eixos, janela, largura, mlG, mrG, folgaG]);

  // Marcos agrupados por dia (o tipo mais importante dá o símbolo)
  const gruposMarcos = useMemo(() => {
    if (!geo) return [];
    const m = new Map<number, Marco[]>();
    for (const mc of p.marcos ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}/.test(mc.data)) continue;
      const d = paraDiaNum(mc.data);
      if (d < geo.dom.de || d > geo.dom.ate) continue;
      m.set(d, [...(m.get(d) ?? []), mc]);
    }
    return [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dia, lista]) => {
        const ord = [...lista].sort((a, b) => PRIORIDADE_MARCO[a.tipo ?? 'nota'] - PRIORIDADE_MARCO[b.tipo ?? 'nota']);
        return { dia, x: geo.xs(dia), marcos: ord, tipo: ord[0].tipo ?? 'nota' };
      });
  }, [geo, p.marcos]);

  // ---------- camada estática (não redesenha a cada movimento da mira) ----------
  const estatico = useMemo(() => {
    if (!geo || !janela) return null;
    const { xs, ys, mt, plotH, plotW, ml, tEsq, tDir, rotEsq, rotDir } = geo;
    const base = mt + plotH;
    const partes: ReactNode[] = [];

    // Grade e rótulos do eixo Y
    const tGrade = tEsq ?? tDir!;
    const yGrade = tEsq ? ys('esq') : ys('dir');
    tGrade.valores.forEach((v, i) => {
      const y = Math.round(yGrade(v)) + 0.5;
      partes.push(<line key={`g${i}`} className={i === 0 ? 'gr-grade gr-grade-base' : 'gr-grade'} x1={ml} x2={ml + plotW} y1={y} y2={y} />);
    });
    tEsq?.valores.forEach((v, i) => {
      partes.push(
        <text key={`ye${i}`} className="gr-eixo" x={ml - 7} y={ys('esq')(v)} textAnchor="end" dominantBaseline="central">
          {rotEsq[i]}
        </text>,
      );
    });
    tDir?.valores.forEach((v, i) => {
      partes.push(
        <text key={`yd${i}`} className="gr-eixo" x={ml + plotW + 7} y={ys('dir')(v)} textAnchor="start" dominantBaseline="central">
          {rotDir[i]}
        </text>,
      );
    });

    // Datas no eixo X
    const yData = alturaSvg - 5;
    ticksDatas(Math.ceil(janela.de), Math.floor(janela.ate), plotW, 44).forEach((d) => {
      const x = xs(d);
      if (x - 16 < 0 || x + 16 > largura) return;
      partes.push(
        <text key={`x${d}`} className="gr-eixo" x={x} y={yData} textAnchor="middle">
          {dataCurta(deDiaNum(d))}
        </text>,
      );
    });

    // Destaque cruzado
    const plot: ReactNode[] = [];
    if (p.destaque) {
      const x0 = Math.max(ml, xs(paraDiaNum(p.destaque.de) - 0.5));
      const x1 = Math.min(ml + plotW, xs(paraDiaNum(p.destaque.ate) + 0.5));
      if (x1 > x0) plot.push(<rect key="dest" className="gr-destaque" x={x0} y={mt} width={x1 - x0} height={plotH} rx={4} />);
    }

    // Guias verticais dos marcos importantes
    for (const g of gruposMarcos) {
      if (g.tipo === 'dose' || g.tipo === 'decisao') plot.push(<line key={`mg${g.dia}`} className="gr-guia-marco" x1={g.x} x2={g.x} y1={mt} y2={base} />);
    }

    // Faixas (leque)
    for (const f of faixas) {
      const [a, b] = indicesVisiveis(f.dias, janela);
      const pts: { x: number; y0: number; y1: number }[] = [];
      for (let i = a; i <= b; i++) pts.push({ x: xs(f.dias[i]), y0: ys(f.eixo)(f.min[i]), y1: ys(f.eixo)(f.max[i]) });
      if (pts.length < 2) continue;
      plot.push(
        <g key={`f${f.id}`} className={animar ? 'gr-surgir' : undefined}>
          <path className="gr-faixa" d={caminhoFaixa(pts)} style={{ fill: f.cor }} />
          <path className="gr-faixa-borda" d={caminhoLinha(pts.map((q) => ({ x: q.x, y: q.y1 })))} style={{ stroke: f.cor }} />
          <path className="gr-faixa-borda" d={caminhoLinha(pts.map((q) => ({ x: q.x, y: q.y0 })))} style={{ stroke: f.cor }} />
        </g>,
      );
    }

    // Barras
    const barras = series.filter((s) => s.s.tipo === 'barra');
    const formaBarra = new Map<string, { w: number; desloc: number; y0: number }>();
    barras.forEach((s, bi) => {
      const [a, b] = indicesVisiveis(s.d.dias, janela);
      let menor = Infinity;
      for (let i = Math.max(a, 1); i <= b; i++) menor = Math.min(menor, s.d.dias[i] - s.d.dias[i - 1]);
      if (!Number.isFinite(menor)) menor = 1;
      const pxDia = plotW / Math.max(1, geo.dom.ate - geo.dom.de);
      const grupo = Math.min(menor * pxDia * 0.72, 22 * barras.length);
      const w = Math.max(1.5, Math.min(22, (grupo - (barras.length - 1) * 2) / barras.length));
      const desloc = (bi - (barras.length - 1) / 2) * (w + 2);
      const y0 = Math.min(base, Math.max(mt, ys(s.eixo)(0)));
      formaBarra.set(s.s.id, { w, desloc, y0 });
      const ds: string[] = [];
      for (let i = a; i <= b; i++) {
        const v = s.d.valores[i];
        if (v === null) continue;
        ds.push(caminhoBarra(xs(s.d.dias[i]) + desloc - w / 2, w, y0, ys(s.eixo)(v), Math.min(4, w / 2)));
      }
      plot.push(<path key={`b${s.s.id}`} className={`gr-barra${animar ? ' gr-crescer' : ''}`} d={ds.join('')} style={{ fill: s.cor }} />);
    });

    // Áreas, degraus e linhas
    for (const s of series) {
      if (s.s.tipo === 'barra') continue;
      const [a, b] = indicesVisiveis(s.d.dias, janela);
      const pts: { x: number; y: number | null }[] = [];
      for (let i = a; i <= b; i++) {
        if (s.d.atipicos[i]) continue; // atípico fica fora da linha
        const v = s.d.valores[i];
        pts.push({ x: xs(s.d.dias[i]), y: v === null ? null : ys(s.eixo)(v) });
      }
      const traco = s.s.tracejado;
      const classeLinha = `gr-linha${traco ? ' gr-tracejada' : ''}${animar && !traco ? ' gr-desenhar' : ''}${animar && traco ? ' gr-surgir' : ''}`;
      if (s.s.tipo === 'degrau') {
        // O último degrau vale por mais um intervalo típico (ex.: a semana da última dose)
        const ultDia = [...s.d.dias].reverse().find((_, k) => s.d.valores[s.d.dias.length - 1 - k] !== null);
        const ultimo = ultDia !== undefined && extensao ? xs(Math.min(extensao.ate, ultDia + Math.max(1, s.d.tolerancia * 2))) : undefined;
        const d = caminhoDegrau(pts, ultimo);
        // Sombra leve sob o degrau, só quando não disputa com uma área
        if (d && !series.some((o) => o.s.tipo === 'area') && (d.match(/M/g) ?? []).length === 1) {
          const x0 = d.slice(1).split(/[,HV]/)[0];
          plot.push(<path key={`da${s.s.id}`} className={`gr-degrau-area${animar ? ' gr-surgir' : ''}`} d={`${d}V${base}H${x0}Z`} style={{ fill: s.cor }} />);
        }
        plot.push(<path key={`d${s.s.id}`} className={`${classeLinha} gr-degrau`} d={d} style={{ stroke: s.cor }} pathLength={traco ? undefined : 1} />);
        continue;
      }
      if (s.s.tipo === 'area') {
        plot.push(<path key={`a${s.s.id}`} className={`gr-area${animar ? ' gr-surgir' : ''}`} d={caminhoArea(pts, base)} fill={`url(#${idg}-g${s.i})`} />);
      }
      plot.push(<path key={`l${s.s.id}`} className={classeLinha} d={caminhoLinha(pts)} style={{ stroke: s.cor }} pathLength={traco ? undefined : 1} />);

      // Pontos: todos quando há poucos, senão só o último
      const comValor: number[] = [];
      for (let i = a; i <= b; i++) if (s.d.valores[i] !== null && !s.d.atipicos[i] && s.d.dias[i] >= janela.de && s.d.dias[i] <= janela.ate) comValor.push(i);
      const poucos = comValor.length <= plotW / 18;
      const marcar = poucos ? comValor : comValor.slice(-1);
      marcar.forEach((i, k) => {
        const ultimo = k === marcar.length - 1;
        plot.push(
          <circle
            key={`p${s.s.id}-${i}`}
            className={`gr-ponto${animar ? ' gr-surgir-tarde' : ''}`}
            cx={xs(s.d.dias[i])}
            cy={ys(s.eixo)(s.d.valores[i]!)}
            r={ultimo ? 3.6 : 2.6}
            style={{ fill: s.cor }}
          />,
        );
      });
    }
    // Atípicos: círculo vazado, fora da linha
    for (const s of series) {
      const [a, b] = indicesVisiveis(s.d.dias, janela);
      for (let i = a; i <= b; i++) {
        if (!s.d.atipicos[i] || s.d.valores[i] === null) continue;
        plot.push(<circle key={`at${s.s.id}-${i}`} className="gr-atipico" cx={xs(s.d.dias[i])} cy={ys(s.eixo)(s.d.valores[i]!)} r={3.8} style={{ stroke: s.cor }} />);
      }
    }

    // Referências: linha tracejada com rótulo pequeno à direita
    const refs: ReactNode[] = referencias.map((r, i) => {
      const y = ys(r.eixo ?? 'esq')(r.valor);
      if (!Number.isFinite(y) || y < mt - 1 || y > base + 1) return null;
      const yr = Math.round(y) + 0.5;
      const embaixo = yr - mt < 14;
      return (
        <g key={`r${i}`} className="gr-ref">
          <line x1={ml} x2={ml + plotW} y1={yr} y2={yr} style={{ stroke: corCss(r.cor ?? 'neutro') }} strokeDasharray={r.tracejado === false ? undefined : '4 4'} />
          <text className="gr-ref-rotulo" x={ml + plotW - 4} y={embaixo ? yr + 12 : yr - 5} textAnchor="end">
            {r.rotulo}
          </text>
        </g>
      );
    });

    // Marcos no eixo X
    const yMarco = base + 10;
    const marcos = gruposMarcos.map((g) => (
      <g key={`m${g.dia}`} className="gr-marco" transform={`translate(${g.x},${yMarco})`}>
        <SimboloMarco tipo={g.tipo} />
      </g>
    ));

    return { eixos: partes, plot, refs, marcos, formaBarra };
  }, [geo, janela, series, faixas, referencias, gruposMarcos, p.destaque, animar, alturaSvg, largura, idg, extensao]);

  // ---------- mira ----------
  const diaMira = dataMira && /^\d{4}-\d{2}-\d{2}/.test(dataMira) ? paraDiaNum(dataMira) : null;
  const miraVisivel = geo && diaMira !== null && diaMira >= geo.dom.de && diaMira <= geo.dom.ate;

  const leitura = useMemo(() => {
    if (!miraVisivel || diaMira === null) return null;
    const linhas = series.map((s) => ({ s, v: s.s.tipo === 'degrau' ? valorVigente(s.d, diaMira) : valorNoDia(s.d, diaMira) }));
    const fx = faixas.map((f) => {
      const v = valorNoDia(f.dMax, diaMira);
      return { f, i: v ? v.indice : -1 };
    });
    return { linhas, fx };
  }, [miraVisivel, diaMira, series, faixas]);

  const diaParaX = useCallback(
    (x: number) => {
      if (!geo || !diasMira.length) return null;
      const alvo = geo.xs.inverter(x);
      // só datas visíveis
      const [a, b] = indicesVisiveis(diasMira, geo.dom);
      const vis = diasMira.slice(a, b + 1).filter((d) => d >= geo.dom.de && d <= geo.dom.ate);
      if (!vis.length) return null;
      return vis[indiceMaisProximo(vis, alvo)];
    },
    [geo, diasMira],
  );

  // ---------- gestos ----------
  const pinca = useRef<{ d0: number; span: number; ancora: number } | null>(null);
  const ultimaJanela = useRef<Janela | null>(null);
  const confirmar = useCallback(
    (j: Janela | null) => {
      setJanelaGesto(null);
      if (!total || !j || janelaInteira(j, total)) aoMudarPeriodo?.(null);
      else aoMudarPeriodo?.(janelaParaPeriodo(j));
    },
    [total, aoMudarPeriodo],
  );

  const tocarMarco = (x: number) => {
    let melhor = -1;
    let dist = 18;
    gruposMarcos.forEach((g, i) => {
      const d = Math.abs(g.x - x);
      if (d < dist) {
        dist = d;
        melhor = i;
      }
    });
    if (melhor < 0) return false;
    const g = gruposMarcos[melhor];
    setMarcoAberto((v) => (v === g.dia ? null : g.dia));
    aoTocarMarco?.(g.marcos[0]);
    return true;
  };

  const { ref: alvoGesto, handlers } = useGesto<SVGSVGElement>({
    aoMover: (x) => {
      const d = diaParaX(x);
      if (d === null) return;
      setFixo(false);
      setMarcoAberto(null);
      setData(deDiaNum(d));
    },
    aoSoltar: () => {
      if (!fixo) setData(null);
    },
    aoTocar: (x, y) => {
      if (!geo) return;
      const base = geo.mt + geo.plotH;
      if (geo.temMarcos && y >= base - 6 && y <= base + 26 && tocarMarco(x)) return;
      setMarcoAberto(null);
      const d = diaParaX(x);
      if (d === null) return;
      const data = deDiaNum(d);
      if (fixo && data === dataMira) {
        setFixo(false);
        setData(null);
        return;
      }
      setFixo(true);
      setData(data);
      aoTocarData?.(data);
    },
    aoDuploToque: zoomLigado
      ? () => {
          setFixo(false);
          setData(null);
          confirmar(null);
        }
      : undefined,
    aoPinca: zoomLigado
      ? (x1, x2, inicio) => {
          if (!geo || !janela || !total) return;
          const dist = Math.max(24, Math.abs(x2 - x1));
          const meio = (x1 + x2) / 2;
          if (inicio || !pinca.current) {
            pinca.current = { d0: dist, span: janela.ate - janela.de, ancora: geo.xs.inverter(meio) };
            setData(null);
            setFixo(false);
            return;
          }
          const { d0, span, ancora } = pinca.current;
          const novoSpan = (span * d0) / dist;
          const frac = (meio - geo.ml) / geo.plotW;
          const j = limitarJanela({ de: ancora - frac * novoSpan, ate: ancora - frac * novoSpan + novoSpan }, total, Math.min(ZOOM_MINIMO, total.ate - total.de));
          ultimaJanela.current = j;
          setJanelaGesto(j);
        }
      : undefined,
    aoPincaFim: () => {
      pinca.current = null;
      if (ultimaJanela.current) confirmar(ultimaJanela.current);
      ultimaJanela.current = null;
    },
  });

  // Toque fora do gráfico solta a mira fixa e fecha o balão do marco
  useEffect(() => {
    if (!fixo && marcoAberto === null) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) {
        if (fixo) {
          setFixo(false);
          setData(null);
        }
        setMarcoAberto(null);
      }
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [fixo, marcoAberto, setData]);

  // ---------- teclado ----------
  const aoTeclar = (e: KeyboardEvent) => {
    if (!geo || !janela || !total) return;
    const [a, b] = indicesVisiveis(diasMira, geo.dom);
    const vis = diasMira.slice(a, b + 1).filter((d) => d >= geo.dom.de && d <= geo.dom.ate);
    if (!vis.length) return;
    const atual = diaMira !== null ? indiceMaisProximo(vis, diaMira) : -1;
    let novo: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
        novo = atual < 0 ? vis.length - 1 : Math.min(vis.length - 1, atual + 1);
        break;
      case 'ArrowLeft':
        novo = atual < 0 ? vis.length - 1 : Math.max(0, atual - 1);
        break;
      case 'Home':
        novo = 0;
        break;
      case 'End':
        novo = vis.length - 1;
        break;
      case 'Escape':
        if (diaMira !== null) {
          setFixo(false);
          setData(null);
          e.preventDefault();
        }
        return;
      case 'Enter':
        if (diaMira !== null) aoTocarData?.(deDiaNum(diaMira));
        return;
      case '+':
      case '=':
      case '-':
      case '0':
        if (!zoomLigado) return;
        e.preventDefault();
        if (e.key === '0') confirmar(null);
        else confirmar(zoomJanela(janela, e.key === '-' ? 1 / 1.6 : 1.6, diaMira ?? (janela.de + janela.ate) / 2, total, Math.min(ZOOM_MINIMO, total.ate - total.de)));
        return;
      default:
        return;
    }
    e.preventDefault();
    setFixo(true);
    setData(deDiaNum(vis[novo]));
  };

  // ---------- dica e balão (posição medida depois de desenhar) ----------
  const dicaRef = useRef<HTMLDivElement>(null);
  const balaoRef = useRef<HTMLDivElement>(null);
  const xMira = miraVisivel && geo && diaMira !== null ? geo.xs(diaMira) : null;
  useLayoutEffect(() => {
    const el = dicaRef.current;
    if (el && xMira !== null) el.style.left = `${posicaoDica(xMira, el.offsetWidth, largura, 12)}px`;
  });
  const grupoAberto = gruposMarcos.find((g) => g.dia === marcoAberto) ?? null;
  useLayoutEffect(() => {
    const el = balaoRef.current;
    if (el && grupoAberto) el.style.left = `${Math.max(0, Math.min(grupoAberto.x - el.offsetWidth / 2, largura - el.offsetWidth))}px`;
  });

  // ---------- acessibilidade ----------
  const resumo = useMemo(() => {
    const partes = series.map((s) => resumoSerie(s.s.nome, s.s.pontos, s.s.casas ?? 1, s.s.unidade));
    if (ampliado && janela) partes.push(`Mostrando de ${dataCurta(deDiaNum(Math.ceil(janela.de)))} a ${dataCurta(deDiaNum(Math.floor(janela.ate)))}`);
    if ((p.marcos ?? []).length) partes.push(`${p.marcos!.length} marco(s) no eixo do tempo`);
    return `${titulo}. ${partes.join('. ')}.`;
  }, [series, titulo, ampliado, janela, p.marcos]);

  const textoMira = leitura && diaMira !== null
    ? `${dataCurta(deDiaNum(diaMira))}: ` +
      leitura.linhas
        .map(({ s, v }) => `${s.s.nome} ${v ? comUnidade(formatarNumero(v.valor, s.s.casas ?? 1), s.s.unidade) : 'sem dado'}`)
        .join(', ')
    : '';

  const vazio = !extensao;
  const base = geo ? geo.mt + geo.plotH : 0;
  const classes = ['gr', 'gr-tempo', p.telaCheia ? 'gr-em-tela-cheia' : '', xMira !== null ? 'gr-com-mira' : ''].filter(Boolean).join(' ');

  return (
    <div className={classes} ref={raiz}>
      {temCab && (
        <div className="gr-cab">
          {legendaVisivel ? (
            <ul className="gr-legenda" aria-label="Legenda">
              {series.map((s) => (
                <li key={s.s.id}>
                  <ChaveLegenda tipo={s.s.tipo} cor={s.cor} tracejado={s.s.tracejado} />
                  {s.s.nome}
                </li>
              ))}
              {faixas.map((f) => (
                <li key={f.id}>
                  <ChaveLegenda tipo="faixa" cor={f.cor} />
                  {f.nome}
                </li>
              ))}
            </ul>
          ) : (
            <span />
          )}
          <div className="gr-acoes">
            {permitirZoom && ampliado && (
              <button type="button" className="gr-pilula" onClick={() => confirmar(null)}>
                Ver tudo
              </button>
            )}
            {p.aoExpandir && (
              <button type="button" className="gr-botao-icone" onClick={p.aoExpandir} aria-label={`Expandir gráfico: ${titulo}`} title="Expandir">
                <IconeExpandir />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="gr-corpo" ref={corpoRef} style={{ height: alturaSvg }}>
        {vazio ? (
          <div className="gr-vazio">Sem dados no período</div>
        ) : (
          geo &&
          estatico && (
            <>
              <div
                className="gr-foco"
                tabIndex={0}
                role="img"
                aria-label={resumo}
                onKeyDown={aoTeclar}
                onFocus={() => setFoco(true)}
                onBlur={() => setFoco(false)}
              >
                <svg ref={alvoGesto} className="gr-svg" width={largura} height={alturaSvg} viewBox={`0 0 ${largura} ${alturaSvg}`} aria-hidden="true" {...handlers}>
                  <defs>
                    <clipPath id={`${idg}-clip`}>
                      <rect x={geo.ml - 4} y={geo.mt - 6} width={geo.plotW + 8} height={geo.plotH + 10} />
                    </clipPath>
                    {series
                      .filter((s) => s.s.tipo === 'area')
                      .map((s) => (
                        <linearGradient key={s.s.id} id={`${idg}-g${s.i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" style={{ stopColor: s.cor, stopOpacity: 0.22 }} />
                          <stop offset="100%" style={{ stopColor: s.cor, stopOpacity: 0 }} />
                        </linearGradient>
                      ))}
                  </defs>
                  <rect className="gr-fundo-toque" x={0} y={0} width={largura} height={alturaSvg} />
                  {estatico.eixos}
                  <g clipPath={`url(#${idg}-clip)`}>{estatico.plot}</g>
                  {estatico.refs}
                  {estatico.marcos}
                  {grupoAberto && <circle className="gr-marco-anel" cx={grupoAberto.x} cy={base + 10} r={8} />}

                  {xMira !== null && leitura && (
                    <g className="gr-mira">
                      <line className="gr-mira-linha" x1={Math.round(xMira) + 0.5} x2={Math.round(xMira) + 0.5} y1={geo.mt - 2} y2={base} />
                      {leitura.fx.map(({ f, i }) =>
                        i < 0 ? null : (
                          <line key={f.id} className="gr-mira-faixa" x1={xMira} x2={xMira} y1={geo.ys(f.eixo)(f.max[i])} y2={geo.ys(f.eixo)(f.min[i])} style={{ stroke: f.cor }} />
                        ),
                      )}
                      {leitura.linhas.map(({ s, v }) => {
                        if (!v) return null;
                        // degrau: o ponto anda junto com a mira (o valor está em vigor)
                        const cx = s.s.tipo === 'degrau' ? geo.xs(diaMira!) : geo.xs(v.dia);
                        const cy = geo.ys(s.eixo)(v.valor);
                        if (s.s.tipo === 'barra') {
                          const f = estatico.formaBarra.get(s.s.id);
                          if (!f || v.dia !== diaMira) return null;
                          return <path key={s.s.id} className="gr-barra gr-barra-ativa" d={caminhoBarra(cx + f.desloc - f.w / 2, f.w, f.y0, cy, Math.min(4, f.w / 2))} style={{ fill: s.cor }} />;
                        }
                        return <circle key={s.s.id} className={v.atipico ? 'gr-mira-ponto gr-mira-atipico' : 'gr-mira-ponto'} cx={cx} cy={cy} r={4.5} style={v.atipico ? { stroke: s.cor } : { fill: s.cor }} />;
                      })}
                    </g>
                  )}
                </svg>
              </div>

              {xMira !== null && leitura && diaMira !== null && (
                <div className="gr-dica" ref={dicaRef} style={{ top: geo.mt }} aria-hidden="true">
                  <div className="gr-dica-data">
                    {diaSemanaCurto(deDiaNum(diaMira))}, {dataCurta(deDiaNum(diaMira))}
                  </div>
                  {leitura.linhas.map(({ s, v }) => (
                    <div key={s.s.id} className="gr-dica-linha">
                      <ChaveLegenda tipo={s.s.tipo} cor={s.cor} tracejado={s.s.tracejado} pequena />
                      <span className="gr-dica-nome">{s.s.nome}</span>
                      <span className="gr-dica-valor">
                        {v ? comUnidade(formatarNumero(v.valor, s.s.casas ?? 1), s.s.unidade) : '–'}
                        {v && v.dia !== diaMira && s.s.tipo !== 'degrau' && <span className="gr-dica-outra"> {dataCurta(deDiaNum(v.dia))}</span>}
                        {v?.atipico && <span className="gr-dica-outra"> atípico</span>}
                      </span>
                    </div>
                  ))}
                  {leitura.fx.map(({ f, i }) =>
                    i < 0 ? null : (
                      <div key={f.id} className="gr-dica-linha">
                        <ChaveLegenda tipo="faixa" cor={f.cor} pequena />
                        <span className="gr-dica-nome">{f.nome}</span>
                        <span className="gr-dica-valor">
                          {formatarNumero(f.min[i], series.find((s) => s.eixo === f.eixo)?.s.casas ?? 1)}–{formatarNumero(f.max[i], series.find((s) => s.eixo === f.eixo)?.s.casas ?? 1)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}

              {grupoAberto && (
                <div className="gr-balao" ref={balaoRef} style={{ bottom: alturaSvg - base + 2 }} role="status">
                  <div className="gr-dica-data">{dataCurta(deDiaNum(grupoAberto.dia))}</div>
                  {grupoAberto.marcos.map((m, i) => (
                    <div key={i} className="gr-balao-linha">
                      <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
                        <SimboloMarco tipo={m.tipo ?? 'nota'} />
                      </svg>
                      <span>{m.rotulo}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        )}
      </div>

      {zoomLigado && total && janela && geo && (
        <BarraZoom
          total={total}
          janela={janela}
          largura={largura}
          ml={geo.ml}
          mr={geo.mr}
          altura={ALTURA_FAIXA_ZOOM}
          minimo={Math.min(ZOOM_MINIMO, total.ate - total.de)}
          serie={series.find((s) => s.s.tipo !== 'barra') ?? series[0]}
          aoMudar={(j, fim) => {
            if (fim) confirmar(j);
            else setJanelaGesto(j);
          }}
          aoRedefinir={() => confirmar(null)}
        />
      )}

      <div className="gr-sr" aria-live="polite">
        {foco ? textoMira : ''}
      </div>
      <TabelaOculta titulo={titulo} series={p.series} faixas={p.faixas ?? []} marcos={p.marcos ?? []} />
    </div>
  );
}

/** Símbolo do marco (centrado em 0,0) */
export function SimboloMarco({ tipo }: { tipo: NonNullable<Marco['tipo']> }) {
  switch (tipo) {
    case 'dose':
      return <circle className="gr-sim gr-sim-dose" r={3.6} />;
    case 'decisao':
      return <rect className="gr-sim gr-sim-decisao" x={-3.4} y={-3.4} width={6.8} height={6.8} rx={1} transform="rotate(45)" />;
    case 'medicao':
      return <circle className="gr-sim gr-sim-medicao" r={3} />;
    case 'atipico':
      return <circle className="gr-sim gr-sim-atipico" r={3.2} />;
    default:
      return <rect className="gr-sim gr-sim-nota" x={-3.2} y={-3.2} width={6.4} height={6.4} rx={1.6} />;
  }
}

function ChaveLegenda({ tipo, cor, tracejado, pequena }: { tipo: Serie['tipo'] | 'faixa'; cor: string; tracejado?: boolean; pequena?: boolean }) {
  const w = pequena ? 12 : 16;
  return (
    <svg className="gr-chave" width={w} height={10} viewBox={`0 0 ${w} 10`} aria-hidden="true">
      {tipo === 'barra' ? (
        <rect x={w / 2 - 3.5} y={1} width={7} height={8} rx={2} style={{ fill: cor }} />
      ) : tipo === 'faixa' ? (
        <rect x={0} y={1.5} width={w} height={7} rx={2.5} style={{ fill: cor, opacity: 0.3 }} />
      ) : tipo === 'degrau' ? (
        <path d={`M1,7.5H${w / 2}V2.5H${w - 1}`} style={{ stroke: cor }} className="gr-chave-linha" />
      ) : (
        <line x1={1} x2={w - 1} y1={5} y2={5} style={{ stroke: cor }} className="gr-chave-linha" strokeDasharray={tracejado ? '3 2.5' : undefined} />
      )}
    </svg>
  );
}

/** Tabela escondida com os dados, para leitores de tela */
function TabelaOculta({ titulo, series, faixas, marcos }: { titulo: string; series: Serie[]; faixas: NonNullable<PropsGraficoTempo['faixas']>; marcos: Marco[] }) {
  const linhas = useMemo(() => {
    const datas = new Set<string>();
    series.forEach((s) => s.pontos.forEach((q) => datas.add(q.data.slice(0, 10))));
    faixas.forEach((f) => f.pontos.forEach((q) => datas.add(q.data.slice(0, 10))));
    const mapas = series.map((s) => new Map(s.pontos.map((q) => [q.data.slice(0, 10), q])));
    const mapasF = faixas.map((f) => new Map(f.pontos.map((q) => [q.data.slice(0, 10), q])));
    return [...datas].sort().map((d) => ({ d, vs: mapas.map((m) => m.get(d)), fs: mapasF.map((m) => m.get(d)) }));
  }, [series, faixas]);
  return (
    <div className="gr-sr">
      <table>
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            {series.map((s) => (
              <th key={s.id} scope="col">
                {s.nome}
                {s.unidade ? ` (${s.unidade})` : ''}
              </th>
            ))}
            {faixas.map((f) => (
              <th key={f.id} scope="col">
                {f.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ d, vs, fs }) => (
            <tr key={d}>
              <th scope="row">{dataCurta(d)}</th>
              {vs.map((q, i) => (
                <td key={i}>
                  {q && q.valor !== null ? formatarNumero(q.valor, series[i].casas ?? 1) : '–'}
                  {q?.atipico ? ' (atípico)' : ''}
                </td>
              ))}
              {fs.map((q, i) => (
                <td key={`f${i}`}>{q ? `${formatarNumero(q.min, 1)}–${formatarNumero(q.max, 1)}` : '–'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {marcos.length > 0 && (
        <ul aria-label="Marcos">
          {marcos.map((m, i) => (
            <li key={i}>
              {dataCurta(m.data)}: {m.rotulo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
