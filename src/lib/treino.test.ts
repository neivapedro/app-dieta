import { describe, expect, it } from 'vitest';
import { calcularCiclo, cicloPadrao } from './ciclo';
import { composicao } from './gordura';
import type { Ciclo, TreinoDia } from './tipos';
import {
  aderenciaRecente,
  calcularPlacar,
  digitosParaTempo,
  horasExercicioDia,
  resumoEsforco,
  tipoCardioEfetivo,
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
    // medição de 19/10 (segunda) mostra o resultado da semana de 12 a 18/10
    expect(s[0].medida?.cintura_cm).toBe(97);
    expect(s[1].medida).toBeNull();
    expect(medidaInicial([med], '2026-10-15')?.data).toBe('2026-10-19');
  });
});

describe('Aderência recente', () => {
  it('depois do fim do projeto não vira falta: fica congelada nas 4 últimas semanas do projeto', () => {
    const dias: TreinoDia[] = [];
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.UTC(2026, 8, 20 + i)).toISOString().slice(0, 10);
      if (d <= '2026-10-27') dias.push({ id: d, data: d, treino: true, cardio: true, corrida_km: null, corrida_seg: null });
    }
    expect(aderenciaRecente(dias, '2026-09-20', '2026-10-20', 28, '2026-10-27')?.treino).toBe(1);
    // Dias depois do fim não contam; a meta "Pelo que fiz" não muda sozinha no dia seguinte ao fim
    expect(aderenciaRecente(dias, '2026-09-20', '2026-11-10', 28, '2026-10-27')).toEqual({ treino: 1, cardio: 1, dias: 28 });
    expect(aderenciaRecente(dias, '2026-09-20', '2026-10-28', 28, '2026-10-27')).toEqual(aderenciaRecente(dias, '2026-09-20', '2026-11-10', 28, '2026-10-27'));
    // O último dia do projeto entra (no dia seguinte ele já venceu)
    const semUltimo = dias.filter((d) => d.data !== '2026-10-27');
    expect(aderenciaRecente(semUltimo, '2026-09-20', '2026-11-10', 28, '2026-10-27')!.treino).toBeCloseTo(27 / 28);
  });
});

describe('Corrida em qualquer dia', () => {
  it('tipo efetivo: o salvo; senão, distância preenchida; senão, a regra do dia', () => {
    expect(tipoCardioEfetivo('2026-10-14')).toBe('corrida'); // quarta sem registro
    expect(tipoCardioEfetivo('2026-10-14', { cardio_tipo: 'bike', corrida_km: null })).toBe('bike');
    expect(tipoCardioEfetivo('2026-10-15', { cardio_tipo: null, corrida_km: 5 })).toBe('corrida'); // quinta com km
    expect(tipoCardioEfetivo('2026-10-15', { cardio_tipo: 'corrida', corrida_km: null })).toBe('corrida');
    expect(tipoCardioEfetivo('2026-10-15', { corrida_km: null })).toBe('bike');
  });

  it('corrida movida de quarta para quinta: meta pela regra, feito pelo real', () => {
    // Semana de 12/10 (segunda) a 18/10 (domingo); hoje = 19/10
    const dias = [
      dia('2026-10-12', true, true),
      dia('2026-10-13', true, true),
      dia('2026-10-14', true, true, { cardio_tipo: 'bike' }), // quarta: bike
      dia('2026-10-15', true, true, { cardio_tipo: 'corrida', corrida_km: 6, corrida_seg: 2160 }), // quinta: corrida
      dia('2026-10-16', true, true),
      dia('2026-10-17', true, true),
      dia('2026-10-18', true, true, { corrida_km: 5, corrida_seg: 1710 }), // domingo
    ];
    const p = calcularPlacar(dias, '2026-10-12', '2026-10-25', '2026-10-19');
    expect(p.corrida).toMatchObject({ meta: 2, feito: 2, km: 11 });
    expect(p.bike).toMatchObject({ meta: 5, feito: 5, minutos: 150 });
    expect(p.corrida.aderencia).toBe(1);
    // A corrida de quinta entra no pace; a quarta (bike) não
    expect(listarCorridas(dias).map((c) => c.data)).toEqual(['2026-10-15', '2026-10-18']);
  });

  it('corrida a mais na semana não passa de 100%', () => {
    const dias = [
      dia('2026-10-14', true, true, { corrida_km: 5 }),
      dia('2026-10-15', true, true, { cardio_tipo: 'corrida', corrida_km: 5 }),
    ];
    const p = calcularPlacar(dias, '2026-10-14', '2026-10-20', '2026-10-16');
    expect(p.corrida).toMatchObject({ meta: 1, feito: 2, aderencia: 1 });
    expect(p.bike).toMatchObject({ meta: 1, feito: 0, aderencia: 0 });
    // Somando os tipos, bate com o cardio
    expect(p.corrida.meta + p.bike.meta).toBe(p.cardio.meta);
    expect(p.corrida.feito + p.bike.feito).toBe(p.cardio.feito);
  });

  it('hoje (quarta) com bike: entra na meta de corrida e no feito de bike', () => {
    const p = calcularPlacar([dia('2026-10-14', false, true, { cardio_tipo: 'bike' })], '2026-10-14', '2026-10-20', '2026-10-14');
    expect(p.corrida).toMatchObject({ meta: 1, feito: 0 });
    expect(p.bike).toMatchObject({ meta: 0, feito: 1, aderencia: null });
  });
});

describe('Esforço percebido', () => {
  const hoje = '2026-11-30';
  const serie = (de: string, n: number, esforco: number) =>
    Array.from({ length: n }, (_, i) => {
      const [a, m, d] = de.split('-').map(Number);
      const data = new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10);
      return dia(data, true, true, { esforco_treino: esforco, esforco_cardio: 4 });
    });

  it('média de 7 dias contra as 4 semanas anteriores; alerta com +1,5', () => {
    const dias = [...serie('2026-10-27', 28, 5), ...serie('2026-11-24', 7, 7)];
    const r = resumoEsforco(dias, hoje);
    expect(r.treino.media7).toBe(7);
    expect(r.treino.referencia).toBe(5);
    expect(r.treino.subida).toBe(2);
    expect(r.treino.alerta).toBe(true);
    expect(r.cardio.subida).toBe(0);
    expect(r.cardio.alerta).toBe(false);
  });

  it('sem comparação com poucos registros', () => {
    const r = resumoEsforco([...serie('2026-11-01', 4, 5), ...serie('2026-11-28', 2, 9)], hoje);
    expect(r.treino.subida).toBeNull();
    expect(r.treino.alerta).toBe(false);
    expect(r.treino.n7).toBe(2);
    expect(resumoEsforco([], hoje).treino.media7).toBeNull();
  });

  it('esforço de sessão desmarcada fica fora da conta', () => {
    const r = resumoEsforco([dia('2026-11-29', false, true, { esforco_treino: 9, esforco_cardio: 4 })], hoje);
    expect(r.treino.n7).toBe(0);
    expect(r.cardio.media7).toBe(4);
  });
});

describe('Horas de exercício do dia (meta de água)', () => {
  it('dia passado conta só o que foi marcado', () => {
    expect(horasExercicioDia('2026-10-15', dia('2026-10-15', true, true), '2026-10-20')).toBe(1.5); // 60 + bike 30
    expect(horasExercicioDia('2026-10-15', dia('2026-10-15', false, false), '2026-10-20')).toBe(0);
    expect(horasExercicioDia('2026-10-15', undefined, '2026-10-20')).toBe(0);
  });
  it('corrida com tempo usa o tempo real', () => {
    expect(horasExercicioDia('2026-10-18', dia('2026-10-18', true, true, { corrida_km: 5, corrida_seg: 1800 }), '2026-10-20')).toBe(1.5);
    expect(horasExercicioDia('2026-10-18', dia('2026-10-18', false, true, { corrida_km: 10, corrida_seg: 3600 }), '2026-10-20')).toBe(1);
  });
  it('hoje em aberto conta o previsto', () => {
    expect(horasExercicioDia('2026-10-20', undefined, '2026-10-20')).toBe(1.5);
    expect(horasExercicioDia('2026-10-20', dia('2026-10-20', true, false), '2026-10-20')).toBe(1.5);
  });
  it('fora do projeto (hoje = null) nada fica em aberto', () => {
    expect(horasExercicioDia('2026-10-20', undefined, null)).toBe(0);
    expect(horasExercicioDia('2026-10-20', dia('2026-10-20', true, false), null)).toBe(1);
  });
});
