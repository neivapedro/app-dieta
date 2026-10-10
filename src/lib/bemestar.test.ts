import { describe, expect, it } from 'vitest';
import { aguaSemana, diaDeSintoma, mediaSono7, metaAgua, sonoPorFase } from './bemestar';
import type { AnaliseFase } from './analise';
import { lerFaixa } from './formato';
import type { RegistroDiario } from './tipos';

const r = (data: string, extra: Partial<RegistroDiario> = {}): RegistroDiario => ({ id: data, data, peso_kg: null, nausea: null, observacoes: null, ...extra });

describe('Sono', () => {
  const hoje = '2026-10-20';
  it('média de 7 dias só com 4 noites ou mais', () => {
    const tres = [r('2026-10-18', { sono_h: 6 }), r('2026-10-19', { sono_h: 6 }), r('2026-10-20', { sono_h: 6 })];
    expect(mediaSono7(tres, hoje)).toEqual({ media: null, noites: 3, baixo: false });
    const quatro = [...tres, r('2026-10-14', { sono_h: 7 })];
    const m = mediaSono7(quatro, hoje);
    expect(m.noites).toBe(4);
    expect(m.media).toBeCloseTo(6.25);
    expect(m.baixo).toBe(true);
  });
  it('fora da janela de 7 dias não conta; 7 h não é baixo', () => {
    const l = ['2026-10-13', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map((d) => r(d, { sono_h: d === '2026-10-13' ? 3 : 7 }));
    expect(mediaSono7(l, hoje)).toEqual({ media: 7, noites: 4, baixo: false });
  });
  it('média por fase', () => {
    const fases = [{ inicio: '2026-10-01' }, { inicio: '2026-10-15' }] as AnaliseFase[];
    const d = [
      ...['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((x) => r(x, { sono_h: 8 })),
      ...['2026-10-15', '2026-10-16'].map((x) => r(x, { sono_h: 5 })),
    ];
    expect(sonoPorFase(fases, d, '2026-10-20')).toEqual([8, null]);
  });
});

describe('Água', () => {
  it('meta = 2 L + 0,7 L por hora de exercício', () => {
    expect(metaAgua(0)).toBe(2);
    expect(metaAgua(1.5)).toBeCloseTo(3.05);
    expect(metaAgua(-1)).toBe(2);
  });
  it('média da semana nos dias com registro e cor da urina', () => {
    const d = [
      r('2026-10-14', { agua_l: 2, cor_urina: 'escura' }),
      r('2026-10-18', { agua_l: 3, cor_urina: 'clara' }),
      r('2026-10-20', { cor_urina: 'amarela' }),
      r('2026-10-10', { agua_l: 9 }), // fora da janela
    ];
    const a = aguaSemana(d, '2026-10-20', (data) => (data === '2026-10-18' ? 3 : 2));
    expect(a.media).toBe(2.5);
    expect(a.dias).toBe(2);
    expect(a.meta_media).toBe(2.5);
    expect(a.urina).toEqual({ clara: 1, amarela: 1, escura: 1 });
    expect(aguaSemana([], '2026-10-20', () => 2).media).toBeNull();
  });
  it('dia de sintoma: vômito ou diarreia', () => {
    expect(diaDeSintoma({ vomito: true })).toBe(true);
    expect(diaDeSintoma({ diarreia: true, vomito: false })).toBe(true);
    expect(diaDeSintoma({ vomito: false, diarreia: null })).toBe(false);
    expect(diaDeSintoma(undefined)).toBe(false);
  });
});

describe('Número opcional com faixa', () => {
  it('vazio é null; fora da faixa é erro', () => {
    expect(lerFaixa('', 0, 24, 'Sono', 'h')).toEqual({ valor: null });
    expect(lerFaixa('6,5', 0, 24, 'Sono', 'h')).toEqual({ valor: 6.5 });
    expect(lerFaixa('30', 0, 24, 'Sono', 'h').erro).toContain('Sono fora da faixa (0 a 24 h)');
    expect(lerFaixa('1,2,3', 0, 15, 'Água', 'L').erro).toBeDefined();
  });
});
