import { describe, expect, it } from 'vitest';
import { marcosRecordes, recordesCorridas, semanaDaData, semanaDaMedicao } from './treino-grafico';
import type { Corrida } from './treino';

const c = (data: string, km: number, segundos: number): Corrida => ({ data, km, segundos, pace: segundos / km, delta: null });

describe('recordesCorridas', () => {
  const lista = [c('2026-09-10', 5, 1650), c('2026-09-03', 5, 1700), c('2026-09-17', 6, 2100), c('2026-09-24', 5, 1500), c('2026-10-01', 5, 1500.4)];
  it('marca pace mais rápido e maior distância até então (a 1ª não conta)', () => {
    expect(recordesCorridas(lista)).toEqual([
      { data: '2026-09-10', pace: true, distancia: false },
      { data: '2026-09-17', pace: false, distancia: true },
      { data: '2026-09-24', pace: true, distancia: false },
    ]);
  });
  it('empate ao segundo não é recorde', () => {
    expect(recordesCorridas([c('2026-09-03', 5, 1500), c('2026-09-10', 5, 1500.2)])).toEqual([]);
  });
  it('vira marco com o texto do recorde', () => {
    const m = marcosRecordes([c('2026-09-03', 5, 1700), c('2026-09-10', 6, 1800)]);
    expect(m).toEqual([{ data: '2026-09-10', rotulo: 'Recorde: pace 5:00 /km e distância 6 km', tipo: 'nota' }]);
    expect(marcosRecordes([])).toEqual([]);
  });
});

describe('semanas', () => {
  const segundas = ['2026-09-07', '2026-09-14', '2026-09-21'];
  it('a medição de segunda é o resultado da semana anterior', () => {
    expect(semanaDaMedicao(segundas, '2026-09-14')).toBe('2026-09-07');
    expect(semanaDaMedicao(segundas, '2026-09-23')).toBe('2026-09-14');
    expect(semanaDaMedicao(segundas, '2026-09-08')).toBeNull();
  });
  it('semana que contém a data', () => {
    expect(semanaDaData(segundas, '2026-09-20')).toBe('2026-09-14');
    expect(semanaDaData(segundas, '2026-10-20')).toBeNull();
  });
});
