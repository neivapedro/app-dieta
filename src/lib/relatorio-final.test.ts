import { describe, expect, it } from 'vitest';
import { analisarFases, serieDePeso } from './analise';
import { calcularCiclo, cicloPadrao } from './ciclo';
import { somarDias } from './datas';
import type { FotoInfo } from './fotos';
import { ajusteVigente, historicoComposicao } from './gordura';
import { decisaoPosRemedio } from './projeto';
import { detalheDecisaoFase, montarRelatorioFinal, RODAPE_RELATORIO_FINAL, type EntradaRelatorioFinal } from './relatorio-final';
import { periodoProjeto } from './treino';
import type { Aplicacao, Ciclo, DecisaoFase, Medida, Perfil, RegistroDecisao, RegistroDiario, RegistroForca, TreinoDia } from './tipos';

// Ciclo de 30 semanas (plano padrão: 4+4+4+4+4+10 doses) a partir de segunda, 05/01/2026
const INICIO = '2026-01-05';
const DOSES = [...Array(4).fill(1.25), ...Array(4).fill(1.5), ...Array(4).fill(1.75), ...Array(4).fill(2), ...Array(4).fill(2.25), ...Array(10).fill(2.5)] as number[];
const dia = (n: number) => somarDias(INICIO, n);

function perfilBase(extra: Partial<Perfil> = {}): Perfil {
  return {
    nome: 'Pedro Teste',
    sexo: 'Masculino',
    altura_cm: 181,
    lembretes_ativos: false,
    hora_lembrete: '09:00',
    fuso_horario: 'America/Sao_Paulo',
    modulo_treino: true,
    metas_projeto: { pescoco_cm: null, cintura_cm: 86, quadril_cm: null, peso_kg: 85, bf: 15 },
    ...extra,
  };
}

/** Decisões de subir a cada fim de fase (o app só sobe com a decisão registrada). */
function decisoesSubir(): DecisaoFase[] {
  const lista: DecisaoFase[] = [];
  let n = 0;
  for (let i = 1; i < DOSES.length; i++) {
    if (DOSES[i] !== DOSES[i - 1]) {
      n++;
      lista.push({ id: `dec${n}`, data: dia(7 * i - 1), apos_aplicacao: i, dose_mg: DOSES[i - 1], fase_indice: n, escolha: 'subir', dose_nova_mg: DOSES[i] });
    }
  }
  return lista;
}

interface Opcoes {
  /** Quantas doses (semanas) foram aplicadas */
  doses?: number;
  hoje?: string;
  sexo?: 'Masculino' | 'Feminino';
  treino?: boolean;
  semMedidas?: boolean;
  medicoes?: number;
  atipicaNoFim?: boolean;
  posRemedio?: boolean;
  fotos?: FotoInfo[];
  semPesoDiario?: boolean;
}

/** Entrada completa, com as contas de useCalculos(). */
function entrada(o: Opcoes = {}): EntradaRelatorioFinal {
  const nDoses = o.doses ?? 30;
  const hoje = o.hoje ?? '2026-11-02';
  const feminino = o.sexo === 'Feminino';
  const comTreino = o.treino ?? true;
  const ciclo: Ciclo = { ...cicloPadrao(INICIO), id: 'c1', decisoes: decisoesSubir().filter((d) => d.apos_aplicacao < nDoses) };
  const aplicacoes: Aplicacao[] = DOSES.slice(0, nDoses).map((mg, i) => ({ id: `a${i}`, ciclo_id: 'c1', data: dia(7 * i), dose_mg: mg, local: 'Abdome direito', observacoes: null }));
  if (o.posRemedio) {
    ciclo.decisoes = [
      ...(ciclo.decisoes ?? []),
      { id: 'pos', data: dia(7 * (nDoses - 1) + 10), apos_aplicacao: nDoses, dose_mg: DOSES[nDoses - 1], fase_indice: null, escolha: 'pos_remedio', bloco_inicio: dia(7 * (nDoses - 1)) },
    ];
  }
  // Uma medição por segunda (31 semanas), cintura e peso caindo; a última semana de dados até hoje
  const nMed = o.semMedidas ? 0 : (o.medicoes ?? 40);
  const medidas: Medida[] = [];
  for (let s = 0; s < nMed; s++) {
    const data = dia(7 * s);
    if (data > hoje) break;
    medidas.push({
      id: `m${s}`,
      data,
      altura_cm: feminino ? 165 : 181,
      pescoco_cm: feminino ? 33 : 41,
      // Semana 3 tem a maior queda (1,5 cm e 1,6 kg)
      cintura_cm: (feminino ? 88 : 100) - s * 0.4 - (s >= 3 ? 1.1 : 0),
      quadril_cm: feminino ? 108 - s * 0.3 : null,
      peso_kg: (feminino ? 82 : 98) - s * 0.45 - (s >= 3 ? 1.15 : 0),
    });
  }
  if (o.atipicaNoFim && medidas.length) {
    const ult = medidas[medidas.length - 1];
    medidas.push({ ...ult, id: 'atip', data: somarDias(ult.data, 2), cintura_cm: 70, peso_kg: 60, atipica: true });
  }
  const diario: RegistroDiario[] = [];
  for (let i = 0; dia(i) <= hoje; i++) {
    const d = dia(i);
    diario.push({
      id: `d${i}`,
      data: d,
      peso_kg: o.semPesoDiario || i % 7 === 0 ? null : (feminino ? 82 : 98) - i * 0.06,
      nausea: i % 7 === 1 ? 2 : i % 7 === 2 ? 1 : 0,
      observacoes: null,
      // 12 dias seguidos no plano a partir do dia 20
      dieta_seguida: i >= 20 && i < 32 ? 'sim' : i % 5 === 0 ? 'nao' : 'sim',
      sono_h: i % 4 === 0 ? 6 : 7.5,
      agua_l: 2 + (i % 3) * 0.5,
      vomito: i % 30 === 1 ? true : null,
    });
  }
  const treinos: TreinoDia[] = [];
  for (let i = 0; dia(i) <= hoje; i++) {
    treinos.push({
      id: `t${i}`,
      data: dia(i),
      treino: i % 6 !== 0,
      cardio: i % 4 !== 0,
      corrida_km: i % 7 === 3 ? 5 + (i % 21 === 3 ? 3 : 0) : null,
      corrida_seg: i % 7 === 3 ? 1800 - i : null,
      cardio_tipo: i % 7 === 3 ? 'corrida' : 'bike',
    });
  }
  const forca: RegistroForca[] = [0, 1, 2, 3, 4, 5].map((s) => ({ id: `f${s}`, data: dia(7 * s * 4 + 2), exercicio: 'Supino', carga_kg: 60 + s * 2, reps: 8, rir: 2 }));
  const registroDecisoes: RegistroDecisao[] = [
    { id: 'r1', data: dia(40), tipo: 'dieta', campo: 'Déficit/superávit', de: '−300 kcal', para: '−400 kcal', motivo: 'ritmo baixo' },
    { id: 'r2', data: dia(400), tipo: 'nota', campo: 'Depois do fim', de: null, para: null },
  ];
  const perfil = perfilBase({
    sexo: feminino ? 'Feminino' : 'Masculino',
    altura_cm: feminino ? 165 : 181,
    modulo_treino: comTreino,
    metas_projeto: feminino ? { pescoco_cm: null, cintura_cm: 78, quadril_cm: 100, peso_kg: 70, bf: 28 } : perfilBase().metas_projeto,
  });
  // As contas de useCalculos()
  const resumo = calcularCiclo(ciclo, aplicacoes, diario, hoje, medidas);
  const serie = serieDePeso(diario, medidas);
  const composicoes = historicoComposicao(medidas, perfil.sexo, { altura_cm: perfil.altura_cm, ajuste: ajusteVigente(perfil, medidas) });
  const pos = decisaoPosRemedio(ciclo, aplicacoes);
  const fimRemedio = resumo.linhas.length && (pos || !resumo.proxima) ? periodoProjeto(ciclo, resumo, pos?.bloco_inicio).fim : null;
  const fases = analisarFases(resumo, serie, diario, hoje, fimRemedio);
  return {
    perfil,
    ciclo,
    resumo,
    diario,
    serie,
    composicoes,
    fases,
    hoje,
    fimRemedio,
    posRemedio: pos,
    treinos: comTreino ? treinos : null,
    forca: comTreino ? forca : null,
    registroDecisoes,
    dieta: null,
    fotos: o.fotos ?? [],
  };
}

const foto = (id: string, sessao: 'antes' | 'depois', rotulo: FotoInfo['rotulo'], data: string, ordem = 0): FotoInfo => ({ id, sessao, rotulo, data, ordem });

describe('montarRelatorioFinal · ciclo concluído', () => {
  const e = entrada({ fotos: [foto('fa', 'antes', 'frente', dia(0)), foto('la', 'antes', 'lado', dia(0), 1), foto('fd', 'depois', 'frente', dia(210)), foto('ld', 'depois', 'lado', dia(210), 1)] });
  const r = montarRelatorioFinal(e);

  it('período: da 1ª aplicação ao fim do período do remédio', () => {
    expect(e.fimRemedio).toBe(somarDias(dia(7 * 29), 7));
    expect(r.estado).toBe('concluido');
    expect(r.rotulo_estado).toBe('Ciclo concluído');
    expect(r.periodo.inicio).toBe(INICIO);
    expect(r.periodo.fim).toBe(e.fimRemedio);
    expect(r.periodo.dias).toBe(29 * 7 + 7 + 1);
    expect(r.periodo.progresso).toBe(1);
    expect(r.textos.aviso_previa).toBeNull();
    expect(r.textos.rodape).toBe(RODAPE_RELATORIO_FINAL);
  });

  it('números de início e fim pelas medições (nada depois do fim)', () => {
    const fim = r.periodo.fim;
    expect(r.numeros.cintura.inicio).toBeCloseTo(100, 6);
    expect(r.numeros.cintura.data_fim! <= fim).toBe(true);
    expect(r.numeros.cintura.delta!).toBeLessThan(-10);
    expect(r.numeros.cintura.tom).toBe('bom');
    expect(r.numeros.peso.delta!).toBeLessThan(-10);
    expect(r.numeros.peso.delta_pct!).toBeCloseTo(r.numeros.peso.delta! / 98, 6);
    expect(r.numeros.peso.texto_delta.startsWith('− ')).toBe(true);
    expect(r.numeros.bf.texto_delta).toMatch(/p\.p\.$/);
    expect(r.numeros.quadril).toBeNull();
    expect(r.series.peso.every((p) => p.data <= fim)).toBe(true);
    expect(r.series.cintura.every((p) => p.data <= fim)).toBe(true);
    expect(r.series.dose.at(-1)).toEqual({ data: fim, valor: 2.5 });
  });

  it('remédio, fases e linha do tempo', () => {
    expect(r.remedio.aplicacoes).toBe(30);
    expect(r.remedio.dose_inicial).toBe(1.25);
    expect(r.remedio.dose_final).toBe(2.5);
    expect(r.remedio.total_mg).toBeCloseTo(60, 6);
    expect(r.fases.map((f) => f.dose_mg)).toEqual([1.25, 1.5, 1.75, 2, 2.25, 2.5]);
    expect(r.fases.at(-1)!.fim).toBe(r.periodo.fim);
    expect(r.fases.every((f) => !f.em_andamento)).toBe(true);
    expect(r.linha_do_tempo[0]).toMatchObject({ tipo: 'inicio', data: INICIO });
    expect(r.linha_do_tempo.at(-1)).toMatchObject({ tipo: 'fim', data: r.periodo.fim, titulo: 'Fim do ciclo' });
    expect(r.linha_do_tempo.filter((x) => x.tipo === 'fase')).toHaveLength(5);
    expect(r.linha_do_tempo.filter((x) => x.tipo === 'decisao_fase')).toHaveLength(5);
    // Registro depois do fim do ciclo fica de fora; o motivo vai junto
    expect(r.linha_do_tempo.some((x) => x.detalhe?.includes('Depois do fim'))).toBe(false);
    expect(r.linha_do_tempo.find((x) => x.tipo === 'registro')!.detalhe).toContain('motivo: ritmo baixo');
  });

  it('semanas e náusea por fase', () => {
    expect(r.semanas[0].segunda).toBe(INICIO);
    expect(r.semanas.at(-1)!.segunda <= r.periodo.fim).toBe(true);
    expect(r.semanas.length).toBe(31);
    expect(r.semanas[0].dose_mg).toBe(1.25);
    expect(r.semanas[0].sono_h).not.toBeNull();
    expect(r.nausea.colunas).toEqual(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    expect(r.nausea.pico).toMatchObject({ rotulo: 'D1' });
    expect(r.fases[0].nausea_por_dia[1]).toBe(2);
    expect(r.nausea.tem_sintomas).toBe(true);
  });

  it('recordes calculados dos registros', () => {
    const ids = r.recordes.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['semana_peso', 'semana_cintura', 'seq_dieta', 'seq_diario', 'doses_no_dia', 'maior_corrida', 'melhor_pace', 'forca']));
    const sc = r.recordes.find((x) => x.id === 'semana_cintura')!;
    expect(sc.valor).toBeCloseTo(-1.5, 6);
    expect(sc.de).toBe(dia(14));
    expect(sc.ate).toBe(dia(21));
    expect(r.recordes.find((x) => x.id === 'seq_dieta')!.valor).toBeGreaterThanOrEqual(12);
    expect(r.recordes.find((x) => x.id === 'doses_no_dia')!.texto).toBe('30 de 30');
    expect(r.recordes.find((x) => x.id === 'maior_corrida')!.valor).toBe(8);
  });

  it('hábitos e treino no ciclo inteiro', () => {
    expect(r.habitos.de).toBe(INICIO);
    expect(r.habitos.ate).toBe(r.periodo.fim);
    expect(r.habitos.adesao.registro.fracao).toBe(1);
    expect(r.habitos.adesao.sono.fracao).toBeCloseTo(0.75, 1);
    expect(r.habitos.sequencias.diario).toBe(r.periodo.dias);
    expect(r.treino).not.toBeNull();
    expect(r.treino!.treino.feito).toBeGreaterThan(0);
    expect(r.treino!.lista_corridas.every((c) => c.data <= r.periodo.fim)).toBe(true);
    expect(r.treino!.forca!.exercicios[0]).toMatchObject({ nome: 'Supino' });
    expect(r.treino!.forca!.exercicios[0].variacao).toBeGreaterThan(0);
  });

  it('metas e balanço', () => {
    expect(r.metas.itens.map((m) => m.nome)).toEqual(['Peso', 'Cintura', '% de gordura', 'Massa gorda']);
    expect(r.metas.itens[1].progresso.fracao).toBeGreaterThan(0);
    expect(r.metas.balanco.map((l) => l.nome)).toContain('Massa magra');
  });

  it('fotos: pares por pose, capa de frente e a mesma seleção do PDF', () => {
    expect(r.fotos.total).toBe(4);
    expect(r.fotos.pares.map((p) => p.chave)).toEqual(['frente', 'lado']);
    expect(r.fotos.capa).toMatchObject({ chave: 'frente', id_antes: 'fa', id_depois: 'fd' });
    expect(r.fotos.capa!.numeros_depois.find((n) => n.chave === 'cintura_cm')!.variacao).toMatch(/^− /);
    expect(r.fotos.pdf.pares).toHaveLength(2);
  });

  it('é serializável (só dados) e não fala de dose a tomar', () => {
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    const texto = JSON.stringify(r).toLowerCase();
    for (const proibido of ['aumente', 'aumentar a dose', 'reduza', 'reduzir a dose', 'suba a dose', 'subir a dose', 'déficit de', 'recomend']) expect(texto).not.toContain(proibido);
  });

  it('resumo e cartão', () => {
    expect(r.resumo_texto).toMatch(/^Em 211 dias \(30,1 semanas\) e 30 aplicações: peso −\u00a0\d.*\u00a0p\.p\.$/);
    expect(r.cartao.sobretitulo).toBe('Relatório final');
    expect(r.cartao.titulo).toBe('30 semanas de ciclo');
    expect(r.cartao.principal.chave).toBe('cintura_cm');
    expect(r.cartao.adesao.map((a) => a.rotulo)).toEqual(['Treino', 'Dieta', 'Água', 'Sono 7 h+']);
  });
});

describe('montarRelatorioFinal · prévia (em andamento)', () => {
  const hoje = dia(7 * 9 + 3);
  const e = entrada({ doses: 10, hoje });
  const r = montarRelatorioFinal(e);

  it('vai até hoje, com aviso de prévia e o fim previsto', () => {
    expect(e.fimRemedio).toBeNull();
    expect(r.estado).toBe('previa');
    expect(r.rotulo_estado).toBe('Em andamento — prévia');
    expect(r.periodo.fim).toBe(hoje);
    expect(r.periodo.fim_previsto! > hoje).toBe(true);
    expect(r.periodo.progresso!).toBeGreaterThan(0);
    expect(r.periodo.progresso!).toBeLessThan(1);
    expect(r.textos.aviso_previa).toContain('prévia');
    expect(r.linha_do_tempo.at(-1)).toMatchObject({ tipo: 'fim', titulo: 'Hoje (prévia)' });
    expect(r.cartao.sobretitulo).toBe('Relatório final · prévia');
  });

  it('hábitos até ontem (hoje ainda em aberto) e o último bloco em andamento', () => {
    expect(r.habitos.ate).toBe(somarDias(hoje, -1));
    expect(r.fases.at(-1)!.em_andamento).toBe(true);
    expect(r.fases.at(-1)!.fim).toBe(hoje);
    expect(r.resumo_texto.startsWith('Até agora, em')).toBe(true);
  });
});

describe('montarRelatorioFinal · casos sem dados', () => {
  it('sem medições nem pesos: números vazios, sem metas e sem recordes de corpo', () => {
    const r = montarRelatorioFinal(entrada({ semMedidas: true, semPesoDiario: true }));
    expect(r.numeros.cintura.inicio).toBeNull();
    expect(r.numeros.cintura.delta).toBeNull();
    expect(r.numeros.cintura.texto_delta).toBe('–');
    expect(r.numeros.peso.delta).toBeNull();
    expect(r.massa_magra.preservada).toBeNull();
    expect(r.qualidade).toBeNull();
    expect(r.metas.itens).toEqual([]);
    expect(r.series.cintura).toEqual([]);
    expect(r.recordes.some((x) => x.categoria === 'corpo')).toBe(false);
    expect(r.resumo_texto).toContain('duas medições');
    expect(r.cartao.principal.detalhe).toBe('sem medição');
  });

  it('sem medições, mas com pesos do Diário: o peso vem das pesagens', () => {
    const r = montarRelatorioFinal(entrada({ semMedidas: true }));
    expect(r.numeros.peso.delta!).toBeLessThan(0);
    expect(r.numeros.cintura.delta).toBeNull();
  });

  it('sem fotos: nenhum par e sem capa', () => {
    const r = montarRelatorioFinal(entrada());
    expect(r.fotos.total).toBe(0);
    expect(r.fotos.pares).toEqual([]);
    expect(r.fotos.capa).toBeNull();
    expect(r.fotos.pdf.pares).toEqual([]);
  });

  it('fotos sem pose em comum: um par geral (1ª do Antes × última do Depois)', () => {
    const r = montarRelatorioFinal(entrada({ fotos: [foto('a1', 'antes', 'outra', dia(0)), foto('d1', 'depois', 'costas', dia(100)), foto('d2', 'depois', 'outra', dia(200))] }));
    expect(r.fotos.pares).toHaveLength(1);
    expect(r.fotos.capa).toMatchObject({ chave: 'geral', id_antes: 'a1', id_depois: 'd2' });
  });

  it('antes da 1ª aplicação: período vazio, sem quebrar', () => {
    const e = entrada({ doses: 0, hoje: '2026-01-01', semMedidas: true });
    const r = montarRelatorioFinal(e);
    expect(r.estado).toBe('previa');
    expect(r.periodo.dias).toBe(0);
    expect(r.fases).toEqual([]);
    expect(r.semanas).toEqual([]);
    expect(r.linha_do_tempo).toEqual([]);
    expect(r.treino).toBeNull();
  });
});

describe('montarRelatorioFinal · perfis', () => {
  it('sem a aba Treino: sem treino, sem anéis de treino e sem recordes de treino', () => {
    const r = montarRelatorioFinal(entrada({ treino: false }));
    expect(r.pessoa.com_treino).toBe(false);
    expect(r.treino).toBeNull();
    expect(r.habitos.adesao.treino).toBeNull();
    expect(r.semanas.every((s) => s.treino === null && s.km === null)).toBe(true);
    expect(r.fases.every((f) => f.treino === null)).toBe(true);
    expect(r.recordes.some((x) => x.categoria === 'treino')).toBe(false);
    expect(r.cartao.adesao.map((a) => a.rotulo)).not.toContain('Treino');
    expect(r.registros.dias_treino).toBeNull();
  });

  it('perfil feminino: quadril nos números, nas metas e nas fotos', () => {
    const r = montarRelatorioFinal(entrada({ sexo: 'Feminino', fotos: [foto('fa', 'antes', 'frente', dia(0)), foto('fd', 'depois', 'frente', dia(200))] }));
    expect(r.pessoa.feminino).toBe(true);
    expect(r.numeros.quadril).not.toBeNull();
    expect(r.numeros.quadril!.delta!).toBeLessThan(0);
    expect(r.numeros.bf.inicio).not.toBeNull();
    expect(r.metas.itens.map((m) => m.nome)).toContain('Quadril');
    expect(r.series.quadril.length).toBeGreaterThan(0);
    expect(r.fotos.capa!.numeros_depois.map((n) => n.chave)).toContain('quadril_cm');
    expect(r.metas.balanco.map((l) => l.nome)).toContain('Quadril');
  });
});

describe('montarRelatorioFinal · medições', () => {
  it('medição atípica fica fora do fim e dos recordes, mas aparece na série marcada', () => {
    const e = entrada({ atipicaNoFim: true, hoje: dia(7 * 12 + 4), doses: 13 });
    const r = montarRelatorioFinal(e);
    expect(r.numeros.cintura.fim).not.toBe(70);
    expect(r.numeros.peso.fim).not.toBe(60);
    expect(r.series.cintura.find((p) => p.valor === 70)).toMatchObject({ atipico: true });
    expect(r.recordes.find((x) => x.id === 'semana_cintura')!.valor).toBeGreaterThan(-5);
    expect(r.registros.atipicas).toBe(1);
  });

  it('uma medição só: início sem variação', () => {
    const r = montarRelatorioFinal(entrada({ medicoes: 1 }));
    expect(r.numeros.cintura.inicio).toBeCloseTo(100, 6);
    expect(r.numeros.cintura.fim).toBeCloseTo(100, 6);
    expect(r.numeros.cintura.delta).toBeNull();
    expect(r.massa_magra.texto).toContain('duas medições');
    expect(r.cartao.principal.detalhe).toBe('sem nova medição');
    expect(r.recordes.some((x) => x.id === 'semana_cintura')).toBe(false);
  });
});

describe('montarRelatorioFinal · fase pós-remédio', () => {
  it('é citada em uma linha e fica fora do período', () => {
    const e = entrada({ posRemedio: true });
    const r = montarRelatorioFinal(e);
    expect(r.estado).toBe('concluido');
    expect(r.pos_remedio).not.toBeNull();
    expect(r.pos_remedio!.texto).toContain('fica fora deste relatório');
    expect(r.periodo.fim).toBe(somarDias(dia(7 * 29), 7));
    expect(r.series.peso.every((p) => p.data <= r.periodo.fim)).toBe(true);
    expect(r.linha_do_tempo.some((x) => x.titulo === 'Fase pós-remédio')).toBe(false);
  });
});

describe('detalheDecisaoFase', () => {
  it('descreve cada escolha', () => {
    const base = { id: 'x', data: '2026-02-01', apos_aplicacao: 4, dose_mg: 1.25, fase_indice: 1 } as const;
    expect(detalheDecisaoFase({ ...base, escolha: 'subir', dose_nova_mg: 1.5 })).toBe('1,25 → 1,50 mg');
    expect(detalheDecisaoFase({ ...base, escolha: 'repetir', semanas: 2 })).toBe('+2 sem. na fase 2 (1,25 mg)');
    expect(detalheDecisaoFase({ ...base, escolha: 'intervalo', intervalo_anterior: 7, intervalo_dias: 10 })).toBe('7 → 10 dias entre doses');
    expect(detalheDecisaoFase({ ...base, escolha: 'anotacao', texto: 'Nota ao médico' })).toBe('Nota ao médico');
  });
});
