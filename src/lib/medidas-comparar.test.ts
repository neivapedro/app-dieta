import { describe, expect, it } from 'vitest';
import type { FotoInfo } from './fotos';
import { historicoComAnterior, paresComparar, passoCortina, posicaoCortina } from './medidas-comparar';

const f = (id: string, sessao: FotoInfo['sessao'], rotulo: FotoInfo['rotulo'], data: string, ordem = 0): FotoInfo => ({ id, sessao, rotulo, data, ordem });

describe('paresComparar', () => {
  it('sem foto numa das sessões, nenhum par', () => {
    expect(paresComparar([])).toEqual([]);
    expect(paresComparar([f('a', 'antes', 'frente', '2026-09-01')])).toEqual([]);
    expect(paresComparar([f('d', 'depois', 'frente', '2026-11-01')])).toEqual([]);
  });

  it('um par por pose: a 1ª do Antes × a mais recente do Depois, na ordem Frente, Lado, Costas', () => {
    const fotos = [
      f('a2', 'antes', 'frente', '2026-09-03'),
      f('a1', 'antes', 'frente', '2026-09-01'),
      f('al', 'antes', 'costas', '2026-09-01', 1),
      f('d1', 'depois', 'frente', '2026-10-01'),
      f('d2', 'depois', 'frente', '2026-11-01'),
      f('dc', 'depois', 'costas', '2026-11-01', 1),
      f('dl', 'depois', 'lado', '2026-11-01', 2),
    ];
    const pares = paresComparar(fotos);
    expect(pares.map((p) => [p.chave, p.rotulo, p.antes.id, p.depois.id])).toEqual([
      ['frente', 'Frente', 'a1', 'd2'],
      ['costas', 'Costas', 'al', 'dc'],
    ]);
  });

  it('sem pose em comum: a 1ª do Antes × a última do Depois', () => {
    const fotos = [f('a1', 'antes', 'outra', '2026-09-01'), f('a2', 'antes', 'frente', '2026-09-02'), f('d1', 'depois', 'outra', '2026-10-01'), f('d2', 'depois', 'lado', '2026-11-01')];
    const [p, ...resto] = paresComparar(fotos);
    expect(resto).toEqual([]);
    expect([p.chave, p.antes.id, p.depois.id]).toEqual(['geral', 'a1', 'd2']);
  });
});

describe('cortina', () => {
  it('posição pelo dedo, presa entre 0 e 100', () => {
    expect(posicaoCortina(150, 100, 200)).toBe(25);
    expect(posicaoCortina(50, 100, 200)).toBe(0);
    expect(posicaoCortina(400, 100, 200)).toBe(100);
    expect(posicaoCortina(10, 0, 0)).toBe(50);
  });

  it('teclado', () => {
    expect(passoCortina(50, 'ArrowLeft')).toBe(45);
    expect(passoCortina(98, 'ArrowRight')).toBe(100);
    expect(passoCortina(10, 'PageDown')).toBe(0);
    expect(passoCortina(30, 'Home')).toBe(0);
    expect(passoCortina(30, 'End')).toBe(100);
    expect(passoCortina(30, 'a')).toBeNull();
  });
});

describe('historicoComAnterior', () => {
  it('mais recente primeiro, com a normal anterior; a atípica sem anterior e pulada pelas outras', () => {
    const lista = [{ n: 1 }, { n: 2, atipica: true }, { n: 3 }, { n: 4 }];
    const h = historicoComAnterior(lista);
    expect(h.map((x) => [x.item.n, x.indice, x.anterior?.n ?? null])).toEqual([
      [4, 3, 3],
      [3, 2, 1],
      [2, 1, null],
      [1, 0, null],
    ]);
  });
});
