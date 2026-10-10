import { describe, expect, it } from 'vitest';
import type { AnaliseFase, ComposicaoFase } from './analise';
import {
  colunasQuadro,
  montarQuadro,
  ocorrencias,
  ritmoDoBloco,
  semanasDoCiclo,
  tabelaDecisoes,
  tabelaEventos,
  tabelaSemanal,
  tabelaTendencias,
  textoDieta,
  textoTolerancia,
  toleranciaIntervalo,
} from './consulta';
import { ritmoComFaixa, tendenciaMedidas } from './conferencia';
import { dataPorExtenso, segundaDaSemana } from './datas';
import type { Composicao } from './gordura';
import type { Aplicacao, RegistroDiario } from './tipos';

const reg = (data: string, extra: Partial<RegistroDiario> = {}): RegistroDiario => ({ id: data, data, peso_kg: null, nausea: null, observacoes: null, ...extra });
const ap = (data: string, dose_mg = 1.25, observacoes: string | null = null): Aplicacao => ({ id: data, ciclo_id: 'c', data, dose_mg, local: null, observacoes });
const comp = (data: string, peso: number, cintura: number): Composicao => ({
  data,
  peso_kg: peso,
  bf: 25,
  massa_gorda_kg: peso * 0.25,
  massa_magra_kg: peso * 0.75,
  cintura_cm: cintura,
  pescoco_cm: 41,
  quadril_cm: null,
});

describe('Semana a semana', () => {
  // 08/10/2026 é quinta; a semana começa na segunda 05/10
  const aplicacoes = [ap('2026-10-08'), ap('2026-10-15'), ap('2026-10-22', 1.5)];
  const diario = [
    reg('2026-10-09', { nausea: 2, vomito: true, dieta_seguida: 'sim' }),
    reg('2026-10-10', { nausea: 1, dieta_seguida: 'parcial' }),
    reg('2026-10-12', { peso_kg: 94.4, dieta_seguida: 'nao' }),
  ];
  const linhas = semanasDoCiclo({
    inicio: '2026-10-08',
    hoje: '2026-10-21',
    aplicacoes,
    serie: [
      { data: '2026-10-05', peso_kg: 95, origem: 'medida' },
      { data: '2026-10-12', peso_kg: 94.4, origem: 'diario' },
    ],
    composicoes: [comp('2026-10-05', 95, 97)],
    diario,
    treinos: [{ id: 't', data: '2026-10-06', treino: true, cardio: false, corrida_km: null, corrida_seg: null }],
  });

  it('uma linha por segunda, da semana da 1ª dose até a semana de hoje', () => {
    expect(linhas.map((l) => l.segunda)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(linhas.map((l) => l.dose_mg)).toEqual([1.25, 1.25, null]);
  });

  it('peso e medição da segunda, náusea máxima, dias com sintoma, dieta e treino', () => {
    expect(linhas[0]).toMatchObject({ peso_kg: 95, nausea_max: 2, dias_sintoma: 1, dieta: { sim: 1, parcial: 1, nao: 0 }, treino: 1, cardio: 0, dias: 7 });
    expect(linhas[0].composicao?.cintura_cm).toBe(97);
    expect(linhas[1]).toMatchObject({ peso_kg: 94.4, composicao: null, dieta: { sim: 0, parcial: 0, nao: 1 } });
    // Semana atual conta só até hoje (segunda 19 a quarta 21)
    expect(linhas[2].dias).toBe(3);
  });

  it('tabela sem a coluna de treino para conta sem a aba Treino', () => {
    const sem = semanasDoCiclo({ inicio: '2026-10-08', hoje: '2026-10-14', aplicacoes, serie: [], composicoes: [], diario, treinos: null });
    expect(sem[0].treino).toBeNull();
    const t = tabelaSemanal(sem, false);
    expect(t.cabecalho).not.toContain('Treino · cardio');
    expect(t.linhas[0]).toHaveLength(t.cabecalho.length);
    expect(t.linhas[0][9]).toBe('1/1/0');
    expect(tabelaSemanal(linhas, true).linhas[0].at(-1)).toBe('1/7 · 0/7');
  });

  it('dieta em % dos dias respondidos', () => {
    expect(textoDieta({ sim: 5, parcial: 1, nao: 1 })).toBe('71% (5 S · 1 P · 1 N)');
    expect(textoDieta({ sim: 0, parcial: 0, nao: 0 })).toBe('–');
  });
});

describe('Quadro de decisão', () => {
  const bloco = (indice: number, inicio: string, fim: string, dose: number, em_andamento: boolean): AnaliseFase => ({
    indice,
    fase_indice: indice,
    nome: 'F',
    dose_mg: dose,
    doses: 2,
    inicio,
    fim,
    dias: 14,
    peso_inicio: null,
    peso_fim: null,
    variacao_kg: null,
    kg_por_semana: null,
    poucos_dados: true,
    nausea_media: null,
    nausea_max: null,
    em_andamento,
  });
  const fases = [bloco(0, '2026-10-05', '2026-10-19', 1.25, false), bloco(1, '2026-10-19', '2026-11-01', 1.5, true)];
  const compFases: ComposicaoFase[] = [
    { indice: 0, de: comp('2026-10-05', 95, 97), ate: comp('2026-10-12', 94, 96), cintura: -1, gorda: -0.25, magra: -0.75, gorda_semana: -0.25, treino: 0.5, cardio: 0.25 },
    { indice: 1, de: null, ate: null, cintura: null, gorda: null, magra: null, gorda_semana: null, treino: 1, cardio: 0 },
  ];
  const diario = [
    reg('2026-10-06', { nausea: 3 }),
    reg('2026-10-07', { nausea: 3, vomito: true }),
    reg('2026-10-20', { nausea: 1, vomito: true, dieta_seguida: 'sim' }),
  ];
  const datas = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
  const q = colunasQuadro(fases, compFases, diario, datas, '2026-11-01');

  it('compara o último bloco com o anterior: eficácia por semana, pico de náusea e vômitos com data', () => {
    expect(q.anterior).toMatchObject({ gorda_semana: -0.25, cintura_semana: -1, magra_semana: -0.75, fim: '2026-10-18', treino: 0.5 });
    expect(q.anterior!.nausea_pico).toEqual({ valor: 3, data: '2026-10-06', d: 1 });
    expect(q.anterior!.vomitos).toEqual([{ data: '2026-10-07', d: 2 }]);
    expect(q.atual).toMatchObject({ em_andamento: true, gorda_semana: null, dias_registrados: 1, dias: 14, dieta: { sim: 1, parcial: 0, nao: 0 } });
  });

  it('sem treino, o quadro não tem as linhas de treino e cardio; sem fase anterior, mostra traço', () => {
    const com = montarQuadro({ atual: q.atual!, anterior: q.anterior }, true, 'Próxima dose prevista: 02/11/2026 · 1,50 mg');
    const sem = montarQuadro({ atual: q.atual!, anterior: null }, false, 'x');
    const rotulos = (m: typeof com) => m.secoes.flatMap((s) => s.linhas.map((l) => l[0]));
    expect(rotulos(com)).toContain('Treino');
    expect(rotulos(sem)).not.toContain('Treino');
    expect(sem.secoes[0].linhas[0][1]).toBe('–');
    expect(com.secoes[1].linhas[1]).toEqual(['Vômitos', '07/10 D2', '20/10 D1']);
    expect(com.colunas[1]).toContain('Fase atual');
    expect(com.regras.length).toBeGreaterThan(0);
  });
});

describe('Tolerância entre doses e ocorrências', () => {
  const diario = [
    reg('2026-10-09', { nausea: 2, vomito: true }),
    reg('2026-10-10', { nausea: 3, diarreia: true, intestino_preso: true, observacoes: 'só tomei água' }),
    reg('2026-10-11', { nausea: 1 }),
    reg('2026-10-16', { observacoes: '  viagem, sem academia ' }),
  ];
  it('náusea máxima e dias com sintoma no intervalo entre as doses', () => {
    const t = toleranciaIntervalo(diario, '2026-10-08', '2026-10-15', '2026-10-20');
    expect(t).toEqual({ dias: 3, nausea_max: 3, vomito: 1, diarreia: 1, intestino_preso: 1 });
    expect(textoTolerancia(t)).toBe('3 · vômito 1 d · diarreia 1 d · intest. preso 1 d');
    expect(textoTolerancia(toleranciaIntervalo(diario, '2026-10-15', null, '2026-10-20'))).toBe('– · sem sintomas');
    expect(textoTolerancia(toleranciaIntervalo([], '2026-10-15', null, '2026-10-20'))).toBe('sem registro');
  });

  it('ocorrências: só os dias com observação, vômito, diarreia ou náusea 3, com D+N e dose', () => {
    const o = ocorrencias([...diario, reg('2026-10-12', { nausea: 2 })], [ap('2026-10-08'), ap('2026-10-15', 1.5, 'doeu um pouco')]);
    expect(o.map((x) => [x.data, x.d, x.dose_mg, x.texto])).toEqual([
      ['2026-10-09', 1, 1.25, 'Vômito'],
      ['2026-10-10', 2, 1.25, 'Náusea forte, diarreia, intestino preso — só tomei água'],
      ['2026-10-15', 0, 1.5, 'Na aplicação: doeu um pouco'],
      ['2026-10-16', 1, 1.5, 'viagem, sem academia'],
    ]);
  });
});

describe('Tendências, eventos e decisões no PDF', () => {
  it('tendência das medidas com a faixa de 95%; sem medições suficientes, só a nota', () => {
    const c = [comp('2026-09-14', 96, 98), comp('2026-09-21', 95.4, 97.6), comp('2026-09-28', 95, 97), comp('2026-10-05', 94.3, 96.8), comp('2026-10-12', 94, 96.1)];
    const t = tabelaTendencias(c);
    expect(t.linhas.map((l) => l[0])).toEqual(['Massa gorda', 'Massa magra', 'Cintura', 'Peso']);
    expect(t.linhas[2][2]).toMatch(/^entre − \d+,\d\d e − \d+,\d\d cm$/);
    expect(t.nota).toContain('5 medições');
    expect(tabelaTendencias(c.slice(0, 2)).linhas).toEqual([]);
  });

  it('kg/semana do bloco pela regressão, com a faixa', () => {
    const serie = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].map((data, i) => ({ data, peso_kg: 95 - i * 0.5 + (i === 2 ? 0.1 : 0), origem: 'diario' as const }));
    expect(ritmoDoBloco(serie, { inicio: '2026-10-05', fim: '2026-10-26' }, true)).toMatch(/^− 0,\d\d ± 0,\d\d \(4 pesagens\)$/);
    // Bloco que não é o último: o dia da troca fica com o bloco seguinte
    expect(ritmoDoBloco(serie, { inicio: '2026-10-05', fim: '2026-10-19' }, false)).toBe('poucas pesagens');
  });

  it('eventos juntam alertas e anotações em ordem de data; decisões com motivo', () => {
    const e = tabelaEventos(
      [{ nivel: 'atencao', regra: 'vomito_dose', data: '2026-10-09', desde: '2026-10-09', texto: 'Vômito no dia seguinte à dose (09/10). Anote como foi.' }],
      [{ id: 'a', data: '2026-10-05', apos_aplicacao: 4, dose_mg: 1.25, fase_indice: 0, escolha: 'anotacao', texto: 'náusea no D1' }],
    );
    expect(e.linhas).toEqual([
      ['05/10/26', 'Anotação', 'náusea no D1 (após a 4ª dose, 1,25 mg)'],
      ['09/10/26', 'Alerta', 'Vômito no dia seguinte à dose (09/10)'],
    ]);
    const d = tabelaDecisoes([{ id: 'r', data: '2026-10-12', tipo: 'dieta', campo: 'Déficit/superávit', de: '−300 kcal', para: '−450 kcal', motivo: 'ritmo baixo' }]);
    expect(d.linhas).toEqual([['12/10/26', 'Dieta', 'Déficit/superávit: −300 kcal → −450 kcal', 'ritmo baixo']]);
  });
});

describe('Datas do relatório', () => {
  it('segunda-feira da semana e data por extenso', () => {
    expect(segundaDaSemana('2026-10-08')).toBe('2026-10-05');
    expect(segundaDaSemana('2026-10-05')).toBe('2026-10-05');
    expect(segundaDaSemana('2026-10-11')).toBe('2026-10-05');
    expect(dataPorExtenso('2026-10-10')).toBe('10 de outubro de 2026');
  });
});

describe('Faixa de 95% dos ritmos', () => {
  it('reta perfeita tem faixa zero; com ruído, a faixa cobre o ritmo', () => {
    const exata = ritmoComFaixa(['2026-10-05', '2026-10-12', '2026-10-19'].map((data, i) => ({ data, valor: 95 - i })));
    expect(exata!.semana).toBeCloseTo(-1);
    expect(exata!.ic95).toBeCloseTo(0);
    expect(ritmoComFaixa([{ data: '2026-10-05', valor: 1 }, { data: '2026-10-06', valor: 2 }, { data: '2026-10-07', valor: 3 }])).toBeNull();
    const c = [comp('2026-09-14', 96, 98), comp('2026-09-21', 95.4, 97.6), comp('2026-09-28', 95, 97), comp('2026-10-05', 94.3, 96.8)];
    const t = tendenciaMedidas(c)!;
    expect(t.ic95_semana.cintura).toBeGreaterThan(0);
    expect(Math.abs(t.cintura_semana)).toBeGreaterThan(t.ic95_semana.cintura);
  });
});
