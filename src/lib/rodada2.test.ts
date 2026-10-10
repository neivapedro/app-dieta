import { describe, expect, it } from 'vitest';
import { aplicarFila, enfileirar } from '../dados/fila';
import { analisarGeral, composicaoPorFase, type AnaliseFase, type PontoPeso } from './analise';
import { diaVazio, resumoSintomas, textosSintomas } from './bemestar';
import { calcularCiclo, cicloPadrao, faseSugeridaForaDoPlano, intervaloNaData } from './ciclo';
import { paraAMeta, projecaoNoRitmo } from './conferencia';
import { montarQuadro, ritmoDoBloco, semanasDoCiclo, type ColunaQuadro } from './consulta';
import { somarDias } from './datas';
import { conflitoDataSessao, type FotoInfo } from './fotos';
import { corVariacao } from './formato';
import { calibrarPorExame, faixaRca, type Composicao } from './gordura';
import { avisoReganho } from './projeto';
import { alteracoesDasDecisoesFase, compararDieta } from './registroDecisoes';
import { textoPdf } from './relatorioPdf';
import type { Aplicacao, Ciclo, DecisaoFase, Medida, TreinoDia } from './tipos';
import { aderenciaRecente } from './treino';

const base: Ciclo = { id: 'c1', ...cicloPadrao('2026-09-10') };
const ap = (data: string, dose: number): Aplicacao => ({ id: data, ciclo_id: 'c1', data, dose_mg: dose, local: null, observacoes: null });
const semanas = (inicio: string, n: number, dose: number) => Array.from({ length: n }, (_, i) => ap(somarDias(inicio, i * 7), dose));
const comp = (data: string, peso: number, cintura: number, extra: Partial<Composicao> = {}): Composicao => ({
  data,
  peso_kg: peso,
  bf: 25,
  massa_gorda_kg: peso * 0.25,
  massa_magra_kg: peso * 0.75,
  cintura_cm: cintura,
  pescoco_cm: 41,
  quadril_cm: null,
  ...extra,
});
const medida = (data: string, cintura: number, peso: number, extra: Partial<Medida> = {}): Medida => ({
  id: data,
  data,
  altura_cm: 181,
  pescoco_cm: 42,
  cintura_cm: cintura,
  quadril_cm: null,
  peso_kg: peso,
  ...extra,
});

describe('Ciclo: troca do intervalo entre doses', () => {
  const aps = [...semanas('2026-09-10', 4, 1.25), ...semanas('2026-10-08', 4, 1.5)];
  const troca: DecisaoFase = {
    id: 'i',
    data: '2026-11-02',
    apos_aplicacao: 8,
    dose_mg: 1.5,
    fase_indice: null,
    escolha: 'intervalo',
    intervalo_anterior: 7,
    intervalo_dias: 14,
  };

  it('as doses antigas seguem o intervalo da época: sem alerta de duplicado nem atraso de −7 d', () => {
    const r = calcularCiclo({ ...base, intervalo_dias: 14, decisoes: [troca] }, aps, [], '2026-11-02');
    expect(r.alertas.filter((a) => a.includes('duplicado'))).toEqual([]);
    expect(r.linhas.slice(1).every((l) => l.atraso_dias === 0)).toBe(true);
    // A próxima já usa o intervalo novo
    expect(r.proxima?.data).toBe('2026-11-12');
    expect(intervaloNaData({ intervalo_dias: 14, decisoes: [troca] }, '2026-10-29')).toBe(7);
    expect(intervaloNaData({ intervalo_dias: 14, decisoes: [troca] }, '2026-11-02')).toBe(14);
  });

  it('sem a troca registrada (mudada antes da correção), 7 dias com intervalo 14 também não é duplicado', () => {
    const r = calcularCiclo({ ...base, intervalo_dias: 14 }, aps, [], '2026-11-02');
    expect(r.alertas.filter((a) => a.includes('duplicado'))).toEqual([]);
    // Mesmo dia continua suspeito
    const dup = calcularCiclo(base, [...aps, { ...ap('2026-10-29', 1.5), id: 'x' }], [], '2026-11-02');
    expect(dup.alertas.some((a) => a.includes('0 dia(s)'))).toBe(true);
  });

  it('peso médio entre aplicações junta o Diário e as medições (sem as atípicas)', () => {
    const meds = [medida('2026-09-14', 100, 96), medida('2026-09-21', 100, 95), medida('2026-09-28', 100, 99, { atipica: true })];
    const r = calcularCiclo(base, aps, [], '2026-11-02', meds);
    expect(r.linhas[0].peso_medio).toBe(96);
    expect(r.linhas[1].peso_medio).toBe(95);
    expect(r.linhas[2].peso_medio).toBeNull();
  });
});

describe('Dose fora do plano: fase sugerida', () => {
  it('dose reduzida sugere a fase de dose mais próxima, nunca uma acima', () => {
    // 1,25 → 1,5 → 1,4 (redução): última fase conhecida é a 2 (índice 1)
    expect(faseSugeridaForaDoPlano(base.fases, 1, 1.4)).toBe(1);
    expect(faseSugeridaForaDoPlano(base.fases, 1, 1.3)).toBe(0);
    // Empate: a de dose menor
    expect(faseSugeridaForaDoPlano([{ dose_mg: 1 }, { dose_mg: 2 }, { dose_mg: 3 }], 2, 1.5)).toBe(0);
  });

  it('dose acima da última fase conhecida continua sugerindo a seguinte', () => {
    expect(faseSugeridaForaDoPlano(base.fases, 1, 1.6)).toBe(2);
  });
});

describe('Registro de decisões', () => {
  it('Repetir: o "de" são as semanas planejadas antes, não as doses já feitas', () => {
    const fasesAntes = base.fases;
    const fasesDepois = fasesAntes.map((f, i) => (i === 1 ? { ...f, semanas: 7 } : f));
    const rep: DecisaoFase = { id: 'r', data: '2026-11-18', apos_aplicacao: 10, dose_mg: 1.5, fase_indice: 1, escolha: 'repetir', semanas: 1 };
    const { novas } = alteracoesDasDecisoesFase([], [rep], fasesDepois, fasesAntes);
    expect(novas[0]).toMatchObject({ campo: 'Repetir fase 2', de: '4 sem.', para: '7 sem.' });
  });

  it('g/kg na 2ª casa decimal entra no registro', () => {
    const c = { fator_atividade: 1.2, atividades: [], ajuste_kcal: -300, ptn_gkg: 2.2, gord_gkg: 0.8 };
    expect(compararDieta(c, { ...c, ptn_gkg: 2.24 })).toEqual([{ tipo: 'dieta', campo: 'Proteína animal', de: '2,2 g/kg', para: '2,24 g/kg' }]);
    expect(compararDieta(c, { ...c, gord_gkg: 0.84 })[0]).toMatchObject({ de: '0,8 g/kg', para: '0,84 g/kg' });
  });
});

describe('Diário', () => {
  it('dia sem nenhum campo é vazio; respostas "não" contam', () => {
    expect(diaVazio({ peso_kg: null, nausea: null, observacoes: null })).toBe(true);
    expect(diaVazio({ peso_kg: null, nausea: null, observacoes: null, vomito: false })).toBe(false);
  });

  it('sintomas com "não" aparecem no texto', () => {
    expect(textosSintomas({ vomito: false, diarreia: false, intestino_preso: null })).toEqual(['sem vômito', 'sem diarreia']);
    expect(resumoSintomas({ vomito: false, diarreia: false })).toBe('nenhum');
    expect(resumoSintomas({ vomito: true, diarreia: false })).toBe('vômito');
    expect(resumoSintomas({ vomito: null })).toBe('–');
  });
});

describe('Medidas', () => {
  it('cor no limite da mudança mínima não depende de erro de ponto flutuante', () => {
    expect(corVariacao(79.4 - 81.6, true, 2.2)).toBe(corVariacao(97.8 - 100, true, 2.2));
    expect(corVariacao(87.8 - 88.9, true, 1.1)).toBe(corVariacao(88.9 - 90, true, 1.1));
    expect(corVariacao(-2.1, true, 2.2)).toBe('');
  });

  it('faixa da cintura/altura sobre o valor exibido (2 casas)', () => {
    expect(faixaRca(90.4 / 181)).toBe('aumentada');
    expect(faixaRca(0.4949)).toBe('saudavel');
    expect(faixaRca(0.5961)).toBe('alta');
  });

  it('calibração por exame: ignora a medição atípica, recusa data futura', () => {
    const perfil = { sexo: 'Masculino' as const, altura_cm: 181 };
    const meds = [medida('2026-10-26', 98, 92), medida('2026-11-02', 104, 93, { atipica: true })];
    const ok = calibrarPorExame(meds, perfil, '2026-10-26', 20, '2026-11-02');
    expect(ok.ok && ok.medida.data).toBe('2026-10-26');
    // Exame de 01/11: a de 02/11 é atípica, então vale a de 26/10? Fica a 6 dias: não serve, avisa da atípica
    const atip = calibrarPorExame(meds, perfil, '2026-11-01', 25, '2026-11-02');
    expect(atip.ok).toBe(false);
    expect(!atip.ok && atip.erro).toMatch(/atípica/);
    const futuro = calibrarPorExame(meds, perfil, '2026-11-05', 21, '2026-11-02');
    expect(!futuro.ok && futuro.erro).toMatch(/até hoje/);
  });

  it('peso do resumo não usa a pesagem atípica (menos de 2 medições normais)', () => {
    const serie: PontoPeso[] = [
      { data: '2026-10-19', peso_kg: 95, origem: 'medida' },
      { data: '2026-11-02', peso_kg: 97.4, origem: 'medida', atipica: true },
    ];
    const g = analisarGeral('2026-10-19', serie, [comp('2026-10-19', 95, 100), comp('2026-11-02', 97.4, 102, { atipica: true })], '2026-11-02');
    expect(g.variacao_kg).toBeNull();
  });
});

describe('Dieta: "Para a meta"', () => {
  it('meta de gordura alcançada e prazo curto demais', () => {
    expect(paraAMeta(19.7, 22.5, '2026-11-02', '2027-01-01')).toEqual({ estado: 'alcancada' });
    expect(paraAMeta(20, 15, '2026-11-01', '2026-11-02')).toMatchObject({ estado: 'inviavel', dias: 1 });
    expect(paraAMeta(20, 19, '2026-11-02', '2026-12-02')).toMatchObject({ estado: 'ok' });
  });

  it('"Pelo que fiz" fica congelado depois do fim do projeto (não muda sozinho no dia seguinte)', () => {
    const dias: TreinoDia[] = [];
    for (let i = 0; i < 70; i++) {
      const d = somarDias('2026-08-24', i);
      if (i % 3) dias.push({ id: d, data: d, treino: true, cardio: i % 2 === 0, corrida_km: null, corrida_seg: null });
    }
    const noFim = aderenciaRecente(dias, '2026-08-24', '2026-11-02', 28, '2026-11-02');
    const depois = aderenciaRecente(dias, '2026-08-24', '2026-11-03', 28, '2026-11-02');
    expect(depois).not.toBeNull();
    expect(depois!.dias).toBe(28);
    expect(noFim).not.toBeNull();
  });
});

describe('Treino e PDF', () => {
  it('semana a semana: hoje sem marcar e dias depois do fim do projeto ficam fora', () => {
    const t = (data: string): TreinoDia => ({ id: data, data, treino: true, cardio: true, corrida_km: null, corrida_seg: null });
    const linhas = semanasDoCiclo({
      inicio: '2026-09-03',
      hoje: '2026-11-04',
      aplicacoes: [ap('2026-09-03', 1.25)],
      serie: [],
      composicoes: [],
      diario: [],
      treinos: [t('2026-11-02'), t('2026-11-03')],
    });
    expect(linhas.at(-1)).toMatchObject({ treino: 2, cardio: 2, dias: 2 });
    const fim = semanasDoCiclo({
      inicio: '2026-06-04',
      hoje: '2026-09-02',
      aplicacoes: [ap('2026-06-04', 1.25)],
      serie: [],
      composicoes: [],
      diario: [],
      treinos: [t('2026-07-27'), t('2026-07-28')],
      periodosTreino: [{ inicio: '2026-06-04', fim: '2026-07-30' }],
    });
    expect(fim.find((l) => l.segunda === '2026-07-27')).toMatchObject({ dias: 4, treino: 2 });
    expect(fim.find((l) => l.segunda === '2026-08-03')).toMatchObject({ treino: null, dias: 0 });
  });

  it('composição por fase com o remédio concluído conta o último dia do projeto', () => {
    const fase = { indice: 0, inicio: '2026-06-04' } as AnaliseFase;
    const dias: TreinoDia[] = [{ id: 'a', data: '2026-07-30', treino: true, cardio: true, corrida_km: null, corrida_seg: null }];
    const [c] = composicaoPorFase([fase], [], dias, '2026-07-30', '2026-09-02');
    expect(c.cardio).toBeCloseTo(1 / 57);
    // Com hoje de verdade, o dia de hoje fica fora
    const [h] = composicaoPorFase([fase], [], dias, '2026-07-30');
    expect(h.cardio).toBeCloseTo(0);
  });

  it('projeção no ritmo inclui o quadril quando as medições têm quadril', () => {
    const lista = Array.from({ length: 10 }, (_, i) => comp(somarDias('2026-08-31', i * 7), 80 - i * 0.4, 90 - i * 0.5, { quadril_cm: 108 - i * 0.4 }));
    const p = projecaoNoRitmo(lista, '2026-11-02', '2027-01-01', 10)!;
    expect(p.valores.quadril_cm).toBeDefined();
    expect(p.valores.quadril_cm!.valor).toBeLessThan(104.4);
    const semQuadril = projecaoNoRitmo(lista.map((c) => ({ ...c, quadril_cm: null })), '2026-11-02', '2027-01-01', 10)!;
    expect(semQuadril.valores.quadril_cm).toBeUndefined();
  });

  it('PDF: bloco com poucos dados na tela não ganha kg/sem no PDF', () => {
    const serie: PontoPeso[] = Array.from({ length: 10 }, (_, i) => ({ data: somarDias('2026-09-28', i), peso_kg: 90 - i * 0.03, origem: 'diario' as const }));
    expect(ritmoDoBloco(serie, { inicio: '2026-09-28', fim: '2026-10-08', kg_por_semana: null, pontos_peso: [], variacao_kg: -0.3 }, true)).toBe(
      '− 0,30 kg no bloco (poucas pesagens)',
    );
    // Sem os pontos da tela: exige 14 dias, como a tela
    expect(ritmoDoBloco(serie, { inicio: '2026-09-28', fim: '2026-10-08', kg_por_semana: null }, true)).toBe('poucas pesagens');
  });

  it('quadro: "Medições usadas" diz poucas medições quando não há regressão', () => {
    const col: ColunaQuadro = {
      rotulo: '1,75 mg · fase 3',
      inicio: '2026-09-28',
      fim: '2026-10-08',
      em_andamento: true,
      gorda_semana: null,
      cintura_semana: null,
      magra_semana: null,
      medicoes: { de: '2026-09-28', ate: '2026-10-05' },
      nausea_pico: null,
      vomitos: [],
      dias_registrados: 0,
      dias: 11,
      treino: null,
      cardio: null,
      dieta: { sim: 0, parcial: 0, nao: 0 },
    };
    const q = montarQuadro({ atual: col, anterior: null }, false, 'x');
    const linha = q.secoes.flatMap((s) => s.linhas).find((l) => l[0] === 'Medições usadas')!;
    expect(linha[2]).toMatch(/^poucas medições/);
  });

  it('texto do PDF sem símbolos fora da fonte', () => {
    expect(textoPdf('Reduzi por conta própria ≥ enjoo ❤️ 🤢')).toBe('Reduzi por conta própria >= enjoo');
    expect(textoPdf('Enjoo 3x ≥ 2h, μ')).toBe('Enjoo 3x >= 2h, u');
    expect(textoPdf('Ação · ±2 × 3 – ok')).toBe('Ação · ±2 × 3 – ok');
  });

  it('aviso de reganho sem ambiguidade', () => {
    const lista = [comp('2027-02-15', 88, 88), comp('2027-02-22', 88.5, 88.5), comp('2027-03-01', 89, 89), comp('2027-03-08', 89.5, 89.5)];
    expect(avisoReganho(lista, '2027-02-20')!.texto).toContain('a cintura subiu em 3 medições seguidas e o peso subiu em 3 medições seguidas');
  });
});

describe('Fotos', () => {
  it('Depois não pode ficar antes do Antes (nem o contrário)', () => {
    const fotos = [
      { sessao: 'antes', pose: 'frente', data: '2026-09-07' },
      { sessao: 'depois', pose: 'lado', data: '2026-11-02' },
    ] as FotoInfo[];
    expect(conflitoDataSessao(fotos, 'depois', '2026-09-01')).toMatch(/anterior à do Antes/);
    expect(conflitoDataSessao(fotos, 'antes', '2026-11-05')).toMatch(/posterior à do Depois/);
    expect(conflitoDataSessao(fotos, 'depois', '2026-10-01')).toBeNull();
  });
});

describe('Fila: decisões não levam fases velhas', () => {
  it('decisão sem fases mantém as fases do ciclo; não apaga as de um Repetir pendente', () => {
    const fases = base.fases.map((f, i) => (i === 2 ? { ...f, semanas: 8 } : f));
    const dados = { treinos: [], diario: [], dieta: null, ciclo: { ...base, fases } };
    const d = aplicarFila(dados, [{ tipo: 'decisoes', dado: { ciclo_id: 'c1', decisoes: [] }, chave: 'decisoes:c1', versao: 1 }]);
    expect(d.ciclo!.fases[2].semanas).toBe(8);
    const repetir = enfileirar([], { tipo: 'decisoes', dado: { ciclo_id: 'c1', decisoes: [], fases } }, 1);
    const depois = enfileirar(repetir, { tipo: 'decisoes', dado: { ciclo_id: 'c1', decisoes: [] } }, 2);
    expect(depois).toHaveLength(1);
    expect(depois[0].tipo === 'decisoes' && depois[0].dado.fases).toEqual(fases);
  });
});
