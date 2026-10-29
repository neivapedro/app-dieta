import { describe, expect, it } from 'vitest';
import {
  alturaMedia,
  destinoAba,
  destinoFolha,
  deveFecharFolha,
  direcaoGesto,
  easeOut,
  LIMITE_PUXAR,
  MAX_PUXAR,
  resistencia,
  seguirDedoAba,
  usarDetentes,
  valorContagem,
  velocidadeGesto,
} from './movimento-gestos';

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

describe('folha com detentes', () => {
  it('altura média: ~58% da tela', () => {
    expect(alturaMedia(844)).toBe(Math.round(844 * 0.58));
    expect(alturaMedia(-5)).toBe(0);
  });

  it('só usa detentes quando o conteúdo passa bem da altura média e a tela é estreita', () => {
    expect(usarDetentes(800, 844, 390)).toBe(true);
    expect(usarDetentes(300, 844, 390)).toBe(false);
    // Só um pouco maior que a média: abre inteira
    expect(usarDetentes(alturaMedia(844) + 20, 844, 390)).toBe(false);
    // Tela larga: janela no meio, sem detentes
    expect(usarDetentes(2000, 900, 800)).toBe(false);
    expect(usarDetentes(800, 0, 390)).toBe(false);
  });

  it('sem detentes: volta inteira ou fecha (25% ou gesto rápido)', () => {
    expect(destinoFolha(500, 0, 0, 500)).toBe('grande');
    expect(destinoFolha(450, 0, 0, 500)).toBe('grande');
    expect(destinoFolha(360, 0, 0, 500)).toBe('fechar');
    expect(destinoFolha(470, 0.8, 0, 500)).toBe('fechar');
  });

  it('entre o médio e o grande: o mais perto, ou na direção de um gesto rápido', () => {
    expect(destinoFolha(700, 0, 490, 776)).toBe('grande');
    expect(destinoFolha(560, 0, 490, 776)).toBe('media');
    expect(destinoFolha(520, -0.8, 490, 776)).toBe('grande');
    expect(destinoFolha(760, 0.9, 490, 776)).toBe('media');
  });

  it('abaixo do médio: volta ao médio ou fecha', () => {
    expect(destinoFolha(470, 0, 490, 776)).toBe('media');
    expect(destinoFolha(300, 0, 490, 776)).toBe('fechar');
    expect(destinoFolha(460, 0.7, 490, 776)).toBe('fechar');
    expect(destinoFolha(485, 0.7, 490, 776)).toBe('media');
  });
});

describe('deslizar entre sub-abas', () => {
  it('o conteúdo anda menos que o dedo, com teto, e quase nada sem vizinha', () => {
    expect(seguirDedoAba(0, 390, true)).toBe(0);
    expect(seguirDedoAba(100, 390, true)).toBeLessThan(100);
    expect(seguirDedoAba(100, 390, true)).toBeGreaterThan(0);
    expect(seguirDedoAba(-100, 390, true)).toBeLessThan(0);
    expect(seguirDedoAba(5000, 390, true)).toBeLessThanOrEqual(390 * 0.35);
    expect(Math.abs(seguirDedoAba(200, 390, false))).toBeLessThan(Math.abs(seguirDedoAba(200, 390, true)));
  });

  it('troca passando de 28% da largura ou num gesto rápido; dedo para a esquerda = próxima', () => {
    expect(destinoAba(-120, 0, 390)).toBe(1);
    expect(destinoAba(120, 0, 390)).toBe(-1);
    expect(destinoAba(-60, 0, 390)).toBe(0);
    expect(destinoAba(-60, -0.6, 390)).toBe(1);
    expect(destinoAba(60, 0.6, 390)).toBe(-1);
    // Rápido, mas curto demais, ou voltando
    expect(destinoAba(-20, -0.9, 390)).toBe(0);
    expect(destinoAba(-60, 0.6, 390)).toBe(0);
  });
});
