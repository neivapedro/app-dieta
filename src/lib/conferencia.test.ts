import { describe, expect, it } from 'vitest';
import { somarDias } from './datas';
import { deficitNecessario, ritmoPercentual, tendenciaMedidas } from './conferencia';
import type { Composicao } from './gordura';

const comp = (dia: number, gorda: number, magra: number): Composicao => ({
  data: somarDias('2026-09-07', dia),
  peso_kg: gorda + magra,
  bf: (gorda / (gorda + magra)) * 100,
  massa_gorda_kg: gorda,
  massa_magra_kg: magra,
  cintura_cm: 97 - dia * 0.1,
  pescoco_cm: 41,
  quadril_cm: null,
});

describe('Conferência com as medidas', () => {
  it('déficit real pela tendência de massa gorda e magra', () => {
    // −0,5 kg de gordura e −0,1 kg de massa magra por semana, por 4 semanas
    const lista = [0, 7, 14, 21, 28].map((d) => comp(d, 23 - (d / 7) * 0.5, 72.5 - (d / 7) * 0.1));
    const t = tendenciaMedidas(lista)!;
    expect(t.gorda_semana).toBeCloseTo(-0.5, 6);
    expect(t.magra_semana).toBeCloseTo(-0.1, 6);
    expect(t.deficit_dia).toBeCloseTo((0.5 * 9400 + 0.1 * 1800) / 7, 3);
    expect(t.margem_dia).toBeCloseTo(0, 6);
  });
  it('precisa de 4 medições em 3 semanas', () => {
    expect(tendenciaMedidas([0, 7, 14].map((d) => comp(d, 23, 72)))).toBeNull();
  });
  it('déficit necessário para a meta e ritmo em % do peso', () => {
    expect(deficitNecessario(23, 18, '2026-10-01', '2026-12-10')).toBeCloseTo((5 * 9400) / 70, 6);
    expect(ritmoPercentual(-0.7, 95).faixa).toBe('ideal');
    expect(ritmoPercentual(-1.5, 95).faixa).toBe('rapido');
    expect(ritmoPercentual(0.2, 95).faixa).toBe('ganho');
  });
});
