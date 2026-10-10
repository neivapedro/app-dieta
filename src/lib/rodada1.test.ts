import { describe, expect, it } from 'vitest';
import { analisarFases, type PontoPeso } from './analise';
import { blocosDeDose, calcularCiclo, cicloPadrao, localizarDegraus, repetirFase, semanasFeitasNaFase, situacaoDoDegrau } from './ciclo';
import { projecaoNoRitmo } from './conferencia';
import { montarQuadro, ritmoDoBloco, semanasDoCiclo, tabelaSemanal, type ColunaQuadro } from './consulta';
import { somarDias } from './datas';
import { ehErroDeRede } from './erros';
import { paraKcal } from './formato';
import { motivoSemGordura, type Composicao } from './gordura';
import { linhasBalanco } from './projeto';
import { faltasNoPeriodo } from './semana';
import type { Aplicacao, Ciclo, DecisaoFase } from './tipos';
import { semanasDoProjeto } from './treino';

const base: Ciclo = { id: 'c1', ...cicloPadrao('2026-09-24') };
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

describe('Fim da fase: Repetir', () => {
  it('estende a partir das doses já feitas: +1 semana dá mais 1 dose mesmo com doses além do planejado', () => {
    const aps = semanas('2026-09-24', 6, 1.25);
    const d = localizarDegraus(base.fases, blocosDeDose(aps)).at(-1)!;
    expect(semanasFeitasNaFase(base.fases, d, 0)).toBe(6);
    const mais1 = repetirFase(base.fases, d, 0, 1);
    expect(mais1[0].semanas).toBe(7);
    const s = situacaoDoDegrau(mais1, aps);
    expect(s).toMatchObject({ estado: 'em_curso', feitas: 6, previstas: 7, dose_mg: 1.25 });
    // +4 semanas = mais 4 doses
    expect(repetirFase(base.fases, d, 0, 4)[0].semanas).toBe(10);
  });

  it('sem doses além do planejado, soma ao tamanho da fase', () => {
    const aps = semanas('2026-09-24', 4, 1.25);
    const d = localizarDegraus(base.fases, blocosDeDose(aps)).at(-1)!;
    expect(repetirFase(base.fases, d, 0, 1)[0].semanas).toBe(5);
  });
});

describe('Fim da fase: decisão de subir e dose esquecida', () => {
  const subir = (apos: number, data: string): DecisaoFase => ({ id: 's', data, apos_aplicacao: apos, dose_mg: 1.25, fase_indice: 1, escolha: 'subir', dose_nova_mg: 1.5 });

  it('uma dose esquecida, de data anterior à decisão, registrada depois não apaga a decisão', () => {
    const antes = [ap('2026-10-01', 1.25), ap('2026-10-08', 1.25), ap('2026-10-15', 1.25), ap('2026-10-29', 1.25)];
    const dec = [subir(4, '2026-11-04')];
    expect(situacaoDoDegrau(base.fases, antes, dec).estado).toBe('subir');
    const depois = [...antes.slice(0, 3), ap('2026-10-22', 1.25), antes[3]];
    const s = situacaoDoDegrau(base.fases, depois, dec);
    expect(s.estado).toBe('subir');
    expect(s.dose_mg).toBe(1.5);
    expect(calcularCiclo({ ...base, decisoes: dec }, depois, [], '2026-11-04').proxima?.dose_mg).toBe(1.5);
  });

  it('uma aplicação da dose antiga depois da decisão a invalida', () => {
    const aps = [...semanas('2026-10-01', 4, 1.25), ap('2026-10-30', 1.25)];
    expect(situacaoDoDegrau(base.fases, aps, [subir(4, '2026-10-23')]).estado).toBe('pendente');
  });

  it('edge function segue a mesma regra e para na fase pós-remédio', async () => {
    const { planoDeDoses, emFasePosRemedio } = await import('../../supabase/functions/_shared/dose');
    const aps = [ap('2026-10-01', 1.25), ap('2026-10-08', 1.25), ap('2026-10-15', 1.25), ap('2026-10-22', 1.25), ap('2026-10-29', 1.25)];
    expect(planoDeDoses(base.fases, aps, [subir(4, '2026-11-04')]).estado).toBe('subir');
    const pos = [{ apos_aplicacao: 5, dose_mg: 1.25, fase_indice: null, escolha: 'pos_remedio', bloco_inicio: '2026-10-29' }];
    expect(emFasePosRemedio(pos, aps)).toBe(true);
    expect(emFasePosRemedio(pos, [...aps, ap('2026-11-05', 1.25)])).toBe(false);
    expect(emFasePosRemedio([], aps)).toBe(false);
  });
});

describe('Medição', () => {
  it('motivo de não calcular a % de gordura: base da fórmula × faixa possível', () => {
    expect(motivoSemGordura('Masculino', 41, 40, null)).toMatch(/cintura precisa ser maior/);
    expect(motivoSemGordura('Masculino', 41, 70, null)).toMatch(/faixa possível/);
    expect(motivoSemGordura('Feminino', 120, 50, 60)).toMatch(/cintura \+ quadril/);
  });
});

describe('kcal com ponto de milhar', () => {
  it('"1.000" = 1000 e "1.200" = 1200; vírgula continua decimal', () => {
    expect(paraKcal('1.000')).toBe(1000);
    expect(paraKcal('1.200')).toBe(1200);
    expect(paraKcal('500')).toBe(500);
    expect(paraKcal('250,5')).toBe(250.5);
    expect(paraKcal('')).toBeNull();
  });
});

describe('Erros: tabela ou coluna faltando não é falta de internet', () => {
  it('PGRST204/205 e 42703/42P01 são erro de dados', () => {
    expect(ehErroDeRede({ message: "Could not find the table 'public.dieta_planos' in the schema cache", code: 'PGRST205', status: 404 })).toBe(false);
    expect(ehErroDeRede({ message: "Could not find the 'decisoes' column of 'ciclos' in the schema cache", code: 'PGRST204', status: 400 })).toBe(false);
    expect(ehErroDeRede(new Error("Could not find the table 'public.forca' in the schema cache"))).toBe(false);
    expect(ehErroDeRede(new Error('Could not query the database for the schema cache. Retrying.'))).toBe(true);
  });
});

describe('Resumo da semana: treino · cardio só nos dias do placar', () => {
  const t = (data: string, treino: boolean, cardio: boolean) => ({ id: data, data, treino, cardio, corrida_km: null, corrida_seg: null });
  it('recorta pelo início e pelo fim do placar', () => {
    const treinos = [t('2026-11-02', true, true), t('2026-11-03', true, true), t('2026-11-04', false, true), t('2026-11-05', true, true), t('2026-11-06', true, true), t('2026-11-07', true, false), t('2026-11-08', true, true)];
    const f = faltasNoPeriodo(treinos, '2026-11-02', '2026-11-08', '2026-11-03', '2027-11-01');
    expect(f).toMatchObject({ dias: 6, treinos_feitos: 5, cardios_feitos: 5 });
    expect(faltasNoPeriodo([], '2026-11-09', '2026-11-15', '2026-09-07', '2026-11-02').dias).toBe(0);
  });
});

describe('Treino', () => {
  it('medição atípica não vira o resultado da semana', () => {
    const comps = [comp('2026-10-12', 95, 98), comp('2026-10-19', 98, 104, { atipica: true })];
    const s = semanasDoProjeto([], '2026-09-07', '2026-11-02', '2026-11-04', comps);
    expect(s.find((x) => x.segunda === '2026-10-05')?.medida?.cintura_cm).toBe(98);
    expect(s.find((x) => x.segunda === '2026-10-12')?.medida).toBeNull();
  });

  it('No ritmo: no último dia do projeto ainda projeta (horizonte = hoje)', () => {
    const lista = Array.from({ length: 9 }, (_, i) => comp(somarDias('2026-09-07', i * 7), 100 - i * 0.6, 104 - i * 0.8));
    const p = projecaoNoRitmo(lista, '2026-11-02', '2026-11-02', 9);
    expect(p?.horizonte).toBe('2026-11-02');
    expect(projecaoNoRitmo(lista, '2026-11-03', '2026-11-02', 9)).toBeNull();
  });
});

describe('Balanço do projeto', () => {
  it('cada linha traz a chave da medida (para a mudança mínima detectável)', () => {
    const l = linhasBalanco(comp('2026-09-07', 100, 104), comp('2026-11-02', 94, 98), null, 'Masculino');
    expect(l.find((x) => x.nome === 'Massa magra')?.chave).toBe('massa_magra_kg');
    expect(l.find((x) => x.nome === 'Peso')?.chave).toBe('peso_kg');
  });
});

describe('Análise e PDF', () => {
  // Doses semanais de 1,25 (4) e 1,5 (4) a partir de 07/09; pesagem toda segunda
  const aps = [...semanas('2026-09-10', 4, 1.25), ...semanas('2026-10-08', 4, 1.5)];
  const serie: PontoPeso[] = Array.from({ length: 16 }, (_, i) => {
    const data = somarDias('2026-09-07', i * 7);
    // Perde 0,6 kg/sem até 02/11 e depois reganha 0,5 kg/sem
    const peso = data <= '2026-11-02' ? 100 - i * 0.6 : 100 - 8 * 0.6 + (i - 8) * 0.5;
    return { data, peso_kg: peso, origem: 'medida' };
  });
  const ciclo: Ciclo = { ...base, quantidade_total_mg: 11 };

  it('com o remédio concluído, o último bloco termina no fim do remédio e não mistura o reganho', () => {
    const resumo = calcularCiclo(ciclo, aps, [], '2026-12-21');
    expect(resumo.proxima).toBeNull();
    const ate = analisarFases(resumo, serie, [], '2026-12-21');
    const fim = analisarFases(resumo, serie, [], '2026-12-21', '2026-11-05');
    expect(ate.at(-1)!.fim).toBe('2026-12-21');
    expect(fim.at(-1)!.fim).toBe('2026-11-05');
    expect(fim.at(-1)!.kg_por_semana!).toBeCloseTo(-0.6, 5);
    expect(ate.at(-1)!.kg_por_semana!).toBeGreaterThan(-0.6);
  });

  it('kg/sem. do PDF usa as mesmas pesagens da tela (com a de referência)', () => {
    const resumo = calcularCiclo({ ...base, quantidade_total_mg: 500 }, aps, [], '2026-11-05');
    const fases = analisarFases(resumo, serie, [], '2026-11-05');
    fases.forEach((f, i) => {
      const txt = ritmoDoBloco(serie, f, i === fases.length - 1);
      if (f.kg_por_semana !== null) expect(txt.startsWith(`− ${Math.abs(f.kg_por_semana).toFixed(2).replace('.', ',')}`)).toBe(true);
    });
  });

  it('quadro de decisão com o remédio concluído: sem "Fase que termina" nem regras de subir', () => {
    const col: ColunaQuadro = {
      rotulo: '1,50 mg · fase 2',
      inicio: '2026-10-08',
      fim: '2026-11-05',
      em_andamento: false,
      gorda_semana: null,
      cintura_semana: null,
      magra_semana: null,
      medicoes: null,
      nausea_pico: null,
      vomitos: [],
      dias_registrados: 0,
      dias: 29,
      treino: null,
      cardio: null,
      dieta: { sim: 0, parcial: 0, nao: 0 },
    };
    const q = montarQuadro({ atual: col, anterior: null }, false, 'x', true);
    expect(q.colunas[1]).toMatch(/Última fase do remédio/);
    expect(q.regras).toEqual([]);
    expect(montarQuadro({ atual: col, anterior: null }, false, 'x').regras.length).toBeGreaterThan(0);
  });

  it('semana a semana marca a medição atípica', () => {
    const linhas = semanasDoCiclo({
      inicio: '2026-09-21',
      hoje: '2026-10-04',
      aplicacoes: [ap('2026-09-24', 1.25)],
      serie: [
        { data: '2026-09-21', peso_kg: 95, origem: 'medida' },
        { data: '2026-09-28', peso_kg: 97, origem: 'medida', atipica: true },
      ],
      composicoes: [comp('2026-09-21', 95, 100), comp('2026-09-28', 97, 102, { atipica: true })],
      diario: [],
      treinos: null,
    });
    const t = tabelaSemanal(linhas, false);
    expect(t.linhas[0][2]).toBe('95,0');
    expect(t.linhas[1][2]).toBe('97,0*');
    expect(t.linhas[1][3]).toBe('102,0*');
    expect(t.nota).toMatch(/atípica/);
  });
});
