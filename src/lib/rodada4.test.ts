import { describe, expect, it } from 'vitest';
import { reconciliarDecisoes, enfileirar, type ItemFila } from '../dados/fila';
import { colunasNausea, composicaoPorFase, sintomasPorFase, type AnaliseFase } from './analise';
import { calcularCiclo, cicloPadrao, decisaoDoBloco, blocosDeDose, textoProximaDoseRelatorio, type BlocoDose } from './ciclo';
import { somarDias } from './datas';
import { atingeCorteProteina, distribuicaoProteina, alvoProteinaRefeicao } from './dieta';
import { faixaRca, rcaExibida, cinturaAlvoRca, rca } from './gordura';
import { dietaNaTendencia, efeitosNoPeriodo, faltasNosPeriodos, sugestaoSemana } from './semana';
import type { Aplicacao, Ciclo, DecisaoFase, RegistroDiario, TreinoDia } from './tipos';
import { aderenciaDoTreino, aderenciaRecente, periodoProjeto } from './treino';

const base: Ciclo = { id: 'c1', ...cicloPadrao('2026-09-10') };
const ap = (data: string, dose: number): Aplicacao => ({ id: data, ciclo_id: 'c1', data, dose_mg: dose, local: null, observacoes: null });
const semanas = (inicio: string, n: number, dose: number) => Array.from({ length: n }, (_, i) => ap(somarDias(inicio, i * 7), dose));
const reg = (data: string, extra: Partial<RegistroDiario> = {}): RegistroDiario => ({ id: data, data, peso_kg: null, nausea: null, observacoes: null, ...extra });
const tr = (data: string, treino: boolean, cardio: boolean): TreinoDia => ({ id: data, data, treino, cardio, corrida_km: null, corrida_seg: null });

describe('Rodada 4 · Subir cancelado não volta a valer', () => {
  const fase2 = [...semanas('2026-09-10', 4, 1.25), ...semanas('2026-10-08', 4, 1.5)];
  const subir: DecisaoFase = { id: 's', data: '2026-11-05', apos_aplicacao: 8, dose_mg: 1.5, fase_indice: 2, escolha: 'subir', dose_nova_mg: 1.75 };

  it('uma dose antiga aplicada no mesmo dia da decisão invalida o Subir', () => {
    const aps = [...fase2, ap('2026-11-05', 1.5)];
    const bloco = blocosDeDose(aps).at(-1)!;
    expect(decisaoDoBloco(subir, bloco, aps)).toBe(false);
    // Plano com a fase 2 repetida (5 semanas): a 5ª dose completa o degrau e espera uma decisão nova
    const ciclo = { ...base, fases: base.fases.map((f, i) => (i === 1 ? { ...f, semanas: 5 } : f)), decisoes: [subir] };
    const r = calcularCiclo(ciclo, aps, [], '2026-11-05');
    expect(r.degrau.estado).toBe('pendente');
    expect(r.proxima!.dose_mg).toBe(1.5);
  });

  it('o Subir continua valendo sem dose depois dele, e uma dose esquecida de antes não o invalida', () => {
    const bloco = blocosDeDose(fase2).at(-1)!;
    expect(decisaoDoBloco(subir, bloco, fase2)).toBe(true);
    // Dose esquecida (data anterior) registrada depois da decisão
    const comEsquecida = [...fase2.slice(0, 7), ap('2026-10-26', 1.5), fase2[7]].sort((a, b) => a.data.localeCompare(b.data));
    const b2: BlocoDose = blocosDeDose(comEsquecida).at(-1)!;
    expect(decisaoDoBloco(subir, b2, comEsquecida)).toBe(true);
  });
});

describe('Rodada 4 · Última dose do frasco (a sobra)', () => {
  // Fase 2 repetida (8 semanas), 31 doses: o saldo fica em 1,50 mg
  const ciclo: Ciclo = { ...base, data_inicio: '2026-04-02', fases: base.fases.map((f, i) => (i === 1 ? { ...f, semanas: 8 } : f)) };
  const doses = [
    ...semanas('2026-04-02', 4, 1.25),
    ...semanas('2026-04-30', 8, 1.5),
    ...semanas('2026-06-25', 4, 1.75),
    ...semanas('2026-07-23', 4, 2),
    ...semanas('2026-08-20', 4, 2.25),
    ...semanas('2026-09-17', 7, 2.5),
  ];

  it('fica na fase atual (Manutenção), com a sobra como prevista, e o alerta de excesso some com o frasco usado', () => {
    const antes = calcularCiclo(ciclo, doses, [], '2026-11-05');
    expect(antes.saldo_mg).toBeCloseTo(1.5);
    expect(antes.alertas.some((a) => a.includes('MAIS do que você tem'))).toBe(true);
    const r = calcularCiclo(ciclo, [...doses, ap('2026-11-05', 1.5)], [], '2026-11-05');
    const u = r.linhas.at(-1)!;
    expect(u.fase?.indice).toBe(5);
    expect(u.bloco).toBe(r.linhas.at(-2)!.bloco);
    expect(u.dose_prevista).toBeCloseTo(1.5);
    expect(u.diferenca_mg).toBeCloseTo(0);
    expect(r.proxima).toBeNull();
    expect(r.alertas.some((a) => a.includes('MAIS do que você tem'))).toBe(false);
  });
});

describe('Rodada 4 · Projeto aberto com a dose extra pendente', () => {
  it('o fim do projeto acompanha a dose pedida (não termina no dia seguinte à última registrada)', () => {
    const ciclo: Ciclo = { ...base, quantidade_total_mg: 8.75, fases: [{ nome: 'Manutenção', semanas: 6, dose_mg: 1.25, objetivo: '' }] };
    const aps = semanas('2026-09-10', 6, 1.25);
    const r = calcularCiclo(ciclo, aps, [], '2026-10-28');
    expect(r.proxima?.extra).toBe(true);
    const p = periodoProjeto(ciclo, r, null, '2026-10-28');
    expect(p.fim).toBe('2026-11-04');
    // Dose extra registrada com atraso: o fim não pula para depois de dias sem check
    const depois = calcularCiclo(ciclo, [...aps, ap('2026-10-28', 1.25)], [], '2026-10-28');
    expect(periodoProjeto(ciclo, depois, null, '2026-10-28').fim).toBe('2026-11-04');
  });
});

describe('Rodada 4 · PDF: próxima dose atrasada', () => {
  it('diz que está atrasada e leva o aviso de pausa longa', () => {
    const aps = [...semanas('2026-08-03', 4, 1.25), ...semanas('2026-08-31', 4, 1.5), ...semanas('2026-09-28', 3, 1.75)];
    const r = calcularCiclo({ ...base, data_inicio: '2026-08-03' }, aps, [], '2026-11-02');
    const t = textoProximaDoseRelatorio(r)!;
    expect(t).toContain('atrasada 14 dias (prevista para 19/10/2026)');
    expect(t).toContain('1,75 mg');
    expect(t).toContain('Pausa de 3 semanas desde a última dose (12/10/2026)');
  });
});

describe('Rodada 4 · Semana: início do ciclo e efeitos', () => {
  const tend = { de: '2026-08-24', ate: '2026-10-05', medicoes: 6, gorda_semana: -0.5, magra_semana: 0, peso_semana: -0.5, cintura_semana: -0.5, bf_semana: -0.3, deficit_dia: 500, ic95_dia: 100, ic95_semana: { gorda: 0.1, magra: 0.1, peso: 0.2, cintura: 0.2 } };
  const diario = Array.from({ length: 32 }, (_, i) => reg(somarDias('2026-09-03', i), { dieta_seguida: 'sim' }));

  it('dias antes do início do ciclo não contam como "segui o plano?" sem resposta', () => {
    expect(dietaNaTendencia(diario, tend).dias).toBe(42);
    const d = dietaNaTendencia(diario, tend, '2026-09-03');
    expect(d).toMatchObject({ respondidos: 32, dias: 32 });
    expect(sugestaoSemana(tend, 94.6, diario, -500, '2026-09-03').tipo).not.toBe('sem_dados');
    expect(sugestaoSemana(tend, 94.6, diario, -500).tipo).toBe('sem_dados');
  });

  it('efeitos: só os dias com sintoma respondido; sintoma sem resposta é null', () => {
    const so = [reg('2026-10-01', { dieta_seguida: 'sim' }), reg('2026-10-02', { peso_kg: 90 })];
    expect(efeitosNoPeriodo(so, '2026-09-28', '2026-10-04')).toMatchObject({ registros: 0, vomito: null, diarreia: null, intestino_preso: null });
    const e = efeitosNoPeriodo([...so, reg('2026-10-03', { nausea: 1, vomito: false })], '2026-09-28', '2026-10-04');
    expect(e).toMatchObject({ registros: 1, vomito: 0, diarreia: null });
  });

  it('faltas somando os dois placares (projeto e pós-remédio na mesma semana)', () => {
    const treinos = ['2026-10-30', '2026-10-31', '2026-11-01'].map((d) => tr(d, true, true));
    const f = faltasNosPeriodos(treinos, '2026-10-26', '2026-11-01', [
      { inicio: '2026-08-27', fim: '2026-10-29' },
      { inicio: '2026-10-30', fim: '2026-12-31' },
    ]);
    expect(f).toMatchObject({ dias: 7, treinos_feitos: 3, cardios_feitos: 3 });
    expect(f.treino).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
  });
});

describe('Rodada 4 · Aderência na meta "Pelo que fiz"', () => {
  const ate = (de: string, n: number) => Array.from({ length: n }, (_, i) => tr(somarDias(de, i), true, true));

  it('hoje entra por campo e só depois de marcado', () => {
    const dias = ate('2026-10-05', 28); // até 01/11
    const sem = aderenciaRecente(dias, '2026-09-03', '2026-11-02')!;
    expect(sem).toMatchObject({ treino: 1, cardio: 1 });
    const soTreino = aderenciaRecente([...dias, tr('2026-11-02', true, false)], '2026-09-03', '2026-11-02')!;
    expect(soTreino.cardio).toBe(1);
    const desmarcado = aderenciaRecente([...dias, tr('2026-11-02', false, false)], '2026-09-03', '2026-11-02')!;
    expect(desmarcado).toMatchObject({ treino: sem.treino, cardio: sem.cardio, dias: sem.dias });
  });

  it('com menos de 7 dias no placar pós-remédio, segue a do projeto (congelada no fim)', () => {
    const dias = [...ate('2026-09-01', 50).map((t, i) => (i % 3 === 0 ? { ...t, cardio: false } : t))];
    const t = { inicio: '2026-11-03', fim: '2026-12-31', placarPos: true, projeto: { inicio: '2026-08-31', fim: '2026-11-02' } };
    const a = aderenciaDoTreino(dias, t, '2026-11-05')!;
    const projeto = aderenciaRecente(dias, '2026-08-31', '2026-11-05', 28, '2026-11-02')!;
    expect(a.cardio).toBeCloseTo(projeto.cardio);
    expect(a.congelada_ate).toBe('2026-11-02');
    // Sem placar pós: não usa o fallback
    expect(aderenciaDoTreino(dias, { ...t, placarPos: false }, '2026-11-05')).toBeNull();
  });
});

describe('Rodada 4 · Medidas e Dieta', () => {
  it('cintura/altura: abaixo de metade da altura é saudável e aparece truncada', () => {
    const r = rca(82.4, 165)!;
    expect(faixaRca(r)).toBe('saudavel');
    expect(rcaExibida(r)).toBe(0.49);
    expect(82.4 < cinturaAlvoRca(165)!).toBe(true);
    expect(faixaRca(rca(82.5, 165)!)).toBe('aumentada');
  });

  it('proteína por refeição: no alvo pelo número mostrado (25 de ~28 g conta com corte de 25 g)', () => {
    const magra = 69.7;
    const corte = alvoProteinaRefeicao(magra) * 0.9;
    expect(atingeCorteProteina(24.64, corte)).toBe(true);
    expect(atingeCorteProteina(24.4, corte)).toBe(false);
    const d = distribuicaoProteina([{ nome: 'Ceia', ptn_animal: 24.64, itens: 1 }], magra);
    expect(d.no_alvo).toBe(1);
  });
});

describe('Rodada 4 · Náusea por dia com intervalo de 14 dias', () => {
  it('faixas até D13 e o pico do D+9 aparece', () => {
    expect(colunasNausea(7).map((c) => c.rotulo)).toEqual(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    expect(colunasNausea(14).map((c) => c.rotulo)).toEqual(['D0', 'D1', 'D2', 'D3–6', 'D7–13']);
    const fase = { indice: 0, inicio: '2026-08-03' } as AnaliseFase;
    const diario = Array.from({ length: 14 }, (_, i) => reg(somarDias('2026-08-03', i), { nausea: i === 9 ? 3 : 0 }));
    const [s] = sintomasPorFase([fase], ['2026-08-03'], diario, '2026-08-16', 14);
    expect(s.nausea_por_dia).toHaveLength(5);
    expect(s.nausea_por_dia[4]).toBeCloseTo(3 / 7);
  });

  it('composição por fase: hoje marcado entra na aderência da fase atual', () => {
    const fase = { indice: 0, inicio: '2026-10-26' } as AnaliseFase;
    const [c] = composicaoPorFase([fase], [], [tr('2026-10-26', true, true)], '2026-10-26');
    expect(c.treino).toBe(1);
    const [v] = composicaoPorFase([fase], [], [], '2026-10-26');
    expect(v.treino).toBeNull();
  });
});

describe('Rodada 4 · Fila: decisão pendente × ciclo salvo', () => {
  it('a decisão ainda na fila passa a levar as fases e as decisões gravadas (com versão nova)', () => {
    const repetir: DecisaoFase = { id: 'r', data: '2026-11-02', apos_aplicacao: 8, dose_mg: 1.5, fase_indice: 1, escolha: 'repetir', semanas: 1 };
    let f: ItemFila[] = enfileirar([], { tipo: 'decisoes', dado: { ciclo_id: 'c1', decisoes: [repetir], fases: base.fases } }, 1);
    f = enfileirar(f, { tipo: 'treino', dado: { data: '2026-11-02', treino: true, cardio: false, corrida_km: null, corrida_seg: null } }, 2);
    const fases = base.fases.map((x, i) => (i === 2 ? { ...x, semanas: 8 } : x));
    const intervalo: DecisaoFase = { id: 'i', data: '2026-11-02', apos_aplicacao: 8, dose_mg: 1.5, fase_indice: null, escolha: 'intervalo', intervalo_anterior: 7, intervalo_dias: 10 };
    let v = 10;
    const nova = reconciliarDecisoes(f, { id: 'c1', fases, decisoes: [repetir, intervalo] }, () => ++v);
    const d = nova.find((i) => i.tipo === 'decisoes')!;
    expect(d.tipo === 'decisoes' && d.dado.fases?.[2].semanas).toBe(8);
    expect(d.tipo === 'decisoes' && d.dado.decisoes.map((x) => x.id)).toEqual(['r', 'i']);
    expect(d.versao).toBe(11);
    expect(nova.find((i) => i.tipo === 'treino')!.versao).toBe(2);
    // Sem decisão na fila: nada muda
    const so = f.filter((i) => i.tipo === 'treino');
    expect(reconciliarDecisoes(so, { id: 'c1', fases, decisoes: [] }, () => ++v)).toBe(so);
  });
});
