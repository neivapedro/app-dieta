// Frases de resumo ("Seu resumo", no Início e na Análise): fatos curtos calculados
// só dos registros do usuário, com a origem de cada número. Regras:
// - variações abaixo do erro da fita/balança (MDC, gordura.ts) são "estável";
// - medições atípicas ficam de fora; dias de hoje ainda em aberto não puxam para baixo;
// - associações só com dados suficientes (correlacoes.ts) e sempre ditas como associação;
// - nunca fala de dose a tomar, nunca sugere déficit nem mexe na meta de kcal, sem afirmações médicas.
// A ordem é determinística: relevância (maior primeiro) e, no empate, o id.
import type { PontoPeso } from './analise';
import { NOITES_MINIMAS, SONO_MINIMO_H } from './bemestar';
import { insightsCorrelacoes, type AnaliseCorrelacao, type AnaliseGrupos, type DadosCorrelacao } from './correlacoes';
import { diferencaDias, formatarData, somarDias } from './datas';
import { num, sinal } from './formato';
import { MDC, type Composicao } from './gordura';
import type { MetasProjeto, RegistroDiario, Sexo, TreinoDia } from './tipos';
import { formatarKm, formatarTempo, listarCorridas } from './treino';

export type CategoriaInsight = 'corpo' | 'habito' | 'remedio' | 'treino';
export type TomInsight = 'bom' | 'neutro' | 'atencao';

export interface Insight {
  /** Estável entre aberturas (a mesma regra dá o mesmo id) */
  id: string;
  categoria: CategoriaInsight;
  tom: TomInsight;
  /** A frase curta do cartão */
  frase: string;
  /** "De onde vem": período e dados usados */
  origem: string;
  /** Rota com a aba (ex.: "/analise?aba=corpo"); null sem destino */
  link: string | null;
  /** Ordena os cartões (0 a 100) */
  relevancia: number;
}

export interface EntradaInsights {
  hoje: string;
  /** Medições com a composição (useCalculos().composicoes); atípicas são ignoradas */
  composicoes: Composicao[];
  /** Pesos do Diário e das medições (useCalculos().serie) */
  serie: PontoPeso[];
  diario: RegistroDiario[];
  /** null = conta sem a aba Treino (nenhuma frase de treino) */
  treinos: TreinoDia[] | null;
  /** Meta de bebidas do dia, em litros */
  metaAgua: (data: string) => number;
  metas?: MetasProjeto | null;
  sexo?: Sexo;
  /** Aplicações registradas: data e atraso em relação ao previsto (resumo.linhas) */
  aplicacoes?: { data: string; atraso_dias: number }[];
  /** Semanas e dias das correlações (dadosCorrelacao); omitido = sem frases de associação */
  correlacoes?: DadosCorrelacao | null;
}

/** Quantos cartões aparecem no resumo */
export const MAX_INSIGHTS = 5;
/** Mínimo de dias anotados para comparar uma semana com outra (náusea) */
export const MIN_DIAS_SEMANA = 4;
/** Sequências (água, plano, treino) só viram frase a partir daqui */
export const MIN_SEQUENCIA = 3;
/** Pace: diferença mínima (s/km) para falar em melhora ou piora */
export const MIN_DIF_PACE_S = 5;
/** Náusea: diferença mínima de média (0 a 3) entre duas semanas */
export const MIN_DIF_NAUSEA = 0.3;

const LINK = {
  corpo: '/analise?aba=corpo',
  habitos: '/analise?aba=habitos',
  remedio: '/analise?aba=remedio',
  treino: '/treino',
} as const;

const temNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const media = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const curta = (d: string) => formatarData(d).slice(0, 5);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** Passou do erro da medida, comparando o número como aparece na tela (1 casa) */
const passou = (v: number, mdc: number) => Math.round(Math.abs(v) * 10) / 10 >= mdc - 1e-9;

function normais(e: EntradaInsights): Composicao[] {
  return e.composicoes.filter((c) => !c.atipica && c.data <= e.hoje).sort((a, b) => a.data.localeCompare(b.data));
}

/** Sequência de dias seguidos que cumprem a regra, terminando hoje (ou ontem, se hoje ainda não cumpriu). */
export function sequenciaAtual(hoje: string, ok: (data: string) => boolean, limite = 400): { dias: number; ate: string | null } {
  let d = ok(hoje) ? hoje : somarDias(hoje, -1);
  const ate = ok(d) ? d : null;
  let n = 0;
  while (n < limite && ok(d)) {
    n++;
    d = somarDias(d, -1);
  }
  return { dias: n, ate };
}

// ---------- Corpo ----------

/** Medição de referência para a janela: a mais perto de `alvo` dias antes, entre `min` e `max`. */
function referencia(lista: Composicao[], ultima: Composicao, alvo: number, min: number, max: number): Composicao | null {
  let melhor: Composicao | null = null;
  let dist = Infinity;
  for (const c of lista) {
    const dias = diferencaDias(c.data, ultima.data);
    if (dias < min || dias > max) continue;
    const d = Math.abs(dias - alvo);
    // Empate: a mais antiga (ordem da lista)
    if (d < dist) {
      dist = d;
      melhor = c;
    }
  }
  return melhor;
}

function insightsCintura(e: EntradaInsights): Insight[] {
  const lista = normais(e);
  const u = lista.at(-1);
  // Medição velha (mais de 3 semanas) não fala do "agora"
  if (!u || lista.length < 2 || diferencaDias(u.data, e.hoje) > 21) return [];
  const saida: Insight[] = [];
  const ref = referencia(lista, u, 28, 21, 35);
  if (ref) {
    const d = u.cintura_cm - ref.cintura_cm;
    const semanas = Math.round(diferencaDias(ref.data, u.data) / 7);
    const origem = `Medições de ${curta(ref.data)} (${num(ref.cintura_cm, 1)} cm) e ${curta(u.data)} (${num(u.cintura_cm, 1)} cm), com fita. Variações abaixo de ${num(MDC.cintura_cm, 1)} cm ficam dentro do erro da fita. Medições atípicas ficam de fora.`;
    if (passou(d, MDC.cintura_cm)) {
      saida.push({
        id: 'cintura-janela',
        categoria: 'corpo',
        tom: d < 0 ? 'bom' : 'atencao',
        frase: `Sua cintura ${d < 0 ? 'caiu' : 'subiu'} ${num(Math.abs(d), 1)} cm nas últimas ${semanas} semanas`,
        origem,
        link: LINK.corpo,
        relevancia: d < 0 ? 80 + Math.min(Math.abs(d) / MDC.cintura_cm, 3) * 3 : 86,
      });
    } else {
      saida.push({
        id: 'cintura-janela',
        categoria: 'corpo',
        tom: 'neutro',
        frase: `Cintura estável nas últimas ${semanas} semanas`,
        origem: `${origem} Variação: ${sinal(d, 1, ' cm')}.`,
        link: LINK.corpo,
        relevancia: 35,
      });
    }
  }
  // Desde o início: só quando a história é bem mais longa que a janela
  const p = lista[0];
  if (p !== u && diferencaDias(p.data, u.data) >= 42) {
    const d = u.cintura_cm - p.cintura_cm;
    if (passou(d, MDC.cintura_cm))
      saida.push({
        id: 'cintura-inicio',
        categoria: 'corpo',
        tom: d < 0 ? 'bom' : 'atencao',
        frase: `Sua cintura ${d < 0 ? 'caiu' : 'subiu'} ${num(Math.abs(d), 1)} cm desde a primeira medição`,
        origem: `Primeira medição normal (${formatarData(p.data)}, ${num(p.cintura_cm, 1)} cm) contra a mais recente (${formatarData(u.data)}, ${num(u.cintura_cm, 1)} cm). Medições atípicas ficam de fora.`,
        link: LINK.corpo,
        relevancia: d < 0 ? 66 : 74,
      });
  }
  return saida;
}

function insightPeso(e: EntradaInsights): Insight | null {
  const pesos = e.serie.filter((p) => !p.atipica && temNumero(p.peso_kg) && p.data <= e.hoje);
  const recentes = pesos.filter((p) => p.data >= somarDias(e.hoje, -6));
  const antes = pesos.filter((p) => p.data >= somarDias(e.hoje, -34) && p.data <= somarDias(e.hoje, -28));
  if (!recentes.length || !antes.length) return null;
  const d = media(recentes.map((p) => p.peso_kg))! - media(antes.map((p) => p.peso_kg))!;
  const origem =
    `Média das pesagens de ${curta(somarDias(e.hoje, -6))} a ${curta(e.hoje)} (${plural(recentes.length, 'pesagem', 'pesagens')}) ` +
    `contra as de ${curta(somarDias(e.hoje, -34))} a ${curta(somarDias(e.hoje, -28))} (${antes.length}). ` +
    `Abaixo de ${num(MDC.peso_kg, 1)} kg conta como estável (variação do dia a dia). Medições atípicas ficam de fora.`;
  if (!passou(d, MDC.peso_kg))
    return { id: 'peso-4sem', categoria: 'corpo', tom: 'neutro', frase: 'Peso estável nas últimas 4 semanas', origem: `${origem} Variação: ${sinal(d, 1, ' kg')}.`, link: LINK.corpo, relevancia: 30 };
  return {
    id: 'peso-4sem',
    categoria: 'corpo',
    tom: d < 0 ? 'bom' : 'atencao',
    frase: `Seu peso médio ${d < 0 ? 'caiu' : 'subiu'} ${num(Math.abs(d), 1)} kg em 4 semanas`,
    origem,
    link: LINK.corpo,
    relevancia: d < 0 ? 64 : 76,
  };
}

function insightMagra(e: EntradaInsights): Insight | null {
  const ultimas = normais(e)
    .filter((c) => temNumero(c.massa_magra_kg))
    .slice(-4);
  if (ultimas.length < 4) return null;
  const a = ultimas[0];
  const b = ultimas[3];
  if (diferencaDias(b.data, e.hoje) > 21) return null;
  const d = b.massa_magra_kg! - a.massa_magra_kg!;
  const origem = `Medições de ${curta(a.data)} a ${curta(b.data)} (fita, US Navy): ${num(a.massa_magra_kg, 1)} → ${num(b.massa_magra_kg, 1)} kg. Variações abaixo de ${num(MDC.massa_magra_kg, 1)} kg ficam dentro do erro da fita. Medições atípicas ficam de fora.`;
  if (passou(d, MDC.massa_magra_kg))
    return d < 0
      ? { id: 'magra-4med', categoria: 'corpo', tom: 'atencao', frase: `Massa magra caiu ${num(-d, 1)} kg nas últimas 4 medições`, origem, link: LINK.corpo, relevancia: 84 }
      : { id: 'magra-4med', categoria: 'corpo', tom: 'bom', frase: `Massa magra subiu ${num(d, 1)} kg nas últimas 4 medições`, origem, link: LINK.corpo, relevancia: 66 };
  return { id: 'magra-4med', categoria: 'corpo', tom: 'bom', frase: 'Massa magra estável nas últimas 4 medições', origem, link: LINK.corpo, relevancia: 60 };
}

function insightGorda(e: EntradaInsights): Insight | null {
  const lista = normais(e).filter((c) => temNumero(c.massa_gorda_kg));
  if (lista.length < 2) return null;
  const p = lista[0];
  const u = lista.at(-1)!;
  if (diferencaDias(p.data, u.data) < 28 || diferencaDias(u.data, e.hoje) > 21) return null;
  const d = u.massa_gorda_kg! - p.massa_gorda_kg!;
  if (!passou(d, MDC.massa_gorda_kg)) return null;
  return {
    id: 'gorda-inicio',
    categoria: 'corpo',
    tom: d < 0 ? 'bom' : 'atencao',
    frase: `Sua massa gorda ${d < 0 ? 'caiu' : 'subiu'} ${num(Math.abs(d), 1)} kg desde a primeira medição`,
    origem: `Estimativa pela fita (US Navy): ${formatarData(p.data)} ${num(p.massa_gorda_kg, 1)} kg → ${formatarData(u.data)} ${num(u.massa_gorda_kg, 1)} kg. Abaixo de ${num(MDC.massa_gorda_kg, 1)} kg fica dentro do erro da fita. Medições atípicas ficam de fora.`,
    link: LINK.corpo,
    relevancia: d < 0 ? 68 : 75,
  };
}

type ChaveMeta = 'cintura_cm' | 'quadril_cm' | 'bf' | 'peso_kg';
const NOMES_META: Record<ChaveMeta, [string, string, (n: number) => string]> = {
  cintura_cm: ['cintura', 'cm', (n) => `${num(n, 1)} cm`],
  quadril_cm: ['quadril', 'cm', (n) => `${num(n, 1)} cm`],
  bf: ['% de gordura', 'p.p.', (n) => `${num(n, 1)}%`],
  peso_kg: ['peso', 'kg', (n) => `${num(n, 1)} kg`],
};

function insightMeta(e: EntradaInsights): Insight | null {
  const m = e.metas;
  if (!m) return null;
  const lista = normais(e);
  if (lista.length < 2) return null;
  const p = lista[0];
  const u = lista.at(-1)!;
  const chaves: ChaveMeta[] = ['cintura_cm', ...(e.sexo === 'Feminino' ? (['quadril_cm'] as ChaveMeta[]) : []), 'bf', 'peso_kg'];
  let melhor: { k: ChaveMeta; fracao: number; falta: number; ini: number; atu: number; meta: number } | null = null;
  for (const k of chaves) {
    const meta = m[k];
    const ini = p[k];
    const atu = u[k];
    if (!temNumero(meta) || meta <= 0 || !temNumero(ini) || !temNumero(atu)) continue;
    const caminho = ini - meta;
    if (!(caminho > 0)) continue;
    const fracao = Math.min(Math.max((ini - atu) / caminho, 0), 1);
    const falta = Math.max(atu - meta, 0);
    // A primeira meta atingida (na ordem: medidas antes do peso) ou a mais adiantada
    if (!melhor || (falta === 0 && melhor.falta > 0) || (melhor.falta > 0 && fracao > melhor.fracao + 1e-9)) melhor = { k, fracao, falta, ini, atu, meta };
  }
  if (!melhor) return null;
  const [nome, , fmt] = NOMES_META[melhor.k];
  const origem = `Primeira medição normal (${formatarData(p.data)}, ${fmt(melhor.ini)}) até a mais recente (${formatarData(u.data)}, ${fmt(melhor.atu)}); meta ${fmt(melhor.meta)}.`;
  if (melhor.falta === 0)
    return { id: `meta-${melhor.k}`, categoria: 'corpo', tom: 'bom', frase: `Meta de ${nome} atingida: ${fmt(melhor.atu)}`, origem, link: LINK.corpo, relevancia: diferencaDias(u.data, e.hoje) <= 14 ? 88 : 56 };
  if (melhor.fracao < 0.25) return null;
  return {
    id: `meta-${melhor.k}`,
    categoria: 'corpo',
    tom: 'neutro',
    frase: `Você já percorreu ${num(melhor.fracao * 100, 0)}% do caminho até a meta de ${nome}`,
    origem: `${origem} Faltam ${fmt(melhor.falta).replace('%', ' p.p.')}.`,
    link: LINK.corpo,
    relevancia: 48,
  };
}

// ---------- Hábitos ----------

function porData(diario: RegistroDiario[]): Map<string, RegistroDiario> {
  return new Map(diario.map((r) => [r.data, r]));
}

function insightSono(e: EntradaInsights, regs: Map<string, RegistroDiario>): Insight | null {
  const de = somarDias(e.hoje, -6);
  const noites: number[] = [];
  for (let d = de; d <= e.hoje; d = somarDias(d, 1)) {
    const h = regs.get(d)?.sono_h;
    if (temNumero(h)) noites.push(h);
  }
  if (noites.length < NOITES_MINIMAS) return null;
  const bons = noites.filter((h) => h >= SONO_MINIMO_H).length;
  const fracao = bons / noites.length;
  const tom: TomInsight = fracao >= 0.7 ? 'bom' : fracao < 0.5 ? 'atencao' : 'neutro';
  return {
    id: 'sono-semana',
    categoria: 'habito',
    tom,
    frase:
      noites.length === 7
        ? `Você dormiu 7 h+ em ${bons} das últimas 7 noites`
        : `Você dormiu 7 h+ em ${bons} das ${noites.length} noites anotadas na última semana`,
    origem: `Sono anotado no Diário de ${curta(de)} a ${curta(e.hoje)} (${plural(noites.length, 'noite', 'noites')}); média ${num(media(noites), 1)} h. Conta noite de ${num(SONO_MINIMO_H, 0)} h ou mais.`,
    link: LINK.habitos,
    relevancia: tom === 'atencao' ? 72 : tom === 'bom' ? 62 : 45,
  };
}

const naMetaAgua = (r: RegistroDiario | undefined, meta: number) => !!r && temNumero(r.agua_l) && r.agua_l >= meta - 0.05;

function insightAgua(e: EntradaInsights, regs: Map<string, RegistroDiario>): Insight | null {
  const seq = sequenciaAtual(e.hoje, (d) => naMetaAgua(regs.get(d), e.metaAgua(d)));
  const origemMeta = 'A meta do dia é 2,0 L + 0,7 L por hora de treino e cardio.';
  if (seq.dias >= MIN_SEQUENCIA)
    return {
      id: 'agua-sequencia',
      categoria: 'habito',
      tom: 'bom',
      frase: `${seq.dias} dias seguidos batendo a meta de água`,
      origem: `Água anotada no Diário de ${curta(somarDias(seq.ate!, -(seq.dias - 1)))} a ${curta(seq.ate!)}. ${origemMeta}`,
      link: LINK.habitos,
      relevancia: Math.min(50 + seq.dias, 72),
    };
  // Sem sequência: a última semana fechada (hoje ainda está em aberto)
  const de = somarDias(e.hoje, -7);
  const ate = somarDias(e.hoje, -1);
  let anotados = 0;
  let naMeta = 0;
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const r = regs.get(d);
    if (!r || !temNumero(r.agua_l)) continue;
    anotados++;
    if (naMetaAgua(r, e.metaAgua(d))) naMeta++;
  }
  if (anotados < 3 || naMeta / anotados >= 0.5) return null;
  return {
    id: 'agua-semana',
    categoria: 'habito',
    tom: 'atencao',
    frase: `Água na meta em ${naMeta} de ${anotados} dias anotados na última semana`,
    origem: `Água anotada no Diário de ${curta(de)} a ${curta(ate)}. ${origemMeta}`,
    link: LINK.habitos,
    relevancia: 58,
  };
}

function insightDieta(e: EntradaInsights, regs: Map<string, RegistroDiario>): Insight | null {
  const seq = sequenciaAtual(e.hoje, (d) => regs.get(d)?.dieta_seguida === 'sim');
  if (seq.dias < MIN_SEQUENCIA) return null;
  return {
    id: 'dieta-sequencia',
    categoria: 'habito',
    tom: 'bom',
    frase: `${seq.dias} dias seguidos seguindo o plano alimentar`,
    origem: `Resposta “Segui o plano?” = sim no Diário, de ${curta(somarDias(seq.ate!, -(seq.dias - 1)))} a ${curta(seq.ate!)}.`,
    link: LINK.habitos,
    relevancia: Math.min(50 + seq.dias, 72),
  };
}

function insightDiario(e: EntradaInsights, regs: Map<string, RegistroDiario>): Insight | null {
  const seq = sequenciaAtual(e.hoje, (d) => regs.has(d));
  if (seq.dias < 7) return null;
  return {
    id: 'diario-sequencia',
    categoria: 'habito',
    tom: 'bom',
    frase: `${seq.dias} dias seguidos com registro no Diário`,
    origem: `Dias com algum campo do Diário preenchido, de ${curta(somarDias(seq.ate!, -(seq.dias - 1)))} a ${curta(seq.ate!)}.`,
    link: '/ciclo?aba=diario',
    relevancia: Math.min(40 + Math.floor(seq.dias / 2), 55),
  };
}

// ---------- Remédio ----------

function insightNauseaSemana(e: EntradaInsights, regs: Map<string, RegistroDiario>): Insight | null {
  const valores = (de: string, ate: string) => {
    const v: number[] = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      const n = regs.get(d)?.nausea;
      if (temNumero(n)) v.push(n);
    }
    return v;
  };
  const agora = valores(somarDias(e.hoje, -6), e.hoje);
  const antes = valores(somarDias(e.hoje, -13), somarDias(e.hoje, -7));
  if (agora.length < MIN_DIAS_SEMANA || antes.length < MIN_DIAS_SEMANA) return null;
  const a = media(agora)!;
  const b = media(antes)!;
  if (Math.abs(a - b) < MIN_DIF_NAUSEA - 1e-9 || num(a, 1) === num(b, 1)) return null;
  const menor = a < b;
  return {
    id: 'nausea-semana',
    categoria: 'remedio',
    tom: menor ? 'bom' : 'atencao',
    frase: `Náusea ${menor ? 'mais leve' : 'mais forte'} nesta semana: média ${num(a, 1)} de 3 (antes, ${num(b, 1)})`,
    origem: `Náusea anotada no Diário (0 a 3): ${curta(somarDias(e.hoje, -6))} a ${curta(e.hoje)} (${plural(agora.length, 'dia', 'dias')}) contra ${curta(somarDias(e.hoje, -13))} a ${curta(somarDias(e.hoje, -7))} (${plural(antes.length, 'dia', 'dias')}).`,
    link: LINK.remedio,
    relevancia: menor ? 58 : 64,
  };
}

function insightNauseaPico(e: EntradaInsights): Insight | null {
  const datas = (e.aplicacoes ?? []).map((a) => a.data).filter((d) => d <= e.hoje).sort();
  if (datas.length < 3) return null;
  const porDia: number[][] = Array.from({ length: 7 }, () => []);
  for (const r of e.diario) {
    if (!temNumero(r.nausea) || r.data > e.hoje || r.data < datas[0]) continue;
    let ultima = datas[0];
    for (const d of datas) if (d <= r.data) ultima = d;
    const k = diferencaDias(ultima, r.data);
    if (k >= 0 && k < 7) porDia[k].push(r.nausea);
  }
  let pico = -1;
  let maior = 0;
  porDia.forEach((v, k) => {
    const m = v.length >= 3 ? media(v)! : null;
    if (m !== null && m > maior + 1e-9) {
      maior = m;
      pico = k;
    }
  });
  if (pico < 0 || maior < 0.5) return null;
  return {
    id: 'nausea-pico',
    categoria: 'remedio',
    tom: 'neutro',
    frase: `Sua náusea costuma ser maior no D${pico} depois da aplicação (média ${num(maior, 1)} de 3)`,
    origem: `Náusea anotada no Diário desde a 1ª aplicação, agrupada pelos dias depois de cada aplicação (D0 = dia da aplicação); D${pico}: ${plural(porDia[pico].length, 'dia', 'dias')} anotados.`,
    link: LINK.remedio,
    relevancia: 40,
  };
}

function insightDosesNoDia(e: EntradaInsights): Insight | null {
  const l = (e.aplicacoes ?? []).filter((a) => a.data <= e.hoje);
  if (l.length < 4) return null;
  const noDia = l.filter((a) => a.atraso_dias === 0).length;
  // Só o fato positivo: atraso não vira cobrança no resumo
  if (noDia / l.length < 0.8) return null;
  return {
    id: 'doses-no-dia',
    categoria: 'remedio',
    tom: 'bom',
    frase: noDia === l.length ? `Todas as ${l.length} aplicações no dia previsto` : `${noDia} de ${l.length} aplicações no dia previsto`,
    origem: 'Datas das aplicações registradas contra a data prevista (aplicação anterior + intervalo).',
    link: '/ciclo',
    relevancia: 45,
  };
}

// ---------- Treino ----------

function insightsTreino(e: EntradaInsights): Insight[] {
  if (!e.treinos) return [];
  const saida: Insight[] = [];
  const corridas = listarCorridas(e.treinos).filter((c) => c.data <= e.hoje);
  const ultima = corridas.at(-1);
  // Recorde: a corrida mais recente (últimos 7 dias) contra as outras (2 ou mais)
  if (ultima && diferencaDias(ultima.data, e.hoje) <= 6) {
    const outras = corridas.filter((c) => c.data !== ultima.data);
    if (outras.length >= 2) {
      const melhorPace = Math.min(...outras.map((c) => Math.round(c.pace)));
      const maisLonga = Math.max(...outras.map((c) => c.km));
      const origem = `Corridas com distância e tempo anotados: ${plural(corridas.length, 'corrida', 'corridas')} até ${curta(ultima.data)}.`;
      if (Math.round(ultima.pace) < melhorPace)
        saida.push({
          id: 'corrida-recorde',
          categoria: 'treino',
          tom: 'bom',
          frase: `Sua corrida de ${curta(ultima.data)} foi a mais rápida até agora: ${formatarTempo(ultima.pace)}/km`,
          origem: `${origem} Recorde anterior: ${formatarTempo(melhorPace)}/km.`,
          link: LINK.treino,
          relevancia: 95,
        });
      else if (ultima.km > maisLonga + 1e-9)
        saida.push({
          id: 'corrida-recorde',
          categoria: 'treino',
          tom: 'bom',
          frase: `Sua corrida de ${curta(ultima.data)} foi a mais longa até agora: ${formatarKm(ultima.km)}`,
          origem: `${origem} A mais longa antes: ${formatarKm(maisLonga)}.`,
          link: LINK.treino,
          relevancia: 92,
        });
    }
  }
  // Pace médio (tempo total ÷ km) dos últimos 30 dias contra os 30 anteriores
  const janela = (de: string, ate: string) => corridas.filter((c) => c.data >= de && c.data <= ate);
  const agora = janela(somarDias(e.hoje, -29), e.hoje);
  const antes = janela(somarDias(e.hoje, -59), somarDias(e.hoje, -30));
  if (agora.length >= 2 && antes.length >= 2) {
    const pace = (l: typeof corridas) => l.reduce((s, c) => s + c.segundos, 0) / l.reduce((s, c) => s + c.km, 0);
    const pa = Math.round(pace(agora));
    const pb = Math.round(pace(antes));
    const d = pa - pb;
    if (Math.abs(d) >= MIN_DIF_PACE_S)
      saida.push({
        id: 'pace-mes',
        categoria: 'treino',
        tom: d < 0 ? 'bom' : 'neutro',
        frase: d < 0 ? `Seu pace médio melhorou ${-d} s/km nos últimos 30 dias` : `Seu pace médio ficou ${d} s/km mais lento nos últimos 30 dias`,
        origem: `${plural(agora.length, 'corrida', 'corridas')} de ${curta(somarDias(e.hoje, -29))} a ${curta(e.hoje)} (${formatarTempo(pa)}/km) contra ${antes.length} nos 30 dias anteriores (${formatarTempo(pb)}/km). Pace médio = tempo total ÷ distância total.`,
        link: LINK.treino,
        relevancia: d < 0 ? 74 : 50,
      });
  }
  // Sequência de treino + cardio (a do placar) ou, sem ela, os treinos da semana
  const dias = new Map(e.treinos.map((t) => [t.data, t]));
  const seq = sequenciaAtual(e.hoje, (d) => !!dias.get(d)?.treino && !!dias.get(d)?.cardio);
  if (seq.dias >= MIN_SEQUENCIA) {
    saida.push({
      id: 'treino-sequencia',
      categoria: 'treino',
      tom: 'bom',
      frase: `${seq.dias} dias seguidos com treino e cardio`,
      origem: `Dias com musculação e cardio marcados no Treino, de ${curta(somarDias(seq.ate!, -(seq.dias - 1)))} a ${curta(seq.ate!)}.`,
      link: LINK.treino,
      relevancia: Math.min(55 + seq.dias, 78),
    });
  } else {
    const de = somarDias(e.hoje, -6);
    let n = 0;
    for (let d = de; d <= e.hoje; d = somarDias(d, 1)) if (dias.get(d)?.treino) n++;
    if (n >= 4)
      saida.push({
        id: 'treino-semana',
        categoria: 'treino',
        tom: 'bom',
        frase: `Você treinou em ${n} dos últimos 7 dias`,
        origem: `Musculação marcada no Treino de ${curta(de)} a ${curta(e.hoje)}.`,
        link: LINK.treino,
        relevancia: 52,
      });
  }
  return saida;
}

// ---------- Associações ----------

const AVISO = ' (associação, não causa)';

function fraseGrupos(a: AnaliseGrupos, comTreino: boolean): string | null {
  const s = a.sim;
  const n = a.nao;
  if (!s || !n) return null;
  const v = (x: number, casas: number, un: string) => sinal(x, casas, un);
  switch (a.id) {
    case 'sono_cintura':
      return `Semanas com sono de 7 h+: cintura ${v(s.media, 1, ' cm')}/sem, contra ${v(n.media, 1, ' cm')} nas outras`;
    case 'sono_magra_grupos':
      return `Semanas com sono de 7 h+: massa magra ${v(s.media, 2, ' kg')}/sem, contra ${v(n.media, 2, ' kg')} nas outras`;
    case 'adesao_cintura_grupos':
      return `Semanas com ${comTreino ? 'treino e dieta em 80%+' : 'o plano seguido em 80%+ dos dias'}: cintura ${v(s.media, 1, ' cm')}/sem, contra ${v(n.media, 1, ' cm')} nas outras`;
    case 'dieta_peso':
      return `Semanas com o plano seguido em 80%+ dos dias: peso ${v(s.media, 2, ' kg')}/sem, contra ${v(n.media, 2, ' kg')} nas outras`;
    case 'agua_sintoma_grupos':
      return `Semanas com água na meta: ${num(s.media, 1)} dia com sintoma, em média, contra ${num(n.media, 1)} nas outras`;
    case 'sono_nausea_grupos':
      return `Depois de noites de 7 h+, náusea média de ${num(s.media, 1)} de 3, contra ${num(n.media, 1)} após noites mais curtas`;
    case 'sintoma_agua':
      return `Nos dias com sintoma, você bebeu ${num(s.media, 1)} L em média, contra ${num(n.media, 1)} L nos outros`;
    default:
      return null;
  }
}

function fraseAssociacao(a: AnaliseCorrelacao, comTreino: boolean): string | null {
  if (!a.texto) return null;
  const base = a.tipo === 'grupos' ? fraseGrupos(a, comTreino) : a.texto.split(' (r =')[0];
  return base ? `${base}${AVISO}` : null;
}

function insightAssociacao(e: EntradaInsights): Insight | null {
  const d = e.correlacoes;
  if (!d) return null;
  const comTreino = d.comTreino && d.semanas.some((s) => s.treino_frac !== null);
  // Associações que envolvem a dose ficam fora do resumo (dose é decisão médica)
  for (const i of insightsCorrelacoes(d, 8)) {
    if (i.analise.sobre_dose) continue;
    const frase = fraseAssociacao(i.analise, comTreino);
    if (!frase) continue;
    return {
      id: `associacao-${i.analise.par}`,
      categoria: 'habito',
      tom: i.tom === 'bom' ? 'bom' : i.tom === 'atencao' ? 'atencao' : 'neutro',
      frase,
      origem: i.texto,
      link: LINK.habitos,
      relevancia: Math.round(50 + i.analise.forca * 40),
    };
  }
  return null;
}

// ---------- Junta e ordena ----------

/** Todas as frases possíveis, da mais relevante para a menos (ordem estável). */
export function todosInsights(e: EntradaInsights): Insight[] {
  const regs = porData(e.diario.filter((r) => r.data <= e.hoje));
  const lista = [
    ...insightsCintura(e),
    insightPeso(e),
    insightMagra(e),
    insightGorda(e),
    insightMeta(e),
    insightSono(e, regs),
    insightAgua(e, regs),
    insightDieta(e, regs),
    insightDiario(e, regs),
    insightNauseaSemana(e, regs),
    insightNauseaPico(e),
    insightDosesNoDia(e),
    ...insightsTreino(e),
    insightAssociacao(e),
  ].filter((x): x is Insight => !!x);
  return lista.sort((a, b) => b.relevancia - a.relevancia || a.id.localeCompare(b.id));
}

/**
 * As frases do resumo: no máximo `max`, as mais relevantes, com no máximo 2 por
 * categoria na primeira passada (para variar o assunto); sobrando vaga, completa
 * com as próximas. Frases "estável" neutras só entram se faltar assunto.
 */
export function gerarInsights(e: EntradaInsights, max = MAX_INSIGHTS): Insight[] {
  const todos = todosInsights(e);
  const escolhidos: Insight[] = [];
  const porCategoria = new Map<CategoriaInsight, number>();
  for (const i of todos) {
    if (escolhidos.length >= max) break;
    const n = porCategoria.get(i.categoria) ?? 0;
    if (n >= 2) continue;
    escolhidos.push(i);
    porCategoria.set(i.categoria, n + 1);
  }
  for (const i of todos) {
    if (escolhidos.length >= max) break;
    if (!escolhidos.includes(i)) escolhidos.push(i);
  }
  return escolhidos.sort((a, b) => b.relevancia - a.relevancia || a.id.localeCompare(b.id));
}
