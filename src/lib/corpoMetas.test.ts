import { describe, expect, it } from 'vitest';
import { calcularMetas, configPadrao, corpoParaMetas, lerConfigDieta, tmbKatch, textoBaseMetas } from './dieta';

const comp = (data: string, peso_kg: number, massa_magra_kg: number | null, atipica = false) => ({ data, peso_kg, massa_magra_kg, ...(atipica ? { atipica } : {}) });

describe('Corpo das metas: média das 3 últimas medições válidas', () => {
  it('sem medição com massa magra: nada', () => {
    expect(corpoParaMetas([])).toBeNull();
    expect(corpoParaMetas([comp('2026-09-01', 90, null)])).toBeNull();
  });

  it('1 medição: ela mesma', () => {
    const c = corpoParaMetas([comp('2026-09-01', 90, 70)])!;
    expect(c).toMatchObject({ peso_kg: 90, massa_magra_kg: 70, medicoes: 1, de: '2026-09-01', ate: '2026-09-01' });
    expect(textoBaseMetas(c)).toBe('pela medição de 01/09/2026');
  });

  it('2 medições: média das duas', () => {
    const c = corpoParaMetas([comp('2026-09-01', 90, 70), comp('2026-09-08', 89, 69.6)])!;
    expect(c.peso_kg).toBeCloseTo(89.5, 6);
    expect(c.massa_magra_kg).toBeCloseTo(69.8, 6);
    expect(c.medicoes).toBe(2);
    expect(textoBaseMetas(c)).toBe('pela média das últimas 2 medições (01/09 a 08/09)');
  });

  it('5 medições: só as 3 últimas, fora de ordem também', () => {
    const lista = [
      comp('2026-09-29', 87, 69),
      comp('2026-09-01', 91, 71),
      comp('2026-09-15', 88, 69.5),
      comp('2026-09-08', 90, 70),
      comp('2026-09-22', 86, 68.5),
    ];
    const c = corpoParaMetas(lista)!;
    expect(c.peso_kg).toBeCloseTo((88 + 86 + 87) / 3, 6);
    expect(c.massa_magra_kg).toBeCloseTo((69.5 + 68.5 + 69) / 3, 6);
    expect(c).toMatchObject({ medicoes: 3, de: '2026-09-15', ate: '2026-09-29' });
    expect(textoBaseMetas(c)).toBe('pela média das últimas 3 medições (15/09 a 29/09)');
  });

  it('medição atípica fica fora: entra a válida anterior', () => {
    const lista = [comp('2026-09-01', 91, 71), comp('2026-09-08', 90, 70), comp('2026-09-15', 95, 72, true), comp('2026-09-22', 89, 69.4), comp('2026-09-29', 88, 69)];
    const c = corpoParaMetas(lista)!;
    expect(c.peso_kg).toBeCloseTo((90 + 89 + 88) / 3, 6);
    expect(c).toMatchObject({ medicoes: 3, de: '2026-09-08', ate: '2026-09-29' });
    // Medição sem massa magra calculada também fica fora
    const semMagra = [...lista, comp('2026-10-06', 87, null)];
    expect(corpoParaMetas(semMagra)!.ate).toBe('2026-09-29');
  });

  it('só medições atípicas: vale a última delas, para a meta não sumir', () => {
    const c = corpoParaMetas([comp('2026-09-01', 91, 71, true), comp('2026-09-08', 92, 71.5, true)])!;
    expect(c).toMatchObject({ peso_kg: 92, massa_magra_kg: 71.5, medicoes: 1, ate: '2026-09-08' });
  });

  it('as metas usam a média: basal, proteína por massa magra e gordura por peso', () => {
    const corpo = corpoParaMetas([comp('2026-09-01', 90, 70), comp('2026-09-08', 88, 69), comp('2026-09-15', 89, 68)])!;
    const config = { ...configPadrao(), ptn_gkg: 2, gord_gkg: 1 };
    const m = calcularMetas(config, corpo);
    expect(m.tmb).toBeCloseTo(tmbKatch(69), 6);
    expect(m.ptn_animal_g).toBeCloseTo(138, 6);
    expect(m.gord_g).toBeCloseTo(89, 6);
  });
});

describe('Config da Dieta lida do banco', () => {
  it('config antiga com pos_degrau_medicao carrega sem erro e o campo é ignorado', () => {
    const c = lerConfigDieta({ fator_atividade: 1.3, ajuste_kcal: -600, pos_degrau_medicao: '2027-02-22' });
    expect(c).toMatchObject({ fator_atividade: 1.3, ajuste_kcal: -600, ptn_gkg: 2, gord_gkg: 1, atividades: [] });
    expect('pos_degrau_medicao' in c).toBe(false);
  });

  it('sem config: o padrão', () => {
    expect(lerConfigDieta(null)).toEqual(configPadrao());
  });
});
