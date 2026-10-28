import { describe, expect, it } from 'vitest';
import { cicloPadrao } from './ciclo';
import { montarGaleria, sequencias, type ConquistaGaleria, type EntradaGaleria, type Galeria } from './conquistas-galeria';
import { somarDias } from './datas';
import { historicoComposicao } from './gordura';
import { dia, entrada, INICIO, type OpcoesEntrada } from './relatorio-final-teste';
import type { Aplicacao, Ciclo, Medida, RegistroDiario, TreinoDia } from './tipos';

const ciclo: Ciclo = { ...cicloPadrao(INICIO), id: 'c1' };

function vazia(extra: Partial<EntradaGaleria> = {}): EntradaGaleria {
  return {
    hoje: dia(10),
    sexo: 'Masculino',
    ciclo,
    aplicacoes: [],
    diario: [],
    medidas: [],
    composicoes: [],
    metas: null,
    treinos: null,
    comDieta: false,
    metaAgua: () => 2,
    ...extra,
  };
}

/** As mesmas entradas que a tela monta a partir de useDados()/useCalculos()/useTreino() */
function deCenario(o: OpcoesEntrada, extra: Partial<EntradaGaleria> = {}): EntradaGaleria {
  const x = entrada(o);
  return {
    hoje: x.hoje,
    sexo: x.perfil!.sexo,
    ciclo: x.ciclo,
    aplicacoes: x.resumo.linhas.map((l) => l.aplicacao),
    diario: x.diario,
    medidas: [],
    composicoes: x.composicoes,
    metas: x.perfil!.metas_projeto ?? null,
    treinos: x.treinos,
    periodosTreino: [{ inicio: INICIO, fim: x.fimRemedio ?? x.hoje }],
    comDieta: false,
    metaAgua: () => 2,
    fimRemedio: x.fimRemedio,
    ...extra,
  };
}

const item = (g: Galeria, id: string): ConquistaGaleria => {
  const i = g.itens.find((x) => x.id === id);
  if (!i) throw new Error(`sem ${id}`);
  return i;
};

const aplic = (doses: number[], inicio = INICIO): Aplicacao[] => doses.map((mg, i) => ({ id: `a${i}`, ciclo_id: 'c1', data: somarDias(inicio, 7 * i), dose_mg: mg, local: null, observacoes: null }));
const regCompleto = (data: string, extra: Partial<RegistroDiario> = {}): RegistroDiario => ({ id: data, data, peso_kg: 90, nausea: 0, observacoes: null, agua_l: 2.5, sono_h: 7.5, ...extra });

describe('sequencias', () => {
  it('maior sequência, data em que cada tamanho foi alcançado e o n-ésimo dia', () => {
    const ok = new Set([dia(0), dia(1), dia(3), dia(4), dia(5)]);
    const s = sequencias(dia(0), dia(6), (d) => ok.has(d));
    expect(s.maior).toBe(3);
    expect(s.atual).toBe(0);
    expect(s.total).toBe(5);
    expect(s.primeiraVez[2]).toBe(dia(1));
    expect(s.primeiraVez[3]).toBe(dia(5));
    expect(s.enesimo[4]).toBe(dia(4));
    expect(sequencias(dia(3), dia(1), () => true).maior).toBe(0);
  });
});

describe('galeria: conta nova vazia', () => {
  it('tudo bloqueado, com progresso zero e sem conquistas de treino', () => {
    const g = montarGaleria(vazia());
    expect(g.ganhas).toBe(0);
    expect(g.total).toBe(g.itens.length);
    expect(g.itens.every((i) => !i.ganha && i.data === null)).toBe(true);
    expect(g.itens.some((i) => i.categoria === 'treino')).toBe(false);
    expect(item(g, 'primeira-aplicacao').falta).toBe('falta registrar a 1ª aplicação');
    // Uma medalha de fase por degrau do plano padrão (6) + ciclo completo
    expect(g.itens.filter((i) => i.id.startsWith('fase:')).map((i) => i.titulo)).toEqual(['Fase 1 concluída', 'Fase 2 concluída', 'Fase 3 concluída', 'Fase 4 concluída', 'Fase 5 concluída', 'Fase 6 concluída']);
    expect(item(g, 'ciclo-completo').progresso).toEqual({ atual: 0, alvo: 30, fracao: 0 });
    expect(item(g, 'massa-magra-preservada').falta).toBe('avaliada no fim do ciclo');
    // Sem metas: nenhuma medalha de meta; sem dieta: nenhuma de plano alimentar
    expect(g.itens.some((i) => i.id.startsWith('meta:'))).toBe(false);
    expect(g.itens.some((i) => i.id === 'dieta-14')).toBe(false);
    expect(g.recentes).toEqual([]);
    expect(g.categorias.map((c) => c.chave)).toEqual(['remedio', 'habitos', 'corpo']);
  });

  it('sem ciclo: só a primeira aplicação no remédio', () => {
    const g = montarGaleria(vazia({ ciclo: null }));
    expect(g.itens.filter((i) => i.categoria === 'remedio').map((i) => i.id)).toEqual(['primeira-aplicacao']);
  });
});

describe('galeria: remédio', () => {
  it('fase concluída no dia da última aplicação prevista; fase incompleta mostra o que falta', () => {
    const g = montarGaleria(vazia({ hoje: dia(60), aplicacoes: aplic([1.25, 1.25, 1.25, 1.25, 1.5, 1.5]) }));
    expect(item(g, 'primeira-aplicacao').data).toBe(INICIO);
    expect(item(g, 'fase:0').data).toBe(dia(21));
    expect(item(g, 'fase:0').selo).toBe('1');
    expect(item(g, 'fase:0').forma).toBe('hexagono');
    const f2 = item(g, 'fase:1');
    expect(f2.ganha).toBe(false);
    expect(f2.progresso).toEqual({ atual: 2, alvo: 4, fracao: 0.5 });
    expect(f2.falta).toBe('faltam 2 aplicações');
  });

  it('subiu antes do fim da fase: a fase não conta', () => {
    const g = montarGaleria(vazia({ hoje: dia(60), aplicacoes: aplic([1.25, 1.25, 1.25, 1.5]) }));
    expect(item(g, 'fase:0').ganha).toBe(false);
    expect(item(g, 'fase:0').falta).toBe('falta 1 aplicação');
  });

  it('fases seguidas com a mesma dose viram uma medalha só', () => {
    const fases = [
      { nome: 'A', semanas: 2, dose_mg: 1, objetivo: '' },
      { nome: 'B', semanas: 2, dose_mg: 2, objetivo: '' },
      { nome: 'C', semanas: 2, dose_mg: 2, objetivo: '' },
    ];
    const g = montarGaleria(vazia({ hoje: dia(60), ciclo: { ...ciclo, fases }, aplicacoes: aplic([1, 1, 2, 2, 2, 2]) }));
    expect(g.itens.filter((i) => i.id.startsWith('fase:')).map((i) => [i.titulo, i.data])).toEqual([
      ['Fase 1 concluída', dia(7)],
      ['Fases 2–3 concluídas', dia(35)],
    ]);
    expect(item(g, 'ciclo-completo').data).toBe(dia(35));
  });

  it('ciclo completo pela fase pós-remédio (fim do remédio registrado)', () => {
    const c = { ...ciclo, decisoes: [{ id: 'p', data: dia(40), apos_aplicacao: 5, dose_mg: 1.5, fase_indice: null, escolha: 'pos_remedio' as const, bloco_inicio: dia(28) }] };
    const g = montarGaleria(vazia({ hoje: dia(60), ciclo: c, aplicacoes: aplic([1.25, 1.25, 1.25, 1.25, 1.5]) }));
    expect(item(g, 'ciclo-completo').data).toBe(dia(28));
  });
});

describe('galeria: hábitos', () => {
  it('checklist do dia: todos os itens do Diário; hoje vale o checklist do Início', () => {
    const diario = [regCompleto(dia(0)), regCompleto(dia(1)), regCompleto(dia(2), { sono_h: null }), regCompleto(dia(3))];
    const g = montarGaleria(vazia({ hoje: dia(3), aplicacoes: aplic([1.25]), diario, checklistHoje: { feitas: 5, total: 6 } }));
    const c = item(g, 'checklist');
    expect(c.titulo).toBe('Checklist do dia completo');
    expect(c.data).toBe(dia(0));
    expect(item(g, 'checklist-7').progresso).toEqual({ atual: 2, alvo: 7, fracao: 2 / 7 });
    expect(item(g, 'checklist-7').falta).toBe('faltam 5 dias');
    expect(c.detalhe).toBe('Total: 2 dias · melhor sequência: 2 dias');
    // Com o checklist de hoje completo, hoje conta
    const g2 = montarGaleria(vazia({ hoje: dia(3), aplicacoes: aplic([1.25]), diario, checklistHoje: { feitas: 6, total: 6 } }));
    expect(item(g2, 'checklist-7').progresso?.atual).toBe(3);
  });

  it('com dieta montada, o "Segui o plano?" entra no checklist; com Treino, treino e cardio no período do placar', () => {
    const diario = [regCompleto(dia(0), { dieta_seguida: 'sim' }), regCompleto(dia(1))];
    expect(item(montarGaleria(vazia({ hoje: dia(1), diario, comDieta: true })), 'checklist-7').progresso?.atual).toBe(1);
    const treinos: TreinoDia[] = [{ id: 't', data: dia(0), treino: true, cardio: false, corrida_km: null, corrida_seg: null }];
    const comTreino = vazia({ hoje: dia(1), diario, treinos, periodosTreino: [{ inicio: dia(0), fim: dia(0) }] });
    // Dia 0: falta o cardio · dia 1: fora do placar, só o Diário
    expect(item(montarGaleria(comTreino), 'checklist').data).toBe(dia(1));
  });

  it('peso do dia vem da medição quando o Diário não tem', () => {
    const diario = [regCompleto(dia(0), { peso_kg: null })];
    const medidas: Pick<Medida, 'data' | 'peso_kg'>[] = [{ data: dia(0), peso_kg: 91 }];
    expect(item(montarGaleria(vazia({ hoje: dia(1), diario, medidas })), 'checklist').data).toBe(dia(0));
    expect(item(montarGaleria(vazia({ hoje: dia(1), diario })), 'checklist').ganha).toBe(false);
  });

  it('água, sono e plano: sequências de 7, 7 e 14 dias', () => {
    const diario = Array.from({ length: 16 }, (_, k) => regCompleto(dia(k), { agua_l: k === 3 ? 1.5 : 2, sono_h: k < 7 ? 7 : 6.5, dieta_seguida: 'sim' }));
    const g = montarGaleria(vazia({ hoje: dia(15), diario }));
    expect(item(g, 'agua-7').data).toBe(dia(10));
    expect(item(g, 'sono-7').data).toBe(dia(6));
    expect(item(g, 'dieta-14').data).toBe(dia(13));
    expect(item(g, 'agua-7').detalhe).toBe('Melhor sequência: 12 dias · atual: 12 dias');
  });
});

describe('galeria: corpo', () => {
  const medida = (k: number, cintura: number, extra: Partial<Medida> = {}): Medida => ({ id: `m${k}`, data: dia(k), altura_cm: 181, pescoco_cm: 41, cintura_cm: cintura, quadril_cm: null, peso_kg: 95, ...extra });

  it('segundas seguidas: uma semana sem medir zera a sequência', () => {
    const ks = [0, 7, 14, 28, 35, 42, 49];
    const medidas = ks.map((k) => medida(k, 100));
    const g = montarGaleria(vazia({ hoje: dia(50), composicoes: historicoComposicao(medidas, 'Masculino') }));
    expect(item(g, 'primeira-medicao').data).toBe(dia(0));
    expect(item(g, 'medicoes-4').data).toBe(dia(49));
    expect(item(g, 'medicoes-12').falta).toBe('faltam 8 segundas');
    // Medição numa terça não conta como medição de segunda
    const terca = montarGaleria(vazia({ hoje: dia(50), composicoes: historicoComposicao([0, 8, 15, 22].map((k) => medida(k, 100)), 'Masculino') }));
    expect(item(terca, 'medicoes-4').progresso?.atual).toBe(1);
  });

  it('meta de cintura: a medição atípica não conta', () => {
    const medidas = [medida(0, 100), medida(7, 95), medida(9, 84, { atipica: true })];
    const metas = { pescoco_cm: null, cintura_cm: 86, quadril_cm: null, peso_kg: null, bf: null };
    const g = montarGaleria(vazia({ hoje: dia(10), composicoes: historicoComposicao(medidas, 'Masculino'), metas }));
    const m = item(g, 'meta:cintura_cm');
    expect(m.ganha).toBe(false);
    expect(m.falta).toBe('faltam 9,0 cm');
    expect(m.progresso?.fracao).toBeCloseTo(5 / 14);
    // Só as metas definidas aparecem
    expect(g.itens.filter((i) => i.id.startsWith('meta:')).length).toBe(1);
    const ok = montarGaleria(vazia({ hoje: dia(20), composicoes: historicoComposicao([...medidas, medida(14, 85.5)], 'Masculino'), metas }));
    expect(item(ok, 'meta:cintura_cm').data).toBe(dia(14));
  });

  it('massa magra preservada: só no fim do ciclo, dentro do erro da fita', () => {
    const e = deCenario({ doses: 30, sexo: 'Feminino', treino: false });
    const g = montarGaleria(e);
    const mm = item(g, 'massa-magra-preservada');
    expect(mm.ganha).toBe(true);
    expect(mm.data! <= e.fimRemedio!).toBe(true);
    // Antes do fim: avaliada no fim
    const previa = montarGaleria(deCenario({ doses: 12, hoje: dia(80) }));
    expect(item(previa, 'massa-magra-preservada').falta).toBe('avaliada no fim do ciclo');
    expect(item(previa, 'massa-magra-preservada').detalhe).toMatch(/^Até agora: /);
  });
});

describe('galeria: treino', () => {
  const corrida = (k: number, km: number | null, seg: number | null, extra: Partial<TreinoDia> = {}): TreinoDia => ({ id: `t${k}`, data: dia(k), treino: true, cardio: true, corrida_km: km, corrida_seg: seg, cardio_tipo: 'corrida', ...extra });

  it('corridas: primeira, 5/10/21 km, recorde de pace (como a comemoração)', () => {
    const treinos = [corrida(1, null, null), corrida(3, 5, 1800), corrida(5, 6, 2100), corrida(8, 10.2, 3300), corrida(9, 4, 1300, { treino: false })];
    const g = montarGaleria(vazia({ hoje: dia(10), treinos }));
    expect(item(g, 'primeira-corrida').data).toBe(dia(1));
    expect(item(g, 'corrida-5k').data).toBe(dia(3));
    expect(item(g, 'corrida-10k').data).toBe(dia(8));
    expect(item(g, 'corrida-21k').falta).toBe('faltam 10,8 km na corrida mais longa');
    const r = item(g, 'recorde-pace');
    expect(r.data).toBe(dia(5));
    // 4 km em 21:40 (5:25/km) não bate os 5:24/km da corrida de 10,2 km
    expect(r.detalhe).toBe('Melhor pace: 5:24/km em 13/01/2026 · 2 recordes');
    expect(item(g, 'treino-seq-7').detalhe).toBe('Melhor sequência: 1 dia');
  });

  it('50 e 100 treinos e sequência de 7 dias de treino + cardio', () => {
    const treinos = Array.from({ length: 60 }, (_, k) => ({ id: `t${k}`, data: dia(k), treino: true, cardio: k !== 20, corrida_km: null, corrida_seg: null }));
    const g = montarGaleria(vazia({ hoje: dia(59), treinos }));
    expect(item(g, 'treinos-50').data).toBe(dia(49));
    expect(item(g, 'treinos-100').progresso).toEqual({ atual: 60, alvo: 100, fracao: 0.6 });
    expect(item(g, 'treino-seq-7').data).toBe(dia(6));
    expect(item(g, 'recorde-pace').falta).toBe('faltam 2 corridas com tempo');
  });
});

describe('galeria: cenários completos', () => {
  it.each([
    ['concluído (Pedro, com Treino)', { doses: 30 }],
    ['prévia', { doses: 12, hoje: dia(80) }],
    ['amiga sem Treino (feminino)', { doses: 30, treino: false, sexo: 'Feminino' as const }],
    ['atípica no fim', { doses: 12, hoje: dia(80), medicoes: 12, atipicaNoFim: true }],
  ])('%s: contagens coerentes e datas dentro do histórico', (_, o) => {
    const e = deCenario(o);
    const g = montarGaleria(e);
    expect(g.ganhas).toBe(g.itens.filter((i) => i.ganha).length);
    expect(g.categorias.reduce((s, c) => s + c.total, 0)).toBe(g.total);
    expect(new Set(g.itens.map((i) => i.id)).size).toBe(g.itens.length);
    for (const i of g.itens) {
      expect(i.criterio.length).toBeGreaterThan(10);
      if (i.ganha) {
        expect(i.data! >= INICIO && i.data! <= e.hoje).toBe(true);
        expect(i.progresso).toBeNull();
        expect(i.falta).toBeNull();
      } else if (i.progresso) {
        expect(i.progresso.fracao).toBeGreaterThanOrEqual(0);
        expect(i.progresso.fracao).toBeLessThanOrEqual(1);
      }
    }
    expect(g.recentes.length).toBeLessThanOrEqual(3);
    for (let k = 1; k < g.recentes.length; k++) expect(g.recentes[k - 1].data! >= g.recentes[k].data!).toBe(true);
  });

  it('concluído: fases e ciclo completo; Treino só com a aba', () => {
    const g = montarGaleria(deCenario({ doses: 30 }));
    expect(g.itens.filter((i) => i.id.startsWith('fase:')).every((i) => i.ganha)).toBe(true);
    expect(item(g, 'ciclo-completo').data).toBe(dia(7 * 29));
    expect(g.itens.some((i) => i.categoria === 'treino')).toBe(true);
    const amiga = montarGaleria(deCenario({ doses: 30, treino: false, sexo: 'Feminino' }));
    expect(amiga.itens.some((i) => i.categoria === 'treino')).toBe(false);
    expect(item(amiga, 'meta:quadril_cm')).toBeDefined();
    expect(g.itens.some((i) => i.id === 'meta:quadril_cm')).toBe(false);
  });

  it('prévia: fase 3 concluída, ciclo completo bloqueado com progresso', () => {
    const g = montarGaleria(deCenario({ doses: 12, hoje: dia(80) }));
    expect(item(g, 'fase:2').data).toBe(dia(77));
    expect(item(g, 'fase:3').ganha).toBe(false);
    expect(item(g, 'ciclo-completo').progresso).toEqual({ atual: 12, alvo: 30, fracao: 0.4 });
    expect(item(g, 'ciclo-completo').falta).toBe('faltam 18 aplicações do plano');
  });
});
