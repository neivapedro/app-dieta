// Ajudantes do painel da Dieta (só apresentação: as contas continuam em lib/dieta).
import { num } from './formato';
import type { Macros, Refeicao } from './dieta';

export type EstadoMacro = 'ok' | 'falta' | 'passou';

/** Dentro da tolerância: o maior entre `tolerancia` e 2% da meta. */
export function estadoFalta(falta: number, meta: number, tolerancia: number): EstadoMacro {
  if (Math.abs(falta) <= Math.max(tolerancia, Math.abs(meta) * 0.02)) return 'ok';
  return falta < 0 ? 'passou' : 'falta';
}

/** Classe e texto da coluna "Falta": ✓ dentro da tolerância, "+" em vermelho quando passou. */
export function falta(valor: number, meta: number, sufixo: string, tolerancia: number): { classe: string; texto: string } {
  const e = estadoFalta(valor, meta, tolerancia);
  if (e === 'ok') return { classe: 'bom', texto: '✓' };
  if (e === 'passou') return { classe: 'ruim', texto: `+${num(-valor, 0)}${sufixo}` };
  return { classe: '', texto: `${num(valor, 0)}${sufixo}` };
}

/**
 * Partes de uma barra plano × meta, em frações do trilho (0 a 1).
 * O trilho vai até o maior entre a meta e o plano: o que passou da meta aparece à parte.
 */
export function partesBarra(plano: number, meta: number): { feito: number; excesso: number; marca: number | null } {
  const p = Math.max(0, plano);
  const m = Math.max(0, meta);
  const fim = Math.max(p, m);
  if (fim <= 0) return { feito: 0, excesso: 0, marca: null };
  const dentro = Math.min(p, m);
  return { feito: dentro / fim, excesso: (p - dentro) / fim, marca: m > 0 ? m / fim : null };
}

/** Fração do anel de kcal (0 a 1): sem meta, vazio. */
export function fracaoAnel(plano: number, meta: number): number {
  if (meta <= 0) return 0;
  return Math.min(Math.max(plano / meta, 0), 1);
}

export interface FatiaKcal {
  chave: 'ptn_animal' | 'ptn_vegetal' | 'colageno' | 'carb' | 'gord';
  rotulo: string;
  classe: string;
  g: number;
  kcal: number;
  /** Fração das kcal do plano */
  fracao: number;
}

/**
 * De onde vêm as kcal do plano (4/4/9, como no total). Colágeno e gelatina
 * aparecem à parte da proteína vegetal: entram nas kcal, não na proteína.
 */
export function fatiasKcal(total: Macros, colageno: number): FatiaKcal[] {
  const col = Math.min(Math.max(colageno, 0), Math.max(total.ptn_vegetal, 0));
  const lista: Omit<FatiaKcal, 'fracao'>[] = [
    { chave: 'ptn_animal', rotulo: 'Ptn animal', classe: 'm-pa', g: total.ptn_animal, kcal: total.ptn_animal * 4 },
    { chave: 'ptn_vegetal', rotulo: 'Ptn vegetal', classe: 'm-pv', g: total.ptn_vegetal - col, kcal: (total.ptn_vegetal - col) * 4 },
    { chave: 'colageno', rotulo: 'Colágeno', classe: 'texto-2', g: col, kcal: col * 4 },
    { chave: 'carb', rotulo: 'Carboidrato', classe: 'm-c', g: total.carb, kcal: total.carb * 4 },
    { chave: 'gord', rotulo: 'Gordura', classe: 'm-g', g: total.gord, kcal: total.gord * 9 },
  ];
  const soma = lista.reduce((s, f) => s + Math.max(f.kcal, 0), 0);
  return lista.filter((f) => f.kcal >= 0.5).map((f) => ({ ...f, fracao: soma > 0 ? f.kcal / soma : 0 }));
}

/** Próximo "Refeição N" livre, sempre depois do maior número em uso. */
export function proximoNomeRefeicao(refeicoes: Pick<Refeicao, 'nome'>[]): string {
  const n = 1 + Math.max(0, refeicoes.length, ...refeicoes.map((r) => Number(/^Refeição (\d+)$/.exec(r.nome)?.[1] ?? 0)));
  const usados = new Set(refeicoes.map((r) => r.nome));
  let k = n;
  while (usados.has(`Refeição ${k}`)) k++;
  return `Refeição ${k}`;
}
