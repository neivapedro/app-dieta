import type { Sexo } from './tipos';

// ---------------------------------------------------------------------------
// Banco de alimentos (valores por 100 g)
// ---------------------------------------------------------------------------

export interface Porcao {
  nome: string;
  g: number;
}

export interface Alimento {
  id: string;
  nome: string;
  grupo: string;
  prot: number;
  carb: number;
  gord: number;
  fibra: number;
  /** Proteína de origem animal (carnes, peixes, ovos, leite e derivados, whey) */
  animal: boolean;
  porcoes: Porcao[];
  fonte: string;
  busca: string;
}

/** Linha compacta do alimentos.json: [id, nome, grupo, prot, carb, gord, fibra, animal, porcoes, fonte, apelidos?] */
export type LinhaAlimento = [string, string, string, number, number, number, number, number, [string, number][], string, string?];

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

export function lerAlimentos(linhas: LinhaAlimento[]): Alimento[] {
  return linhas.map(([id, nome, grupo, prot, carb, gord, fibra, animal, porcoes, fonte, apelidos]) => ({
    id,
    nome,
    grupo,
    prot,
    carb,
    gord,
    fibra,
    animal: animal === 1,
    porcoes: porcoes.map(([n, g]) => ({ nome: n, g })),
    fonte,
    busca: normalizar(`${nome} ${apelidos ?? ''}`),
  }));
}

/** Busca por palavras em qualquer ordem, sem acento. Alimentos já usados no plano vêm primeiro. */
export function buscarAlimentos(lista: Alimento[], termo: string, usados: Set<string> = new Set(), limite = 60): Alimento[] {
  const palavras = normalizar(termo).split(' ').filter(Boolean);
  const achados = palavras.length ? lista.filter((a) => palavras.every((p) => a.busca.includes(p))) : lista.filter((a) => usados.has(a.id));
  const primeira = palavras[0] ?? '';
  const nota = (a: Alimento) => (usados.has(a.id) ? 0 : 2) + (a.busca.startsWith(primeira) ? 0 : 1);
  return achados.sort((a, b) => nota(a) - nota(b) || a.nome.length - b.nome.length || a.nome.localeCompare(b.nome)).slice(0, limite);
}

// ---------------------------------------------------------------------------
// Plano alimentar
// ---------------------------------------------------------------------------

export interface ItemRefeicao {
  alimento_id: string;
  quantidade: number;
  /** 'g' ou o nome de uma porção do alimento (fatia, unidade, dose…) */
  unidade: string;
}

export interface Refeicao {
  id: string;
  nome: string;
  horario: string | null;
  itens: ItemRefeicao[];
}

export interface Atividade {
  nome: string;
  kcal: number;
  vezes_semana: number;
}

export interface ConfigDieta {
  /** Multiplicador da TMB para o dia a dia, sem contar o exercício */
  fator_atividade: number;
  atividades: Atividade[];
  /** Déficit (negativo) ou superávit (positivo) em kcal por dia */
  ajuste_kcal: number;
  /** Proteína animal em g por kg de massa magra */
  ptn_gkg: number;
  /** Gordura em g por kg de peso */
  gord_gkg: number;
}

export interface PlanoDieta {
  config: ConfigDieta;
  refeicoes: Refeicao[];
}

export const FATORES_ATIVIDADE = [
  { valor: 1.2, rotulo: 'Sentado', detalhe: 'trabalho sentado, pouca caminhada' },
  { valor: 1.3, rotulo: 'Em pé', detalhe: 'em pé ou andando parte do dia' },
  { valor: 1.45, rotulo: 'Braçal', detalhe: 'trabalho físico o dia todo' },
];

export function configPadrao(): ConfigDieta {
  return { fator_atividade: 1.2, atividades: [], ajuste_kcal: -300, ptn_gkg: 2, gord_gkg: 1 };
}

export function novoId(): string {
  return crypto.randomUUID();
}

export function planoPadrao(): PlanoDieta {
  const nomes = ['Refeição 1', 'Refeição 2', 'Refeição 3', 'Refeição 4', 'Refeição 5', 'Pós-treino'];
  return { config: configPadrao(), refeicoes: nomes.map((nome) => ({ id: novoId(), nome, horario: null, itens: [] })) };
}

// ---------------------------------------------------------------------------
// Gasto calórico
// ---------------------------------------------------------------------------

export function idade(nascimento: string | null | undefined, hoje: string): number | null {
  if (!nascimento) return null;
  const [an, mn, dn] = nascimento.split('-').map(Number);
  const [ah, mh, dh] = hoje.split('-').map(Number);
  return ah - an - (mh < mn || (mh === mn && dh < dn) ? 1 : 0);
}

/** Katch-McArdle: usa só a massa magra (a do app vem da fórmula da Gorgonoidiana). */
export function tmbKatch(massaMagra: number): number {
  return 370 + 21.6 * massaMagra;
}

/** Mifflin-St Jeor: referência para conferir a Katch-McArdle. */
export function tmbMifflin(sexo: Sexo, peso: number, altura: number, anos: number): number {
  return 10 * peso + 6.25 * altura - 5 * anos + (sexo === 'Feminino' ? -161 : 5);
}

/** Harris-Benedict como nas planilhas (Dieta: masculino · Gorgonoidiana: feminino). */
export function tmbHarris(sexo: Sexo, peso: number, altura: number, anos: number): number {
  return sexo === 'Feminino' ? 665 + 9.6 * peso + 1.8 * altura - 4.7 * anos : 66.47 + 13.75 * peso + 5 * altura - 6.8 * anos;
}

/** Média diária do exercício da semana: Σ kcal × vezes ÷ 7 */
export function exercicioMedioDia(atividades: Atividade[]): number {
  return atividades.reduce((s, a) => s + (a.kcal || 0) * (a.vezes_semana || 0), 0) / 7;
}

export interface Corpo {
  peso_kg: number;
  massa_magra_kg: number;
}

export interface Metas {
  tmb: number;
  dia_a_dia: number;
  exercicio: number;
  gasto_total: number;
  meta_kcal: number;
  ptn_animal_g: number;
  gord_g: number;
}

export function calcularMetas(config: ConfigDieta, corpo: Corpo): Metas {
  const tmb = tmbKatch(corpo.massa_magra_kg);
  const dia_a_dia = tmb * config.fator_atividade;
  const exercicio = exercicioMedioDia(config.atividades);
  const gasto_total = dia_a_dia + exercicio;
  return {
    tmb,
    dia_a_dia,
    exercicio,
    gasto_total,
    meta_kcal: gasto_total + config.ajuste_kcal,
    ptn_animal_g: config.ptn_gkg * corpo.massa_magra_kg,
    gord_g: config.gord_gkg * corpo.peso_kg,
  };
}

// ---------------------------------------------------------------------------
// Macros do plano
// ---------------------------------------------------------------------------

export interface Macros {
  ptn_animal: number;
  ptn_vegetal: number;
  carb: number;
  gord: number;
  kcal: number;
}

export const ZERO: Macros = { ptn_animal: 0, ptn_vegetal: 0, carb: 0, gord: 0, kcal: 0 };

/** kcal sempre pelos macros (4/4/9), como na planilha de dieta */
export function kcalDe(m: Omit<Macros, 'kcal'>): number {
  return (m.ptn_animal + m.ptn_vegetal + m.carb) * 4 + m.gord * 9;
}

export function gramasDoItem(item: ItemRefeicao, alimento: Alimento | undefined): number {
  if (item.unidade === 'g') return item.quantidade;
  const p = alimento?.porcoes.find((x) => x.nome === item.unidade);
  return p ? item.quantidade * p.g : item.quantidade;
}

export function macrosDoItem(item: ItemRefeicao, alimento: Alimento | undefined): Macros {
  if (!alimento || !(item.quantidade > 0)) return ZERO;
  const f = gramasDoItem(item, alimento) / 100;
  const prot = alimento.prot * f;
  const m = { ptn_animal: alimento.animal ? prot : 0, ptn_vegetal: alimento.animal ? 0 : prot, carb: alimento.carb * f, gord: alimento.gord * f };
  return { ...m, kcal: kcalDe(m) };
}

export function somar(lista: Macros[]): Macros {
  return lista.reduce(
    (s, m) => ({
      ptn_animal: s.ptn_animal + m.ptn_animal,
      ptn_vegetal: s.ptn_vegetal + m.ptn_vegetal,
      carb: s.carb + m.carb,
      gord: s.gord + m.gord,
      kcal: s.kcal + m.kcal,
    }),
    ZERO,
  );
}

export function macrosDaRefeicao(r: Refeicao, mapa: Map<string, Alimento>): Macros {
  return somar(r.itens.map((i) => macrosDoItem(i, mapa.get(i.alimento_id))));
}

export interface Saldo {
  meta: { ptn_animal: number; carb: number; gord: number; kcal: number };
  plano: Macros;
  /** meta − plano (positivo = ainda falta) */
  falta: { ptn_animal: number; carb: number; gord: number; kcal: number };
}

/**
 * Proteína animal e gordura têm meta fixa em g/kg. O carboidrato fecha a conta:
 * o que sobra da meta de kcal depois delas e da proteína vegetal que já está no plano.
 */
export function calcularSaldo(metas: Metas, plano: Macros): Saldo {
  const carb = (metas.meta_kcal - metas.ptn_animal_g * 4 - metas.gord_g * 9 - plano.ptn_vegetal * 4) / 4;
  const meta = { ptn_animal: metas.ptn_animal_g, carb, gord: metas.gord_g, kcal: metas.meta_kcal };
  return {
    meta,
    plano,
    falta: {
      ptn_animal: meta.ptn_animal - plano.ptn_animal,
      carb: meta.carb - plano.carb,
      gord: meta.gord - plano.gord,
      kcal: meta.kcal - plano.kcal,
    },
  };
}
