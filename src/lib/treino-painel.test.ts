import { describe, expect, it } from 'vitest';
import { abaTreino, barraPlacar, celulaDia, resumoCorridas, textoHoje, tomPlacar } from './treino-painel';
import type { Corrida } from './treino';

describe('abaTreino', () => {
  it('links antigos e valores desconhecidos abrem Hoje', () => {
    expect(abaTreino(null)).toBe('hoje');
    expect(abaTreino('')).toBe('hoje');
    expect(abaTreino('agenda')).toBe('hoje');
  });
  it('abas conhecidas', () => {
    expect(abaTreino('placar')).toBe('placar');
    expect(abaTreino('corridas')).toBe('corridas');
    expect(abaTreino('forca')).toBe('forca');
    expect(abaTreino('metas')).toBe('metas');
  });
});

describe('celulaDia', () => {
  it('nível = quantos dos dois foram feitos', () => {
    expect(celulaDia('2026-11-01', '2026-11-02', { treino: true, cardio: true })).toMatchObject({ estado: 'passado', nivel: 2 });
    expect(celulaDia('2026-11-01', '2026-11-02', { treino: false, cardio: true })).toMatchObject({ nivel: 1, treino: false, cardio: true });
    expect(celulaDia('2026-11-01', '2026-11-02', undefined)).toMatchObject({
      nivel: 0,
      treino: false,
      cardio: false,
    });
  });
  it('estado pelo dia de hoje', () => {
    expect(celulaDia('2026-11-02', '2026-11-02').estado).toBe('hoje');
    expect(celulaDia('2026-11-03', '2026-11-02').estado).toBe('futuro');
  });
});

describe('textoHoje', () => {
  it('descreve o que falta', () => {
    expect(textoHoje({ treino: true, cardio: true })).toEqual({
      texto: '✓ completo',
      completo: true,
    });
    expect(textoHoje({ treino: true, cardio: false }).texto).toBe('falta cardio');
    expect(textoHoje({ treino: false, cardio: true }).texto).toBe('falta treino');
    expect(textoHoje(null).texto).toBe('a marcar');
  });
});

describe('tomPlacar', () => {
  it('faixas 90% e 70%', () => {
    expect(tomPlacar(null)).toBe('');
    expect(tomPlacar(0.9)).toBe('bom');
    expect(tomPlacar(0.75)).toBe('aviso');
    expect(tomPlacar(0.5)).toBe('ruim');
  });
});

describe('barraPlacar', () => {
  it('frações sobre o total do período', () => {
    expect(
      barraPlacar({
        meta: 50,
        feito: 40,
        aderencia: 0.8,
        projecao: 160,
        total: 200,
      }),
    ).toEqual({ feito: 0.2, meta: 0.25, projecao: 0.8 });
  });
  it('total zero não divide por zero; projeção nunca abaixo do feito', () => {
    expect(
      barraPlacar({
        meta: 0,
        feito: 0,
        aderencia: null,
        projecao: 0,
        total: 0,
      }),
    ).toEqual({ feito: 0, meta: 0, projecao: 0 });
    expect(
      barraPlacar({
        meta: 10,
        feito: 12,
        aderencia: 1,
        projecao: 11,
        total: 20,
      }).projecao,
    ).toBe(0.6);
  });
});

describe('resumoCorridas', () => {
  const c = (data: string, km: number, segundos: number): Corrida => ({
    data,
    km,
    segundos,
    pace: segundos / km,
    delta: null,
  });
  it('sem corridas: null', () => {
    expect(resumoCorridas([])).toBeNull();
  });
  it('última, melhor pace e distância média', () => {
    const r = resumoCorridas([c('2026-10-01', 5, 1600), c('2026-10-08', 5, 1500), c('2026-10-15', 6, 1900)])!;
    expect(r.ultima.data).toBe('2026-10-15');
    expect(r.melhor.data).toBe('2026-10-08');
    expect(r.kmMedio).toBeCloseTo(16 / 3);
  });
});
