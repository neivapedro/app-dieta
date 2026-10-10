import { segundaDaSemana } from './treino';
import type { RegistroForca } from './tipos';

// Força em exercícios-âncora: sinal de massa magra que não depende da fita.
// 1x por semana, a primeira série válida de cada exercício (carga, repetições, RIR).
// 1RM estimado por Epley = carga × (1 + reps/30), só com até 10 repetições (acima
// disso a estimativa perde precisão e o app mostra só a carga).
// Referência de cada exercício = média das 2 primeiras semanas registradas; trocar
// de exercício (outro nome) começa uma referência nova.
// Índice semanal = média das variações % dos exercícios contra a própria referência,
// suavizado pela média de 2 leituras. Queda de 5% em 2 leituras seguidas = atenção;
// de 10% = alerta. Em déficit a força costuma se manter (Murphy & Koehler, 2022), então
// queda é sinal sensível, mas pouco específico: fadiga, sono, náusea e glicogênio também derrubam.

export const EXERCICIOS_PADRAO = ['Supino', 'Agachamento ou leg press', 'Remada', 'Desenvolvimento'];
export const REPS_MAX_EPLEY = 10;
export const QUEDA_ATENCAO = -0.05;
export const QUEDA_ALERTA = -0.1;
const SEMANAS_REFERENCIA = 2;

/** Lista de exercícios do perfil, ou a padrão. */
export function exerciciosDoPerfil(lista: string[] | null | undefined): string[] {
  const limpos = (lista ?? []).map((e) => e.trim()).filter(Boolean);
  return limpos.length ? limpos : EXERCICIOS_PADRAO;
}

/** 1RM estimado (Epley); null com mais de 10 repetições ou valores inválidos. */
export function umRmEpley(carga: number, reps: number): number | null {
  if (!(carga > 0) || !Number.isInteger(reps) || reps < 1 || reps > REPS_MAX_EPLEY) return null;
  return carga * (1 + reps / 30);
}

/** Nome comparável: sem diferença de maiúsculas, acentos e espaços nas pontas. */
export function chaveExercicio(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

export interface ExercicioSemana {
  exercicio: string;
  registro: RegistroForca;
  /** 1RM estimado; null com mais de 10 repetições */
  e1rm: number | null;
  /** Variação contra a referência do exercício (0,03 = +3%); null sem 1RM */
  variacao: number | null;
}

export interface SemanaForca {
  segunda: string;
  exercicios: ExercicioSemana[];
  /** Média das variações dos exercícios da semana; null sem nenhum 1RM */
  indice: number | null;
  /** Média desta leitura com a anterior (2 leituras) */
  suavizado: number | null;
}

export type NivelForca = 'atencao' | 'alerta' | null;

export interface IndiceForca {
  semanas: SemanaForca[];
  /** Referência (1RM médio das 2 primeiras semanas) por exercício, pelo nome comparável */
  referencias: Map<string, number>;
  nivel: NivelForca;
  /** Últimas 2 leituras suavizadas (anterior, última) quando há alerta */
  queda: number | null;
}

export function calcularIndiceForca(registros: RegistroForca[]): IndiceForca {
  // Um registro por exercício por semana: vale o de data mais recente na semana
  const porSemana = new Map<string, Map<string, RegistroForca>>();
  for (const r of [...registros].sort((a, b) => a.data.localeCompare(b.data))) {
    const seg = segundaDaSemana(r.data);
    if (!porSemana.has(seg)) porSemana.set(seg, new Map());
    porSemana.get(seg)!.set(chaveExercicio(r.exercicio), r);
  }
  const segundas = [...porSemana.keys()].sort();

  // Referência: média do 1RM das 2 primeiras semanas com 1RM de cada exercício
  const valoresIniciais = new Map<string, number[]>();
  for (const seg of segundas) {
    for (const [chave, r] of porSemana.get(seg)!) {
      const e = umRmEpley(r.carga_kg, r.reps);
      if (e === null) continue;
      const l = valoresIniciais.get(chave) ?? [];
      if (l.length < SEMANAS_REFERENCIA) valoresIniciais.set(chave, [...l, e]);
    }
  }
  const referencias = new Map([...valoresIniciais].map(([k, l]) => [k, l.reduce((a, b) => a + b, 0) / l.length]));

  const semanas: SemanaForca[] = [];
  let anterior: number | null = null;
  for (const seg of segundas) {
    const exercicios: ExercicioSemana[] = [...porSemana.get(seg)!].map(([chave, r]) => {
      const e1rm = umRmEpley(r.carga_kg, r.reps);
      const ref = referencias.get(chave);
      return { exercicio: r.exercicio, registro: r, e1rm, variacao: e1rm !== null && ref ? e1rm / ref - 1 : null };
    });
    const variacoes = exercicios.map((e) => e.variacao).filter((v): v is number => v !== null);
    const indice = variacoes.length ? variacoes.reduce((a, b) => a + b, 0) / variacoes.length : null;
    // Suavização entre leituras seguidas com índice (semanas sem registro não quebram a sequência)
    const suavizado: number | null = indice === null ? null : anterior === null ? indice : (indice + anterior) / 2;
    if (indice !== null) anterior = indice;
    semanas.push({ segunda: seg, exercicios, indice, suavizado });
  }

  const leituras = semanas.map((s) => s.suavizado).filter((v): v is number => v !== null);
  const [a, b] = leituras.slice(-2);
  let nivel: NivelForca = null;
  if (leituras.length >= 2) {
    if (a <= QUEDA_ALERTA + 1e-9 && b <= QUEDA_ALERTA + 1e-9) nivel = 'alerta';
    else if (a <= QUEDA_ATENCAO + 1e-9 && b <= QUEDA_ATENCAO + 1e-9) nivel = 'atencao';
  }
  return { semanas, referencias, nivel, queda: nivel ? b : null };
}

/** Último registro de cada exercício, para pré-preencher o formulário da semana. */
export function ultimoDoExercicio(registros: RegistroForca[], exercicio: string, antesDe?: string): RegistroForca | null {
  const chave = chaveExercicio(exercicio);
  const l = registros.filter((r) => chaveExercicio(r.exercicio) === chave && (!antesDe || r.data < antesDe)).sort((x, y) => x.data.localeCompare(y.data));
  return l.length ? l[l.length - 1] : null;
}
