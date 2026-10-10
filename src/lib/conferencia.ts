import { diferencaDias, somarDias } from './datas';
import type { Composicao } from './gordura';

/** Energia de 1 kg de tecido (Hall, 2008): gordura ≈ 9.400 kcal; massa magra ≈ 1.800 kcal */
export const KCAL_KG_GORDA = 9400;
export const KCAL_KG_MAGRA = 1800;

export interface Reta {
  inclinacao: number;
  /** Erro padrão da inclinação */
  erro: number;
  n: number;
  /** Médias de x e y (a reta passa por elas) */
  mx: number;
  my: number;
  /** Σ(x − x̄)² */
  sxx: number;
  /** Desvio padrão dos resíduos (n − 2 graus de liberdade) */
  s: number;
}

/** Regressão linear simples (x em dias); erro padrão da inclinação. Com x todos iguais, inclinação 0. */
export function reta(xs: number[], ys: number[]): Reta {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const inclinacao = sxx > 0 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  const residuos = ys.map((y, i) => y - (my + inclinacao * (xs[i] - mx)));
  const s2 = n > 2 ? residuos.reduce((a, r) => a + r * r, 0) / (n - 2) : 0;
  return { inclinacao, erro: sxx > 0 ? Math.sqrt(s2 / sxx) : Infinity, n, mx, my, sxx, s: Math.sqrt(s2) };
}

/** t(0,975) para poucos graus de liberdade; acima de 30, ≈ 1,96. */
export function tStudent95(gl: number): number {
  const tabela = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228];
  if (gl < 1) return Infinity;
  if (gl <= tabela.length) return tabela[gl - 1];
  if (gl <= 20) return 2.228 - ((gl - 10) * (2.228 - 2.086)) / 10;
  if (gl <= 30) return 2.086 - ((gl - 20) * (2.086 - 2.042)) / 10;
  return 1.96;
}

export interface Tendencia {
  de: string;
  ate: string;
  medicoes: number;
  /** kg por semana (negativo = perdendo) */
  gorda_semana: number;
  magra_semana: number;
  peso_semana: number;
  cintura_semana: number;
  bf_semana: number;
  /** Déficit médio por dia que as medidas mostram (positivo = déficit) */
  deficit_dia: number;
  /** Meia-largura da faixa de 95% do déficit (t de Student, n−2 graus de liberdade) */
  ic95_dia: number;
  /** Meia-largura da faixa de 95% de cada ritmo semanal (mesma conta do déficit) */
  ic95_semana: { gorda: number; magra: number; peso: number; cintura: number };
}

/**
 * Tendência das últimas medições (até `janelaDias` para trás), por regressão.
 * Precisa de pelo menos 4 medições cobrindo 3 semanas.
 */
export function tendenciaMedidas(composicoes: Composicao[], janelaDias = 42): Tendencia | null {
  // Medição atípica (doente, inchado, viagem) fica fora da tendência
  const validas = composicoes.filter((c) => c.massa_gorda_kg !== null && c.massa_magra_kg !== null && !c.atipica);
  if (!validas.length) return null;
  const ultima = validas[validas.length - 1].data;
  const janela = validas.filter((c) => diferencaDias(c.data, ultima) <= janelaDias);
  if (janela.length < 4 || diferencaDias(janela[0].data, ultima) < 21) return null;
  const xs = janela.map((c) => diferencaDias(janela[0].data, c.data));
  const g = reta(xs, janela.map((c) => c.massa_gorda_kg!));
  const m = reta(xs, janela.map((c) => c.massa_magra_kg!));
  const p = reta(xs, janela.map((c) => c.peso_kg));
  const ci = reta(xs, janela.map((c) => c.cintura_cm));
  const bf = reta(xs, janela.map((c) => c.bf!));
  // Uma série só de energia: massa gorda e magra vêm da mesma fita e da mesma
  // balança, então os erros delas andam juntos (não dá para somar como independentes).
  const e = reta(xs, janela.map((c) => c.massa_gorda_kg! * KCAL_KG_GORDA + c.massa_magra_kg! * KCAL_KG_MAGRA));
  const deficit_dia = -e.inclinacao;
  const t = tStudent95(janela.length - 2);
  const ic95_dia = t * e.erro;
  return {
    de: janela[0].data,
    ate: ultima,
    medicoes: janela.length,
    gorda_semana: g.inclinacao * 7,
    magra_semana: m.inclinacao * 7,
    peso_semana: p.inclinacao * 7,
    cintura_semana: ci.inclinacao * 7,
    bf_semana: bf.inclinacao * 7,
    deficit_dia,
    ic95_dia,
    ic95_semana: { gorda: t * g.erro * 7, magra: t * m.erro * 7, peso: t * p.erro * 7, cintura: t * ci.erro * 7 },
  };
}

/**
 * Ritmo semanal de uma série (ex.: pesagens de um bloco de dose), por
 * regressão, com a faixa de 95%. Precisa de 3 pontos cobrindo 1 semana.
 */
export function ritmoComFaixa(pontos: { data: string; valor: number }[]): { semana: number; ic95: number; n: number } | null {
  const pts = [...pontos].sort((a, b) => a.data.localeCompare(b.data));
  if (pts.length < 3 || diferencaDias(pts[0].data, pts[pts.length - 1].data) < 7) return null;
  const r = reta(
    pts.map((p) => diferencaDias(pts[0].data, p.data)),
    pts.map((p) => p.valor),
  );
  return { semana: r.inclinacao * 7, ic95: tStudent95(pts.length - 2) * r.erro * 7, n: pts.length };
}

/** Faixa larga demais para decidir: mais de 350 kcal/dia ou 40% do valor. */
export function faixaImprecisa(t: Tendencia): boolean {
  return t.ic95_dia > Math.max(350, Math.abs(t.deficit_dia) * 0.4);
}

// ---------- Ritmo estimado pelo déficit ----------

export interface FracaoMagra {
  /** Fração da perda que sai de massa magra (0 a 0,5) */
  p: number;
  /** 'tendencia' = pelas medidas; 'forbes' = estimativa pela massa gorda */
  fonte: 'tendencia' | 'forbes';
}

/**
 * Quanto da perda sai de massa magra: pela tendência das medidas (limitado a
 * 0–0,5) quando o peso está caindo; senão, Forbes: p = 10,4 / (10,4 + massa gorda).
 */
export function fracaoMagraDaPerda(tendencia: Tendencia | null, massaGorda: number): FracaoMagra {
  const perda = tendencia ? tendencia.gorda_semana + tendencia.magra_semana : 0;
  if (tendencia && perda < -0.1) return { p: Math.min(0.5, Math.max(0, tendencia.magra_semana / perda)), fonte: 'tendencia' };
  return { p: 10.4 / (10.4 + Math.max(0, massaGorda)), fonte: 'forbes' };
}

/** kcal por kg perdido: ρ = (1 − p) · 9.400 + p · 1.800 */
export function kcalPorKgPerdido(p: number): number {
  return (1 - p) * KCAL_KG_GORDA + p * KCAL_KG_MAGRA;
}

/** Ritmo previsto pelo déficit, em % do peso por semana: déficit × 7 / (ρ × peso) × 100. */
export function ritmoEstimado(deficitDia: number, peso: number, p: number): number {
  return peso > 0 ? ((deficitDia * 7) / (kcalPorKgPerdido(p) * peso)) * 100 : 0;
}

/** Déficit por dia necessário para chegar à massa gorda da meta até a data final (massa magra mantida). */
export function deficitNecessario(gordaAtual: number, gordaMeta: number, hoje: string, fim: string): number | null {
  const dias = diferencaDias(hoje, fim);
  if (dias <= 0) return null;
  return ((gordaAtual - gordaMeta) * KCAL_KG_GORDA) / dias;
}

/** Ritmo de perda em % do peso por semana e a faixa (0,5 a 1,0% preserva melhor a massa magra). */
export function ritmoPercentual(pesoSemana: number, peso: number): { pct: number; faixa: 'lento' | 'ideal' | 'rapido' | 'ganho' } {
  const pct = (-pesoSemana / peso) * 100;
  const faixa = pct < 0 ? 'ganho' : pct < 0.5 ? 'lento' : pct <= 1.0 ? 'ideal' : 'rapido';
  return { pct, faixa };
}

/** Tendência do peso (diário + medidas) nas últimas semanas, em kg por semana. */
export function tendenciaPeso(serie: { data: string; peso_kg: number; atipica?: boolean }[], hoje: string, janelaDias = 28): { kg_semana: number; pontos: number } | null {
  const pts = serie.filter((p) => diferencaDias(p.data, hoje) <= janelaDias && p.data <= hoje && !p.atipica);
  if (pts.length < 3 || diferencaDias(pts[0].data, pts[pts.length - 1].data) < 14) return null;
  const r = reta(
    pts.map((p) => diferencaDias(pts[0].data, p.data)),
    pts.map((p) => p.peso_kg),
  );
  return { kg_semana: r.inclinacao * 7, pontos: pts.length };
}

// ---------- Qualidade da perda ----------

export interface QualidadePerda {
  medicoes: number;
  de: string;
  ate: string;
  /** Fração da perda que saiu de gordura e de massa magra (somam 1) */
  gordura: number;
  magra: number;
  /** kg por semana (negativo = perdendo) */
  peso_semana: number;
  /** Ritmo em % do peso por semana (positivo = perdendo) */
  ritmo_pct: number;
  /** Cor de aviso: gordura abaixo de 75% da perda ou ritmo acima de 1%/sem */
  aviso: boolean;
  /** Peso parado ou subindo: não há perda para dividir */
  sem_perda: boolean;
}

/**
 * Abaixo de 0,05 kg/sem de queda, a massa magra conta como estável: é ruído da
 * fita e da balança, não sinal (vale para o texto e para "reduzir o déficit").
 */
export const RUIDO_MAGRA_SEMANA = 0.05;

export function magraCaindo(t: Pick<Tendencia, 'magra_semana'>): boolean {
  return t.magra_semana < -RUIDO_MAGRA_SEMANA;
}

/** Gordura abaixo desta fração da perda pede atenção (a regra clássica é ~3/4 de gordura). */
export const GORDURA_MINIMA_DA_PERDA = 0.75;

/**
 * De onde veio a perda nas últimas `n` medições (fora as atípicas): inclinação da
 * massa gorda e da magra pela regressão, como fração da inclinação do peso.
 * Precisa de 3 medições cobrindo 2 semanas.
 */
export function qualidadePerda(composicoes: Composicao[], n = 4): QualidadePerda | null {
  const validas = composicoes.filter((c) => c.massa_gorda_kg !== null && c.massa_magra_kg !== null && !c.atipica).slice(-n);
  if (validas.length < 3) return null;
  const de = validas[0].data;
  const ate = validas[validas.length - 1].data;
  if (diferencaDias(de, ate) < 14) return null;
  const xs = validas.map((c) => diferencaDias(de, c.data));
  const g = reta(xs, validas.map((c) => c.massa_gorda_kg!)).inclinacao * 7;
  const m = reta(xs, validas.map((c) => c.massa_magra_kg!)).inclinacao * 7;
  const peso_semana = g + m;
  const peso = validas[validas.length - 1].peso_kg;
  const ritmo_pct = (-peso_semana / peso) * 100;
  // Menos de 0,1 kg/sem: peso parado, a divisão não quer dizer nada
  const sem_perda = peso_semana > -0.1;
  const gordura = sem_perda ? 0 : g / peso_semana;
  return {
    medicoes: validas.length,
    de,
    ate,
    gordura,
    magra: sem_perda ? 0 : 1 - gordura,
    peso_semana,
    ritmo_pct,
    aviso: !sem_perda && (gordura < GORDURA_MINIMA_DA_PERDA || ritmo_pct > 1),
    sem_perda,
  };
}

/** "70% gordura · 30% massa magra" (ou o caso em que uma das duas subiu). */
export function textoQualidade(q: QualidadePerda): string {
  if (q.sem_perda) return 'peso parado ou subindo, sem perda para dividir';
  const p = (f: number) => `${Math.round(f * 100)}%`;
  if (q.magra <= 0) return 'toda a perda foi gordura (massa magra estável ou subindo)';
  if (q.gordura <= 0) return 'toda a perda foi massa magra (massa gorda estável ou subindo)';
  return `${p(q.gordura)} gordura · ${p(q.magra)} massa magra`;
}

// ---------- Projeção "No ritmo" ----------

export type ChaveProjecao = 'cintura_cm' | 'peso_kg' | 'bf' | 'massa_magra_kg' | 'massa_gorda_kg';

export interface ValorProjetado {
  /** Valor da reta no horizonte */
  valor: number;
  /** Faixa de 95% da reta no horizonte (t de Student, n − 2 graus de liberdade) */
  min: number;
  max: number;
}

export interface Projecao {
  horizonte: string;
  /** true quando o horizonte é o fim do projeto; false = hoje + 8 semanas */
  ate_o_fim: boolean;
  medicoes: number;
  valores: Record<ChaveProjecao, ValorProjetado>;
}

/** Janela, mínimo de medições e de dias, semana a partir da qual aparece e horizonte máximo. */
export const PROJECAO = { janela: 42, medicoes: 5, dias: 28, semana: 6, horizonte: 56 } as const;

/**
 * Onde cada medida estará no horizonte, mantido o ritmo das últimas 6 semanas.
 * Só a partir da semana 6 do projeto (passa a perda de água e glicogênio do
 * início), com 5 medições cobrindo 4 semanas. Horizonte: o fim do projeto ou
 * hoje + 8 semanas, o que vier antes. Parte do valor da reta (não do último
 * ponto, que tem o ruído daquela segunda) e dá a faixa de 95% da reta.
 */
export function projecaoNoRitmo(composicoes: Composicao[], hoje: string, fim: string, semanaProjeto: number): Projecao | null {
  // No último dia do projeto o horizonte é o próprio dia; só depois do fim não há projeção
  if (semanaProjeto < PROJECAO.semana || hoje > fim) return null;
  const validas = composicoes.filter((c) => c.bf !== null && c.massa_gorda_kg !== null && c.massa_magra_kg !== null && !c.atipica && c.data <= hoje);
  if (!validas.length) return null;
  const ultima = validas[validas.length - 1].data;
  const janela = validas.filter((c) => diferencaDias(c.data, ultima) <= PROJECAO.janela);
  if (janela.length < PROJECAO.medicoes || diferencaDias(janela[0].data, ultima) < PROJECAO.dias) return null;
  const limite = somarDias(hoje, PROJECAO.horizonte);
  const ate_o_fim = fim <= limite;
  const horizonte = ate_o_fim ? fim : limite;
  const xs = janela.map((c) => diferencaDias(janela[0].data, c.data));
  const xh = diferencaDias(janela[0].data, horizonte);
  const t = tStudent95(janela.length - 2);
  const projetar = (ys: number[]): ValorProjetado => {
    const r = reta(xs, ys);
    const valor = r.my + r.inclinacao * (xh - r.mx);
    const meia = t * r.s * Math.sqrt(1 / r.n + (xh - r.mx) ** 2 / r.sxx);
    return { valor, min: valor - meia, max: valor + meia };
  };
  return {
    horizonte,
    ate_o_fim,
    medicoes: janela.length,
    valores: {
      cintura_cm: projetar(janela.map((c) => c.cintura_cm)),
      peso_kg: projetar(janela.map((c) => c.peso_kg)),
      bf: projetar(janela.map((c) => c.bf!)),
      massa_magra_kg: projetar(janela.map((c) => c.massa_magra_kg!)),
      massa_gorda_kg: projetar(janela.map((c) => c.massa_gorda_kg!)),
    },
  };
}

export type ChanceMeta = 'provavel' | 'possivel' | 'improvavel';

/** Chance de chegar à meta pela faixa: a faixa inteira do lado certo = provável; inteira do lado errado = improvável. */
export function chanceMeta(p: ValorProjetado, meta: number, menorMelhor: boolean): ChanceMeta {
  if (menorMelhor) return p.max <= meta ? 'provavel' : p.min > meta ? 'improvavel' : 'possivel';
  return p.min >= meta ? 'provavel' : p.max < meta ? 'improvavel' : 'possivel';
}
