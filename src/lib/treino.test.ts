import { describe, expect, it } from 'vitest';
import { calcularCiclo, cicloPadrao } from './ciclo';
import { composicao } from './gordura';
import type { Ciclo, TreinoDia } from './tipos';
import {
  calcularPlacar,
  digitosParaTempo,
  paceValido,
  formatarTempo,
  lerTempo,
  listarCorridas,
  medidaInicial,
  periodoProjeto,
  segundaDaSemana,
  semanasDoProjeto,
  tipoCardio,
} from './treino';

const dia = (data: string, treino: boolean, cardio: boolean, extra: Partial<TreinoDia> = {}): TreinoDia => ({
  id: data,
  data,
  treino,
  cardio,
  corrida_km: null,
  corrida_seg: null,
  ...extra,
});

describe('Cardio do dia', () => {
  it('quarta e domingo são corrida; os demais, bike', () => {
    expect(tipoCardio('2026-10-14')).toBe('corrida'); // quarta
    expect(tipoCardio('2026-10-18')).toBe('corrida'); // domingo
    expect(tipoCardio('2026-10-15')).toBe('bike'); // quinta
    expect(tipoCardio('2026-10-17')).toBe('bike'); // sábado
  });
});

describe('Período do projeto', () => {
  const ciclo: Ciclo = { id: 'c1', ...cicloPadrao('2026-10-15') };
  it('vai da 1ª aplicação até 7 dias depois da última prevista', () => {
    const r = calcularCiclo(ciclo, [], [], '2026-10-10');
    expect(periodoProjeto(ciclo, r)).toEqual({ inicio: '2026-10-15', fim: '2027-05-13' });
  });
  it('usa a data real da 1ª aplicação', () => {
    const r = calcularCiclo(ciclo, [{ id: 'a', ciclo_id: 'c1', data: '2026-10-16', dose_mg: 1.25, local: null, observacoes: null }], [], '2026-10-17');
    expect(periodoProjeto(ciclo, r).inicio).toBe('2026-10-16');
  });
});

describe('Placar', () => {
  const inicio = '2026-10-15'; // quinta
  const fim = '2026-10-28';
  const dias = [
    dia('2026-10-15', true, true),
    dia('2026-10-16', true, false),
    // 17 sem nada
    dia('2026-10-18', true, true, { corrida_km: 5, corrida_seg: 1710 }), // domingo
    dia('2026-10-19', true, true),
  ];

  it('conta meta e feito até ontem; hoje em aberto não penaliza', () => {
    const p = calcularPlacar(dias, inicio, fim, '2026-10-20');
    expect(p.totalDias).toBe(14);
    expect(p.diasDecorridos).toBe(5);
    expect(p.treino).toMatchObject({ meta: 5, feito: 4 });
    expect(p.cardio).toMatchObject({ meta: 5, feito: 3 });
    expect(p.treino.aderencia).toBeCloseTo(0.8);
    expect(p.corrida).toMatchObject({ meta: 1, feito: 1, km: 5 });
    expect(p.bike).toMatchObject({ meta: 4, feito: 2, minutos: 60 });
  });

  it('hoje marcado entra na meta', () => {
    const p = calcularPlacar([...dias, dia('2026-10-20', true, false)], inicio, fim, '2026-10-20');
    expect(p.treino).toMatchObject({ meta: 6, feito: 5 });
    expect(p.cardio).toMatchObject({ meta: 5, feito: 3 }); // cardio de hoje ainda em aberto
  });

  it('sequência e recorde de dias completos (sem folga)', () => {
    const p = calcularPlacar(dias, inicio, fim, '2026-10-20');
    expect(p.sequenciaAtual).toBe(2); // 18 e 19
    expect(p.recorde).toBe(2);
  });

  it('projeção pela aderência atual', () => {
    const p = calcularPlacar(dias, inicio, fim, '2026-10-20');
    // 4 feitos + 0,8 × 9 dias a fazer (20 a 28)
    expect(p.treino.projecao).toBe(Math.round(4 + 0.8 * 9));
  });
});

describe('Corridas e pace', () => {
  it('calcula pace e compara com a anterior', () => {
    const c = listarCorridas([
      dia('2026-10-18', true, true, { corrida_km: 5, corrida_seg: 1800 }),
      dia('2026-10-21', true, true, { corrida_km: 5, corrida_seg: 1710 }),
      dia('2026-10-22', true, true, { corrida_seg: 1500 }), // quinta: não é dia de corrida
    ]);
    expect(c).toHaveLength(2);
    expect(c[0].pace).toBe(360);
    expect(c[1].pace).toBe(342);
    expect(c[1].delta).toBe(-18);
    expect(formatarTempo(342)).toBe('5:42');
  });
  it('formata o tempo digitado só com números', () => {
    expect(digitosParaTempo('2830')).toBe('28:30');
    expect(digitosParaTempo('13000')).toBe('1:30:00');
    expect(digitosParaTempo('500')).toBe('5:00');
    expect(digitosParaTempo('5')).toBe('0:05');
    expect(digitosParaTempo('28:30')).toBe('28:30');
    expect(digitosParaTempo('')).toBe('');
    expect(lerTempo(digitosParaTempo('2830'))).toBe(1710);
    expect(paceValido(1710 / 5)).toBe(true);
    expect(paceValido(169800 / 5)).toBe(false);
  });
  it('lê tempos digitados', () => {
    expect(lerTempo('28:30')).toBe(1710);
    expect(lerTempo('1:02:05')).toBe(3725);
    expect(lerTempo('30')).toBe(1800);
    expect(lerTempo('abc')).toBeNull();
  });
});

describe('Semanas e medidas', () => {
  it('semana começa na segunda', () => {
    expect(segundaDaSemana('2026-10-15')).toBe('2026-10-12');
    expect(segundaDaSemana('2026-10-18')).toBe('2026-10-12');
    expect(segundaDaSemana('2026-10-19')).toBe('2026-10-19');
  });
  it('aderência por semana e medida da segunda', () => {
    const med = composicao({ id: 'm', data: '2026-10-19', altura_cm: 182, pescoco_cm: 41, cintura_cm: 97, quadril_cm: null, peso_kg: 95 }, 'Masculino');
    const s = semanasDoProjeto(
      [dia('2026-10-15', true, true), dia('2026-10-16', true, false), dia('2026-10-18', true, true)],
      '2026-10-15',
      '2026-10-28',
      '2026-10-20',
      [med],
    );
    expect(s).toHaveLength(3);
    // semana 1: 15 a 18 (4 dias × 2) = 8 metas, 5 feitos
    expect(s[0].aderencia).toBeCloseTo(5 / 8);
    expect(s[1].medida?.cintura_cm).toBe(97);
    expect(medidaInicial([med], '2026-10-15')?.data).toBe('2026-10-19');
  });
});
