import { describe, expect, it } from 'vitest';
import { corDoDia, gradeMes, limitesMeses, nomeMes, resumoDoMes, rotuloDiaDose, segmentosPorFase, somarMeses } from './ciclo-calendario';
import type { RegistroDiario } from './tipos';

const reg = (data: string, c: Partial<RegistroDiario> = {}): RegistroDiario => ({ id: data, data, peso_kg: null, nausea: null, observacoes: null, ...c });

describe('somarMeses e nomeMes', () => {
  it('vira o ano nos dois sentidos', () => {
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(somarMeses('2026-12', 1)).toBe('2027-01');
    expect(somarMeses('2026-10', 0)).toBe('2026-10');
    expect(somarMeses('2026-10', -14)).toBe('2025-08');
  });
  it('nome por extenso', () => {
    expect(nomeMes('2026-03')).toBe('março de 2026');
  });
});

describe('gradeMes', () => {
  it('semanas de segunda a domingo, com vazios fora do mês', () => {
    // 1º de outubro de 2026 é quinta; 31 é sábado
    const g = gradeMes('2026-10');
    expect(g.length % 7).toBe(0);
    expect(g.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(g.filter(Boolean)).toHaveLength(31);
    expect(g.at(-2)).toBe('2026-10-31');
    expect(g.at(-1)).toBeNull();
  });
  it('mês que começa na segunda e fevereiro', () => {
    expect(gradeMes('2027-02')[0]).toBe('2027-02-01');
    expect(gradeMes('2027-02')).toHaveLength(28);
  });
});

describe('corDoDia', () => {
  it('náusea 0 a 3', () => {
    expect(corDoDia('nausea', reg('d', { nausea: 0 }))).toEqual({ tom: 'bom', texto: '0' });
    expect(corDoDia('nausea', reg('d', { nausea: 1 })).tom).toBe('aviso');
    expect(corDoDia('nausea', reg('d', { nausea: 2 })).tom).toBe('forte');
    expect(corDoDia('nausea', reg('d', { nausea: 3 })).tom).toBe('ruim');
  });
  it('sono pela faixa de 7 h', () => {
    expect(corDoDia('sono', reg('d', { sono_h: 7.2 }))).toEqual({ tom: 'bom', texto: '7,2' });
    expect(corDoDia('sono', reg('d', { sono_h: 6.5 })).tom).toBe('aviso');
    expect(corDoDia('sono', reg('d', { sono_h: 5 })).tom).toBe('ruim');
  });
  it('água pela meta do dia', () => {
    expect(corDoDia('agua', reg('d', { agua_l: 2.5 }), 2.5).tom).toBe('bom');
    expect(corDoDia('agua', reg('d', { agua_l: 2 }), 2.5).tom).toBe('aviso');
    expect(corDoDia('agua', reg('d', { agua_l: 1 }), 2.5).tom).toBe('ruim');
  });
  it('dieta e dia sem o dado', () => {
    expect(corDoDia('dieta', reg('d', { dieta_seguida: 'sim' })).tom).toBe('bom');
    expect(corDoDia('dieta', reg('d', { dieta_seguida: 'parcial' })).tom).toBe('aviso');
    expect(corDoDia('dieta', reg('d', { dieta_seguida: 'nao' })).tom).toBe('ruim');
    expect(corDoDia('dieta', reg('d'))).toEqual({ tom: null, texto: '' });
    expect(corDoDia('sono', null)).toEqual({ tom: null, texto: '' });
  });
});

describe('rotuloDiaDose', () => {
  const doses = ['2026-10-19', '2026-10-26'];
  it('D0 no dia da dose e conta da última anterior', () => {
    expect(rotuloDiaDose('2026-10-26', doses)).toBe('D0');
    expect(rotuloDiaDose('2026-10-29', doses)).toBe('D3');
    expect(rotuloDiaDose('2026-10-22', doses)).toBe('D3');
  });
  it('antes da 1ª dose: null', () => {
    expect(rotuloDiaDose('2026-10-01', doses)).toBeNull();
  });
});

describe('resumoDoMes', () => {
  const r = [
    reg('2026-10-01', { nausea: 0, dieta_seguida: 'sim' }),
    reg('2026-10-02', { nausea: 2, dieta_seguida: 'parcial' }),
    reg('2026-10-30', { nausea: 3 }),
    reg('2026-09-30', { nausea: 3 }),
  ];
  it('média só do mês e até hoje', () => {
    expect(resumoDoMes('nausea', r, '2026-10', '2026-10-15')).toEqual({ dias: 2, media: 1 });
  });
  it('dieta: fração (parcial vale meio)', () => {
    expect(resumoDoMes('dieta', r, '2026-10', '2026-10-31')).toEqual({ dias: 2, media: 0.75 });
  });
  it('sem dados', () => {
    expect(resumoDoMes('sono', r, '2026-10', '2026-10-31')).toEqual({ dias: 0, media: null });
  });
});

describe('limitesMeses', () => {
  it('do mais antigo até hoje', () => {
    expect(limitesMeses(['2026-10-02', '2026-08-30', '2027-01-01'], '2026-11-02')).toEqual({ min: '2026-08', max: '2026-11' });
    expect(limitesMeses([], '2026-11-02')).toEqual({ min: '2026-11', max: '2026-11' });
  });
});

describe('segmentosPorFase', () => {
  it('nova etiqueta quando muda a fase ou a hipótese', () => {
    const d = (n: number, fase: number, hipotese = false) => ({ numero: n, fase: { indice: fase }, hipotese });
    const s = segmentosPorFase([d(9, 1), d(10, 2, true), d(11, 2, true), d(12, 3, true)]);
    expect(s.map((x) => [x.fase, x.hipotese, x.doses.length])).toEqual([
      [1, false, 1],
      [2, true, 2],
      [3, true, 1],
    ]);
  });
});
