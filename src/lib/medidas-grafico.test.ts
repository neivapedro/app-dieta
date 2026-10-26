import { describe, expect, it } from 'vitest';
import type { Composicao } from './gordura';
import { leituraMedida, marcosAtipicas, marcosDecisoes, marcosMudancaDose, pontosMedida } from './medidas-grafico';

const comp = (data: string, cintura: number, atipica = false): Composicao => ({
  data,
  peso_kg: 90,
  bf: null,
  massa_magra_kg: null,
  massa_gorda_kg: null,
  cintura_cm: cintura,
  pescoco_cm: 40,
  quadril_cm: null,
  ...(atipica ? { atipica } : {}),
});

describe('pontosMedida', () => {
  it('inclui a atípica marcada e pula valores vazios', () => {
    const p = pontosMedida([comp('2026-09-07', 98), comp('2026-09-10', 99, true), comp('2026-09-14', 97)], 'cintura_cm');
    expect(p).toEqual([
      { data: '2026-09-07', valor: 98 },
      { data: '2026-09-10', valor: 99, atipico: true },
      { data: '2026-09-14', valor: 97 },
    ]);
    expect(pontosMedida([comp('2026-09-07', 98)], 'bf')).toEqual([]);
  });
});

describe('marcosMudancaDose', () => {
  it('marca só quando a dose muda, em ordem de data', () => {
    const m = marcosMudancaDose([
      { data: '2026-09-21', dose_mg: 1.5 },
      { data: '2026-09-07', dose_mg: 1.25 },
      { data: '2026-09-14', dose_mg: 1.25 },
      { data: '2026-09-28', dose_mg: 1 },
    ]);
    expect(m.map((x) => x.data)).toEqual(['2026-09-21', '2026-09-28']);
    expect(m[0]).toMatchObject({ tipo: 'dose', rotulo: 'Dose subiu: 1,25 → 1,50 mg' });
    expect(m[1].rotulo).toBe('Dose desceu: 1,50 → 1,00 mg');
  });
  it('sem aplicação ou com uma só: nenhum marco', () => {
    expect(marcosMudancaDose([])).toEqual([]);
    expect(marcosMudancaDose([{ data: '2026-09-07', dose_mg: 2 }])).toEqual([]);
  });
});

describe('marcos de atípicas e decisões', () => {
  it('converte para o tipo certo', () => {
    expect(marcosAtipicas([comp('2026-09-07', 98), comp('2026-09-10', 99, true)])).toEqual([{ data: '2026-09-10', rotulo: 'Medição atípica (fora das tendências)', tipo: 'atipico' }]);
    expect(marcosDecisoes([{ data: '2026-09-21', texto: 'subir a dose' }])).toEqual([{ data: '2026-09-21', rotulo: 'Decisão: subir a dose', tipo: 'decisao' }]);
  });
});

describe('leituraMedida', () => {
  const pts = [
    { data: '2026-09-07', valor: 98 },
    { data: '2026-09-14', valor: 97 },
    { data: '2026-09-17', valor: 99, atipico: true },
  ];
  it('sem mira: a última normal, com as diferenças', () => {
    expect(leituraMedida(pts, null, 98, 90)).toEqual({ data: '2026-09-14', valor: 97, atipica: false, desdeInicio: -1, paraMeta: 7, ultima: true });
  });
  it('na mira: o ponto da data; a atípica fica sem contas', () => {
    expect(leituraMedida(pts, '2026-09-07', 98, null)).toMatchObject({ valor: 98, desdeInicio: 0, paraMeta: null, ultima: false });
    expect(leituraMedida(pts, '2026-09-17', 98, 90)).toMatchObject({ valor: 99, atipica: true, desdeInicio: null, paraMeta: null });
  });
  it('sem pontos: null', () => {
    expect(leituraMedida([], null, null, null)).toBeNull();
  });
});
