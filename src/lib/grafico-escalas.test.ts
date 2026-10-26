import { describe, expect, it } from 'vitest';
import {
  caminhoArea,
  caminhoBarra,
  caminhoDegrau,
  caminhoFaixa,
  caminhoLinha,
  casasDoPasso,
  dataCurta,
  deDiaNum,
  dominioY,
  escalaLinear,
  formatarNumero,
  indiceMaisProximo,
  janelaInteira,
  janelaParaPeriodo,
  limitarJanela,
  minimosQuadrados,
  moverJanela,
  paraDiaNum,
  passoBonito,
  posicaoDica,
  ticksAlinhados,
  ticksBonitos,
  ticksDatas,
  zoomJanela,
} from './grafico-escalas';

describe('datas', () => {
  it('ida e volta entre data e número do dia', () => {
    expect(paraDiaNum('1970-01-01')).toBe(0);
    expect(paraDiaNum('1970-01-05')).toBe(4);
    for (const d of ['2026-02-28', '2026-03-01', '2024-02-29', '2026-10-25', '2026-12-31']) {
      expect(deDiaNum(paraDiaNum(d))).toBe(d);
    }
    expect(paraDiaNum('2026-03-01') - paraDiaNum('2026-02-28')).toBe(1);
  });
  it('formata dd/mm', () => {
    expect(dataCurta('2026-10-05')).toBe('05/10');
  });
});

describe('números', () => {
  it('pt-BR com vírgula e sem −0', () => {
    expect(formatarNumero(1234.56, 1)).toBe('1.234,6');
    expect(formatarNumero(85, 1)).toBe('85,0');
    expect(formatarNumero(-0.01, 1)).toBe('0,0');
    expect(formatarNumero(-2.5, 1)).toBe('−2,5');
    expect(formatarNumero(null)).toBe('–');
    expect(formatarNumero(NaN)).toBe('–');
  });
  it('casas do passo', () => {
    expect(casasDoPasso(10)).toBe(0);
    expect(casasDoPasso(0.5)).toBe(1);
    expect(casasDoPasso(0.25)).toBe(2);
    expect(casasDoPasso(2.5)).toBe(1);
    expect(casasDoPasso(0.1)).toBe(1);
  });
  it('passo bonito', () => {
    expect(passoBonito(0.7)).toBe(1);
    expect(passoBonito(1.3)).toBe(2);
    expect(passoBonito(2.2)).toBe(2.5);
    expect(passoBonito(3)).toBe(5);
    expect(passoBonito(7)).toBe(10);
    expect(passoBonito(0.03)).toBeCloseTo(0.05);
  });
});

describe('ticksBonitos', () => {
  it('cobre o intervalo com passos redondos', () => {
    const t = ticksBonitos(83.2, 91.7, 4);
    expect(t.passo).toBe(2.5);
    expect(t.min).toBe(82.5);
    expect(t.max).toBe(92.5);
    expect(t.valores).toEqual([82.5, 85, 87.5, 90, 92.5]);
  });
  it('sem lixo de ponto flutuante', () => {
    const t = ticksBonitos(0.1, 0.7, 3);
    for (const v of t.valores) expect(String(v).length).toBeLessThan(6);
  });
  it('inteiro evita passos fracionários', () => {
    expect(ticksBonitos(0, 7, 3, true).passo).toBe(2);
    expect(ticksBonitos(0, 2, 4, true).passo).toBe(1);
    expect(ticksBonitos(0, 2, 4, true).valores).toEqual([0, 1, 2]);
  });
  it('valor único abre uma faixa', () => {
    const t = ticksBonitos(80, 80);
    expect(t.min).toBeLessThan(80);
    expect(t.max).toBeGreaterThan(80);
  });
  it('dominioY com zero para barras', () => {
    const t = dominioY([3, 7, 9], { comZero: true });
    expect(t.min).toBe(0);
    expect(t.max).toBeGreaterThanOrEqual(9);
    // positivos não descem abaixo de zero
    expect(dominioY([0, 2, 6]).min).toBe(0);
    const s = dominioY([]);
    expect(s.valores.length).toBeGreaterThan(1);
  });
});

describe('ticksAlinhados', () => {
  it('sempre o mesmo número de intervalos, cobrindo os dados', () => {
    for (const [a, b, n] of [[0, 7.5, 4], [2.5, 10, 3], [83, 91, 5], [0, 0.3, 4], [5, 5, 2]] as const) {
      const t = ticksAlinhados(a, b, n);
      expect(t.valores.length).toBe(n + 1);
      expect(t.min).toBeLessThanOrEqual(Math.min(a, b));
      expect(t.max).toBeGreaterThanOrEqual(Math.max(a, b));
    }
    expect(ticksAlinhados(0, 7.5, 4).valores).toEqual([0, 2, 4, 6, 8]);
  });
});

describe('escalaLinear', () => {
  it('mapeia e inverte', () => {
    const e = escalaLinear([0, 10], [100, 0]);
    expect(e(0)).toBe(100);
    expect(e(5)).toBe(50);
    expect(e.inverter(25)).toBe(7.5);
  });
  it('domínio vazio vai ao meio', () => {
    expect(escalaLinear([3, 3], [0, 100])(3)).toBe(50);
  });
});

describe('indiceMaisProximo', () => {
  const xs = [1, 4, 6, 10];
  it('acha o vizinho mais perto', () => {
    expect(indiceMaisProximo(xs, -5)).toBe(0);
    expect(indiceMaisProximo(xs, 2.4)).toBe(0);
    expect(indiceMaisProximo(xs, 2.6)).toBe(1);
    expect(indiceMaisProximo(xs, 5)).toBe(1); // empate fica com o anterior
    expect(indiceMaisProximo(xs, 8.1)).toBe(3);
    expect(indiceMaisProximo(xs, 99)).toBe(3);
    expect(indiceMaisProximo([], 3)).toBe(-1);
  });
});

describe('ticksDatas', () => {
  it('8 semanas em 300 px: marcas semanais ou quinzenais nas segundas', () => {
    const de = paraDiaNum('2026-09-01');
    const ate = paraDiaNum('2026-10-27');
    const t = ticksDatas(de, ate, 300, 52);
    expect(t.length).toBeGreaterThan(2);
    expect(t.length).toBeLessThanOrEqual(5);
    for (const d of t) {
      expect(new Date(d * 86400000).getUTCDay()).toBe(1);
      expect(d).toBeGreaterThanOrEqual(de);
      expect(d).toBeLessThanOrEqual(ate);
    }
  });
  it('janela curta: diário', () => {
    const de = paraDiaNum('2026-10-01');
    const t = ticksDatas(de, de + 4, 400, 52);
    expect(t).toEqual([de, de + 1, de + 2, de + 3, de + 4]);
  });
  it('ano inteiro: inícios de mês', () => {
    const de = paraDiaNum('2026-01-10');
    const ate = paraDiaNum('2026-12-20');
    const t = ticksDatas(de, ate, 320, 52);
    expect(t.length).toBeGreaterThan(1);
    for (const d of t) expect(deDiaNum(d).slice(8)).toBe('01');
    expect(deDiaNum(t[0]) >= '2026-02-01').toBe(true);
  });
  it('um dia só', () => {
    expect(ticksDatas(10, 10, 300)).toEqual([10]);
  });
});

describe('caminhos', () => {
  it('linha quebra nos nulos', () => {
    expect(caminhoLinha([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: null }, { x: 3, y: 4 }])).toBe('M0,1L1,2M3,4');
  });
  it('degrau', () => {
    expect(caminhoDegrau([{ x: 0, y: 5 }, { x: 10, y: 3 }], 20)).toBe('M0,5H10V3H20');
  });
  it('área fecha cada trecho', () => {
    const d = caminhoArea([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: null }, { x: 3, y: 4 }], 10);
    expect(d).toBe('M0,10L0,1L1,2L1,10Z');
  });
  it('faixa', () => {
    expect(caminhoFaixa([{ x: 0, y0: 5, y1: 3 }, { x: 1, y0: 6, y1: 2 }])).toBe('M0,3L1,2L1,6L0,5Z');
  });
  it('barra arredondada', () => {
    const d = caminhoBarra(0, 10, 100, 50, 4);
    expect(d.startsWith('M0,100V54Q0,50 4,50H6Q10,50 10,54V100Z')).toBe(true);
  });
});

describe('minimosQuadrados', () => {
  it('reta perfeita', () => {
    const t = minimosQuadrados([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])!;
    expect(t.a).toBeCloseTo(1);
    expect(t.b).toBeCloseTo(2);
    expect(t.r).toBeCloseTo(1);
  });
  it('poucos pontos ou constante → null', () => {
    expect(minimosQuadrados([{ x: 0, y: 1 }, { x: 1, y: 2 }])).toBeNull();
    expect(minimosQuadrados([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }])).toBeNull();
  });
});

describe('janela de zoom', () => {
  const total = { de: 0, ate: 100 };
  it('limita dentro do total e no mínimo', () => {
    expect(limitarJanela({ de: -10, ate: 20 }, total)).toEqual({ de: 0, ate: 30 });
    expect(limitarJanela({ de: 90, ate: 120 }, total)).toEqual({ de: 70, ate: 100 });
    expect(limitarJanela({ de: 50, ate: 51 }, total, 6)).toEqual({ de: 50, ate: 56 });
  });
  it('zoom mantém a âncora', () => {
    const j = zoomJanela(total, 2, 50, total);
    expect(j).toEqual({ de: 25, ate: 75 });
    const k = zoomJanela(j, 0.1, 50, total);
    expect(k).toEqual(total);
  });
  it('mover não muda o tamanho', () => {
    expect(moverJanela({ de: 10, ate: 30 }, 80, total)).toEqual({ de: 80, ate: 100 });
  });
  it('janela inteira e período', () => {
    expect(janelaInteira(total, total)).toBe(true);
    expect(janelaInteira({ de: 1, ate: 100 }, total)).toBe(false);
    expect(janelaParaPeriodo({ de: 0.2, ate: 4.6 })).toEqual({ de: '1970-01-01', ate: '1970-01-06' });
  });
});

describe('posicaoDica', () => {
  it('fica dentro da área', () => {
    expect(posicaoDica(10, 100, 300)).toBe(22);
    expect(posicaoDica(280, 100, 300)).toBe(168);
    expect(posicaoDica(50, 100, 120)).toBe(0);
    expect(posicaoDica(5, 400, 300)).toBe(0);
  });
});
