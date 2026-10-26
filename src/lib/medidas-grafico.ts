// Dados dos gráficos de Medidas (motor SVG): séries com as atípicas marcadas, marcos e a leitura da mira.
import type { Marco, PontoSerie } from '../componentes/grafico/tipos';
import type { Composicao } from './gordura';
import type { ChavePainel } from './painel';
import { num } from './formato';

/** Pontos de uma medida: todas as medições, com a atípica marcada (fica fora da linha, como ponto vazio). */
export function pontosMedida(composicoes: Composicao[], chave: ChavePainel): PontoSerie[] {
  return composicoes
    .filter((c) => c[chave] !== null && Number.isFinite(c[chave] as number))
    .map((c) => ({ data: c.data, valor: c[chave] as number, ...(c.atipica ? { atipico: true } : {}) }));
}

/** Aplicações em que a dose mudou em relação à anterior (a 1ª não conta: não é mudança). */
export function marcosMudancaDose(aplicacoes: { data: string; dose_mg: number }[]): Marco[] {
  const ord = [...aplicacoes].sort((a, b) => a.data.localeCompare(b.data));
  const marcos: Marco[] = [];
  for (let i = 1; i < ord.length; i++) {
    const antes = ord[i - 1].dose_mg;
    const agora = ord[i].dose_mg;
    if (agora === antes) continue;
    marcos.push({ data: ord[i].data, rotulo: `Dose ${agora > antes ? 'subiu' : 'desceu'}: ${num(antes, 2)} → ${num(agora, 2)} mg`, tipo: 'dose' });
  }
  return marcos;
}

/** Medições atípicas como marcos no eixo do tempo. */
export function marcosAtipicas(composicoes: Composicao[]): Marco[] {
  return composicoes.filter((c) => c.atipica).map((c) => ({ data: c.data, rotulo: 'Medição atípica (fora das tendências)', tipo: 'atipico' as const }));
}

/** Decisões do ciclo (registro de decisões) como marcos. */
export function marcosDecisoes(decisoes: { data: string; texto: string }[]): Marco[] {
  return decisoes.map((d) => ({ data: d.data, rotulo: `Decisão: ${d.texto}`, tipo: 'decisao' as const }));
}

export interface LeituraMedida {
  data: string;
  valor: number;
  atipica: boolean;
  /** variação desde o início (null sem início ou na atípica) */
  desdeInicio: number | null;
  /** quanto falta para a meta: valor − meta (null sem meta ou na atípica) */
  paraMeta: number | null;
  /** é a última medição normal (sem mira) */
  ultima: boolean;
}

/**
 * O que a linha de leitura mostra: o ponto da data da mira ou, sem mira, a última medição normal.
 * A atípica não entra nas contas (fica fora das tendências).
 */
export function leituraMedida(pontos: PontoSerie[], data: string | null, inicio: number | null | undefined, meta: number | null | undefined): LeituraMedida | null {
  const validos = pontos.filter((p): p is PontoSerie & { valor: number } => p.valor !== null && Number.isFinite(p.valor));
  const naMira = data ? validos.find((p) => p.data === data) : undefined;
  const p = naMira ?? [...validos].reverse().find((q) => !q.atipico);
  if (!p) return null;
  const atipica = !!p.atipico;
  return {
    data: p.data,
    valor: p.valor,
    atipica,
    desdeInicio: !atipica && inicio != null ? p.valor - inicio : null,
    paraMeta: !atipica && meta != null ? p.valor - meta : null,
    ultima: !naMira,
  };
}
