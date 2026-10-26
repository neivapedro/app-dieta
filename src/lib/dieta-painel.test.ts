import { describe, expect, it } from 'vitest';
import { estadoFalta, falta, fatiasKcal, fracaoAnel, partesBarra, proximoNomeRefeicao } from './dieta-painel';
import { ZERO } from './dieta';

describe('falta', () => {
  it('✓ dentro da tolerância (o maior entre a tolerância e 2% da meta)', () => {
    expect(falta(0.8, 142, ' g', 1)).toEqual({ classe: 'bom', texto: '✓' });
    expect(falta(2.5, 142, ' g', 1)).toEqual({ classe: 'bom', texto: '✓' }); // 2% de 142 = 2,84
    expect(falta(30, 1982, '', 15)).toEqual({ classe: 'bom', texto: '✓' });
    expect(estadoFalta(-0.5, 10, 1)).toBe('ok');
  });
  it('quanto falta, sem sinal; "+" em vermelho quando passou', () => {
    expect(falta(22, 142, ' g', 1)).toEqual({ classe: '', texto: '22 g' });
    expect(falta(-12, 92, ' g', 1)).toEqual({ classe: 'ruim', texto: '+12 g' });
    expect(falta(1982, 1982, '', 15)).toEqual({ classe: '', texto: '1.982' });
    expect(estadoFalta(-50, 1982, 15)).toBe('passou');
    expect(estadoFalta(50, 1982, 15)).toBe('falta');
  });
});

describe('partesBarra', () => {
  it('abaixo da meta: só o feito, a meta no fim do trilho', () => {
    expect(partesBarra(71, 142)).toEqual({ feito: 0.5, excesso: 0, marca: 1 });
  });
  it('acima da meta: o excesso à parte e a marca da meta antes do fim', () => {
    const p = partesBarra(150, 100);
    expect(p.feito).toBeCloseTo(100 / 150);
    expect(p.excesso).toBeCloseTo(50 / 150);
    expect(p.marca).toBeCloseTo(100 / 150);
  });
  it('sem plano e sem meta: vazio; meta negativa (carbo) conta como zero', () => {
    expect(partesBarra(0, 0)).toEqual({ feito: 0, excesso: 0, marca: null });
    expect(partesBarra(20, -10)).toEqual({ feito: 0, excesso: 1, marca: null });
  });
});

describe('fracaoAnel', () => {
  it('limita entre 0 e 1', () => {
    expect(fracaoAnel(991, 1982)).toBeCloseTo(0.5);
    expect(fracaoAnel(2500, 1982)).toBe(1);
    expect(fracaoAnel(100, 0)).toBe(0);
  });
});

describe('fatiasKcal', () => {
  it('soma 100% das kcal do plano, com o colágeno à parte da vegetal', () => {
    const total = { ...ZERO, ptn_animal: 100, ptn_vegetal: 30, carb: 150, gord: 50 };
    total.kcal = 4 * 100 + 4 * 30 + 4 * 150 + 9 * 50;
    const f = fatiasKcal(total, 10);
    expect(f.map((x) => x.chave)).toEqual(['ptn_animal', 'ptn_vegetal', 'colageno', 'carb', 'gord']);
    expect(f.reduce((s, x) => s + x.kcal, 0)).toBeCloseTo(total.kcal);
    expect(f.reduce((s, x) => s + x.fracao, 0)).toBeCloseTo(1);
    expect(f.find((x) => x.chave === 'ptn_vegetal')?.g).toBe(20);
    expect(f.find((x) => x.chave === 'colageno')?.kcal).toBe(40);
  });
  it('plano vazio: sem fatias', () => {
    expect(fatiasKcal(ZERO, 0)).toEqual([]);
  });
});

describe('proximoNomeRefeicao', () => {
  it('depois do maior número em uso, sem repetir', () => {
    expect(proximoNomeRefeicao([])).toBe('Refeição 1');
    expect(proximoNomeRefeicao([{ nome: 'Refeição 1' }, { nome: 'Pós-treino' }])).toBe('Refeição 3');
    expect(proximoNomeRefeicao([{ nome: 'Refeição 5' }])).toBe('Refeição 6');
  });
});
