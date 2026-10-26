// Dados dos gráficos do Treino (motor SVG): recordes das corridas e a semana de cada medição.
import type { Marco } from '../componentes/grafico/tipos';
import { somarDias } from './datas';
import { formatarKm, formatarTempo, segundaDaSemana, type Corrida } from './treino';

/** Medida do gráfico de aderência × medidas */
export type MetricaSemanal = 'cintura_cm' | 'bf' | 'massa_magra_kg' | 'peso_kg';

export interface RecordeCorrida {
  data: string;
  pace: boolean;
  distancia: boolean;
}

/**
 * Recordes pessoais ao longo do tempo: corrida com o pace mais rápido (ao segundo, como aparece
 * na tela) ou a maior distância até então. A 1ª corrida não conta (não há com o que comparar).
 */
export function recordesCorridas(corridas: Corrida[]): RecordeCorrida[] {
  const ord = [...corridas].sort((a, b) => a.data.localeCompare(b.data));
  const lista: RecordeCorrida[] = [];
  let melhorPace = Infinity;
  let maiorKm = -Infinity;
  ord.forEach((c, i) => {
    const pace = Math.round(c.pace);
    const r = { data: c.data, pace: i > 0 && pace < melhorPace, distancia: i > 0 && c.km > maiorKm };
    melhorPace = Math.min(melhorPace, pace);
    maiorKm = Math.max(maiorKm, c.km);
    if (r.pace || r.distancia) lista.push(r);
  });
  return lista;
}

/** Recordes como marcos do gráfico do pace. */
export function marcosRecordes(corridas: Corrida[]): Marco[] {
  const porData = new Map(corridas.map((c) => [c.data, c]));
  return recordesCorridas(corridas).map((r) => {
    const c = porData.get(r.data)!;
    const partes = [r.pace && `pace ${formatarTempo(c.pace)} /km`, r.distancia && `distância ${formatarKm(c.km)}`].filter(Boolean);
    return { data: r.data, rotulo: `Recorde: ${partes.join(' e ')}`, tipo: 'nota' as const };
  });
}

/**
 * Semana cujo resultado é a medição desta data: a medição de segunda (em jejum) é o resultado da
 * semana que terminou. Devolve a segunda dessa semana, se ela está na lista.
 */
export function semanaDaMedicao(segundas: string[], data: string): string | null {
  const alvo = somarDias(segundaDaSemana(data), -7);
  return segundas.includes(alvo) ? alvo : null;
}

/** Semana que contém a data (para um toque fora das medições). */
export function semanaDaData(segundas: string[], data: string): string | null {
  const alvo = segundaDaSemana(data);
  return segundas.includes(alvo) ? alvo : null;
}
