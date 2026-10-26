import { describe, expect, it } from 'vitest';
import { extensaoDias, indicesVisiveis, prepararPontos, resumoSerie, unirDias, valorNoDia, valorVigente } from './grafico-dados';
import { paraDiaNum } from './grafico-escalas';

const d = paraDiaNum;

describe('prepararPontos', () => {
  it('ordena, junta repetidos e ignora datas inválidas', () => {
    const s = prepararPontos([
      { data: '2026-10-10', valor: 2 },
      { data: '2026-10-03', valor: 1 },
      { data: '2026-10-10', valor: 3 },
      { data: 'x', valor: 9 },
      { data: '2026-10-17', valor: null },
    ]);
    expect(s.dias).toEqual([d('2026-10-03'), d('2026-10-10'), d('2026-10-17')]);
    expect(s.valores).toEqual([1, 3, null]);
  });
  it('tolerância é metade do intervalo típico', () => {
    const semanal = prepararPontos(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((data) => ({ data, valor: 1 })));
    expect(semanal.tolerancia).toBe(3);
    const diario = prepararPontos(['2026-10-01', '2026-10-02', '2026-10-03'].map((data) => ({ data, valor: 1 })));
    expect(diario.tolerancia).toBe(0);
  });
});

describe('valorNoDia', () => {
  const s = prepararPontos([
    { data: '2026-10-01', valor: 90 },
    { data: '2026-10-08', valor: 89 },
    { data: '2026-10-15', valor: null },
    { data: '2026-10-22', valor: 87, atipico: true },
  ]);
  it('dia exato', () => {
    expect(valorNoDia(s, d('2026-10-08'))).toMatchObject({ valor: 89, dia: d('2026-10-08') });
  });
  it('dia sem medida pega o mais perto dentro da tolerância', () => {
    expect(valorNoDia(s, d('2026-10-10'))?.valor).toBe(89);
    expect(valorNoDia(s, d('2026-10-06'))?.valor).toBe(89);
    expect(valorNoDia(s, d('2026-10-04'))?.valor).toBe(90); // empate fica com o anterior
  });
  it('nulo não conta e fora da tolerância some', () => {
    expect(valorNoDia(s, d('2026-10-15'), 3)).toBeNull();
    expect(valorNoDia(s, d('2026-10-20'), 3)).toMatchObject({ valor: 87, atipico: true });
    expect(valorNoDia(s, d('2026-11-30'), 3)).toBeNull();
  });
});

describe('valorVigente (degrau)', () => {
  const dose = prepararPontos([
    { data: '2026-10-01', valor: 1 },
    { data: '2026-10-08', valor: 2 },
    { data: '2026-10-15', valor: 3 },
  ]);
  it('vale o último ponto até o dia', () => {
    expect(valorVigente(dose, d('2026-10-07'))?.valor).toBe(1);
    expect(valorVigente(dose, d('2026-10-08'))?.valor).toBe(2);
    expect(valorVigente(dose, d('2026-10-20'))?.valor).toBe(3);
  });
  it('antes do início e muito depois do fim não há valor', () => {
    expect(valorVigente(dose, d('2026-09-30'))).toBeNull();
    expect(valorVigente(dose, d('2026-11-30'))).toBeNull();
  });
});

describe('dias', () => {
  it('unir e extensão', () => {
    expect(unirDias([[3, 1], [2, 3]].map((l) => l.sort()))).toEqual([1, 2, 3]);
    expect(extensaoDias([[1, 5], [], [0, 2]])).toEqual({ de: 0, ate: 5 });
    expect(extensaoDias([[]])).toBeNull();
  });
  it('visíveis com um vizinho de cada lado', () => {
    expect(indicesVisiveis([0, 10, 20, 30, 40], { de: 12, ate: 28 })).toEqual([1, 3]);
    expect(indicesVisiveis([0, 10, 20], { de: 0, ate: 20 })).toEqual([0, 2]);
    expect(indicesVisiveis([], { de: 0, ate: 1 })).toEqual([0, -1]);
  });
});

describe('resumoSerie', () => {
  it('texto com início, fim, mínimo e máximo (sem atípicos)', () => {
    const t = resumoSerie('Peso', [
      { data: '2026-10-01', valor: 90 },
      { data: '2026-10-08', valor: 88.5 },
      { data: '2026-10-09', valor: 70, atipico: true },
    ], 1, 'kg');
    expect(t).toBe('Peso: de 90,0 kg (01/10) a 88,5 kg (08/10); mín. 88,5 kg, máx. 90,0 kg');
    expect(resumoSerie('X', [])).toBe('X: sem dados');
  });
});
