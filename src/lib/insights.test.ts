import { describe, expect, it } from 'vitest';
import type { PontoPeso } from './analise';
import { dadosCorrelacao, type DadosCorrelacao, type SemanaCorrelacao } from './correlacoes';
import { somarDias } from './datas';
import type { Composicao } from './gordura';
import { gerarInsights, sequenciaAtual, todosInsights, type EntradaInsights, type Insight } from './insights';
import { entrada, INICIO, type OpcoesEntrada } from './relatorio-final-teste';
import type { RegistroDiario, TreinoDia } from './tipos';

const HOJE = '2026-11-02';

function comp(data: string, cintura: number, extra: Partial<Composicao> = {}): Composicao {
  return { data, peso_kg: 90, bf: 20, massa_magra_kg: 72, massa_gorda_kg: 18, cintura_cm: cintura, pescoco_cm: 40, quadril_cm: null, ...extra };
}

function reg(data: string, extra: Partial<RegistroDiario> = {}): RegistroDiario {
  return { id: data, data, peso_kg: null, nausea: null, observacoes: null, ...extra };
}

function base(extra: Partial<EntradaInsights> = {}): EntradaInsights {
  return { hoje: HOJE, composicoes: [], serie: [], diario: [], treinos: null, metaAgua: () => 2, ...extra };
}

const porId = (l: Insight[], id: string) => l.find((i) => i.id === id);
const PROIBIDO = /\bdose\b|déficit|kcal|aument|reduz|diminu|deveria|recomend/i;

/** As mesmas contas que os componentes fazem a partir de useCalculos() */
function deCenario(o: OpcoesEntrada): EntradaInsights {
  const x = entrada(o);
  const metaAgua = () => 2;
  const aplicacoes = x.resumo.linhas.map((l) => l.aplicacao);
  return {
    hoje: x.hoje,
    composicoes: x.composicoes,
    serie: x.serie,
    diario: x.diario,
    treinos: x.treinos,
    metaAgua,
    metas: x.perfil?.metas_projeto ?? null,
    sexo: x.perfil?.sexo,
    aplicacoes: x.resumo.linhas.map((l) => ({ data: l.aplicacao.data, atraso_dias: l.atraso_dias })),
    correlacoes: dadosCorrelacao({ inicio: INICIO, hoje: x.hoje, aplicacoes, serie: x.serie, composicoes: x.composicoes, diario: x.diario, treinos: x.treinos, metaAgua }),
  };
}

function invariantes(l: Insight[]) {
  for (const i of l) {
    expect(i.frase.length).toBeGreaterThan(10);
    expect(i.frase.length).toBeLessThanOrEqual(130);
    expect(i.origem.length).toBeGreaterThan(10);
    expect(['bom', 'neutro', 'atencao']).toContain(i.tom);
    expect(['corpo', 'habito', 'remedio', 'treino']).toContain(i.categoria);
    if (i.link) expect(i.link.startsWith('/')).toBe(true);
    expect(i.frase).not.toMatch(PROIBIDO);
  }
  expect(new Set(l.map((i) => i.id)).size).toBe(l.length);
}

describe('insights: conta vazia e poucos dados', () => {
  it('sem registros não há frase', () => {
    expect(todosInsights(base())).toEqual([]);
    expect(gerarInsights(base())).toEqual([]);
  });

  it('uma medição só e 3 noites de sono não bastam', () => {
    const l = todosInsights(base({ composicoes: [comp(HOJE, 100)], diario: [0, 1, 2].map((i) => reg(somarDias(HOJE, -i), { sono_h: 8 })) }));
    expect(l).toEqual([]);
  });
});

describe('insights: cintura', () => {
  const duas = (antes: number, agora: number, extra: Composicao[] = []) => base({ composicoes: [comp(somarDias(HOJE, -28), antes), comp(HOJE, agora), ...extra] });

  it('queda acima do erro da fita: "caiu"', () => {
    const i = porId(todosInsights(duas(101, 98.6)), 'cintura-janela')!;
    expect(i.frase).toBe('Sua cintura caiu 2,4 cm nas últimas 4 semanas');
    expect(i.tom).toBe('bom');
    expect(i.link).toBe('/analise?aba=corpo');
    expect(i.origem).toContain('2,2 cm');
  });

  it('no limite do MDC (2,2 cm) já conta; 2,1 cm é estável', () => {
    expect(porId(todosInsights(duas(100, 97.8)), 'cintura-janela')!.frase).toBe('Sua cintura caiu 2,2 cm nas últimas 4 semanas');
    const e = porId(todosInsights(duas(100, 97.9)), 'cintura-janela')!;
    expect(e.frase).toBe('Cintura estável nas últimas 4 semanas');
    expect(e.tom).toBe('neutro');
    expect(e.origem).toContain('− 2,1 cm');
  });

  it('subida acima do erro: "subiu", em atenção', () => {
    const i = porId(todosInsights(duas(98, 100.5)), 'cintura-janela')!;
    expect(i.frase).toBe('Sua cintura subiu 2,5 cm nas últimas 4 semanas');
    expect(i.tom).toBe('atencao');
  });

  it('medição atípica fica de fora (vale a última normal)', () => {
    const atipica = comp(somarDias(HOJE, 1), 90, { atipica: true });
    const l = todosInsights(base({ hoje: somarDias(HOJE, 1), composicoes: [comp(somarDias(HOJE, -28), 100), comp(HOJE, 99), atipica] }));
    expect(porId(l, 'cintura-janela')!.frase).toBe('Cintura estável nas últimas 4 semanas');
  });

  it('última medição com mais de 3 semanas não vira frase do "agora"', () => {
    const l = todosInsights(base({ hoje: somarDias(HOJE, 22), composicoes: [comp(somarDias(HOJE, -28), 101), comp(HOJE, 97)] }));
    expect(porId(l, 'cintura-janela')).toBeUndefined();
  });

  it('desde a primeira medição, com história longa', () => {
    const c = [comp(somarDias(HOJE, -70), 104), comp(somarDias(HOJE, -28), 100), comp(HOJE, 99)];
    const l = todosInsights(base({ composicoes: c }));
    expect(porId(l, 'cintura-inicio')!.frase).toBe('Sua cintura caiu 5,0 cm desde a primeira medição');
    expect(porId(l, 'cintura-janela')!.tom).toBe('neutro');
  });
});

describe('insights: peso, massa magra, massa gorda e metas', () => {
  it('peso médio das pesagens da última semana contra 4 semanas antes', () => {
    const serie: PontoPeso[] = [
      { data: somarDias(HOJE, -30), peso_kg: 92, origem: 'diario' },
      { data: somarDias(HOJE, -29), peso_kg: 92.4, origem: 'diario' },
      { data: somarDias(HOJE, -2), peso_kg: 90, origem: 'diario' },
      { data: somarDias(HOJE, -1), peso_kg: 90.2, origem: 'diario' },
      // Atípica: fora
      { data: HOJE, peso_kg: 80, origem: 'medida', atipica: true },
    ];
    const i = porId(todosInsights(base({ serie })), 'peso-4sem')!;
    expect(i.frase).toBe('Seu peso médio caiu 2,1 kg em 4 semanas');
    expect(i.origem).toContain('2 pesagens');
    const estavel = porId(todosInsights(base({ serie: serie.map((p) => (p.data >= somarDias(HOJE, -2) ? { ...p, peso_kg: p.peso_kg + 1.5 } : p)) })), 'peso-4sem')!;
    expect(estavel.frase).toBe('Peso estável nas últimas 4 semanas');
  });

  it('massa magra: estável, caiu acima do erro, subiu', () => {
    const quatro = (magras: number[]) => base({ composicoes: magras.map((m, k) => comp(somarDias(HOJE, -7 * (3 - k)), 100, { massa_magra_kg: m })) });
    expect(porId(todosInsights(quatro([72, 71.5, 72.4, 71.2])), 'magra-4med')!.frase).toBe('Massa magra estável nas últimas 4 medições');
    const caiu = porId(todosInsights(quatro([72, 71, 70.5, 69.5])), 'magra-4med')!;
    expect(caiu.frase).toBe('Massa magra caiu 2,5 kg nas últimas 4 medições');
    expect(caiu.tom).toBe('atencao');
    expect(porId(todosInsights(quatro([70, 71, 72, 72.5])), 'magra-4med')!.frase).toBe('Massa magra subiu 2,5 kg nas últimas 4 medições');
    // Três medições não bastam
    expect(porId(todosInsights(base({ composicoes: [comp(somarDias(HOJE, -14), 100), comp(somarDias(HOJE, -7), 100), comp(HOJE, 100)] })), 'magra-4med')).toBeUndefined();
  });

  it('massa gorda desde a primeira medição (pelo menos 4 semanas)', () => {
    const l = todosInsights(base({ composicoes: [comp(somarDias(HOJE, -35), 100, { massa_gorda_kg: 22 }), comp(HOJE, 99, { massa_gorda_kg: 19.4 })] }));
    expect(porId(l, 'gorda-inicio')!.frase).toBe('Sua massa gorda caiu 2,6 kg desde a primeira medição');
  });

  it('meta: atingida (a primeira na ordem) ou a mais adiantada', () => {
    const c = [comp(somarDias(HOJE, -28), 100, { peso_kg: 95, bf: 25 }), comp(HOJE, 94, { peso_kg: 90, bf: 22 })];
    const metas = { pescoco_cm: null, cintura_cm: 90, quadril_cm: null, peso_kg: 85, bf: 15 };
    const prog = porId(todosInsights(base({ composicoes: c, metas })), 'meta-cintura_cm')!;
    expect(prog.frase).toBe('Você já percorreu 60% do caminho até a meta de cintura');
    expect(prog.origem).toContain('Faltam 4,0 cm');
    const ating = porId(todosInsights(base({ composicoes: c, metas: { ...metas, peso_kg: 91 } })), 'meta-peso_kg')!;
    expect(ating.frase).toBe('Meta de peso atingida: 90,0 kg');
    expect(ating.tom).toBe('bom');
    // Sem metas: nada
    expect(todosInsights(base({ composicoes: c })).some((i) => i.id.startsWith('meta-'))).toBe(false);
  });
});

describe('insights: hábitos', () => {
  const semana = (f: (k: number) => Partial<RegistroDiario>) => Array.from({ length: 7 }, (_, k) => reg(somarDias(HOJE, -k), f(k)));

  it('sono: 7 h+ em X das últimas 7 noites (tom pela fração)', () => {
    const i = porId(todosInsights(base({ diario: semana((k) => ({ sono_h: k < 5 ? 7.5 : 6 })) })), 'sono-semana')!;
    expect(i.frase).toBe('Você dormiu 7 h+ em 5 das últimas 7 noites');
    expect(i.tom).toBe('bom');
    const pouco = porId(todosInsights(base({ diario: semana((k) => ({ sono_h: k < 2 ? 7 : 6.2 })) })), 'sono-semana')!;
    expect(pouco.tom).toBe('atencao');
    const cinco = porId(todosInsights(base({ diario: semana((k) => (k < 5 ? { sono_h: 8 } : {})) })), 'sono-semana')!;
    expect(cinco.frase).toBe('Você dormiu 7 h+ em 5 das 5 noites anotadas na última semana');
  });

  it('água: dias seguidos na meta; hoje sem registro não quebra a sequência', () => {
    const diario = [reg(somarDias(HOJE, -4), { agua_l: 1 }), ...[1, 2, 3].map((k) => reg(somarDias(HOJE, -k), { agua_l: 2.5 }))];
    const i = porId(todosInsights(base({ diario })), 'agua-sequencia')!;
    expect(i.frase).toBe('3 dias seguidos batendo a meta de água');
    expect(i.origem).toContain('30/10 a 01/11');
    // 1,96 L com meta de 2,0 L conta (tolerância de 0,05 L, como na Análise)
    expect(porId(todosInsights(base({ diario: [1, 2, 3].map((k) => reg(somarDias(HOJE, -k), { agua_l: 1.96 })) })), 'agua-sequencia')).toBeDefined();
  });

  it('água: sem sequência e abaixo da meta na maioria dos dias anotados → atenção', () => {
    const diario = [1, 2, 3, 4, 5].map((k) => reg(somarDias(HOJE, -k), { agua_l: k === 3 ? 2.2 : 1.2 }));
    const i = porId(todosInsights(base({ diario })), 'agua-semana')!;
    expect(i.frase).toBe('Água na meta em 1 de 5 dias anotados na última semana');
    expect(i.tom).toBe('atencao');
  });

  it('plano alimentar e Diário em dia', () => {
    const diario = Array.from({ length: 9 }, (_, k) => reg(somarDias(HOJE, -k), { dieta_seguida: k < 4 ? 'sim' : 'parcial' }));
    const l = todosInsights(base({ diario }));
    expect(porId(l, 'dieta-sequencia')!.frase).toBe('4 dias seguidos seguindo o plano alimentar');
    expect(porId(l, 'diario-sequencia')!.frase).toBe('9 dias seguidos com registro no Diário');
  });

  it('sequenciaAtual: conta até ontem quando hoje ainda não cumpriu', () => {
    const ok = new Set([somarDias(HOJE, -1), somarDias(HOJE, -2)]);
    expect(sequenciaAtual(HOJE, (d) => ok.has(d))).toEqual({ dias: 2, ate: somarDias(HOJE, -1) });
    expect(sequenciaAtual(HOJE, () => false)).toEqual({ dias: 0, ate: null });
  });
});

describe('insights: remédio', () => {
  it('náusea desta semana contra a anterior (4 dias anotados em cada)', () => {
    const diario = Array.from({ length: 14 }, (_, k) => reg(somarDias(HOJE, -k), { nausea: k < 7 ? (k % 3 === 0 ? 1 : 0) : 1 }));
    const i = porId(todosInsights(base({ diario })), 'nausea-semana')!;
    expect(i.frase).toBe('Náusea mais leve nesta semana: média 0,4 de 3 (antes, 1,0)');
    expect(i.link).toBe('/analise?aba=remedio');
    const poucos = diario.filter((_, k) => k >= 7 || k < 3);
    expect(porId(todosInsights(base({ diario: poucos })), 'nausea-semana')).toBeUndefined();
  });

  it('pico de náusea por dia depois da aplicação e aplicações no dia previsto', () => {
    const aplic = [0, 7, 14, 21].map((k) => ({ data: somarDias(HOJE, -28 + k), atraso_dias: 0 }));
    const diario = Array.from({ length: 28 }, (_, k) => reg(somarDias(HOJE, -28 + k), { nausea: k % 7 === 1 ? 2 : 0 }));
    const l = todosInsights(base({ diario, aplicacoes: aplic }));
    expect(porId(l, 'nausea-pico')!.frase).toBe('Sua náusea costuma ser maior no D1 depois da aplicação (média 2,0 de 3)');
    expect(porId(l, 'doses-no-dia')!.frase).toBe('Todas as 4 aplicações no dia previsto');
    // Com atrasos frequentes: o resumo não cobra
    expect(porId(todosInsights(base({ aplicacoes: aplic.map((a, k) => ({ ...a, atraso_dias: k % 2 })) })), 'doses-no-dia')).toBeUndefined();
  });
});

describe('insights: treino', () => {
  const corrida = (dias: number, km: number, seg: number): TreinoDia => ({ id: `t${dias}`, data: somarDias(HOJE, -dias), treino: false, cardio: true, corrida_km: km, corrida_seg: seg, cardio_tipo: 'corrida' });

  it('sem a aba Treino: nenhuma frase de treino', () => {
    const l = todosInsights(deCenario({ treino: false, sexo: 'Feminino' }));
    expect(l.some((i) => i.categoria === 'treino')).toBe(false);
  });

  it('recorde de pace na corrida mais recente', () => {
    const treinos = [corrida(20, 5, 1650), corrida(10, 5, 1600), corrida(2, 5, 1500)];
    const i = porId(todosInsights(base({ treinos })), 'corrida-recorde')!;
    expect(i.frase).toBe('Sua corrida de 31/10 foi a mais rápida até agora: 5:00/km');
    expect(i.link).toBe('/treino');
    expect(i.relevancia).toBeGreaterThanOrEqual(90);
  });

  it('corrida mais longa (sem recorde de pace)', () => {
    const treinos = [corrida(20, 5, 1500), corrida(10, 5, 1500), corrida(1, 8, 2600)];
    expect(porId(todosInsights(base({ treinos })), 'corrida-recorde')!.frase).toBe('Sua corrida de 01/11 foi a mais longa até agora: 8 km');
  });

  it('pace médio dos últimos 30 dias contra os 30 anteriores', () => {
    const treinos = [corrida(50, 5, 1800), corrida(40, 5, 1800), corrida(20, 5, 1740), corrida(8, 5, 1740)];
    const i = porId(todosInsights(base({ treinos })), 'pace-mes')!;
    expect(i.frase).toBe('Seu pace médio melhorou 12 s/km nos últimos 30 dias');
    // Diferença pequena (< 5 s/km): sem frase
    expect(porId(todosInsights(base({ treinos: treinos.map((t) => ({ ...t, corrida_seg: t.corrida_seg! - (t.data > somarDias(HOJE, -30) ? -55 : 0) })) })), 'pace-mes')).toBeUndefined();
  });

  it('sequência de treino + cardio; sem ela, treinos da semana', () => {
    const dia = (k: number, treino: boolean, cardio: boolean): TreinoDia => ({ id: `d${k}`, data: somarDias(HOJE, -k), treino, cardio, corrida_km: null, corrida_seg: null });
    const seq = [dia(0, true, true), dia(1, true, true), dia(2, true, true), dia(3, true, true)];
    expect(porId(todosInsights(base({ treinos: seq })), 'treino-sequencia')!.frase).toBe('4 dias seguidos com treino e cardio');
    const semana = [0, 1, 3, 5].map((k) => dia(k, true, false));
    expect(porId(todosInsights(base({ treinos: semana })), 'treino-semana')!.frase).toBe('Você treinou em 4 dos últimos 7 dias');
  });
});

describe('insights: associações', () => {
  function semanaCorr(k: number, extra: Partial<SemanaCorrelacao>): SemanaCorrelacao {
    return {
      segunda: somarDias('2026-06-01', 7 * k),
      rotulo: '',
      dose_mg: null,
      peso_kg: null,
      composicao: null,
      nausea_max: null,
      dias_sintoma: 0,
      dieta: { sim: 0, parcial: 0, nao: 0 },
      treino: null,
      cardio: null,
      dias: 7,
      atipica: false,
      sono_h: null,
      agua_l: null,
      agua_meta_l: null,
      agua_frac: null,
      dieta_frac: null,
      treino_frac: null,
      cardio_frac: null,
      adesao: null,
      nausea_media: null,
      sintomas: null,
      peso_sem: null,
      cintura_sem: null,
      gorda_sem: null,
      magra_sem: null,
      ...extra,
    } as SemanaCorrelacao;
  }

  it('sono × cintura com semanas suficientes: frase de associação, nunca causa', () => {
    const semanas = Array.from({ length: 10 }, (_, k) =>
      semanaCorr(k, k % 2 ? { sono_h: 7.6, cintura_sem: -1 - (k % 3) * 0.1 } : { sono_h: 6.3, cintura_sem: -0.1 - (k % 3) * 0.05 }),
    );
    const d: DadosCorrelacao = { semanas, dias: [], comTreino: false };
    const i = todosInsights(base({ correlacoes: d })).find((x) => x.id.startsWith('associacao-'))!;
    expect(i.id).toBe('associacao-sono_cintura');
    expect(i.frase).toMatch(/^Semanas com sono de 7 h\+: cintura − 1,1 cm\/sem, contra − 0,2 cm nas outras \(associação, não causa\)$/);
    expect(i.origem).toContain('Associação, não prova de causa.');
    expect(i.link).toBe('/analise?aba=habitos');
  });

  it('poucas semanas (abaixo do mínimo): sem frase', () => {
    const semanas = Array.from({ length: 4 }, (_, k) => semanaCorr(k, k % 2 ? { sono_h: 8, cintura_sem: -1 } : { sono_h: 6, cintura_sem: 0 }));
    expect(todosInsights(base({ correlacoes: { semanas, dias: [], comTreino: false } })).some((x) => x.id.startsWith('associacao-'))).toBe(false);
  });

  it('associação com a dose fica fora do resumo', () => {
    const semanas = Array.from({ length: 12 }, (_, k) => semanaCorr(k, { dose_mg: 1 + k * 0.25, peso_sem: -0.2 - k * 0.1 }));
    expect(todosInsights(base({ correlacoes: { semanas, dias: [], comTreino: false } })).some((x) => x.id.startsWith('associacao-'))).toBe(false);
  });
});

describe('insights: seleção e cenários', () => {
  it('no máximo 5, ordem determinística, até 2 por categoria quando há variedade', () => {
    const e = deCenario({ doses: 30 });
    const a = gerarInsights(e);
    expect(a.length).toBeLessThanOrEqual(5);
    expect(gerarInsights(e)).toEqual(a);
    for (let k = 1; k < a.length; k++) expect(a[k - 1].relevancia).toBeGreaterThanOrEqual(a[k].relevancia);
    const todas = todosInsights(e);
    const categorias = new Set(todas.map((i) => i.categoria));
    if (categorias.size >= 3) for (const c of categorias) expect(a.filter((i) => i.categoria === c).length).toBeLessThanOrEqual(2);
  });

  it.each([
    ['concluído', { doses: 30 }],
    ['prévia', { doses: 12, hoje: somarDias(INICIO, 80) }],
    ['amiga sem Treino (feminino)', { doses: 30, treino: false, sexo: 'Feminino' as const }],
    ['medição atípica no fim', { doses: 12, hoje: somarDias(INICIO, 80), medicoes: 12, atipicaNoFim: true }],
    ['sem medidas', { doses: 6, hoje: somarDias(INICIO, 40), semMedidas: true }],
  ])('%s: frases válidas, sem orientação de dose ou dieta', (_, o) => {
    const e = deCenario(o);
    const todas = todosInsights(e);
    invariantes(todas);
    invariantes(gerarInsights(e));
  });

  it('prévia com atípica no fim: a atípica (cintura 70 cm) não vira queda', () => {
    const e = deCenario({ doses: 12, hoje: somarDias(INICIO, 80), medicoes: 12, atipicaNoFim: true });
    const c = todosInsights(e).filter((i) => i.id.startsWith('cintura'));
    for (const i of c) expect(i.frase).not.toMatch(/2[0-9],\d cm/);
    expect(c.every((i) => !i.origem.includes('70,0 cm'))).toBe(true);
  });

  it('sem medidas: nenhuma frase de corpo', () => {
    const e = deCenario({ doses: 6, hoje: somarDias(INICIO, 40), semMedidas: true });
    expect(todosInsights(e).filter((i) => i.categoria === 'corpo' && i.id !== 'peso-4sem')).toEqual([]);
  });
});
