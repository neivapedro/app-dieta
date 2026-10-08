import { useEffect, useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

function Dica({ active, payload, label }: { active?: boolean; payload?: ItemDica[]; label?: number }) {
  if (!active || !payload?.length || label === undefined) return null;
  return (
    <div className="dica-grafico">
      <b>{formatarData(deDia(label))}</b>
      {payload
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
export function GraficoComposicao({ dados }: { dados: Composicao[] }) {
  const CORES = useCores();
  const pontos = dados.map((c) => ({ dia: paraDia(c.data), peso: c.peso_kg, magra: c.massa_magra_kg, bf: c.bf }));
  return (
    <div className="grafico">
      <ResponsiveContainer>
        <ComposedChart data={pontos} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          {eixoX()}
          <YAxis yAxisId="kg" domain={['auto', 'auto']} tickFormatter={(v: number) => num(v, 0)} tickLine={false} axisLine={false} width={36} />
          <YAxis yAxisId="bf" orientation="right" domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={(v: number) => `${num(v, 0)}%`} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<Dica />} />
          <Legend iconType="plainline" />
          <Line yAxisId="kg" dataKey="peso" name="Peso" unit=" kg" stroke={CORES.peso} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line yAxisId="kg" dataKey="magra" name="Massa magra" unit=" kg" stroke={CORES.magra} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line yAxisId="bf" dataKey="bf" name="% de gordura" unit="%" stroke={CORES.bf} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Peso ao longo do ciclo × degraus de dose aplicada. */
export function GraficoPesoDose({ serie, linhas, hoje }: { serie: PontoPeso[]; linhas: LinhaAplicacao[]; hoje: string }) {
  const CORES = useCores();
  const mapa = new Map<number, { dia: number; peso?: number; dose?: number }>();
  for (const p of serie) mapa.set(paraDia(p.data), { dia: paraDia(p.data), peso: p.peso_kg });
  for (const l of linhas) {
    const dia = paraDia(l.aplicacao.data);
    mapa.set(dia, { ...(mapa.get(dia) ?? { dia }), dose: l.aplicacao.dose_mg });
  }
  if (linhas.length) {
    const ultimoDia = paraDia(hoje);
    mapa.set(ultimoDia, { ...(mapa.get(ultimoDia) ?? { dia: ultimoDia }), dose: linhas[linhas.length - 1].aplicacao.dose_mg });
  }
  const pontos = [...mapa.values()].sort((a, b) => a.dia - b.dia);
  return (
    <div className="grafico">
      <ResponsiveContainer>
        <ComposedChart data={pontos} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          {eixoX()}
          <YAxis yAxisId="kg" domain={['auto', 'auto']} tickFormatter={(v: number) => num(v, 0)} tickLine={false} axisLine={false} width={36} />
          <YAxis yAxisId="mg" orientation="right" domain={[0, (max: number) => Math.ceil(max + 0.5)]} tickFormatter={(v: number) => num(v, 1)} tickLine={false} axisLine={false} width={36} />
          <Tooltip content={<Dica />} />
          <Legend iconType="plainline" />
          <Line yAxisId="kg" dataKey="peso" name="Peso" unit=" kg" stroke={CORES.peso} strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
          <Line yAxisId="mg" dataKey="dose" name="Dose" unit=" mg" type="stepAfter" stroke={CORES.dose} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
