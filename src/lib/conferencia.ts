import { diferencaDias } from './datas';
import type { Composicao } from './gordura';

/** Energia de 1 kg de tecido (Hall, 2008): gordura ≈ 9.400 kcal; massa magra ≈ 1.800 kcal */
export const KCAL_KG_GORDA = 9400;
export const KCAL_KG_MAGRA = 1800;

interface Reta {
  inclinacao: number;
  erro: number;
}

/** Regressão linear simples (x em dias); erro padrão da inclinação. */
function reta(xs: number[], ys: number[]): Reta {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const inclinacao = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
  const residuos = ys.map((y, i) => y - (my + inclinacao * (xs[i] - mx)));
  const s2 = n > 2 ? residuos.reduce((a, r) => a + r * r, 0) / (n - 2) : 0;
  return { inclinacao, erro: Math.sqrt(s2 / sxx) };
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
}

/**
 * Tendência das últimas medições (até `janelaDias` para trás), por regressão.
 * Precisa de pelo menos 4 medições cobrindo 3 semanas.
 */
export function tendenciaMedidas(composicoes: Composicao[], janelaDias = 42): Tendencia | null {
  const validas = composicoes.filter((c) => c.massa_gorda_kg !== null && c.massa_magra_kg !== null);
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
  const ic95_dia = tStudent95(janela.length - 2) * e.erro;
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
  };
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
export function tendenciaPeso(serie: { data: string; peso_kg: number }[], hoje: string, janelaDias = 28): { kg_semana: number; pontos: number } | null {
  const pts = serie.filter((p) => diferencaDias(p.data, hoje) <= janelaDias && p.data <= hoje);
  if (pts.length < 3 || diferencaDias(pts[0].data, pts[pts.length - 1].data) < 14) return null;
  const r = reta(
    pts.map((p) => diferencaDias(pts[0].data, p.data)),
    pts.map((p) => p.peso_kg),
  );
  return { kg_semana: r.inclinacao * 7, pontos: pts.length };
}
