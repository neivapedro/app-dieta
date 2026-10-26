import { describe, expect, it } from 'vitest';
import type { Composicao } from './gordura';
import { adesaoPeriodo, destaques, habitosPorSemana, picoNausea, progressoMeta, serieMetrica, type EntradaDestaques } from './painel';
import type { RegistroDiario, TreinoDia } from './tipos';

const reg = (data: string, c: Partial<RegistroDiario> = {}): RegistroDiario => ({ id: data, data, peso_kg: null, nausea: null, observacoes: null, ...c });
const tr = (data: string, treino: boolean, cardio: boolean): TreinoDia => ({ id: data, data, treino, cardio, corrida_km: null, corrida_seg: null });

describe('progressoMeta', () => {
  it('fração do caminho e quanto falta (menor é melhor)', () => {
    expect(progressoMeta(100, 95, 90)).toEqual({ inicio: 100, atual: 95, meta: 90, fracao: 0.5, falta: 5, alcancada: false });
  });
  it('passou da meta: 100% e falta 0', () => {
    expect(progressoMeta(100, 88, 90)).toMatchObject({ fracao: 1, falta: 0, alcancada: true });
  });
  it('andou para trás: 0%', () => {
    expect(progressoMeta(100, 102, 90)).toMatchObject({ fracao: 0, falta: 12 });
  });
  it('maior é melhor', () => {
    expect(progressoMeta(60, 62, 64, false)).toMatchObject({ fracao: 0.5, falta: 2 });
  });
  it('sem meta, meta no lado errado ou sem início: null', () => {
    expect(progressoMeta(100, 95, null)).toBeNull();
    expect(progressoMeta(100, 95, 105)).toBeNull();
    expect(progressoMeta(null, 95, 90)).toBeNull();
  });
  it('sem medição atual vale o início', () => {
    expect(progressoMeta(100, null, 90)).toMatchObject({ atual: 100, fracao: 0 });
  });
});

describe('serieMetrica', () => {
  it('ignora atípicas e vazios', () => {
    const c = (data: string, cintura: number | null, atipica = false) => ({ data, cintura_cm: cintura, atipica }) as unknown as Composicao;
    expect(serieMetrica([c('2026-10-05', 100), c('2026-10-12', 99, true), c('2026-10-19', null), c('2026-10-26', 98)], 'cintura_cm')).toEqual([
      { data: '2026-10-05', valor: 100 },
      { data: '2026-10-26', valor: 98 },
    ]);
  });
});

describe('adesaoPeriodo', () => {
  const diario = [
    reg('2026-10-20', { dieta_seguida: 'sim', agua_l: 3, sono_h: 7.5 }),
    reg('2026-10-21', { dieta_seguida: 'parcial', agua_l: 2, sono_h: 6 }),
    reg('2026-10-22', { dieta_seguida: 'nao' }),
    reg('2026-10-30', { dieta_seguida: 'sim' }), // fora do período
  ];
  it('conta dieta (em parte = meio), água na meta, sono ≥ 7 h e dias com registro', () => {
    const a = adesaoPeriodo({ diario, treinos: null, de: '2026-10-20', ate: '2026-10-23', metaAgua: () => 2.7 });
    expect(a.dieta).toEqual({ feito: 1.5, total: 3, fracao: 0.5 });
    expect(a.agua).toEqual({ feito: 1, total: 2, fracao: 0.5 });
    expect(a.sono).toEqual({ feito: 1, total: 2, fracao: 0.5 });
    expect(a.registro).toEqual({ feito: 3, total: 4, fracao: 0.75 });
    expect(a.treino).toBeNull();
  });
  it('treino e cardio sobre todos os dias do período', () => {
    const a = adesaoPeriodo({ diario: [], treinos: [tr('2026-10-20', true, true), tr('2026-10-21', true, false)], de: '2026-10-20', ate: '2026-10-23', metaAgua: () => 2 });
    expect(a.treino).toEqual({ feito: 2, total: 4, fracao: 0.5 });
    expect(a.cardio).toEqual({ feito: 1, total: 4, fracao: 0.25 });
    expect(a.dieta.fracao).toBeNull();
  });
});

describe('habitosPorSemana', () => {
  it('médias da semana até hoje', () => {
    const d = [reg('2026-10-19', { sono_h: 6, agua_l: 2, nausea: 1, dieta_seguida: 'sim' }), reg('2026-10-21', { sono_h: 8, nausea: 0 }), reg('2026-10-27', { sono_h: 7 })];
    const [s1, s2] = habitosPorSemana(d, ['2026-10-19', '2026-10-26'], '2026-10-27', () => 2.5);
    expect(s1).toMatchObject({ sono_h: 7, agua_l: 2, agua_meta_l: 2.5, nausea_media: 0.5, dieta: { sim: 1, parcial: 0, nao: 0 } });
    expect(s2).toMatchObject({ sono_h: 7, agua_l: null, agua_meta_l: null, nausea_media: null });
  });
});

describe('picoNausea', () => {
  const col = [{ rotulo: 'D0' }, { rotulo: 'D1' }, { rotulo: 'D2' }];
  const s = (n: (number | null)[]) => ({ indice: 0, nausea_por_dia: n, dias_com_registro: 3, vomito: null, diarreia: null, intestino_preso: null });
  it('dia com a maior média entre as fases', () => {
    expect(picoNausea([s([0, 2, 1]), s([0, 1, null])], col)).toEqual({ rotulo: 'D1', media: 1.5 });
  });
  it('sem náusea anotada (ou tudo zero): null', () => {
    expect(picoNausea([s([null, null, null])], col)).toBeNull();
    expect(picoNausea([s([0, 0, 0])], col)).toBeNull();
  });
});

describe('destaques', () => {
  const base: EntradaDestaques = { cintura: null, gorda: null, magra: null, peso: null, pesoPct: null, ritmo: null, gorduraDaPerda: null, nausea: null, adesao: null, meta: null };
  it('variações abaixo do erro da fita não viram destaque', () => {
    expect(destaques({ ...base, cintura: -1, gorda: -1 })).toEqual([]);
  });
  it('resultado, ritmo e massa magra preservada', () => {
    const l = destaques({ ...base, cintura: -3.2, gorda: -2.4, magra: -0.3, ritmo: { faixa: 'ideal', pct: 0.8 } });
    expect(l.map((d) => d.tom)).toEqual(['bom', 'bom', 'bom', 'bom']);
    expect(l[0].texto).toMatch(/^Cintura −\s?3,2 cm desde o início\.$/);
    expect(l.some((d) => d.texto.startsWith('Massa magra preservada'))).toBe(true);
    expect(l.some((d) => d.texto.includes('0,80% do peso por semana'))).toBe(true);
  });
  it('atenção vem primeiro', () => {
    const l = destaques({ ...base, cintura: -3, ritmo: { faixa: 'rapido', pct: 1.4 } });
    expect(l[0].tom).toBe('atencao');
    expect(l[0].texto).toContain('acima de 1%');
  });
  it('perda de massa magra acima do erro', () => {
    expect(destaques({ ...base, magra: -2.5, gorda: -1 })[0]).toMatchObject({ tom: 'atencao' });
  });
  it('hábitos fracos e náusea', () => {
    const t = (feito: number, total: number) => ({ feito, total, fracao: feito / total });
    const l = destaques({
      ...base,
      adesao: { treino: t(10, 28), cardio: t(20, 28), dieta: t(3, 10), agua: t(1, 6), sono: t(1, 6), registro: t(20, 28) },
      nausea: { rotulo: 'D1', media: 1.2 },
    });
    expect(l.filter((d) => d.tom === 'atencao')).toHaveLength(4);
    expect(l.at(-1)!.texto).toBe('Náusea mais forte no D1 depois da dose (média 1,2 de 3).');
  });
  it('no máximo 6', () => {
    const t = (feito: number, total: number) => ({ feito, total, fracao: feito / total });
    const l = destaques({
      ...base,
      cintura: -5,
      gorda: -4,
      magra: -0.5,
      ritmo: { faixa: 'ideal', pct: 0.7 },
      meta: { nome: 'cintura', fracao: 0.4, alcancada: false },
      adesao: { treino: t(27, 28), cardio: t(27, 28), dieta: t(3, 10), agua: t(1, 6), sono: t(1, 6), registro: t(20, 28) },
      nausea: { rotulo: 'D1', media: 1 },
    });
    expect(l).toHaveLength(6);
  });
});

describe('destaques no período do filtro', () => {
  it('as variações dizem o período pedido', () => {
    const base: EntradaDestaques = { cintura: -2.5, gorda: null, magra: null, peso: -2, pesoPct: -0.02, ritmo: { faixa: 'ganho', pct: -0.1 }, gorduraDaPerda: null, nausea: null, adesao: null, meta: null };
    const l = destaques({ ...base, desde: 'nas últimas 4 semanas', periodoRitmo: 'do período' }).map((d) => d.texto);
    expect(l).toContain('Cintura − 2,5 cm nas últimas 4 semanas.');
    expect(l).toContain('Peso subindo na tendência do período.');
    expect(destaques(base).map((d) => d.texto)).toContain('Cintura − 2,5 cm desde o início.');
  });
});
