import { useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { diferencaDias, formatarData, somarDias } from '../lib/datas';
import { num } from '../lib/formato';
import type { Composicao } from '../lib/gordura';
import type { PontoPeso } from '../lib/analise';
import type { LinhaAplicacao } from '../lib/ciclo';

const BASE = '2000-01-01';
const paraDia = (d: string) => diferencaDias(BASE, d);
const deDia = (n: number) => somarDias(BASE, n);

type Cores = { peso: string; magra: string; bf: string; dose: string };

function lerCores(): Cores {
  const css = getComputedStyle(document.documentElement);
  const v = (nome: string, padrao: string) => css.getPropertyValue(nome).trim() || padrao;
  return { peso: v('--g-peso', '#f5f5f7'), magra: v('--g-magra', '#8e8e93'), bf: v('--g-bf', '#ffd60a'), dose: v('--g-dose', '#636366') };
}

/** Cores das séries vindas do tema (claro/escuro), atualizadas quando o tema muda. */
function useCores(): Cores {
  const [cores, setCores] = useState(lerCores);
  useEffect(() => {
    const atualizar = () => setCores(lerCores());
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', atualizar);
    const obs = new MutationObserver(atualizar);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', atualizar);
      obs.disconnect();
    };
  }, []);
  return cores;
}

function eixoX() {
  return (
    <XAxis
      dataKey="dia"
      type="number"
      scale="time"
      domain={['dataMin', 'dataMax']}
      tickFormatter={(v: number) => formatarData(deDia(v), true).slice(0, 5)}
      tickLine={false}
      axisLine={false}
      minTickGap={24}
    />
  );
}

interface ItemDica {
  name?: string | number;
  value?: number | string;
  color?: string;
  unit?: string;
  dataKey?: string | number;
}

/** Dia com decisão registrada (registro de decisões): vira uma linha vertical discreta */
export interface MarcoGrafico {
  data: string;
  texto: string;
}

/** Só os marcos dentro do período do gráfico (um marco fora dele esticaria o eixo). */
function marcosNoPeriodo(marcos: MarcoGrafico[] | undefined, dias: number[]): { dia: number; texto: string }[] {
  if (!marcos?.length || !dias.length) return [];
  const min = Math.min(...dias);
  const max = Math.max(...dias);
  return marcos.map((m) => ({ dia: paraDia(m.data), texto: m.texto })).filter((m) => m.dia >= min && m.dia <= max);
}

function linhasDeMarco(marcos: { dia: number }[], yAxisId: string, cor: string) {
  return marcos.map((m) => (
    <ReferenceLine key={`marco-${m.dia}`} x={m.dia} yAxisId={yAxisId} stroke={cor} strokeDasharray="2 3" strokeOpacity={0.8} ifOverflow="discard" />
  ));
}

function Dica({ active, payload, label, marcos }: { active?: boolean; payload?: ItemDica[]; label?: number; marcos?: { dia: number; texto: string }[] }) {
  const marco = label === undefined ? undefined : marcos?.find((m) => m.dia === label);
  if (!active || (!payload?.length && !marco) || label === undefined) return null;
  return (
    <div className="dica-grafico">
      <b>{formatarData(deDia(label))}</b>
      {marco && <div className="mudo">Decisão: {marco.texto}</div>}
      {(payload ?? []).some((p) => String(p.dataKey).endsWith('At') && p.value != null) && <div className="mudo">Medição atípica (fora das tendências)</div>}
      {(payload ?? [])
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <div key={String(p.dataKey)} style={{ color: p.color }}>
            {p.name}: {num(Number(p.value), p.dataKey === 'dose' ? 2 : 1)}
            {p.unit}
          </div>
        ))}
    </div>
  );
}

/** Mesmo gráfico "Evolução" da planilha, com a % de gordura no eixo da direita. */
export function GraficoComposicao({ dados, marcos }: { dados: Composicao[]; marcos?: MarcoGrafico[] }) {
  const CORES = useCores();
  // Medição atípica: ponto vazio à parte, fora das linhas (as linhas ligam só as normais)
  type Ponto = { dia: number; peso?: number; magra?: number | null; bf?: number | null; pesoAt?: number; magraAt?: number | null; bfAt?: number | null };
  const base: Ponto[] = dados.map((c) =>
    c.atipica
      ? { dia: paraDia(c.data), pesoAt: c.peso_kg, magraAt: c.massa_magra_kg, bfAt: c.bf }
      : { dia: paraDia(c.data), peso: c.peso_kg, magra: c.massa_magra_kg, bf: c.bf },
  );
  const temAtipica = dados.some((c) => c.atipica);
  const pontoVazio = (cor: string) => ({ r: 4, fill: 'var(--fundo, transparent)', stroke: cor, strokeWidth: 2 });
  const noPeriodo = marcosNoPeriodo(marcos, base.map((p) => p.dia));
  // Dia de decisão sem medição entra como ponto vazio (a dica mostra a decisão)
  const pontos = [...base, ...noPeriodo.filter((m) => !base.some((p) => p.dia === m.dia)).map((m) => ({ dia: m.dia }))].sort((a, b) => a.dia - b.dia);
  return (
    <div className="grafico">
      <ResponsiveContainer>
        <ComposedChart data={pontos} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          {eixoX()}
          <YAxis yAxisId="kg" domain={['auto', 'auto']} allowDecimals={false} tickFormatter={(v: number) => num(v, 0)} tickLine={false} axisLine={false} width={36} />
          <YAxis yAxisId="bf" orientation="right" domain={['auto', 'auto']} allowDecimals={false} tickFormatter={(v: number) => `${num(v, 0)}%`} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<Dica marcos={noPeriodo} />} />
          <Legend iconType="plainline" />
          {linhasDeMarco(noPeriodo, 'kg', CORES.dose)}
          <Line yAxisId="kg" dataKey="peso" name="Peso" unit=" kg" stroke={CORES.peso} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line yAxisId="kg" dataKey="magra" name="Massa magra" unit=" kg" stroke={CORES.magra} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line yAxisId="bf" dataKey="bf" name="% de gordura" unit="%" stroke={CORES.bf} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          {temAtipica && (
            <>
              <Line yAxisId="kg" dataKey="pesoAt" name="Peso" unit=" kg" stroke="none" dot={pontoVazio(CORES.peso)} activeDot={false} legendType="none" isAnimationActive={false} />
              <Line yAxisId="kg" dataKey="magraAt" name="Massa magra" unit=" kg" stroke="none" dot={pontoVazio(CORES.magra)} activeDot={false} legendType="none" isAnimationActive={false} />
              <Line yAxisId="bf" dataKey="bfAt" name="% de gordura" unit="%" stroke="none" dot={pontoVazio(CORES.bf)} activeDot={false} legendType="none" isAnimationActive={false} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Peso ao longo do ciclo × degraus de dose aplicada. */
export function GraficoPesoDose({
  serie,
  linhas,
  hoje,
  larguraFixa,
  marcos,
  fimDose,
}: {
  serie: PontoPeso[];
  linhas: LinhaAplicacao[];
  hoje: string;
  /** Remédio concluído: o degrau da última dose termina aqui (não vai até hoje) */
  fimDose?: string;
  larguraFixa?: number;
  marcos?: MarcoGrafico[];
}) {
  const CORES = useCores();
  const mapa = new Map<number, { dia: number; peso?: number; pesoAt?: number; dose?: number }>();
  // Medição atípica: ponto vazio à parte, fora da linha do peso
  for (const p of serie) mapa.set(paraDia(p.data), p.atipica ? { dia: paraDia(p.data), pesoAt: p.peso_kg } : { dia: paraDia(p.data), peso: p.peso_kg });
  const temAtipica = serie.some((p) => p.atipica);
  for (const l of linhas) {
    const dia = paraDia(l.aplicacao.data);
    mapa.set(dia, { ...(mapa.get(dia) ?? { dia }), dose: l.aplicacao.dose_mg });
  }
  if (linhas.length) {
    const ultimoDia = paraDia(fimDose && fimDose < hoje ? fimDose : hoje);
    mapa.set(ultimoDia, { ...(mapa.get(ultimoDia) ?? { dia: ultimoDia }), dose: linhas[linhas.length - 1].aplicacao.dose_mg });
  }
  const noPeriodo = marcosNoPeriodo(marcos, [...mapa.keys()]);
  for (const m of noPeriodo) if (!mapa.has(m.dia)) mapa.set(m.dia, { dia: m.dia });
  const pontos = [...mapa.values()].sort((a, b) => a.dia - b.dia);
  // Na impressão, largura fixa: o gráfico responsivo não se redimensiona para a página
  const grafico = (
        <ComposedChart data={pontos} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} {...(larguraFixa ? { width: larguraFixa, height: 240 } : {})}>
          <CartesianGrid vertical={false} />
          {eixoX()}
          <YAxis yAxisId="kg" domain={['auto', 'auto']} allowDecimals={false} tickFormatter={(v: number) => num(v, 0)} tickLine={false} axisLine={false} width={36} />
          <YAxis yAxisId="mg" orientation="right" domain={[0, (max: number) => Math.ceil(max + 0.5)]} tickFormatter={(v: number) => String(Math.round(v * 100) / 100).replace('.', ',')} tickLine={false} axisLine={false} width={36} />
          <Tooltip content={<Dica marcos={noPeriodo} />} />
          <Legend iconType="plainline" />
          {linhasDeMarco(noPeriodo, 'kg', CORES.dose)}
          <Line yAxisId="kg" dataKey="peso" name="Peso" unit=" kg" stroke={CORES.peso} strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
          {temAtipica && (
            <Line
              yAxisId="kg"
              dataKey="pesoAt"
              name="Peso"
              unit=" kg"
              stroke="none"
              dot={{ r: 3.5, fill: 'var(--fundo, transparent)', stroke: CORES.peso, strokeWidth: 2 }}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />
          )}
          <Line yAxisId="mg" dataKey="dose" name="Dose" unit=" mg" type="stepAfter" stroke={CORES.dose} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
  );
  if (larguraFixa) return <div className="grafico grafico-fixo">{grafico}</div>;
  return (
    <div className="grafico">
      <ResponsiveContainer>{grafico}</ResponsiveContainer>
    </div>
  );
}

export type MetricaSemanal = 'cintura_cm' | 'bf' | 'massa_magra_kg' | 'peso_kg';

const ROTULO_METRICA: Record<MetricaSemanal, { nome: string; unidade: string }> = {
  cintura_cm: { nome: 'Cintura', unidade: ' cm' },
  bf: { nome: '% de gordura', unidade: '%' },
  massa_magra_kg: { nome: 'Massa magra', unidade: ' kg' },
  peso_kg: { nome: 'Peso', unidade: ' kg' },
};

/** Aderência semanal (barras) × medida da segunda-feira (linha). */
export function GraficoAderencia({ semanas, metrica }: { semanas: { numero: number; segunda: string; aderencia: number | null; medida: Composicao | null }[]; metrica: MetricaSemanal }) {
  const CORES = useCores();
  const r = ROTULO_METRICA[metrica];
  const pontos = semanas.map((s) => ({
    semana: `S${s.numero}`,
    aderencia: s.aderencia === null ? null : Math.round(s.aderencia * 100),
    medida: s.medida ? (s.medida[metrica] as number | null) : null,
  }));
  return (
    <div className="grafico">
      <ResponsiveContainer>
        <ComposedChart data={pontos} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="semana" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
          <YAxis yAxisId="pct" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={36} />
          <YAxis yAxisId="med" orientation="right" domain={['auto', 'auto']} tickFormatter={(v: number) => num(v, 1)} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="dica-grafico">
                  <b>{label}</b>
                  {payload
                    .filter((p) => p.value !== null && p.value !== undefined)
                    .map((p) => (
                      <div key={String(p.dataKey)} style={{ color: p.color }}>
                        {p.name}: {p.dataKey === 'aderencia' ? `${p.value}%` : `${num(Number(p.value), 1)}${r.unidade}`}
                      </div>
                    ))}
                </div>
              ) : null
            }
          />
          <Legend iconType="plainline" />
          <Bar yAxisId="pct" dataKey="aderencia" name="Aderência" fill={CORES.magra} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="med" dataKey="medida" name={r.nome} stroke={CORES.bf} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Pace das corridas (eixo invertido: subir = ficar mais rápido). */
export function GraficoPace({ corridas }: { corridas: { data: string; pace: number }[] }) {
  const CORES = useCores();
  const pontos = corridas.map((c) => ({ dia: paraDia(c.data), pace: Math.round(c.pace) }));
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return (
    <div className="grafico" style={{ height: 200 }}>
      <ResponsiveContainer>
        <ComposedChart data={pontos} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          {eixoX()}
          <YAxis reversed domain={['dataMin - 10', 'dataMax + 10']} tickFormatter={mmss} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="dica-grafico">
                  <b>{formatarData(deDia(Number(label)))}</b>
                  <div>Pace: {mmss(Number(payload[0].value))} /km</div>
                </div>
              ) : null
            }
          />
          <Line dataKey="pace" name="Pace" stroke={CORES.peso} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
