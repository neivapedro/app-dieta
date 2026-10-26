// Detalhe de um indicador da Análise (folha ao tocar no KPI): semanas, fases e marcos do gráfico.
import { diaDaSemana, diferencaDias, formatarData, segundaDaSemana } from './datas';
import { parNoPeriodo } from './analise-periodo';
import type { DecisaoFase, RegistroDecisao } from './tipos';

export interface PontoValor {
  data: string;
  valor: number;
}

export interface SemanaValor extends PontoValor {
  /** Segunda da semana */
  segunda: string;
}

/** A última medição de cada semana (segunda a domingo), em ordem. */
export function ultimaPorSemana(pontos: PontoValor[]): SemanaValor[] {
  const porSemana = new Map<string, SemanaValor>();
  for (const p of [...pontos].sort((a, b) => a.data.localeCompare(b.data))) {
    if (!Number.isFinite(p.valor)) continue;
    const segunda = segundaDaSemana(p.data);
    porSemana.set(segunda, { ...p, segunda });
  }
  return [...porSemana.values()];
}

export interface VariacaoSemana {
  /** Semana da medição mais nova */
  segunda: string;
  de: SemanaValor;
  ate: SemanaValor;
  /** Variação por semana (o intervalo entre as duas medições levado a 7 dias) */
  delta: number;
}

/** Variação de uma semana para a seguinte (medições com 4 a 14 dias entre si). */
export function variacoesSemanais(pontos: PontoValor[]): VariacaoSemana[] {
  const semanas = ultimaPorSemana(pontos);
  const lista: VariacaoSemana[] = [];
  for (let i = 1; i < semanas.length; i++) {
    const de = semanas[i - 1];
    const ate = semanas[i];
    const dias = diferencaDias(de.data, ate.data);
    if (dias < 4 || dias > 14) continue;
    lista.push({ segunda: ate.segunda, de, ate, delta: ((ate.valor - de.valor) / dias) * 7 });
  }
  return lista;
}

/** Melhor e pior semana: a maior queda e a maior subida (o contrário quando subir é bom). */
export function extremosSemanais(v: VariacaoSemana[], menorMelhor: boolean): { melhor: VariacaoSemana; pior: VariacaoSemana } | null {
  if (v.length < 2) return null;
  const ord = [...v].sort((a, b) => (menorMelhor ? a.delta - b.delta : b.delta - a.delta));
  return { melhor: ord[0], pior: ord[ord.length - 1] };
}

export interface EstaSemana {
  atual: SemanaValor | null;
  anterior: SemanaValor | null;
  delta: number | null;
}

/** Esta semana × a anterior: a última medição de cada uma (sem medição nesta, atual = null). */
export function estaSemanaVsAnterior(pontos: PontoValor[], hoje: string): EstaSemana {
  const semanas = ultimaPorSemana(pontos.filter((p) => p.data <= hoje));
  const seg = segundaDaSemana(hoje);
  const atual = semanas.find((s) => s.segunda === seg) ?? null;
  const antes = semanas.filter((s) => s.segunda < seg);
  const anterior = antes.length ? antes[antes.length - 1] : null;
  return { atual, anterior, delta: atual && anterior ? atual.valor - anterior.valor : null };
}

/** Variação dentro de cada bloco de dose (referência até 7 dias antes do início × última do bloco). */
export function variacaoPorFase(pontos: PontoValor[], fases: { rotulo: string; de: string; ate: string }[]): { rotulo: string; delta: number | null; de: string | null; ate: string | null }[] {
  const ord = [...pontos].sort((a, b) => a.data.localeCompare(b.data));
  return fases.map((f) => {
    const par = parNoPeriodo(ord, f.de, f.ate);
    return {
      rotulo: f.rotulo,
      delta: par.comVariacao ? par.fim!.valor - par.ini!.valor : null,
      de: par.comVariacao ? par.ini!.data : null,
      ate: par.comVariacao ? par.fim!.data : null,
    };
  });
}

// ---------- Marcos do eixo do tempo ----------

/** Mesmo formato do Marco do motor de gráficos */
export interface MarcoTempo {
  data: string;
  rotulo: string;
  tipo?: 'dose' | 'decisao' | 'nota' | 'atipico' | 'medicao';
}

const mgTxt = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mg`;

const ESCOLHA: Record<DecisaoFase['escolha'], string> = {
  subir: 'Decisão: subir a dose',
  repetir: 'Decisão: repetir a fase',
  confirmar_fase: 'Decisão: confirmou a fase',
  anotacao: 'Anotação',
  pos_remedio: 'Fase pós-remédio',
  intervalo: 'Intervalo entre doses mudou',
};

/**
 * Marcos para os gráficos da Análise: trocas de dose, decisões (fim de fase e registro de
 * decisões), anotações, medições atípicas e as medições de segunda.
 */
export function marcosAnalise(e: {
  doses: { data: string; dose_mg: number }[];
  decisoes?: DecisaoFase[];
  registros?: RegistroDecisao[];
  /** Medições (data e se é atípica) */
  medicoes?: { data: string; atipica?: boolean }[];
}): MarcoTempo[] {
  const lista: MarcoTempo[] = [];
  const doses = [...e.doses].sort((a, b) => a.data.localeCompare(b.data));
  doses.forEach((d, i) => {
    if (i === 0) lista.push({ data: d.data, rotulo: `1ª dose: ${mgTxt(d.dose_mg)}`, tipo: 'dose' });
    else if (Math.abs(d.dose_mg - doses[i - 1].dose_mg) > 1e-9) lista.push({ data: d.data, rotulo: `Dose: ${mgTxt(doses[i - 1].dose_mg)} → ${mgTxt(d.dose_mg)}`, tipo: 'dose' });
  });
  const diasSubir = new Set<string>();
  for (const d of e.decisoes ?? []) {
    if (d.escolha === 'anotacao') {
      lista.push({ data: d.data, rotulo: `Anotação: ${d.texto ?? ''}`.trim(), tipo: 'nota' });
      continue;
    }
    const extra = d.escolha === 'subir' && d.dose_nova_mg ? ` (${mgTxt(d.dose_mg)} → ${mgTxt(d.dose_nova_mg)})` : '';
    if (d.escolha === 'subir') diasSubir.add(d.data);
    lista.push({ data: d.data, rotulo: `${ESCOLHA[d.escolha]}${extra}`, tipo: 'decisao' });
  }
  for (const r of e.registros ?? []) {
    // A troca de dose do mesmo dia já está na decisão de fim de fase
    if (r.tipo === 'dose' && diasSubir.has(r.data)) continue;
    const valores = r.de || r.para ? `: ${r.de ?? '–'} → ${r.para ?? '–'}` : '';
    lista.push({ data: r.data, rotulo: `${r.campo}${valores}${r.motivo ? ` (${r.motivo})` : ''}`, tipo: r.tipo === 'nota' ? 'nota' : 'decisao' });
  }
  for (const m of e.medicoes ?? []) {
    if (m.atipica) lista.push({ data: m.data, rotulo: 'Medição atípica (fora das tendências)', tipo: 'atipico' });
    else if (diaDaSemana(m.data) === 'Segunda') lista.push({ data: m.data, rotulo: 'Medição de segunda', tipo: 'medicao' });
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

/** "semana de 05/10" */
export const rotuloSemana = (segunda: string) => `semana de ${formatarData(segunda).slice(0, 5)}`;
