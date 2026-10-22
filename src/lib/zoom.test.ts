import { describe, expect, it } from 'vitest';
import {
  alternarZoom,
  ampliada,
  areaConteudo,
  assentarVista,
  escalaElastica,
  limitarVista,
  textoEscala,
  VISTA_INICIAL,
  vistaDaPinca,
  ZOOM_DUPLO,
  ZOOM_MAX,
  zoomNoPonto,
  type Vista,
} from './zoom';

// Ponto da imagem q aparece na tela em t + s·q
const naTela = (v: Vista, q: { x: number; y: number }) => ({ x: v.x + v.s * q.x, y: v.y + v.s * q.y });
const perto = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('Área do desenho (object-fit: contain)', () => {
  it('foto em pé numa caixa larga: faixas dos lados', () => {
    expect(areaConteudo({ w: 390, h: 500 }, { w: 3000, h: 4000 })).toEqual({ w: 375, h: 500 });
  });
  it('foto deitada: ocupa a largura', () => {
    expect(areaConteudo({ w: 390, h: 292.5 }, { w: 4000, h: 3000 })).toEqual({ w: 390, h: 292.5 });
  });
  it('sem tamanho natural (não carregou): o elemento todo', () => {
    expect(areaConteudo({ w: 390, h: 300 }, { w: 0, h: 0 })).toEqual({ w: 390, h: 300 });
  });
});

describe('Zoom em volta de um ponto', () => {
  it('o ponto sob o dedo fica parado', () => {
    const v = { x: -50, y: -20, s: 1.5 };
    const p = { x: 120, y: 80 };
    const q = { x: (p.x - v.x) / v.s, y: (p.y - v.y) / v.s };
    const n = zoomNoPonto(v, 3, p);
    expect(n.s).toBe(3);
    perto(naTela(n, q), p);
  });
});

describe('Pinça', () => {
  it('dedos se afastando ampliam no meio deles', () => {
    const meio = { x: 200, y: 150 };
    const v = vistaDaPinca(VISTA_INICIAL, meio, 100, meio, 200);
    expect(v.s).toBeCloseTo(2, 6);
    perto(naTela(v, meio), meio); // o ponto do meio continua no meio
  });
  it('mexer os dois dedos juntos também arrasta', () => {
    const v = vistaDaPinca({ x: -100, y: -100, s: 2 }, { x: 100, y: 100 }, 80, { x: 130, y: 90 }, 80);
    expect(v).toEqual({ x: -70, y: -110, s: 2 });
  });
  it('passa de 4× e de 1× com resistência', () => {
    const muito = vistaDaPinca(VISTA_INICIAL, { x: 0, y: 0 }, 50, { x: 0, y: 0 }, 400).s; // 8× cru
    expect(muito).toBeGreaterThan(ZOOM_MAX);
    expect(muito).toBeLessThan(5);
    expect(escalaElastica(0.5)).toBeGreaterThan(0.5);
    expect(escalaElastica(0.5)).toBeLessThan(1);
    expect(escalaElastica(2)).toBe(2);
  });
});

describe('Limite do arraste', () => {
  const janela = { w: 400, h: 300 };
  it('desenho que enche a janela: não deixa vão em nenhuma borda', () => {
    const c = { w: 400, h: 300 };
    expect(limitarVista({ x: 50, y: 40, s: 2 }, janela, c)).toEqual({ x: 0, y: 0, s: 2 });
    expect(limitarVista({ x: -900, y: -900, s: 2 }, janela, c)).toEqual({ x: -400, y: -300, s: 2 });
    expect(limitarVista({ x: -123, y: -45, s: 2 }, janela, c)).toEqual({ x: -123, y: -45, s: 2 });
  });
  it('foto em pé com faixas (contain): a borda do desenho, não a do elemento', () => {
    const c = { w: 200, h: 300 }; // faixas de 100 px dos lados
    // 3×: desenho com 600 de largura, começa em x + 300; não pode passar de 0 nem deixar vão à direita
    expect(limitarVista({ x: 0, y: 0, s: 3 }, janela, c).x).toBe(-300);
    expect(limitarVista({ x: -900, y: 0, s: 3 }, janela, c).x).toBe(-500);
    // 1,5×: desenho (300) menor que a janela: fica no meio
    const v = limitarVista({ x: 37, y: 0, s: 1.5 }, janela, c);
    expect(v.x + 1.5 * (100 + 100)).toBeCloseTo(200, 6);
  });
  it('em 1× fica no lugar de sempre', () => {
    expect(limitarVista({ x: 30, y: -20, s: 1 }, janela, { w: 200, h: 300 })).toEqual({ x: 0, y: 0, s: 1 });
  });
});

describe('Fim do gesto', () => {
  const janela = { w: 400, h: 300 };
  it('abaixo de 1× volta ao normal (centralizada)', () => {
    expect(assentarVista({ x: 40, y: 10, s: 0.7 }, janela, janela)).toEqual(VISTA_INICIAL);
    expect(assentarVista({ x: 3, y: 1, s: 1.005 }, janela, janela)).toEqual(VISTA_INICIAL);
  });
  it('acima de 4× volta para 4× e respeita as bordas', () => {
    const v = assentarVista({ x: -500, y: -400, s: 4.6 }, janela, janela, { x: 200, y: 150 });
    expect(v.s).toBe(ZOOM_MAX);
    expect(v.x).toBeLessThanOrEqual(0);
    expect(v.x).toBeGreaterThanOrEqual(400 - 4 * 400);
    expect(v.y).toBeLessThanOrEqual(0);
    expect(v.y).toBeGreaterThanOrEqual(300 - 4 * 300);
  });
});

describe('Toque duplo', () => {
  const janela = { w: 400, h: 300 };
  it('normal → 2,5× no ponto tocado; de novo → normal', () => {
    const p = { x: 200, y: 150 };
    const v = alternarZoom(VISTA_INICIAL, p, janela, janela);
    expect(v.s).toBe(ZOOM_DUPLO);
    expect(ampliada(v)).toBe(true);
    perto(naTela(v, p), p);
    expect(alternarZoom(v, p, janela, janela)).toEqual(VISTA_INICIAL);
  });
  it('no canto não deixa vão', () => {
    expect(alternarZoom(VISTA_INICIAL, { x: 0, y: 0 }, janela, janela)).toEqual({ x: 0, y: 0, s: ZOOM_DUPLO });
    expect(alternarZoom(VISTA_INICIAL, { x: 400, y: 300 }, janela, janela)).toEqual({ x: -600, y: -450, s: ZOOM_DUPLO });
  });
  it('tocar na faixa vazia da foto em pé: a borda do desenho encosta na da janela', () => {
    // desenho de 200 px no meio (faixas de 100); em 2,5× começa em x + 250
    const v = alternarZoom(VISTA_INICIAL, { x: 5, y: 150 }, janela, { w: 200, h: 300 });
    expect(v.x).toBe(-250);
  });
});

describe('Texto do data-zoom', () => {
  it('até duas casas', () => {
    expect(textoEscala(1)).toBe('1');
    expect(textoEscala(2.5)).toBe('2.5');
    expect(textoEscala(2.3456)).toBe('2.35');
  });
});
