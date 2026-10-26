import { describe, expect, it } from 'vitest';
import { deveFecharFolha, direcaoGesto, easeOut, LIMITE_PUXAR, MAX_PUXAR, resistencia, valorContagem, velocidadeGesto } from './movimento-gestos';

describe('contagem', () => {
  it('ease-out vai de 0 a 1, rápido no começo', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.8);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });

  it('termina exatamente no alvo, também ao contar para baixo', () => {
    expect(valorContagem(0, 82.4, 1)).toBe(82.4);
    expect(valorContagem(0, 82.4, 1.3)).toBe(82.4);
    expect(valorContagem(90, 82.4, 0)).toBe(90);
    const meio = valorContagem(90, 80, 0.5);
    expect(meio).toBeLessThan(90);
    expect(meio).toBeGreaterThan(80);
  });
});

describe('puxar para atualizar', () => {
  it('a resistência cresce menos que o dedo e não passa do teto', () => {
    expect(resistencia(0)).toBe(0);
    expect(resistencia(-30)).toBe(0);
    expect(resistencia(50)).toBeLessThan(50);
    expect(resistencia(1000)).toBeLessThanOrEqual(MAX_PUXAR);
    expect(resistencia(80)).toBeLessThan(LIMITE_PUXAR);
    expect(resistencia(160)).toBeGreaterThan(LIMITE_PUXAR);
  });

  it('a direção só se decide depois do limiar', () => {
    expect(direcaoGesto(2, 3)).toBeNull();
    expect(direcaoGesto(2, 20)).toBe('vertical');
    expect(direcaoGesto(20, 5)).toBe('horizontal');
    expect(direcaoGesto(0, -12)).toBe('vertical');
  });
});

describe('arrastar a folha', () => {
  it('fecha passando de 25% da altura', () => {
    expect(deveFecharFolha(99, 400, 0)).toBe(false);
    expect(deveFecharFolha(100, 400, 0)).toBe(true);
    expect(deveFecharFolha(-50, 400, 2)).toBe(false);
  });

  it('gesto rápido fecha mesmo curto, mas não um toque', () => {
    expect(deveFecharFolha(40, 600, 0.8)).toBe(true);
    expect(deveFecharFolha(10, 600, 2)).toBe(false);
    expect(deveFecharFolha(40, 600, 0.2)).toBe(false);
  });

  it('velocidade pelas amostras recentes', () => {
    expect(velocidadeGesto([])).toBe(0);
    expect(velocidadeGesto([{ y: 0, t: 0 }])).toBe(0);
    expect(velocidadeGesto([{ y: 0, t: 0 }, { y: 50, t: 50 }, { y: 100, t: 100 }])).toBe(1);
    // Amostras antigas não contam: o dedo parou no fim
    expect(velocidadeGesto([{ y: 0, t: 0 }, { y: 200, t: 100 }, { y: 200, t: 400 }])).toBe(0);
  });
});
