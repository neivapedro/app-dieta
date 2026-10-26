// Contas do painel da Análise: indicadores, progresso das metas, adesão aos hábitos
// e destaques em texto. Só descrevem o que foi registrado; nunca sugerem dose.
import type { SintomasFase } from './analise';
import { NOITES_MINIMAS, SONO_MINIMO_H } from './bemestar';
import { diferencaDias, somarDias } from './datas';
import { num, pct, sinal } from './formato';
import { MDC, type Composicao } from './gordura';
import type { RegistroDiario, TreinoDia } from './tipos';

export type ChavePainel = 'peso_kg' | 'cintura_cm' | 'bf' | 'massa_magra_kg' | 'massa_gorda_kg';

/** Valores de uma medida ao longo das medições normais (as atípicas ficam fora das tendências). */
export function serieMetrica(composicoes: Composicao[], chave: ChavePainel): { data: string; valor: number }[] {
  return composicoes
    .filter((c) => !c.atipica && c[chave] !== null && Number.isFinite(c[chave] as number))
    .map((c) => ({ data: c.data, valor: c[chave] as number }));
}

export interface ProgressoMeta {
  inicio: number;
  atual: number;
  meta: number;
  /** Fração do caminho do início até a meta (0 a 1) */
  fracao: number;
  /** Quanto falta (sempre ≥ 0, na unidade da medida) */
  falta: number;
  alcancada: boolean;
}

/** Progresso de uma medida até a meta. null sem meta, sem início ou com a meta no lado errado. */
export function progressoMeta(inicio: number | null | undefined, atual: number | null | undefined, meta: number | null | undefined, menorMelhor = true): ProgressoMeta | null {
  if (inicio == null || meta == null || !Number.isFinite(inicio) || !Number.isFinite(meta)) return null;
  const agora = atual ?? inicio;
  const caminho = menorMelhor ? inicio - meta : meta - inicio;
  if (!(caminho > 0)) return null;
  const andado = menorMelhor ? inicio - agora : agora - inicio;
  const fracao = Math.min(Math.max(andado / caminho, 0), 1);
  const falta = Math.max(menorMelhor ? agora - meta : meta - agora, 0);
  return { inicio, atual: agora, meta, fracao, falta, alcancada: falta === 0 };
}

export interface Taxa {
  feito: number;
  total: number;
  /** feito / total; null sem nenhum dia contado */
  fracao: number | null;
}

const taxa = (feito: number, total: number): Taxa => ({ feito, total, fracao: total > 0 ? feito / total : null });

export interface AdesaoPeriodo {
  treino: Taxa | null;
  cardio: Taxa | null;
  /** "Segui o plano?": sim = 1, em parte = 0,5, entre os dias respondidos */
  dieta: Taxa;
  /** Dias com água na meta, entre os dias com água anotada */
  agua: Taxa;
  /** Noites com 7 h ou mais, entre as noites anotadas */
  sono: Taxa;
  /** Dias com algum registro no Diário, entre os dias do período */
  registro: Taxa;
}

/**
 * Adesão de `de` até `ate` (inclusive). O treino conta todos os dias do período
 * (o chamador decide se o dia de hoje entra); null para quem não tem a aba Treino.
 */
export function adesaoPeriodo(e: {
  diario: RegistroDiario[];
  treinos: TreinoDia[] | null;
  de: string;
  ate: string;
  metaAgua: (data: string) => number;
}): AdesaoPeriodo {
  const dias = e.ate >= e.de ? diferencaDias(e.de, e.ate) + 1 : 0;
  const regs = e.diario.filter((r) => r.data >= e.de && r.data <= e.ate);
  const respondidos = regs.filter((r) => r.dieta_seguida === 'sim' || r.dieta_seguida === 'parcial' || r.dieta_seguida === 'nao');
  const pontosDieta = respondidos.reduce((s, r) => s + (r.dieta_seguida === 'sim' ? 1 : r.dieta_seguida === 'parcial' ? 0.5 : 0), 0);
  const comAgua = regs.filter((r) => typeof r.agua_l === 'number' && Number.isFinite(r.agua_l));
  const naMeta = comAgua.filter((r) => (r.agua_l as number) >= e.metaAgua(r.data) - 0.05).length;
  const comSono = regs.filter((r) => typeof r.sono_h === 'number' && Number.isFinite(r.sono_h));
  const sonoBom = comSono.filter((r) => (r.sono_h as number) >= SONO_MINIMO_H).length;
  const treinosPeriodo = e.treinos ? e.treinos.filter((t) => t.data >= e.de && t.data <= e.ate) : null;
  return {
    treino: treinosPeriodo ? taxa(treinosPeriodo.filter((t) => t.treino).length, dias) : null,
    cardio: treinosPeriodo ? taxa(treinosPeriodo.filter((t) => t.cardio).length, dias) : null,
    dieta: taxa(pontosDieta, respondidos.length),
    agua: taxa(naMeta, comAgua.length),
    sono: taxa(sonoBom, comSono.length),
    registro: taxa(regs.length, dias),
  };
}

export interface HabitosSemana {
  segunda: string;
  /** Média de sono das noites anotadas na semana */
  sono_h: number | null;
  /** Média de água dos dias anotados e a média da meta nesses dias */
  agua_l: number | null;
  agua_meta_l: number | null;
  dieta: { sim: number; parcial: number; nao: number };
  nausea_media: number | null;
}

const media = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

/** Sono, água, dieta e náusea de cada semana (segunda a domingo, até hoje). */
export function habitosPorSemana(diario: RegistroDiario[], segundas: string[], hoje: string, metaAgua: (data: string) => number): HabitosSemana[] {
  return segundas.map((segunda) => {
    const dom = somarDias(segunda, 6);
    const ate = dom < hoje ? dom : hoje;
    const regs = diario.filter((r) => r.data >= segunda && r.data <= ate);
    const comAgua = regs.filter((r) => typeof r.agua_l === 'number');
    return {
      segunda,
      sono_h: media(regs.filter((r) => typeof r.sono_h === 'number').map((r) => r.sono_h as number)),
      agua_l: media(comAgua.map((r) => r.agua_l as number)),
      agua_meta_l: media(comAgua.map((r) => metaAgua(r.data))),
      dieta: {
        sim: regs.filter((r) => r.dieta_seguida === 'sim').length,
        parcial: regs.filter((r) => r.dieta_seguida === 'parcial').length,
        nao: regs.filter((r) => r.dieta_seguida === 'nao').length,
      },
      nausea_media: media(regs.filter((r) => r.nausea !== null).map((r) => r.nausea as number)),
    };
  });
}

/** Dia depois da dose com a náusea média mais alta, juntando todas as fases (ponderado pelos dias anotados). */
export function picoNausea(sintomas: SintomasFase[], colunas: { rotulo: string }[]): { rotulo: string; media: number } | null {
  let rotulo: string | null = null;
  let maior = 0;
  for (let i = 0; i < colunas.length; i++) {
    const valores = sintomas.map((s) => s.nausea_por_dia[i]).filter((v): v is number => v !== null && v !== undefined);
    const m = media(valores);
    if (m !== null && m > maior + 1e-9) {
      maior = m;
      rotulo = colunas[i].rotulo;
    }
  }
  return rotulo ? { rotulo, media: maior } : null;
}

export type TomDestaque = 'bom' | 'atencao' | 'info';
export interface Destaque {
  tom: TomDestaque;
  texto: string;
}

export interface EntradaDestaques {
  cintura: number | null;
  gorda: number | null;
  magra: number | null;
  peso: number | null;
  pesoPct: number | null;
  ritmo: { faixa: 'ideal' | 'rapido' | 'lento' | 'ganho'; pct: number } | null;
  /** Fração da perda que veio de gordura (qualidade da perda das últimas medições) */
  gorduraDaPerda: number | null;
  nausea: { rotulo: string; media: number } | null;
  adesao: AdesaoPeriodo | null;
  /** Como dizer o período da adesão: "nas últimas 4 semanas", "desde o início" */
  periodoAdesao?: string;
  /** Meta mais adiantada (para um destaque de progresso) */
  meta: { nome: string; fracao: number; alcancada: boolean } | null;
}

/**
 * Até 6 destaques do ciclo, os mais importantes primeiro: resultado do corpo,
 * ritmo, hábitos que puxam para baixo e o que vale observar. Variações abaixo
 * do erro da fita (MDC) não viram destaque de melhora ou piora.
 */
export function destaques(e: EntradaDestaques): Destaque[] {
  const lista: Destaque[] = [];
  const passou = (v: number | null, mdc: number) => v !== null && Math.abs(v) >= mdc - 1e-9;

  if (passou(e.cintura, MDC.cintura_cm)) {
    lista.push({ tom: e.cintura! < 0 ? 'bom' : 'atencao', texto: `Cintura ${sinal(e.cintura, 1, ' cm')} desde o início.` });
  }
  if (passou(e.gorda, MDC.massa_gorda_kg)) {
    lista.push({ tom: e.gorda! < 0 ? 'bom' : 'atencao', texto: `Massa gorda ${sinal(e.gorda, 1, ' kg')} desde o início.` });
  }
  if (e.magra !== null) {
    if (passou(e.magra, MDC.massa_magra_kg) && e.magra < 0) lista.push({ tom: 'atencao', texto: `Massa magra ${sinal(e.magra, 1, ' kg')} desde o início: acima do erro da fita.` });
    else if (e.gorda !== null && e.gorda < 0) lista.push({ tom: 'bom', texto: 'Massa magra preservada: a variação está dentro do erro da fita.' });
  }
  if (e.ritmo) {
    const p = `${num(e.ritmo.pct, 2)}% do peso por semana`;
    if (e.ritmo.faixa === 'ideal') lista.push({ tom: 'bom', texto: `Ritmo de ${p}: na faixa que preserva a massa magra (0,5 a 1%).` });
    else if (e.ritmo.faixa === 'rapido') lista.push({ tom: 'atencao', texto: `Ritmo de ${p}: acima de 1%, a massa magra tende a sofrer mais.` });
    else if (e.ritmo.faixa === 'ganho') lista.push({ tom: 'atencao', texto: 'Peso subindo na tendência das últimas 4 semanas.' });
    else lista.push({ tom: 'info', texto: `Ritmo de ${p}: abaixo de 0,5% por semana.` });
  } else if (e.peso !== null && passou(e.peso, MDC.peso_kg)) {
    lista.push({ tom: e.peso < 0 ? 'bom' : 'atencao', texto: `Peso ${sinal(e.peso, 1, ' kg')}${e.pesoPct !== null ? ` (${sinal(e.pesoPct * 100, 1, '%')})` : ''} desde o início.` });
  }
  if (e.gorduraDaPerda !== null && e.gorduraDaPerda < 0.75) {
    lista.push({ tom: 'atencao', texto: `Só ${pct(Math.max(e.gorduraDaPerda, 0), 0)} da perda recente veio de gordura.` });
  }
  if (e.meta) {
    lista.push(
      e.meta.alcancada
        ? { tom: 'bom', texto: `Meta de ${e.meta.nome} alcançada.` }
        : { tom: 'info', texto: `Meta de ${e.meta.nome}: ${pct(e.meta.fracao, 0)} do caminho percorrido.` },
    );
  }
  const a = e.adesao;
  const quando = e.periodoAdesao ?? 'nas últimas 4 semanas';
  if (a) {
    const fraco = (t: Taxa | null, minimo: number) => t && t.total >= 3 && t.fracao !== null && t.fracao < minimo;
    const forte = (t: Taxa | null) => t && t.total >= 5 && t.fracao !== null && t.fracao >= 0.9;
    if (fraco(a.treino, 0.7)) lista.push({ tom: 'atencao', texto: `Treino em ${pct(a.treino!.fracao, 0)} dos dias ${quando}.` });
    else if (forte(a.treino)) lista.push({ tom: 'bom', texto: `Treino em ${pct(a.treino!.fracao, 0)} dos dias ${quando}.` });
    if (fraco(a.dieta, 0.7)) lista.push({ tom: 'atencao', texto: `Plano alimentar seguido em ${pct(a.dieta.fracao, 0)} dos dias respondidos ${quando}.` });
    if (a.sono.total >= NOITES_MINIMAS && a.sono.fracao !== null && a.sono.fracao < 0.5) {
      lista.push({ tom: 'atencao', texto: `Sono de 7 h ou mais em só ${a.sono.feito} de ${a.sono.total} noites anotadas ${quando}.` });
    }
    if (fraco(a.agua, 0.5)) lista.push({ tom: 'atencao', texto: `Água na meta em ${a.agua.feito} de ${a.agua.total} dias anotados ${quando}.` });
  }
  if (e.nausea && e.nausea.media >= 0.5) {
    lista.push({ tom: 'info', texto: `Náusea mais forte no ${e.nausea.rotulo} depois da dose (média ${num(e.nausea.media, 1)} de 3).` });
  }
  // Atenção primeiro (é o que pede ação), depois os bons, depois as informações
  const ordem: Record<TomDestaque, number> = { atencao: 0, bom: 1, info: 2 };
  return lista
    .map((d, i) => ({ d, i }))
    .sort((x, y) => ordem[x.d.tom] - ordem[y.d.tom] || x.i - y.i)
    .map((x) => x.d)
    .slice(0, 6);
}
