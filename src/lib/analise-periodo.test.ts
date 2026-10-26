import { describe, expect, it } from 'vitest';
import type { AnaliseFase, PontoPeso } from './analise';
import { fasesNoPeriodo, lerPeriodo, opcoesPeriodo, parNoPeriodo, resumoPeriodo, rotuloFaseCurto, textoIntervalo } from './analise-periodo';
import type { Composicao } from './gordura';

const fase = (inicio: string, fim: string, dose_mg: number, fase_indice: number | null) => ({ inicio, fim, dose_mg, fase_indice }) as Pick<AnaliseFase, 'inicio' | 'fim' | 'dose_mg' | 'fase_indice'>;
const fases = [fase('2026-09-07', '2026-10-05', 1.25, 0), fase('2026-10-05', '2026-10-26', 1.5, 1), fase('2026-10-26', '2026-11-02', 1.75, 2)];

describe('opcoesPeriodo', () => {
  it('7 dias, 4 e 8 semanas, ciclo e cada bloco', () => {
    const o = opcoesPeriodo({ hoje: '2026-11-02', inicio: '2026-09-07', fases });
    expect(o.map((x) => x.chave)).toEqual(['1s', '4s', '8s', 'ciclo', 'f1', 'f2', 'f3']);
    expect(o.find((x) => x.chave === '4s')).toMatchObject({ de: '2026-10-05', ate: '2026-11-02' });
    // bloco que não é o último termina na véspera do seguinte
    expect(o.find((x) => x.chave === 'f2')).toMatchObject({ rotulo: 'F2 1,5', de: '2026-10-05', ate: '2026-10-25', quando: 'na fase F2 (1,5 mg)' });
    expect(o.find((x) => x.chave === 'f3')).toMatchObject({ ate: '2026-11-02' });
  });
  it('ciclo curto: sem 8 semanas; um bloco só: sem fases', () => {
    const o = opcoesPeriodo({ hoje: '2026-09-20', inicio: '2026-09-07', fases: [fases[0]] });
    expect(o.map((x) => x.chave)).toEqual(['1s', '4s', 'ciclo']);
  });
  it('lerPeriodo: inválido vale o ciclo', () => {
    const o = opcoesPeriodo({ hoje: '2026-11-02', inicio: '2026-09-07', fases });
    expect(lerPeriodo('f9', o).chave).toBe('ciclo');
    expect(lerPeriodo('8s', o).chave).toBe('8s');
    expect(lerPeriodo(null, o).chave).toBe('ciclo');
  });
  it('rótulo pelo nº do bloco quando a fase do plano se repete ou falta', () => {
    const rep = [fase('2026-09-07', '2026-09-21', 1.25, 0), fase('2026-09-21', '2026-10-05', 1.5, 1), fase('2026-10-05', '2026-10-19', 1.25, 0), fase('2026-10-19', '2026-11-02', 3, null)];
    expect([0, 1, 2, 3].map((i) => rotuloFaseCurto(rep, i))).toEqual(['B1 1,25', 'F2 1,5', 'B3 1,25', 'B4 3']);
  });
});

describe('parNoPeriodo', () => {
  const pts = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'].map((data, i) => ({ data, v: i }));
  it('referência até 7 dias antes do início; fim = última dentro', () => {
    const p = parNoPeriodo(pts, '2026-10-01', '2026-10-15');
    expect(p.ini?.data).toBe('2026-09-28');
    expect(p.fim?.data).toBe('2026-10-12');
    expect(p.comVariacao).toBe(true);
  });
  it('sem referência: a primeira dentro do período', () => {
    expect(parNoPeriodo(pts, '2026-09-20', '2026-10-30').ini?.data).toBe('2026-09-28');
  });
  it('nada no período: a última antes do fim, sem variação', () => {
    const p = parNoPeriodo(pts, '2026-10-25', '2026-10-30');
    expect(p.fim?.data).toBe('2026-10-19');
    expect(p.comVariacao).toBe(false);
  });
});

describe('fasesNoPeriodo e textoIntervalo', () => {
  it('blocos que tocam o período', () => {
    expect(fasesNoPeriodo(fases, '2026-10-20', '2026-11-02')).toEqual([1, 2]);
    expect(fasesNoPeriodo(fases, '2026-10-26', '2026-11-02')).toEqual([2]);
  });
  it('datas curtas e com ano de outro ano', () => {
    expect(textoIntervalo('2026-10-05', '2026-11-02', '2026-11-02')).toBe('05/10 → 02/11');
    expect(textoIntervalo('2025-12-29', '2026-01-04', '2026-01-04')).toBe('29/12/25 → 04/01');
  });
});

describe('resumoPeriodo', () => {
  const comp = (data: string, peso: number, cintura: number, atipica = false) => ({ data, peso_kg: peso, cintura_cm: cintura, atipica }) as unknown as Composicao;
  const composicoes = [comp('2026-09-28', 96, 98), comp('2026-10-05', 95.5, 97.5), comp('2026-10-12', 95, 97), comp('2026-10-19', 97, 99, true), comp('2026-10-26', 94, 96)];
  const serie: PontoPeso[] = composicoes.map((c) => ({ data: c.data, peso_kg: c.peso_kg, origem: 'medida', ...(c.atipica ? { atipica: true } : {}) }));
  it('variação pelas medições normais (atípica fora)', () => {
    const r = resumoPeriodo({ serie, composicoes, de: '2026-10-05', ate: '2026-11-02' });
    expect(r.comp.ini?.data).toBe('2026-10-05');
    expect(r.comp.fim?.data).toBe('2026-10-26');
    expect(r.variacao_kg).toBeCloseTo(-1.5);
    expect(r.variacao_percentual).toBeCloseTo(-1.5 / 95.5);
    expect(r.tendencia?.kg_semana).toBeCloseTo(-0.5, 1);
    expect(r.fonte).toBe('medições');
  });
});
