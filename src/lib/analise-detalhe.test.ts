import { describe, expect, it } from 'vitest';
import { estaSemanaVsAnterior, extremosSemanais, marcosAnalise, ultimaPorSemana, variacaoPorFase, variacoesSemanais } from './analise-detalhe';

const p = (data: string, valor: number) => ({ data, valor });
const pts = [p('2026-09-07', 100), p('2026-09-10', 99.6), p('2026-09-14', 99), p('2026-09-21', 98.8), p('2026-09-28', 97.5), p('2026-10-19', 97)];

describe('semanas', () => {
  it('última medição de cada semana', () => {
    expect(ultimaPorSemana(pts).map((s) => [s.segunda, s.valor])).toEqual([
      ['2026-09-07', 99.6],
      ['2026-09-14', 99],
      ['2026-09-21', 98.8],
      ['2026-09-28', 97.5],
      ['2026-10-19', 97],
    ]);
  });
  it('variação semanal (intervalo levado a 7 dias; acima de 14 dias fica fora)', () => {
    const v = variacoesSemanais(pts);
    expect(v.map((x) => x.segunda)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
    expect(v[0].delta).toBeCloseTo(((99 - 99.6) / 4) * 7);
    const e = extremosSemanais(v, true)!;
    expect(e.melhor.segunda).toBe('2026-09-28');
    expect(e.pior.segunda).toBe('2026-09-21');
    expect(extremosSemanais(v, false)!.melhor.segunda).toBe('2026-09-21');
  });
  it('esta semana × anterior', () => {
    expect(estaSemanaVsAnterior(pts, '2026-10-21')).toMatchObject({ atual: { valor: 97 }, anterior: { valor: 97.5 } });
    expect(estaSemanaVsAnterior(pts, '2026-10-21').delta).toBeCloseTo(-0.5);
    expect(estaSemanaVsAnterior(pts, '2026-10-27')).toMatchObject({ atual: null, anterior: { valor: 97 }, delta: null });
  });
  it('variação por fase', () => {
    const v = variacaoPorFase(pts, [
      { rotulo: 'F1', de: '2026-09-07', ate: '2026-09-20' },
      { rotulo: 'F2', de: '2026-09-21', ate: '2026-10-25' },
      { rotulo: 'F3', de: '2026-10-26', ate: '2026-11-02' },
    ]);
    expect(v[0].delta).toBeCloseTo(-1);
    expect(v[1].delta).toBeCloseTo(97 - 98.8); // referência: a última até o início
    expect(v[2].delta).toBeNull();
  });
});

describe('marcosAnalise', () => {
  it('trocas de dose, decisões sem repetir a dose, anotações e medições', () => {
    const m = marcosAnalise({
      doses: [
        { data: '2026-09-07', dose_mg: 1.25 },
        { data: '2026-09-14', dose_mg: 1.25 },
        { data: '2026-09-21', dose_mg: 1.5 },
      ],
      decisoes: [
        { id: 'a', data: '2026-09-20', apos_aplicacao: 2, dose_mg: 1.25, fase_indice: 1, escolha: 'subir', dose_nova_mg: 1.5 },
        { id: 'b', data: '2026-09-25', apos_aplicacao: 3, dose_mg: 1.5, fase_indice: null, escolha: 'anotacao', texto: 'Enjoo' },
      ],
      registros: [
        { id: 'r', data: '2026-09-20', tipo: 'dose', campo: 'Dose', de: '1,25 mg', para: '1,5 mg' },
        { id: 's', data: '2026-09-22', tipo: 'dieta', campo: 'Déficit', de: '-500', para: '-400', motivo: 'fome' },
      ],
      medicoes: [{ data: '2026-09-07' }, { data: '2026-09-16', atipica: true }, { data: '2026-09-17' }],
    });
    expect(m.map((x) => [x.data, x.tipo, x.rotulo])).toEqual([
      ['2026-09-07', 'dose', '1ª dose: 1,25 mg'],
      ['2026-09-07', 'medicao', 'Medição de segunda'],
      ['2026-09-16', 'atipico', 'Medição atípica (fora das tendências)'],
      ['2026-09-20', 'decisao', 'Decisão: subir a dose (1,25 mg → 1,5 mg)'],
      ['2026-09-21', 'dose', 'Dose: 1,25 mg → 1,5 mg'],
      ['2026-09-22', 'decisao', 'Déficit: -500 → -400 (fome)'],
      ['2026-09-25', 'nota', 'Anotação: Enjoo'],
    ]);
  });
});
