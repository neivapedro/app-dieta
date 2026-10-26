import { describe, expect, it } from 'vitest';
import { somarDias } from './datas';
import { historicoComposicao } from './gordura';
import { focoDaSemana, maiorSequencia, montarRecap, textoSemana, type EntradaRecap } from './recap-semana';
import { faltasNoPeriodo, type Sugestao } from './semana';
import type { Medida, RegistroDiario, TreinoDia } from './tipos';
import { listarCorridas } from './treino';

const INICIO = '2026-09-07';
const dia = (n: number) => somarDias(INICIO, n);
const medida = (n: number, cintura: number, peso: number, extra: Partial<Medida> = {}): Medida =>
  ({ id: `m${n}`, data: dia(n), altura_cm: 181, pescoco_cm: 41, cintura_cm: cintura, quadril_cm: null, peso_kg: peso, ...extra }) as Medida;
const medidas = [98, 97.6, 96.9, 96.5, 95.8, 95.6, 95.0, 94.6, 94.2].map((c, i) => medida(7 * i, c, 96 - i * 0.6));
const composicoes = historicoComposicao(medidas, 'Masculino', { altura_cm: 181 });
const diario: RegistroDiario[] = Array.from({ length: 56 }, (_, i) => ({
  id: `d${i}`,
  data: dia(i),
  peso_kg: null,
  nausea: i % 7 === 1 ? 2 : i % 7 === 2 ? 1 : 0,
  observacoes: null,
  dieta_seguida: i % 7 === 0 ? 'nao' : 'sim',
  sono_h: 6 + (i % 4) * 0.6,
  agua_l: 2 + (i % 3) * 0.5,
  vomito: i === 50 ? true : false,
}));
const treinos: TreinoDia[] = Array.from({ length: 56 }, (_, i) => ({
  id: `t${i}`,
  data: dia(i),
  treino: i % 6 !== 0,
  cardio: i % 4 !== 0,
  corrida_km: i % 7 === 3 ? 5.2 : null,
  corrida_seg: i % 7 === 3 ? 1700 - i * 3 : null,
  cardio_tipo: i % 7 === 3 ? 'corrida' : 'bike',
}));
const aplicacoes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ data: dia(7 * i), dose_mg: i < 4 ? 1.25 : 1.5 }));
const manter: Sugestao = { tipo: 'manter', texto: 'Manter.', motivo: 'Plano seguido em 86%.' };

const base = (o: Partial<EntradaRecap> = {}): EntradaRecap => ({
  composicoes,
  diario,
  aplicacoes,
  treinos,
  faltas: faltasNoPeriodo(treinos, dia(49), dia(55), INICIO, dia(200)),
  corridas: listarCorridas(treinos),
  inicio: INICIO,
  hoje: dia(56),
  metaAgua: () => 2.5,
  sugestao: manter,
  ...o,
});

describe('maiorSequencia', () => {
  it('conta a maior sequência de dias seguidos', () => {
    const ok = new Set([dia(0), dia(1), dia(3), dia(4), dia(5)]);
    expect(maiorSequencia(dia(0), dia(6), (d) => ok.has(d))).toBe(3);
    expect(maiorSequencia(dia(0), dia(6), () => false)).toBe(0);
  });
});

describe('montarRecap', () => {
  const r = montarRecap(base())!;
  it('semana que a medição fecha: os 7 dias antes dela, numerada como no Resumo da semana', () => {
    expect(r.data).toBe(dia(56));
    expect(r.semana).toBe(8);
    expect([r.de, r.ate, r.dias]).toEqual([dia(49), dia(55), 7]);
    expect(textoSemana(r.de, r.ate)).toBe('26/10 a 01/11');
  });
  it('(a) números: diferença para a medição anterior, sem cor abaixo do MDC', () => {
    expect(r.numeros.anterior).toBe(dia(49));
    const [cintura, peso] = r.numeros.itens;
    expect(cintura).toMatchObject({ texto: '− 0,4 cm', tom: '', agora: '94,2 cm agora' });
    expect(peso).toMatchObject({ texto: '− 0,6 kg', tom: '' });
  });
  it('(b) constância: faltas do placar e adesão da semana', () => {
    expect(r.constancia.treino).toEqual({ feito: 6, dias: 7 });
    expect(r.constancia.faltas).toMatch(/^Faltou treino: /);
    expect(r.constancia.adesao?.dieta.total).toBe(7);
    expect(r.constancia.vazio).toBe(false);
  });
  it('(c) corpo: náusea por dia com o dia depois da dose e o pico', () => {
    expect(r.corpo.dias).toHaveLength(7);
    expect(r.corpo.dias[0]).toMatchObject({ data: dia(49), apos: 0, nausea: 0 });
    expect(r.corpo.dias[1]).toMatchObject({ apos: 1, nausea: 2 });
    expect(r.corpo.dias[1].sintomas).toEqual(['vômito']);
    expect(r.corpo.pico?.data).toBe(dia(50));
    expect(r.corpo.texto).toBe('Náusea mais alta no D1 depois da dose (moderada).');
    expect(r.corpo.efeitos.vomito).toBe(1);
    expect(r.corpo.doses).toBe(1);
  });
  it('(d) destaques: sequência da semana, cintura e massa gorda desde o início (corrida sem cardio marcado não conta)', () => {
    expect(r.destaques.map((d) => d.tipo)).toEqual(['sequencia', 'cintura', 'gorda', 'sono']);
    expect(r.destaques[0]).toMatchObject({ valor: '3 dias' });
    expect(r.destaques[1]).toMatchObject({ titulo: 'Menor cintura do ciclo', valor: '94,2 cm', detalhe: '− 3,8 cm desde o início.' });
  });
  it('(d) recorde de pace vem primeiro; melhor corrida sem recorde vem depois das medidas', () => {
    const corrida = (data: string, seg: number) => ({ data, km: 5, segundos: seg, pace: seg / 5, delta: null });
    const recorde = montarRecap(base({ corridas: [corrida(dia(40), 1550), corrida(dia(51), 1500)] }))!;
    expect(recorde.destaques[0]).toMatchObject({ tipo: 'pace', titulo: 'Recorde de pace', valor: '5:00 /km' });
    expect(recorde.destaques[0].detalhe).toMatch(/10 s\/km mais rápido/);
    const semRecorde = montarRecap(base({ corridas: [corrida(dia(40), 1400), corrida(dia(51), 1500)] }))!;
    expect(semRecorde.destaques.map((d) => d.tipo)).toEqual(['sequencia', 'cintura', 'gorda', 'pace', 'sono']);
    expect(semRecorde.destaques[3].titulo).toBe('Melhor corrida da semana');
  });
  it('(e) foco: a sugestão da semana e o treino que faltou (máximo 3, sem dose)', () => {
    expect(r.foco[0]).toEqual({ texto: 'Manter.', detalhe: 'Plano seguido em 86%.' });
    expect(r.foco.length).toBeLessThanOrEqual(3);
    expect(r.foco.map((f) => `${f.texto} ${f.detalhe ?? ''}`).join(' ')).not.toMatch(/dose|mg/i);
  });
  it('sem medição: null', () => {
    expect(montarRecap(base({ composicoes: [] }))).toBeNull();
  });
  it('primeira medição (dia da 1ª dose): antes do ciclo, sem comparação nem dias', () => {
    const p = montarRecap(base({ data: INICIO }))!;
    expect(p.antesDoCiclo).toBe(true);
    expect(p.numeros.anterior).toBeNull();
    expect(p.dias).toBe(0);
    expect(p.corpo.dias).toEqual([]);
    expect(p.corpo.texto).toMatch(/antes do início do ciclo/);
    expect(p.constancia.vazio).toBe(true);
  });
  it('sem a aba Treino: sem faltas, sem pace e sem sequência', () => {
    const s = montarRecap(base({ treinos: null, faltas: null, corridas: [] }))!;
    expect(s.constancia.treino).toBeNull();
    expect(s.destaques.some((d) => d.tipo === 'pace' || d.tipo === 'sequencia')).toBe(false);
  });
  it('medição atípica: a anterior normal é a referência e sem destaque de cintura', () => {
    const comAtipica = historicoComposicao([...medidas, medida(63, 92, 90, { atipica: true })], 'Masculino', { altura_cm: 181 });
    const a = montarRecap(base({ composicoes: comAtipica, data: dia(63), corridas: [] }))!;
    expect(a.numeros.atipica).toBe(true);
    expect(a.numeros.anterior).toBe(dia(56));
    expect(a.destaques.some((d) => d.tipo === 'cintura')).toBe(false);
  });
});

describe('focoDaSemana', () => {
  const vazia = { sono: { feito: 0, total: 0, fracao: null }, agua: { feito: 0, total: 0, fracao: null } };
  it('sem sugestão e sem faltas: manter os registros, com o motivo', () => {
    const f = focoDaSemana(
      { diario: [], sugestao: { tipo: 'sem_dados', texto: 'Sem sugestão por enquanto.', motivo: 'Precisa da tendência.' } },
      { de: dia(0), ate: dia(6), dias: 7, adesao: null, faltas: null },
    );
    expect(f).toEqual([{ texto: 'Manter os registros em dia', detalhe: 'Precisa da tendência.' }]);
  });
  it('poucos dias com "Segui o plano?" e sono curto viram foco', () => {
    const adesao = {
      treino: null,
      cardio: null,
      dieta: { feito: 1, total: 2, fracao: 0.5 },
      agua: vazia.agua,
      sono: { feito: 1, total: 5, fracao: 0.2 },
      registro: { feito: 5, total: 7, fracao: 5 / 7 },
    };
    const diario2 = [dia(0), dia(1)].map((d) => ({ id: d, data: d, peso_kg: null, nausea: null, observacoes: null, dieta_seguida: 'sim' as const }));
    const f = focoDaSemana({ diario: diario2, sugestao: manter }, { de: dia(0), ate: dia(6), dias: 7, adesao, faltas: null });
    expect(f.map((x) => x.texto)).toEqual(['Manter.', 'Responder “Segui o plano?” no Diário', 'Dormir 7 h ou mais']);
  });
});
