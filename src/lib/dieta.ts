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
  /** Versão crua de algo que se pesa pronto: fora da busca, mas ainda lida em planos antigos */
  oculto: boolean;
}

/** Linha compacta do alimentos.json: [id, nome, grupo, prot, carb, gord, fibra, animal, porcoes, fonte, apelidos, oculto] */
export type LinhaAlimento = [string, string, string, number, number, number, number, number, [string, number][], string, string, number];

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

export function lerAlimentos(linhas: LinhaAlimento[]): Alimento[] {
  return linhas.map(([id, nome, grupo, prot, carb, gord, fibra, animal, porcoes, fonte, apelidos, oculto]) => ({
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
    busca: normalizar(`${nome} ${apelidos}`),
    oculto: oculto === 1,
  }));
}

/**
 * Busca por palavras em qualquer ordem, sem acento. Alimentos já usados no plano vêm primeiro.
 * Versões cruas (ocultas) não aparecem: o alimento é sempre pesado pronto.
 */
export function buscarAlimentos(lista: Alimento[], termo: string, usados: Set<string> = new Set(), limite = 60): Alimento[] {
  const palavras = normalizar(termo).split(' ').filter(Boolean);
  const achados = palavras.length
    ? lista.filter((a) => !a.oculto && palavras.every((p) => a.busca.includes(p)))
    : lista.filter((a) => usados.has(a.id));
  const primeira = palavras[0] ?? '';
  // Ordem: já usados no plano → alimentos do dia a dia → começa com a palavra → pronto antes do cru → nome curto
  const nota = (a: Alimento) => {
    const pop = POPULARES.indexOf(a.id);
    return (usados.has(a.id) ? 0 : 1000) + (pop >= 0 ? pop : 500) + (a.busca.startsWith(primeira) ? 0 : 200) + (/\bcrua?s?\b/.test(a.busca) ? 100 : 0);
  };
  return achados.sort((a, b) => nota(a) - nota(b) || a.nome.length - b.nome.length || a.nome.localeCompare(b.nome)).slice(0, limite);
}

/** Alimentos mais comuns no dia a dia, do mais ao menos comum: sobem na busca */
export const POPULARES = [
  't3', 't1', 't561', 't567', 't410', 't408', 'x53', 't377', 'x49', 't326', 't370', 't346', 't358', 't383', 't488', 't490', 'x60', 't486',
  'x25', 't317', 't318', 'x27', 't182', 't179', 't214', 't222', 't226', 't231', 't88', 'x63', 't91', 't129', 'x19', 'x20', 't53', 'x15',
  't52', 't463', 't468', 'x30', 't448', 't449', 'x01', 'x02', 'x37', 't7', 't260', 'x48', 't577', 'x65', 't533', 'x21', 't413', 'x54',
  't432', 't435', 't423', 'x36', 'x35',
];

const UNIDADES_DE_COLHER = /^(colher|concha|escumadeira|pegador)/;

/**
 * Quantidade com que o alimento entra no plano. Como tudo é pesado pronto, o que
 * se serve com colher/concha (arroz, feijão, macarrão, carne moída) entra em gramas;
 * o que tem unidade natural (ovo, fatia, dose, pote) entra em 1 unidade.
 */
export function itemPadrao(a: Alimento): ItemRefeicao {
  const p = a.porcoes[0];
  if (p && !UNIDADES_DE_COLHER.test(p.nome)) return { alimento_id: a.id, quantidade: 1, unidade: p.nome };
  // Gordura, açúcar, mel, pasta de amendoim: denso e servido em colherinha (≤ 20 g) entra em 1 colher, não 100 g
  const kcal100 = a.prot * 4 + a.carb * 4 + a.gord * 9;
  if (p && p.g <= 20 && kcal100 >= 300) return { alimento_id: a.id, quantidade: 1, unidade: p.nome };
  return { alimento_id: a.id, quantidade: 100, unidade: 'g' };
}

/** Troca o alimento de um item mantendo o peso que você já tinha posto. */
export function trocarAlimento(item: ItemRefeicao, antigo: Alimento | undefined, novo: Alimento): ItemRefeicao {
  if (item.unidade !== 'g' && novo.porcoes.some((p) => p.nome === item.unidade)) return { ...item, alimento_id: novo.id };
  return { alimento_id: novo.id, quantidade: Math.round(gramasDoItem(item, antigo)), unidade: 'g' };
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
  /** Exercício da meta ajustado pelo que a aba Treino registrou */
  usar_aderencia?: boolean;
  /** Fase pós-remédio: última medição em que a sugestão de degrau do déficit foi aplicada ou dispensada */
  pos_degrau_medicao?: string | null;
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

export function planoPadrao(comTreino = true): PlanoDieta {
  const nomes = ['Refeição 1', 'Refeição 2', 'Refeição 3', 'Refeição 4', 'Refeição 5', comTreino ? 'Pós-treino' : 'Refeição 6'];
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

/** Fração dos treinos e cardios feitos nas últimas semanas (aba Treino) */
export interface Aderencia {
  treino: number;
  cardio: number;
  dias: number;
}

const FORCA = /muscula|força|forca|treino|academia|peso/i;

/** Exercício médio por dia considerando o quanto foi feito de verdade */
export function exercicioReal(atividades: Atividade[], ad: Aderencia): number {
  return atividades.reduce((s, a) => s + (a.kcal || 0) * (a.vezes_semana || 0) * (FORCA.test(a.nome) ? ad.treino : ad.cardio), 0) / 7;
}

export interface Metas {
  tmb: number;
  dia_a_dia: number;
  /** Exercício usado na meta (planejado ou ajustado pela aderência) */
  exercicio: number;
  exercicio_planejado: number;
  /** true quando o exercício da meta foi ajustado pelo que o Treino registrou */
  pela_aderencia: boolean;
  gasto_total: number;
  meta_kcal: number;
  ptn_animal_g: number;
  gord_g: number;
}

export function calcularMetas(config: ConfigDieta, corpo: Corpo, aderencia?: Aderencia | null): Metas {
  const tmb = tmbKatch(corpo.massa_magra_kg);
  const dia_a_dia = tmb * config.fator_atividade;
  const exercicio_planejado = exercicioMedioDia(config.atividades);
  const pela_aderencia = !!(config.usar_aderencia && aderencia);
  const exercicio = pela_aderencia ? exercicioReal(config.atividades, aderencia!) : exercicio_planejado;
  const gasto_total = dia_a_dia + exercicio;
  return {
    tmb,
    dia_a_dia,
    exercicio,
    exercicio_planejado,
    pela_aderencia,
    gasto_total,
    meta_kcal: gasto_total + config.ajuste_kcal,
    ptn_animal_g: Math.max(0, config.ptn_gkg) * corpo.massa_magra_kg,
    gord_g: Math.max(0, config.gord_gkg) * corpo.peso_kg,
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
  fibra: number;
  kcal: number;
}

export const ZERO: Macros = { ptn_animal: 0, ptn_vegetal: 0, carb: 0, gord: 0, fibra: 0, kcal: 0 };

/** kcal sempre pelos macros (4/4/9), como na planilha de dieta (fibra já está no carboidrato) */
export function kcalDe(m: Pick<Macros, 'ptn_animal' | 'ptn_vegetal' | 'carb' | 'gord'>): number {
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
  return { ...m, fibra: alimento.fibra * f, kcal: kcalDe(m) };
}

export function somar(lista: Macros[]): Macros {
  return lista.reduce(
    (s, m) => ({
      ptn_animal: s.ptn_animal + m.ptn_animal,
      ptn_vegetal: s.ptn_vegetal + m.ptn_vegetal,
      carb: s.carb + m.carb,
      gord: s.gord + m.gord,
      fibra: s.fibra + m.fibra,
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

/** Referência de fibra: 14 g a cada 1.000 kcal */
export function metaFibra(kcal: number): number {
  return (14 * kcal) / 1000;
}

/** Proteína por refeição que o músculo aproveita bem: ~0,4 g por kg de massa magra */
export function alvoProteinaRefeicao(massaMagra: number): number {
  return 0.4 * massaMagra;
}

// ---------------------------------------------------------------------------
// Resumo do plano no Início
// ---------------------------------------------------------------------------

function minutosDe(h: string | null): number | null {
  if (!h || !/^\d{1,2}:\d{2}/.test(h)) return null;
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
}

/**
 * Próxima refeição pelo horário (até 30 min depois de passar). Depois da
 * última com horário, vem a refeição sem horário que está depois dela na lista
 * (a ceia). Sem nenhum horário, a primeira com alimentos.
 */
export function proximaRefeicao(refeicoes: Refeicao[], agoraMin: number): Refeicao | null {
  const comItens = refeicoes.filter((r) => r.itens.length);
  if (!comItens.length) return null;
  const comHora = comItens.filter((r) => minutosDe(r.horario) !== null).sort((a, b) => minutosDe(a.horario)! - minutosDe(b.horario)!);
  if (!comHora.length) return comItens[0];
  const proxima = comHora.find((r) => minutosDe(r.horario)! >= agoraMin - 30);
  if (proxima) return proxima;
  // Já passou de todas com horário: a ceia é a sem horário depois da última com horário na lista
  const ultima = comHora[comHora.length - 1];
  const depois = refeicoes.slice(refeicoes.indexOf(ultima) + 1);
  return depois.find((r) => r.itens.length && minutosDe(r.horario) === null) ?? null;
}

/** Plural do 1º termo da porção: unidade → unidades, colher de sopa → colheres de sopa, porção → porções. */
export function pluralPorcao(nome: string): string {
  const [primeiro, ...resto] = nome.split(' ');
  if (!primeiro || /^\d/.test(primeiro)) return nome;
  const p = primeiro.endsWith('ão')
    ? `${primeiro.slice(0, -2)}ões`
    : /[rz]$/.test(primeiro)
      ? `${primeiro}es`
      : /[aeiouáéíóúâêô]$/.test(primeiro)
        ? `${primeiro}s`
        : primeiro;
  return [p, ...resto].join(' ');
}

function qtd(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** "Ovo, de galinha, inteiro, cozido · 2 unidades" ou "Arroz, tipo 1, cozido · 150 g": a unidade do plano, nome completo. */
export function textoItemPlano(item: ItemRefeicao, alimento: Alimento | undefined): string {
  const nome = alimento?.nome ?? 'Alimento';
  if (item.unidade === 'g' || !alimento?.porcoes.some((p) => p.nome === item.unidade)) return `${nome} · ${qtd(Math.round(gramasDoItem(item, alimento)))} g`;
  return `${nome} · ${qtd(item.quantidade)} ${item.quantidade > 1 ? pluralPorcao(item.unidade) : item.unidade}`;
}

export interface ResumoPlano {
  /** Plano bate com a meta (kcal e macros dentro da tolerância) */
  fechado: boolean;
  kcal_plano: number;
  kcal_meta: number;
  /** Macros que ainda faltam (g, positivos) */
  faltam: { nome: string; g: number }[];
  /** Macros que passaram da meta (g, positivos) */
  passam: { nome: string; g: number }[];
}

/** Tolerância da coluna "Falta" da Dieta: 1 g nos macros, 15 kcal, ou 2% da meta. */
function dentro(valor: number, meta: number, tolerancia: number): boolean {
  return Math.abs(valor) <= Math.max(tolerancia, Math.abs(meta) * 0.02);
}

/** "Plano fechado ✓" ou quanto falta de cada macro, com as mesmas tolerâncias da Dieta. */
export function resumoPlano(saldo: Saldo): ResumoPlano {
  const macros: [string, number, number][] = [
    ['Ptn A', saldo.falta.ptn_animal, saldo.meta.ptn_animal],
    ['Carb', saldo.falta.carb, saldo.meta.carb],
    ['Gord', saldo.falta.gord, saldo.meta.gord],
  ];
  const faltam = macros.filter(([, f, m]) => f > 0 && !dentro(f, m, 1)).map(([nome, g]) => ({ nome, g }));
  const passam = macros.filter(([, f, m]) => f < 0 && !dentro(f, m, 1)).map(([nome, g]) => ({ nome, g: -g }));
  return {
    fechado: !faltam.length && !passam.length && dentro(saldo.falta.kcal, saldo.meta.kcal, 15),
    kcal_plano: saldo.plano.kcal,
    kcal_meta: saldo.meta.kcal,
    faltam,
    passam,
  };
}
