import { describe, expect, it } from 'vitest';
import { calcularCiclo, cicloPadrao } from './ciclo';
import { composicao } from './gordura';
import type { Ciclo, TreinoDia } from './tipos';
import {
  aderenciaRecente,
  calcularPlacar,
  detalheTipoCardio,
  formatarKm,
  resumoCorrida,
  ritmoCorrida,
  rotuloTipoCardio,
  textoCorridasPeriodo,
  textoKmCorridos,
  tocarCardio,
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
    expect(p.diaAtual).toBe(6);
    expect(p.diasRestantes).toBe(8);
    expect(p.treino).toMatchObject({ meta: 5, feito: 4 });
    expect(p.cardio).toMatchObject({ meta: 5, feito: 3 });
    expect(p.treino.aderencia).toBeCloseTo(0.8);
    expect(p.corrida).toMatchObject({ meta: 1, feito: 1, km: 5, semDistancia: 0 });
    expect(p.bike).toMatchObject({ meta: 4, feito: 2, minutos: 60 });
  });

  it('dia do projeto: hoje conta como o dia em curso e a soma com o que falta dá o total', () => {
    expect(calcularPlacar([], inicio, fim, '2026-10-14')).toMatchObject({ diaAtual: 0, diasRestantes: 14, iniciado: false });
    expect(calcularPlacar([], inicio, fim, '2026-10-15')).toMatchObject({ diaAtual: 1, diasRestantes: 13 });
    expect(calcularPlacar([], inicio, fim, '2026-10-16')).toMatchObject({ diaAtual: 2, diasRestantes: 12 });
    expect(calcularPlacar([], inicio, fim, '2026-10-28')).toMatchObject({ diaAtual: 14, diasRestantes: 0, encerrado: false });
    expect(calcularPlacar([], inicio, fim, '2026-10-29')).toMatchObject({ diaAtual: 14, diasRestantes: 0, encerrado: true });
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
  it('pace só de corridas com distância E tempo (sem distância padrão)', () => {
    const c = listarCorridas([
      dia('2026-10-14', true, true, { cardio_tipo: 'corrida', corrida_seg: 1800 }), // só tempo
      dia('2026-10-18', true, true, { cardio_tipo: 'corrida', corrida_km: 6 }), // só distância
      dia('2026-10-21', true, true, { cardio_tipo: 'corrida', corrida_km: 6.2, corrida_seg: 1930 }),
      dia('2026-10-25', true, false, { cardio_tipo: 'corrida', corrida_km: 5, corrida_seg: 1500 }), // desmarcada
    ]);
    expect(c.map((x) => x.data)).toEqual(['2026-10-21']);
    expect(c[0]).toMatchObject({ km: 6.2, segundos: 1930, delta: null });
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

  it('km corridos soma só as distâncias anotadas e conta as corridas sem distância', () => {
    const dias = [
      dia('2026-10-14', true, true, { cardio_tipo: 'corrida', corrida_km: 6.2, corrida_seg: 1930 }),
      dia('2026-10-15', true, true, { cardio_tipo: 'corrida' }), // marcada, sem distância
      dia('2026-10-18', true, true, { cardio_tipo: 'corrida', corrida_km: 6.2 }),
      dia('2026-10-19', true, false, { cardio_tipo: 'corrida', corrida_km: 9 }), // desmarcada: fora
      dia('2026-10-20', true, true, { cardio_tipo: 'bike' }),
    ];
    const p = calcularPlacar(dias, '2026-10-12', '2026-10-25', '2026-10-21');
    expect(p.corrida.km).toBeCloseTo(12.4);
    expect(p.corrida.semDistancia).toBe(1);
    expect(textoKmCorridos(p.corrida)).toBe('12,4 km corridos · 1 sem distância');
    expect(textoKmCorridos({ km: 12.4, semDistancia: 2 })).toBe('12,4 km corridos · 2 sem distância');
    expect(textoKmCorridos({ km: 0, semDistancia: 0 })).toBe('0 km corridos');
    expect(textoKmCorridos({ km: 10, semDistancia: 0 })).toBe('10 km corridos');
    // Mesma precisão do botão e do resumo (até 2 casas)
    expect(textoKmCorridos({ km: 6.25, semDistancia: 0 })).toBe('6,25 km corridos');
    // Nenhuma distância anotada: não mostra "0 km corridos"
    expect(textoKmCorridos({ km: 0, semDistancia: 1 })).toBe('1 sem distância');
    expect(textoKmCorridos({ km: 0, semDistancia: 2 })).toBe('2 sem distância');
  });

  it('corridas do período (Análise) dizem quantas estão sem distância', () => {
    expect(textoCorridasPeriodo({ feito: 2, km: 6.2, semDistancia: 1 })).toBe('2 · 6,2 km · 1 sem distância');
    expect(textoCorridasPeriodo({ feito: 2, km: 12.45, semDistancia: 0 })).toBe('2 · 12,45 km');
    expect(textoCorridasPeriodo({ feito: 1, km: 0, semDistancia: 1 })).toBe('1 · sem distância');
    expect(textoCorridasPeriodo({ feito: 0, km: 0, semDistancia: 0 })).toBe('0');
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
  it('corrida sem tempo conta a duração estimada (30 min)', () => {
    expect(horasExercicioDia('2026-10-18', dia('2026-10-18', false, true, { cardio_tipo: 'corrida' }), '2026-10-20')).toBe(0.5);
    expect(horasExercicioDia('2026-10-18', dia('2026-10-18', false, true, { cardio_tipo: 'corrida', corrida_km: 8 }), '2026-10-20')).toBe(0.5);
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

describe('tocarCardio (Bike e Corrida no cartão do dia)', () => {
  const sexta = '2026-10-23';
  const quarta = '2026-10-28';
  const reg = (c: Partial<TreinoDia>): TreinoDia => ({ id: 'x', data: sexta, treino: false, cardio: false, corrida_km: null, corrida_seg: null, ...c });

  it('nada marcado: marca o tipo tocado, em qualquer dia', () => {
    // Sem distância padrão: marcar a corrida não grava km
    expect(tocarCardio(sexta, undefined, 'corrida')).toEqual({ cardio: true, cardio_tipo: 'corrida', corrida_km: null, corrida_seg: null, esforco_cardio: null });
    expect(tocarCardio(quarta, undefined, 'bike')).toMatchObject({ cardio: true, cardio_tipo: 'bike' });
  });

  it('o mesmo tipo marcado: desmarca e apaga o esforço, guarda distância e tempo', () => {
    const r = reg({ cardio: true, cardio_tipo: 'corrida', corrida_km: 6, corrida_seg: 1900, esforco_cardio: 6 });
    expect(tocarCardio(sexta, r, 'corrida')).toEqual({ cardio: false, cardio_tipo: null, corrida_km: 6, corrida_seg: 1900, esforco_cardio: null });
    // Bike marcada pela regra do dia (sem tipo salvo): tocar Bike desmarca
    expect(tocarCardio(sexta, reg({ cardio: true }), 'bike')).toMatchObject({ cardio: false });
    // Corrida pela regra da quarta (sem tipo salvo): tocar Corrida desmarca
    expect(tocarCardio(quarta, reg({ data: quarta, cardio: true }), 'corrida')).toMatchObject({ cardio: false });
  });

  it('o outro tipo marcado: troca, mantém o esforço; Bike apaga distância e tempo', () => {
    const corrida = reg({ cardio: true, cardio_tipo: 'corrida', corrida_km: 6, corrida_seg: 1900, esforco_cardio: 6 });
    expect(tocarCardio(sexta, corrida, 'bike')).toEqual({ cardio: true, cardio_tipo: 'bike', corrida_km: null, corrida_seg: null, esforco_cardio: 6 });
    expect(tocarCardio(quarta, reg({ data: quarta, cardio: true }), 'bike')).toMatchObject({ cardio: true, cardio_tipo: 'bike' });
    expect(tocarCardio(sexta, reg({ cardio: true, esforco_cardio: 4 }), 'corrida')).toMatchObject({ cardio: true, cardio_tipo: 'corrida', esforco_cardio: 4 });
  });

  it('remarcar a corrida depois de desmarcar recupera distância e tempo', () => {
    const desmarcada = reg({ ...tocarCardio(sexta, reg({ cardio: true, cardio_tipo: 'corrida', corrida_km: 7, corrida_seg: 2400 }), 'corrida') });
    expect(tocarCardio(sexta, desmarcada, 'corrida')).toMatchObject({ cardio: true, cardio_tipo: 'corrida', corrida_km: 7, corrida_seg: 2400 });
  });

  it('o cardio marcado conta como o tipo tocado no placar', () => {
    const r = reg({ ...tocarCardio(sexta, undefined, 'corrida') });
    expect(tipoCardioEfetivo(sexta, r)).toBe('corrida');
    expect(detalheTipoCardio('corrida', r.corrida_km)).toBe('km e pace');
    expect(detalheTipoCardio('bike')).toBe('30 min');
  });

  it('trocar Bike → Corrida não inventa distância', () => {
    expect(tocarCardio(sexta, reg({ cardio: true, cardio_tipo: 'bike' }), 'corrida')).toMatchObject({ cardio_tipo: 'corrida', corrida_km: null, corrida_seg: null });
  });
});

describe('Rótulos e resumo da corrida', () => {
  it('detalhe do botão: a distância anotada ou "km e pace"', () => {
    expect(detalheTipoCardio('corrida', null)).toBe('km e pace');
    expect(detalheTipoCardio('corrida', 0)).toBe('km e pace');
    expect(detalheTipoCardio('corrida', 6.2)).toBe('6,2 km');
    expect(detalheTipoCardio('corrida', 21.08)).toBe('21,08 km');
    expect(detalheTipoCardio('corrida', 10)).toBe('10 km');
    expect(detalheTipoCardio('bike', 6.2)).toBe('30 min');
    expect(formatarKm(5.255)).toBe('5,26 km');
  });

  it('rótulo do cardio sem distância padrão', () => {
    expect(rotuloTipoCardio('corrida')).toBe('Corrida');
    expect(rotuloTipoCardio('corrida', 6.2)).toBe('Corrida 6,2 km');
    expect(rotuloTipoCardio('bike', 6.2)).toBe('Bike 30 min');
  });

  it('pace e velocidade só com distância e tempo', () => {
    const r = ritmoCorrida(6.2, 1930)!; // 32:10
    expect(formatarTempo(r.pace)).toBe('5:11');
    expect(r.kmh).toBeCloseTo(11.565, 2);
    expect(ritmoCorrida(null, 1930)).toBeNull();
    expect(ritmoCorrida(6.2, null)).toBeNull();
    expect(ritmoCorrida(0, 1930)).toBeNull();
  });

  it('resumo mostra só o que foi anotado; pace só com os dois', () => {
    expect(resumoCorrida(6.2, 1930)).toBe('6,2 km · 32:10 · 5:11 /km');
    expect(resumoCorrida(6.2, null)).toBe('6,2 km');
    expect(resumoCorrida(null, 1930)).toBe('32:10');
    expect(resumoCorrida(null, null)).toBeNull();
    expect(resumoCorrida(0, 0)).toBeNull();
  });
});
