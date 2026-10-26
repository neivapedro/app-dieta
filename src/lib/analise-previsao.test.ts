import { describe, expect, it } from 'vitest';
import { somarDias } from './datas';
import { preverMeta, textoPrevisao } from './analise-previsao';

// Cintura caindo 0,5 cm por semana, com um pouco de ruído
const serie = (n: number, ini = 100, passo = -0.5, ruido = [0, 0.2, -0.2, 0.1, -0.1, 0.15]) =>
  Array.from({ length: n }, (_, i) => ({ data: somarDias('2026-09-07', 7 * i), valor: ini + passo * i + ruido[i % ruido.length] }));

describe('preverMeta', () => {
  it('poucas medições ou poucos dias: sem previsão', () => {
    expect(preverMeta(serie(2), { meta: 90, hoje: '2026-11-02' })).toBeNull();
    expect(
      preverMeta(
        [
          { data: '2026-10-01', valor: 100 },
          { data: '2026-10-05', valor: 99 },
          { data: '2026-10-08', valor: 98 },
        ],
        { meta: 90, hoje: '2026-11-02' },
      ),
    ).toBeNull();
  });
  it('chega à meta numa data, com a faixa abrindo e contendo a data central', () => {
    const p = preverMeta(serie(7), { meta: 94, hoje: '2026-11-02', fim: '2027-03-29', piso: 0.3 })!;
    expect(p.alcancada).toBe(false);
    expect(p.data).not.toBeNull();
    expect(p.cedo! <= p.data!).toBe(true);
    if (p.tarde) expect(p.tarde >= p.data!).toBe(true);
    // leque: abre com o tempo
    const larg = p.faixa.map((f) => f.max - f.min);
    expect(larg[larg.length - 1]).toBeGreaterThan(larg[0]);
    expect(p.ritmo_semana).toBeCloseTo(-0.5, 1);
    expect(textoPrevisao('cintura', p)).toMatch(/^No ritmo atual, a meta de cintura chega por volta de \d\d\/\d\d \(faixa provável/);
  });
  it('tendência no sentido errado: não alcança até o fim', () => {
    const p = preverMeta(serie(6, 100, 0.3), { meta: 94, hoje: '2026-11-02', fim: '2027-01-31' })!;
    expect(p.data).toBeNull();
    expect(textoPrevisao('peso', p)).toBe('No ritmo atual, a meta de peso não é alcançada até o fim do ciclo (31/01).');
    expect(p.centro[p.centro.length - 1].data).toBe('2027-01-31');
  });
  it('já na meta', () => {
    const p = preverMeta(serie(6), { meta: 99, hoje: '2026-11-02' })!;
    expect(p.alcancada).toBe(true);
    expect(textoPrevisao('cintura', p)).toBe('Meta de cintura alcançada.');
  });
  it('maior é melhor (massa magra subindo)', () => {
    const p = preverMeta(serie(6, 60, 0.2), { meta: 62, hoje: '2026-11-02', fim: '2027-06-01', menorMelhor: false })!;
    expect(p.data).not.toBeNull();
  });
});
