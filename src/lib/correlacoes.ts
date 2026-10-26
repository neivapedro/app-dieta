// Correlações entre hábitos e resultados (sono, água, adesão, dose × náusea,
// cintura, peso, massa magra). Só descrevem associações nos dados registrados:
// nunca falam em causa e nunca sugerem dose (a dose é decidida com o médico).
import { diaAposDose, type PontoPeso } from './analise';
import { SONO_MINIMO_H } from './bemestar';
import { tStudent95 } from './conferencia';
import { semanasDoCiclo, type LinhaSemana } from './consulta';
import { diferencaDias, formatarData, segundaDaSemana, somarDias } from './datas';
import { num } from './formato';
import { MDC, type Composicao } from './gordura';
import type { TomDestaque } from './painel';
import type { Aplicacao, RegistroDiario, TreinoDia } from './tipos';

// ---------- Estatística ----------

/** Aviso fixo de todo texto de associação */
export const AVISO_ASSOCIACAO = 'Associação, não prova de causa.';
/** Aviso extra das análises com dose: a dose varia junto com outras coisas */
export const AVISO_DOSE = 'A dose muda junto com o tempo de uso, a dieta e o treino.';

/** Mínimo de pares para falar de associação: semanas ou dias */
export const MINIMO_SEMANAS = 5;
export const MINIMO_DIAS = 14;
/** |r| mínimo para virar texto (abaixo disso, associação fraca demais para comentar) */
export const R_MINIMO = 0.3;

export interface Correlacao {
  /** Pares usados (os dois valores presentes) */
  n: number;
  r: number;
  /** p < 0,05 bicaudal: |r| ≥ r crítico para o n */
  significativa: boolean;
  /** r crítico (p < 0,05 bicaudal); null quando o n não permite significância */
  r_critico: number | null;
}

export interface RetaMinimos {
  inclinacao: number;
  intercepto: number;
  n: number;
}

type Valor = number | null | undefined;
const temNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const media = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

/** Exclusão aos pares: só entram os índices com x e y numéricos (comprimento = o menor dos dois). */
export function paresValidos(x: Valor[], y: Valor[]): { x: number[]; y: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const a = x[i];
    const b = y[i];
    if (temNumero(a) && temNumero(b)) {
      xs.push(a);
      ys.push(b);
    }
  }
  return { x: xs, y: ys };
}

/** Série constante (variação desprezível): correlação indefinida */
function constante(v: number[]): boolean {
  if (v.length < 2) return true;
  const min = Math.min(...v);
  const max = Math.max(...v);
  return max - min <= 1e-12 * Math.max(1, Math.abs(max), Math.abs(min));
}

function rDePares(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3 || constante(x) || constante(y)) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (!(sxx > 0) || !(syy > 0)) return null;
  return Math.min(Math.max(sxy / Math.sqrt(sxx * syy), -1), 1);
}

/** t(0,975) com gl graus de liberdade (tabela até 30; acima, 1,96 + 2,4/gl, contínuo em 30). */
function tCritico(gl: number): number {
  return gl <= 30 ? tStudent95(gl) : 1.96 + 2.4 / gl;
}

/** r crítico de Pearson (p < 0,05 bicaudal) pelo t de Student: r = t / √(t² + n − 2). */
export function rCriticoPearson(n: number): number | null {
  if (n < 3) return null;
  const gl = n - 2;
  const t = tCritico(gl);
  return t / Math.sqrt(t * t + gl);
}

/** Valores críticos exatos de Spearman (Zar), p < 0,05 bicaudal, n de 5 a 20 */
const CRITICO_SPEARMAN: Record<number, number> = {
  5: 1, 6: 0.886, 7: 0.786, 8: 0.738, 9: 0.7, 10: 0.648, 11: 0.618, 12: 0.587, 13: 0.56,
  14: 0.538, 15: 0.521, 16: 0.503, 17: 0.485, 18: 0.472, 19: 0.46, 20: 0.447,
};

/** r crítico de Spearman: tabela exata até 20 pares; acima, a aproximação pelo t. Com menos de 5, null. */
export function rCriticoSpearman(n: number): number | null {
  if (n < 5) return null;
  return CRITICO_SPEARMAN[n] ?? rCriticoPearson(n);
}

function resultado(r: number | null, n: number, critico: number | null): Correlacao | null {
  if (r === null) return null;
  return { n, r, r_critico: critico, significativa: critico !== null && Math.abs(r) >= critico - 1e-9 };
}

/** Correlação de Pearson com exclusão aos pares; null com menos de 3 pares ou série constante. */
export function pearson(x: Valor[], y: Valor[]): Correlacao | null {
  const p = paresValidos(x, y);
  return resultado(rDePares(p.x, p.y), p.x.length, rCriticoPearson(p.x.length));
}

/** Postos com empates na média dos postos (1 = menor). */
export function postos(v: number[]): number[] {
  const ordem = v.map((valor, i) => ({ valor, i })).sort((a, b) => a.valor - b.valor);
  const p = new Array<number>(v.length);
  for (let i = 0; i < ordem.length; ) {
    let j = i;
    while (j + 1 < ordem.length && ordem[j + 1].valor === ordem[i].valor) j++;
    const posto = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) p[ordem[k].i] = posto;
    i = j + 1;
  }
  return p;
}

/** Correlação de Spearman (Pearson dos postos, empates pela média); null com menos de 3 pares ou série constante. */
export function spearman(x: Valor[], y: Valor[]): Correlacao | null {
  const p = paresValidos(x, y);
  if (p.x.length < 3) return null;
  return resultado(rDePares(postos(p.x), postos(p.y)), p.x.length, rCriticoSpearman(p.x.length));
}

/** Reta dos mínimos quadrados y = intercepto + inclinação·x; null com menos de 2 pares ou x constante. */
export function retaMinimos(x: Valor[], y: Valor[]): RetaMinimos | null {
  const p = paresValidos(x, y);
  const n = p.x.length;
  if (n < 2 || constante(p.x)) return null;
  const mx = p.x.reduce((a, b) => a + b, 0) / n;
  const my = p.y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (p.x[i] - mx) * (p.y[i] - my);
    sxx += (p.x[i] - mx) ** 2;
  }
  const inclinacao = sxy / sxx;
  return { inclinacao, intercepto: my - inclinacao * mx, n };
}

/** "moderada" (0,3 a 0,5), "forte" (0,5 a 0,7), "muito forte" (0,7 ou mais); abaixo de 0,3, "fraca". */
export function intensidade(r: number): 'fraca' | 'moderada' | 'forte' | 'muito forte' {
  const a = Math.abs(r);
  return a >= 0.7 ? 'muito forte' : a >= 0.5 ? 'forte' : a >= R_MINIMO ? 'moderada' : 'fraca';
}

/** "r = −0,45" (coeficiente, com o menos colado) */
export function textoR(r: number): string {
  const zero = Number(Math.abs(r).toFixed(2)) === 0;
  return `r = ${r < 0 && !zero ? '−' : ''}${num(Math.abs(r), 2)}`;
}

// ---------- Dados: semana a semana e dia a dia ----------

/** As mesmas entradas de semanasDoCiclo (consulta.ts), mais a meta de água do dia. */
export interface EntradaCorrelacoes {
  inicio: string;
  hoje: string;
  aplicacoes: Aplicacao[];
  serie: PontoPeso[];
  composicoes: Composicao[];
  diario: RegistroDiario[];
  treinos: TreinoDia[] | null;
  periodosTreino?: { inicio: string; fim: string }[];
  /** Meta de bebidas do dia, em litros (useMetaAgua()(data).meta) */
  metaAgua: (data: string) => number;
}

/** Uma semana (segunda a domingo) com as médias e variações usadas nas correlações. */
export interface SemanaCorrelacao extends LinhaSemana {
  /** "dd/mm" da segunda */
  rotulo: string;
  /** Média de sono das noites anotadas (h) */
  sono_h: number | null;
  /** Média de água dos dias anotados e a média da meta nesses dias (L) */
  agua_l: number | null;
  agua_meta_l: number | null;
  /** Água média ÷ meta média (1 = na meta) */
  agua_frac: number | null;
  /** "Segui o plano?": sim = 1, em parte = 0,5, entre os dias respondidos (0 a 1) */
  dieta_frac: number | null;
  /** Treinos e cardios ÷ dias contados (0 a 1); null sem a aba Treino */
  treino_frac: number | null;
  cardio_frac: number | null;
  /** Média de treino e dieta (só a dieta para quem não tem a aba Treino), 0 a 1 */
  adesao: number | null;
  nausea_media: number | null;
  /** Dias com vômito, diarreia ou intestino preso; null sem nenhum registro no Diário na semana */
  sintomas: number | null;
  /** kg/sem: média das pesagens normais da semana × a da semana anterior com pesagem (pelas datas médias) */
  peso_sem: number | null;
  /** Por semana, entre a medição normal da semana e a da semana medida anterior (atípicas fora) */
  cintura_sem: number | null;
  gorda_sem: number | null;
  magra_sem: number | null;
}

/** Um dia do Diário. O sono anotado no dia é o da noite anterior. */
export interface DiaCorrelacao {
  data: string;
  /** "dd/mm" */
  rotulo: string;
  /** Sono da noite anterior (h) */
  sono_h: number | null;
  nausea: number | null;
  agua_l: number | null;
  agua_meta_l: number;
  /** Vômito, diarreia ou intestino preso marcados */
  sintoma: boolean;
  /** Dias depois da última dose (D0 = dia da dose); null antes da 1ª */
  d_dose: number | null;
}

export interface DadosCorrelacao {
  semanas: SemanaCorrelacao[];
  dias: DiaCorrelacao[];
  /** Conta com a aba Treino (a adesão junta treino e dieta) */
  comTreino: boolean;
}

const rotuloDia = (d: string) => formatarData(d).slice(0, 5);
const temSintoma = (r: RegistroDiario) => r.vomito === true || r.diarreia === true || r.intestino_preso === true;

/** Variação por semana entre duas datas; null fora da janela (dias mínimos e máximos entre as duas). */
function porSemana(de: { data: string; valor: number | null } | null, ate: { data: string; valor: number | null }, min: number, max: number): number | null {
  if (!de || de.valor === null || ate.valor === null) return null;
  const dias = diferencaDias(de.data, ate.data);
  if (dias < min || dias > max) return null;
  return ((ate.valor - de.valor) / dias) * 7;
}

/** Semana a semana para as correlações: as linhas de semanasDoCiclo com médias e variações. */
export function semanasCorrelacao(e: EntradaCorrelacoes): SemanaCorrelacao[] {
  const linhas = semanasDoCiclo(e);
  const comps = [...e.composicoes].filter((c) => !c.atipica).sort((a, b) => a.data.localeCompare(b.data));
  const pesos = e.serie.filter((p) => !p.atipica && temNumero(p.peso_kg));
  let compAnterior: Composicao | null = null;
  let pesoAnterior: { data: string; valor: number } | null = null;
  return linhas.map((l) => {
    const dom = somarDias(l.segunda, 6);
    const ate = dom < e.hoje ? dom : e.hoje;
    // Mesmos dias da linha de semanasDoCiclo (segunda até domingo ou hoje)
    const dentro = (d: string) => d >= l.segunda && d <= ate;
    const regs = e.diario.filter((r) => dentro(r.data));
    const sonos = regs.map((r) => r.sono_h).filter(temNumero);
    const comAgua = regs.filter((r) => temNumero(r.agua_l));
    const agua = media(comAgua.map((r) => r.agua_l as number));
    const meta = media(comAgua.map((r) => e.metaAgua(r.data)));
    const respondidos = l.dieta.sim + l.dieta.parcial + l.dieta.nao;
    const dieta = respondidos ? (l.dieta.sim + 0.5 * l.dieta.parcial) / respondidos : null;
    const treino = l.treino !== null && l.dias > 0 ? l.treino / l.dias : null;
    const cardio = l.cardio !== null && l.dias > 0 ? l.cardio / l.dias : null;
    const partes = [treino, dieta].filter(temNumero);

    // Peso: média das pesagens normais da semana na data média, contra a semana anterior com pesagem
    const pesosSemana = pesos.filter((p) => dentro(p.data));
    let peso_sem: number | null = null;
    if (pesosSemana.length) {
      const valor = media(pesosSemana.map((p) => p.peso_kg))!;
      const deslocamento = Math.round(media(pesosSemana.map((p) => diferencaDias(l.segunda, p.data)))!);
      const atual = { data: somarDias(l.segunda, deslocamento), valor };
      peso_sem = porSemana(pesoAnterior, atual, 3, 21);
      pesoAnterior = atual;
    }

    // Fita: 1ª medição normal da semana contra a da última semana medida (até 5 semanas antes)
    const comp = comps.find((c) => dentro(c.data)) ?? null;
    let cintura_sem: number | null = null;
    let gorda_sem: number | null = null;
    let magra_sem: number | null = null;
    if (comp) {
      const a = compAnterior;
      const v = (c: Composicao | null, k: 'cintura_cm' | 'massa_gorda_kg' | 'massa_magra_kg') => (c ? { data: c.data, valor: c[k] } : null);
      cintura_sem = porSemana(v(a, 'cintura_cm'), v(comp, 'cintura_cm')!, 4, 35);
      gorda_sem = porSemana(v(a, 'massa_gorda_kg'), v(comp, 'massa_gorda_kg')!, 4, 35);
      magra_sem = porSemana(v(a, 'massa_magra_kg'), v(comp, 'massa_magra_kg')!, 4, 35);
      compAnterior = comp;
    }

    return {
      ...l,
      rotulo: rotuloDia(l.segunda),
      sono_h: media(sonos),
      agua_l: agua,
      agua_meta_l: meta,
      agua_frac: agua !== null && meta ? agua / meta : null,
      dieta_frac: dieta,
      treino_frac: treino,
      cardio_frac: cardio,
      adesao: media(partes),
      nausea_media: media(regs.map((r) => r.nausea).filter(temNumero)),
      sintomas: regs.length ? regs.filter(temSintoma).length : null,
      peso_sem,
      cintura_sem,
      gorda_sem,
      magra_sem,
    };
  });
}

/** Dia a dia do Diário, do início até hoje. */
export function diasCorrelacao(e: Pick<EntradaCorrelacoes, 'inicio' | 'hoje' | 'aplicacoes' | 'diario' | 'metaAgua'>): DiaCorrelacao[] {
  const datasAplic = e.aplicacoes.map((a) => a.data).sort();
  return e.diario
    .filter((r) => r.data >= e.inicio && r.data <= e.hoje)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((r) => ({
      data: r.data,
      rotulo: rotuloDia(r.data),
      sono_h: temNumero(r.sono_h) ? r.sono_h : null,
      nausea: temNumero(r.nausea) ? r.nausea : null,
      agua_l: temNumero(r.agua_l) ? r.agua_l : null,
      agua_meta_l: e.metaAgua(r.data),
      sintoma: temSintoma(r),
      d_dose: diaAposDose(r.data, datasAplic),
    }));
}

export function dadosCorrelacao(e: EntradaCorrelacoes): DadosCorrelacao {
  return { semanas: semanasCorrelacao(e), dias: diasCorrelacao(e), comTreino: e.treinos !== null };
}

/** Recorte de um período (filtro da Análise): semanas que tocam o período e dias dentro dele. */
export function filtrarPeriodo(d: DadosCorrelacao, de: string, ate: string): DadosCorrelacao {
  const seg = segundaDaSemana(de);
  return {
    ...d,
    semanas: d.semanas.filter((s) => s.segunda >= seg && s.segunda <= ate),
    dias: d.dias.filter((x) => x.data >= de && x.data <= ate),
  };
}

// ---------- Análises prontas ----------

export type IdDispersao = 'sono_nausea' | 'adesao_cintura' | 'dose_peso' | 'sono_magra' | 'agua_sintoma';
export type IdGrupos = 'sono_cintura' | 'sono_magra_grupos' | 'adesao_cintura_grupos' | 'dieta_peso' | 'agua_sintoma_grupos' | 'sono_nausea_grupos' | 'sintoma_agua';

export interface Eixo {
  nome: string;
  unidade?: string;
  casas?: number;
}

/** Ponto pronto para o GraficoDispersao */
export interface PontoDispersao {
  x: number;
  y: number;
  /** Segunda da semana ou o dia (AAAA-MM-DD) */
  data: string;
  /** "dd/mm" */
  rotulo: string;
}

interface BaseAnalise {
  /** Par de variáveis: a dispersão e a comparação de grupos do mesmo par não aparecem juntas nos insights */
  par: string;
  titulo: string;
  escopo: 'semana' | 'dia';
  /** Pares com os dois valores */
  n: number;
  /** Mínimo de pares para virar texto (5 semanas ou 14 dias) */
  minimo: number;
  /** |r| quando há texto; 0 sem texto (ordena os insights) */
  forca: number;
  /** Texto pronto em pt-BR, ou null sem dados suficientes ou sem associação clara */
  texto: string | null;
  tom: TomDestaque;
  /** Análise que envolve a dose: só descritiva, com o aviso extra */
  sobre_dose: boolean;
}

export interface AnaliseDispersao extends BaseAnalise {
  tipo: 'dispersao';
  id: IdDispersao;
  eixoX: Eixo;
  eixoY: Eixo;
  pontos: PontoDispersao[];
  /** Pearson (o mesmo da reta do gráfico) */
  r: number | null;
  /** Spearman (conferência: mesma direção e significativo) */
  rho: number | null;
  significativa: boolean;
  reta: RetaMinimos | null;
}

export interface Grupo {
  n: number;
  media: number;
}

export interface AnaliseGrupos extends BaseAnalise {
  tipo: 'grupos';
  id: IdGrupos;
  /** Como dizer cada grupo ("sono de 7 h ou mais" / "as outras") */
  condicao: string;
  limiar: number;
  /** Semanas (ou dias) que cumprem a condição e as outras; null sem nenhuma */
  sim: Grupo | null;
  nao: Grupo | null;
  /** Correlação ponto-bisserial (grupo 0/1 × resultado): equivale ao teste t entre os grupos */
  r: number | null;
  significativa: boolean;
  /** Unidade e casas do resultado (média de cada grupo) */
  eixoY: Eixo;
}

export type AnaliseCorrelacao = AnaliseDispersao | AnaliseGrupos;

const minimoDe = (escopo: 'semana' | 'dia') => (escopo === 'dia' ? MINIMO_DIAS : MINIMO_SEMANAS);
const contagem = (n: number, escopo: 'semana' | 'dia') => `${n} ${escopo === 'dia' ? (n === 1 ? 'dia' : 'dias') : n === 1 ? 'semana' : 'semanas'}`;

function dispersao<T extends { data?: string; segunda?: string; rotulo: string }>(c: {
  id: IdDispersao;
  titulo: string;
  escopo: 'semana' | 'dia';
  eixoX: Eixo;
  eixoY: Eixo;
  linhas: T[];
  x: (l: T) => number | null;
  y: (l: T) => number | null;
  /** Frase pela direção (r < 0 ou > 0), sem o r, o n e o aviso */
  frase: (negativa: boolean) => string;
  sobreDose?: boolean;
}): AnaliseDispersao {
  const pontos: PontoDispersao[] = [];
  for (const l of c.linhas) {
    const x = c.x(l);
    const y = c.y(l);
    if (temNumero(x) && temNumero(y)) pontos.push({ x, y, data: (l.segunda ?? l.data)!, rotulo: l.rotulo });
  }
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  const p = pearson(xs, ys);
  const s = spearman(xs, ys);
  const minimo = minimoDe(c.escopo);
  const clara =
    !!p && !!s && pontos.length >= minimo && Math.abs(p.r) >= R_MINIMO && p.significativa && s.significativa && Math.sign(p.r) === Math.sign(s.r);
  const avisos = c.sobreDose ? `${AVISO_DOSE} ${AVISO_ASSOCIACAO}` : AVISO_ASSOCIACAO;
  return {
    tipo: 'dispersao',
    id: c.id,
    par: c.id,
    titulo: c.titulo,
    escopo: c.escopo,
    eixoX: c.eixoX,
    eixoY: c.eixoY,
    pontos,
    n: pontos.length,
    minimo,
    r: p?.r ?? null,
    rho: s?.r ?? null,
    significativa: !!p?.significativa,
    reta: retaMinimos(xs, ys),
    forca: clara ? Math.abs(p!.r) : 0,
    texto: clara ? `${c.frase(p!.r < 0)} (${textoR(p!.r)}, associação ${intensidade(p!.r)}; ${contagem(pontos.length, c.escopo)}). ${avisos}` : null,
    tom: 'info',
    sobre_dose: !!c.sobreDose,
  };
}

/** "caiu em média 0,6 cm/sem" · "subiu 0,2 kg/sem" · "ficou estável" */
function movimento(v: number, casas: number, un: string, emMedia: boolean): string {
  if (Number(Math.abs(v).toFixed(casas)) === 0) return emMedia ? 'ficou estável, em média' : 'ficou estável';
  return `${v < 0 ? 'caiu' : 'subiu'}${emMedia ? ' em média' : ''} ${num(Math.abs(v), casas)} ${un}`;
}

/** O segundo grupo: só o número quando vai na mesma direção do primeiro */
function movimentoOutro(a: number, b: number, casas: number, un: string): string {
  const zero = (v: number) => Number(Math.abs(v).toFixed(casas)) === 0;
  if (!zero(a) && !zero(b) && Math.sign(a) === Math.sign(b)) return `${num(Math.abs(b), casas)} ${un}`;
  return movimento(b, casas, un, false);
}

function grupos<T extends { data?: string; segunda?: string }>(c: {
  id: IdGrupos;
  par: string;
  titulo: string;
  escopo: 'semana' | 'dia';
  condicao: string;
  limiar: number;
  linhas: T[];
  /** Cumpre a condição? null = fora da comparação */
  cumpre: (l: T) => boolean | null;
  y: (l: T) => number | null;
  eixoY: Eixo;
  /** Resultado: menor é melhor (cintura, peso, náusea, sintomas) ou maior é melhor (massa magra, água) */
  menorMelhor: boolean;
  /** Mínimo de cada grupo */
  minGrupo: number;
  frase: (sim: Grupo, nao: Grupo) => string;
  /** Tom quando o grupo que cumpre a condição foi melhor (padrão: bom) e quando foi pior (padrão: info) */
  tomMelhor?: TomDestaque;
  tomPior?: TomDestaque;
}): AnaliseGrupos {
  const ind: number[] = [];
  const ys: number[] = [];
  for (const l of c.linhas) {
    const g = c.cumpre(l);
    const y = c.y(l);
    if (g === null || !temNumero(y)) continue;
    ind.push(g ? 1 : 0);
    ys.push(y);
  }
  const doGrupo = (k: number): Grupo | null => {
    const v = ys.filter((_, i) => ind[i] === k);
    return v.length ? { n: v.length, media: media(v)! } : null;
  };
  const sim = doGrupo(1);
  const nao = doGrupo(0);
  const p = pearson(ind, ys);
  const minimo = minimoDe(c.escopo);
  const casas = c.eixoY.casas ?? 1;
  const diferentes = !!sim && !!nao && num(sim.media, casas) !== num(nao.media, casas);
  const clara =
    !!p && !!sim && !!nao && diferentes && ys.length >= minimo && sim.n >= c.minGrupo && nao.n >= c.minGrupo && Math.abs(p.r) >= R_MINIMO && p.significativa;
  const melhor = !!sim && !!nao && (c.menorMelhor ? sim.media < nao.media : sim.media > nao.media);
  const unidade = c.escopo === 'dia' ? 'dias' : 'semanas';
  return {
    tipo: 'grupos',
    id: c.id,
    par: c.par,
    titulo: c.titulo,
    escopo: c.escopo,
    condicao: c.condicao,
    limiar: c.limiar,
    sim,
    nao,
    n: ys.length,
    minimo,
    r: p?.r ?? null,
    significativa: !!p?.significativa,
    eixoY: c.eixoY,
    forca: clara ? Math.abs(p!.r) : 0,
    texto: clara ? `${c.frase(sim!, nao!)} (${sim!.n} × ${nao!.n} ${unidade}). ${AVISO_ASSOCIACAO}` : null,
    tom: melhor ? (c.tomMelhor ?? 'bom') : (c.tomPior ?? 'info'),
    sobre_dose: false,
  };
}

const LIMIAR_ADESAO = 0.8;
const pctX = (v: number | null) => (v === null ? null : v * 100);
const naMetaAgua = (agua: number | null, meta: number | null) => (agua === null || meta === null ? null : agua >= meta - 0.05 - 1e-9);

/** Rótulo da adesão: treino e dieta, ou só a dieta para quem não tem a aba Treino */
const nomeAdesao = (comTreino: boolean) => (comTreino ? 'Adesão (treino e dieta)' : 'Adesão à dieta');

/**
 * As 5 dispersões (sempre na mesma ordem, para a seção de gráficos): sono × náusea (dia a dia),
 * adesão × cintura, dose × ritmo de peso, sono × massa magra e água × dias com sintoma (semanais).
 */
export function analisesDispersao(d: DadosCorrelacao): AnaliseDispersao[] {
  const comTreino = d.comTreino && d.semanas.some((s) => s.treino_frac !== null);
  const adesao = nomeAdesao(comTreino);
  return [
    dispersao({
      id: 'sono_nausea',
      titulo: 'Sono × náusea',
      escopo: 'dia',
      eixoX: { nome: 'Sono da noite', unidade: 'h', casas: 1 },
      eixoY: { nome: 'Náusea do dia (0 a 3)', casas: 0 },
      linhas: d.dias,
      x: (l) => l.sono_h,
      y: (l) => l.nausea,
      frase: (neg) => `Noites de sono mais longas vieram com ${neg ? 'menos' : 'mais'} náusea no dia seguinte`,
    }),
    dispersao({
      id: 'adesao_cintura',
      titulo: `${adesao} × cintura`,
      escopo: 'semana',
      eixoX: { nome: adesao, unidade: '%', casas: 0 },
      eixoY: { nome: 'Cintura', unidade: 'cm/sem', casas: 1 },
      linhas: d.semanas,
      x: (l) => pctX(l.adesao),
      y: (l) => l.cintura_sem,
      frase: (neg) =>
        `Semanas com mais ${comTreino ? 'adesão ao treino e à dieta' : 'adesão à dieta'} tiveram ${neg ? 'mais queda' : 'menos queda'} de cintura`,
    }),
    dispersao({
      id: 'dose_peso',
      titulo: 'Dose × ritmo de peso',
      escopo: 'semana',
      eixoX: { nome: 'Dose da semana', unidade: 'mg', casas: 2 },
      eixoY: { nome: 'Peso', unidade: 'kg/sem', casas: 2 },
      linhas: d.semanas,
      x: (l) => l.dose_mg,
      y: (l) => l.peso_sem,
      frase: (neg) => `Nas semanas com dose maior, o peso caiu ${neg ? 'mais rápido' : 'mais devagar'}`,
      sobreDose: true,
    }),
    dispersao({
      id: 'sono_magra',
      titulo: 'Sono × massa magra',
      escopo: 'semana',
      eixoX: { nome: 'Sono médio', unidade: 'h', casas: 1 },
      eixoY: { nome: 'Massa magra', unidade: 'kg/sem', casas: 2 },
      linhas: d.semanas,
      x: (l) => l.sono_h,
      y: (l) => l.magra_sem,
      frase: (neg) => `Semanas com mais sono tiveram ${neg ? 'mais queda' : 'menos queda'} de massa magra pela fita`,
    }),
    dispersao({
      id: 'agua_sintoma',
      titulo: 'Água × dias com sintoma',
      escopo: 'semana',
      eixoX: { nome: 'Água média', unidade: 'L', casas: 1 },
      eixoY: { nome: 'Dias com sintoma', casas: 0 },
      linhas: d.semanas,
      x: (l) => l.agua_l,
      y: (l) => l.sintomas,
      frase: (neg) => `Semanas com mais água tiveram ${neg ? 'menos' : 'mais'} dias com vômito, diarreia ou intestino preso`,
    }),
  ];
}

/** "0,5 dia" · "2,0 dias"; zero (arredondado) = null */
const dias = (v: number) => (Number(v.toFixed(1)) === 0 ? null : `${num(v, 1)} ${Number(v.toFixed(1)) >= 2 ? 'dias' : 'dia'}`);

/**
 * Comparações de grupos (leem melhor que o r): a média do resultado nas semanas (ou dias)
 * que cumprem um limiar contra as outras, com as contagens.
 */
export function analisesGrupos(d: DadosCorrelacao): AnaliseGrupos[] {
  const comTreino = d.comTreino && d.semanas.some((s) => s.treino_frac !== null);
  const sono7 = num(SONO_MINIMO_H, 0);
  const sonoBom = (h: number | null) => (h === null ? null : h >= SONO_MINIMO_H);
  const adesao = comTreino ? 'adesão de 80% ou mais ao treino e à dieta' : 'o plano alimentar seguido em 80% dos dias ou mais';
  const cm = { unidade: 'cm/sem', casas: 1 };
  const kg = { unidade: 'kg/sem', casas: 2 };
  return [
    grupos({
      id: 'sono_cintura',
      par: 'sono_cintura',
      titulo: 'Sono × cintura',
      escopo: 'semana',
      condicao: `sono de ${sono7} h ou mais`,
      limiar: SONO_MINIMO_H,
      linhas: d.semanas,
      cumpre: (l) => sonoBom(l.sono_h),
      y: (l) => l.cintura_sem,
      eixoY: { nome: 'Cintura', ...cm },
      menorMelhor: true,
      minGrupo: 2,
      frase: (s, n) => `Nas semanas com sono de ${sono7} h ou mais, a cintura ${movimento(s.media, 1, cm.unidade, true)}; nas outras, ${movimentoOutro(s.media, n.media, 1, cm.unidade)}`,
    }),
    grupos({
      id: 'sono_magra_grupos',
      par: 'sono_magra',
      titulo: 'Sono × massa magra',
      escopo: 'semana',
      condicao: `sono de ${sono7} h ou mais`,
      limiar: SONO_MINIMO_H,
      linhas: d.semanas,
      cumpre: (l) => sonoBom(l.sono_h),
      y: (l) => l.magra_sem,
      eixoY: { nome: 'Massa magra', ...kg },
      menorMelhor: false,
      minGrupo: 2,
      frase: (s, n) =>
        `Nas semanas com sono de ${sono7} h ou mais, a massa magra ${movimento(s.media, 2, kg.unidade, true)}; nas outras, ${movimentoOutro(s.media, n.media, 2, kg.unidade)}`,
    }),
    grupos({
      id: 'adesao_cintura_grupos',
      par: 'adesao_cintura',
      titulo: `${nomeAdesao(comTreino)} × cintura`,
      escopo: 'semana',
      condicao: adesao,
      limiar: LIMIAR_ADESAO,
      linhas: d.semanas,
      cumpre: (l) => (l.adesao === null ? null : l.adesao >= LIMIAR_ADESAO - 1e-9),
      y: (l) => l.cintura_sem,
      eixoY: { nome: 'Cintura', ...cm },
      menorMelhor: true,
      minGrupo: 2,
      frase: (s, n) => `Nas semanas com ${adesao}, a cintura ${movimento(s.media, 1, cm.unidade, true)}; nas outras, ${movimentoOutro(s.media, n.media, 1, cm.unidade)}`,
    }),
    grupos({
      id: 'dieta_peso',
      par: 'dieta_peso',
      titulo: 'Dieta × peso',
      escopo: 'semana',
      condicao: 'o plano alimentar seguido em 80% dos dias ou mais',
      limiar: LIMIAR_ADESAO,
      linhas: d.semanas,
      cumpre: (l) => (l.dieta_frac === null ? null : l.dieta_frac >= LIMIAR_ADESAO - 1e-9),
      y: (l) => l.peso_sem,
      eixoY: { nome: 'Peso', ...kg },
      menorMelhor: true,
      minGrupo: 2,
      frase: (s, n) =>
        `Nas semanas com o plano alimentar seguido em 80% dos dias ou mais, o peso ${movimento(s.media, 2, kg.unidade, true)}; nas outras, ${movimentoOutro(s.media, n.media, 2, kg.unidade)}`,
    }),
    grupos({
      id: 'agua_sintoma_grupos',
      par: 'agua_sintoma',
      titulo: 'Água × dias com sintoma',
      escopo: 'semana',
      condicao: 'água na meta',
      limiar: 1,
      linhas: d.semanas,
      cumpre: (l) => naMetaAgua(l.agua_l, l.agua_meta_l),
      y: (l) => l.sintomas,
      eixoY: { nome: 'Dias com sintoma', casas: 1 },
      menorMelhor: true,
      minGrupo: 2,
      frase: (s, n) => {
        const a = dias(s.media);
        const b = dias(n.media);
        return `Nas semanas com água na meta (média), ${a ? `houve em média ${a} com sintoma` : 'não houve dia com sintoma'}; nas outras, ${b ? (a ? b : `${b} em média`) : 'nenhum'}`;
      },
    }),
    grupos({
      id: 'sono_nausea_grupos',
      par: 'sono_nausea',
      titulo: 'Sono × náusea',
      escopo: 'dia',
      condicao: `noites de ${sono7} h ou mais`,
      limiar: SONO_MINIMO_H,
      linhas: d.dias,
      cumpre: (l) => sonoBom(l.sono_h),
      y: (l) => l.nausea,
      eixoY: { nome: 'Náusea (0 a 3)', casas: 1 },
      menorMelhor: true,
      minGrupo: 4,
      frase: (s, n) =>
        `Depois de noites com ${sono7} h ou mais de sono, a náusea média do dia foi ${num(s.media, 1)} de 3; depois das noites mais curtas, ${num(n.media, 1)} de 3`,
    }),
    grupos({
      id: 'sintoma_agua',
      par: 'sintoma_agua',
      titulo: 'Sintoma × água',
      escopo: 'dia',
      condicao: 'dias com sintoma',
      limiar: 1,
      linhas: d.dias,
      cumpre: (l) => l.sintoma,
      y: (l) => l.agua_l,
      eixoY: { nome: 'Água', unidade: 'L', casas: 1 },
      // Nos dias com sintoma, beber menos pede atenção (perde líquido)
      menorMelhor: false,
      minGrupo: 3,
      tomMelhor: 'info',
      tomPior: 'atencao',
      frase: (s, n) => `Nos dias com sintoma, a água anotada foi em média ${num(s.media, 1)} L; nos outros, ${num(n.media, 1)} L`,
    }),
  ];
}

export interface InsightCorrelacao {
  tom: TomDestaque;
  texto: string;
  analise: AnaliseCorrelacao;
}

const ehDados = (e: EntradaCorrelacoes | DadosCorrelacao): e is DadosCorrelacao => 'semanas' in e && 'dias' in e;

/**
 * Até 4 textos de associação, os mais fortes primeiro. Do mesmo par de variáveis fica
 * um só (a comparação de grupos, que lê melhor, quando as duas têm texto).
 */
export function insightsCorrelacoes(e: EntradaCorrelacoes | DadosCorrelacao, max = 4): InsightCorrelacao[] {
  const d = ehDados(e) ? e : dadosCorrelacao(e);
  const porPar = new Map<string, AnaliseCorrelacao>();
  for (const a of [...analisesGrupos(d), ...analisesDispersao(d)]) {
    if (!a.texto || porPar.has(a.par)) continue;
    porPar.set(a.par, a);
  }
  return [...porPar.values()]
    .sort((a, b) => b.forca - a.forca)
    .slice(0, max)
    .map((a) => ({ tom: a.tom, texto: a.texto!, analise: a }));
}

/** Para o "Como ler" da seção de correlações */
export const TEXTO_COMO_LER =
  `Cada ponto é uma semana (ou um dia). O r vai de −1 a 1: perto de 0, sem relação; perto de ±1, os dois andam juntos. ` +
  `Só aparece texto com ${MINIMO_SEMANAS} semanas ou ${MINIMO_DIAS} dias, |r| de ${num(R_MINIMO, 1)} ou mais e p < 0,05. ` +
  `As variações semanais da fita têm ruído (até ${num(MDC.cintura_cm, 1)} cm de cintura e ${num(MDC.massa_magra_kg, 1)} kg de massa magra entre duas medições). ` +
  `Medições atípicas ficam de fora. ${AVISO_ASSOCIACAO}`;
