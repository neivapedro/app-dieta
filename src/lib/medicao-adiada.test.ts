import { describe, expect, it } from 'vitest';
import { medicaoDoDia, podeAdiarMedicao } from './medicao-adiada';

// 2026-11-02 é segunda-feira
const med = (data: string) => ({ data });
const antes = [med('2026-10-26')];

describe('medicaoDoDia', () => {
  it('sem histórico de medidas: nada', () => {
    expect(medicaoDoDia({ hoje: '2026-11-02', medidas: [], adiadaPara: null })).toBeNull();
  });
  it('segunda sem adiar: pendente; feita hoje: feita', () => {
    expect(medicaoDoDia({ hoje: '2026-11-02', medidas: antes, adiadaPara: null })).toEqual({ feita: false, adiada: false });
    expect(medicaoDoDia({ hoje: '2026-11-02', medidas: [...antes, med('2026-11-02')], adiadaPara: null })).toEqual({ feita: true, adiada: false });
  });
  it('segunda adiada para terça: some hoje e volta amanhã como adiada', () => {
    expect(medicaoDoDia({ hoje: '2026-11-02', medidas: antes, adiadaPara: '2026-11-03' })).toBeNull();
    expect(medicaoDoDia({ hoje: '2026-11-03', medidas: antes, adiadaPara: '2026-11-03' })).toEqual({ feita: false, adiada: true });
  });
  it('continua pendente nos dias seguintes da semana até medir; feita some do pendente', () => {
    expect(medicaoDoDia({ hoje: '2026-11-05', medidas: antes, adiadaPara: '2026-11-03' })).toEqual({ feita: false, adiada: true });
    expect(medicaoDoDia({ hoje: '2026-11-03', medidas: [...antes, med('2026-11-03')], adiadaPara: '2026-11-03' })).toEqual({ feita: true, adiada: true });
  });
  it('adiamento de outra semana não vale; terça comum sem adiar não mostra', () => {
    expect(medicaoDoDia({ hoje: '2026-11-03', medidas: antes, adiadaPara: null })).toBeNull();
    expect(medicaoDoDia({ hoje: '2026-11-09', medidas: [...antes, med('2026-11-03')], adiadaPara: '2026-11-03' })).toEqual({ feita: false, adiada: false });
  });
});

describe('medicaoDoDia: depois de medir', () => {
  it('medida na terça (adiada): aparece como feita só na terça; quarta e quinta não mostram mais', () => {
    const medidas = [...antes, med('2026-11-03')];
    expect(medicaoDoDia({ hoje: '2026-11-03', medidas, adiadaPara: '2026-11-03' })).toEqual({ feita: true, adiada: true });
    expect(medicaoDoDia({ hoje: '2026-11-04', medidas, adiadaPara: '2026-11-03' })).toBeNull();
    expect(medicaoDoDia({ hoje: '2026-11-05', medidas, adiadaPara: '2026-11-03' })).toBeNull();
  });
  it('medida na segunda sem adiar: feita na segunda; terça em diante nada', () => {
    const medidas = [...antes, med('2026-11-02')];
    expect(medicaoDoDia({ hoje: '2026-11-02', medidas, adiadaPara: null })).toEqual({ feita: true, adiada: false });
    expect(medicaoDoDia({ hoje: '2026-11-03', medidas, adiadaPara: null })).toBeNull();
  });
});

describe('podeAdiarMedicao', () => {
  it('de segunda a sábado pode; domingo não (o dia seguinte é outra semana)', () => {
    expect(podeAdiarMedicao('2026-11-02')).toBe(true);
    expect(podeAdiarMedicao('2026-11-07')).toBe(true);
    expect(podeAdiarMedicao('2026-11-08')).toBe(false);
  });
});
