// Contas de apresentação da aba Treino (abas, calendário em mapa de calor, placar em barras).
// Só reorganizam números que o placar já calcula; nada aqui muda o que é salvo.
import type { Contagem, Corrida } from './treino';
import type { TreinoDia } from './tipos';

export type AbaTreino = 'hoje' | 'placar' | 'corridas' | 'forca' | 'metas';
export const ABAS_TREINO: [AbaTreino, string][] = [
  ['hoje', 'Hoje'],
  ['placar', 'Placar'],
  ['corridas', 'Corridas'],
  ['forca', 'Força'],
  ['metas', 'Metas'],
];

/** Aba pelo ?aba= do endereço; valor ausente ou desconhecido (links antigos) abre "Hoje". */
export function abaTreino(valor: string | null): AbaTreino {
  return ABAS_TREINO.find(([k]) => k === valor)?.[0] ?? 'hoje';
}

export type EstadoDia = 'passado' | 'hoje' | 'futuro';

export interface CelulaDia {
  data: string;
  estado: EstadoDia;
  treino: boolean;
  cardio: boolean;
  /** 0 a 2: quantos dos dois (treino e cardio) foram feitos; a intensidade do mapa de calor */
  nivel: 0 | 1 | 2;
}

/** Célula do calendário: o que foi feito no dia e se o dia já passou. */
export function celulaDia(data: string, hoje: string, reg?: Pick<TreinoDia, 'treino' | 'cardio'> | null): CelulaDia {
  const treino = !!reg?.treino;
  const cardio = !!reg?.cardio;
  return {
    data,
    estado: data < hoje ? 'passado' : data === hoje ? 'hoje' : 'futuro',
    treino,
    cardio,
    nivel: ((treino ? 1 : 0) + (cardio ? 1 : 0)) as 0 | 1 | 2,
  };
}

/** Situação de hoje em poucas palavras (hero da aba). */
export function textoHoje(reg?: Pick<TreinoDia, 'treino' | 'cardio'> | null): {
  texto: string;
  completo: boolean;
} {
  const t = !!reg?.treino;
  const c = !!reg?.cardio;
  if (t && c) return { texto: '✓ completo', completo: true };
  if (t) return { texto: 'falta cardio', completo: false };
  if (c) return { texto: 'falta treino', completo: false };
  return { texto: 'a marcar', completo: false };
}

/** Cor da % do placar (mesmas faixas da tabela antiga): 90%+ bom, 70%+ atenção, abaixo disso ruim. */
export function tomPlacar(a: number | null): string {
  if (a === null) return '';
  return a >= 0.9 ? 'bom' : a >= 0.7 ? 'aviso' : 'ruim';
}

/** Barra do placar sobre o total do período: feito, meta até hoje e projeção no fim (frações de 0 a 1). */
export function barraPlacar(c: Contagem): {
  feito: number;
  meta: number;
  projecao: number;
} {
  const f = (n: number) => (c.total > 0 ? Math.min(Math.max(n / c.total, 0), 1) : 0);
  return {
    feito: f(c.feito),
    meta: f(c.meta),
    projecao: f(Math.max(c.projecao, c.feito)),
  };
}

/** Indicadores das corridas com pace: último, melhor (e a data), média das distâncias. null sem corrida. */
export function resumoCorridas(corridas: Corrida[]): { ultima: Corrida; melhor: Corrida; kmMedio: number } | null {
  if (!corridas.length) return null;
  const melhor = corridas.reduce((m, c) => (c.pace < m.pace ? c : m), corridas[0]);
  const kmMedio = corridas.reduce((s, c) => s + c.km, 0) / corridas.length;
  return { ultima: corridas[corridas.length - 1], melhor, kmMedio };
}
