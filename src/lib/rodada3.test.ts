import { describe, expect, it } from 'vitest';
import { planejarImportacao, type Backup } from './backup';
import { blocosDeDose, calcularCiclo, cicloPadrao, localizarDegraus } from './ciclo';
import { ocorrencias, semanasDoCiclo } from './consulta';
import { somarDias } from './datas';
import { conflitoDataSessao, separarFotosImportar, type FotoBackup, type FotoInfo } from './fotos';
import { corVariacao, lerFaixa } from './formato';
import { ajusteVigente, calibrarPorExame, MDC, percentualGorduraBruto, type Composicao } from './gordura';
import { pendenciasDeOntem } from './rotina';
import type { Aplicacao, Ciclo, DecisaoFase, Medida, Perfil } from './tipos';
import { listarCorridas, periodoProjeto, rotuloCardio } from './treino';

const base: Ciclo = { id: 'c1', ...cicloPadrao('2026-09-10') };
const ap = (data: string, dose: number): Aplicacao => ({ id: data, ciclo_id: 'c1', data, dose_mg: dose, local: null, observacoes: null });
const semanas = (inicio: string, n: number, dose: number) => Array.from({ length: n }, (_, i) => ap(somarDias(inicio, i * 7), dose));
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

describe('Dose fora do plano: a confirmação acompanha o bloco', () => {
  const antes = [...semanas('2026-09-10', 4, 1.25), ...semanas('2026-10-08', 4, 1.5)];
  const confirmacao: DecisaoFase = {
    id: 'cf',
    data: '2026-11-12',
    apos_aplicacao: 9,
    dose_mg: 1.6,
    fase_indice: 1,
    escolha: 'confirmar_fase',
    bloco_inicio: '2026-11-12',
  };

  it('uma dose esquecida no começo do bloco não invalida a fase confirmada', () => {
    const aps = [...antes, ap('2026-11-05', 1.6), ap('2026-11-12', 1.6), ap('2026-11-19', 1.6)];
    const d = localizarDegraus(base.fases, blocosDeDose(aps), [confirmacao]).at(-1)!;
    expect(d.confirmada).toBe(true);
    expect(d.primeira_fase).toBe(1);
    expect(d.bloco.aplicacoes).toBe(3);
    const r = calcularCiclo({ ...base, decisoes: [confirmacao] }, aps, [], '2026-11-22');
    expect(r.degrau.estado).not.toBe('fora_do_plano');
  });

  it('excluir a 1ª dose do bloco também mantém a confirmação; outro bloco com a mesma dose não a herda', () => {
    const semPrimeira = [...antes, ap('2026-11-19', 1.6)];
    expect(localizarDegraus(base.fases, blocosDeDose(semPrimeira), [confirmacao]).at(-1)!.confirmada).toBe(true);
    // 1,6 confirmado, depois 1,75, depois 1,6 de novo: o bloco novo pede outra confirmação
    const volta = [...antes, ap('2026-11-12', 1.6), ap('2026-11-19', 1.75), ap('2026-11-26', 1.6)];
    expect(localizarDegraus(base.fases, blocosDeDose(volta), [confirmacao]).at(-1)!.confirmada).toBe(false);
  });
});

describe('Agenda: saldo que não cobre a próxima dose', () => {
  it('projeção vazia, mas a próxima dose continua no plano (doses_plano_restantes > projeção)', () => {
    const ciclo: Ciclo = { ...base, quantidade_total_mg: 5 };
    const r = calcularCiclo(ciclo, [ap('2026-09-10', 1.25), ap('2026-09-17', 1.25), ap('2026-09-24', 1.25), ap('2026-10-01', 1.0)], [], '2026-10-08');
    expect(r.projecao).toHaveLength(0);
    expect(r.proxima).not.toBeNull();
    expect(r.proxima!.saldo_suficiente).toBe(false);
    expect(r.doses_plano_restantes).toBeGreaterThan(0);
  });
});

describe('Pendências de ontem: nada antes do início do ciclo', () => {
  it('conta recém-criada (1ª aplicação hoje) não pergunta "segui o plano?" de ontem', () => {
    const p = pendenciasDeOntem({ hoje: '2026-11-02', treinos: [], diario: [], periodoTreino: null, comDieta: true, inicioCiclo: '2026-11-02' });
    expect(p).toBeNull();
    const dentro = pendenciasDeOntem({ hoje: '2026-11-02', treinos: [], diario: [], periodoTreino: null, comDieta: true, inicioCiclo: '2026-10-01' });
    expect(dentro?.dieta).toBe(true);
  });
});

describe('Sono e água: número mal digitado', () => {
  it('texto que não vira número dá erro de formato, não "fora da faixa"', () => {
    expect(lerFaixa('6,5,', 0, 24, 'Sono', 'h', '6,5').erro).toBe('Sono: número inválido. Use só um separador decimal, ex.: 6,5.');
    expect(lerFaixa('1,5,', 0, 15, 'Água', 'L', '1,5').erro).toContain('número inválido');
    expect(lerFaixa('30', 0, 24, 'Sono', 'h').erro).toContain('fora da faixa');
  });
});

describe('Cores no limite da mudança mínima', () => {
  it('a cor segue o número exibido (1 casa)', () => {
    expect(corVariacao(-1.496, true, MDC.massa_gorda_kg)).toBe(corVariacao(-1.513, true, MDC.massa_gorda_kg));
    expect(corVariacao(-1.496, true, MDC.massa_gorda_kg)).toBe('bom');
    expect(corVariacao(-1.44, true, MDC.massa_gorda_kg)).toBe('');
    // Sem limiar continua colorindo qualquer variação (ex.: kg/sem com 2 casas)
    expect(corVariacao(0.04, true)).toBe('ruim');
  });
});

describe('Calibração por exame', () => {
  const perfil = (altura: number): Pick<Perfil, 'sexo' | 'ajuste_gordura' | 'altura_cm' | 'exame_gordura_data' | 'exame_gordura_bf'> => ({
    sexo: 'Masculino',
    altura_cm: altura,
    ajuste_gordura: -0.1,
    exame_gordura_data: '2026-11-02',
    exame_gordura_bf: 22,
  });
  const medidas = [medida('2026-11-02', 100, 96)];

  it('com exame salvo, o ajuste é refeito com a altura atual: a medição do exame continua dando o % dele', () => {
    for (const altura of [181, 175]) {
      const a = ajusteVigente(perfil(altura), medidas);
      const bruta = percentualGorduraBruto('Masculino', altura, 42, 100, null)!;
      expect(bruta + a).toBeCloseTo(22, 0);
    }
    expect(ajusteVigente(perfil(181), medidas)).not.toBe(ajusteVigente(perfil(175), medidas));
  });

  it('sem medição perto do exame, vale o ajuste salvo', () => {
    expect(ajusteVigente(perfil(181), [medida('2026-10-01', 100, 96)])).toBe(-0.1);
  });

  it('ajuste acima de ±15 p.p. é recusado com explicação (o banco não aceitaria)', () => {
    const c = calibrarPorExame([medida('2026-10-26', 95.8, 90, { pescoco_cm: 40.3 })], { sexo: 'Masculino', altura_cm: 181 }, '2026-10-26', 40, '2026-11-02');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.erro).toMatch(/limite de ±15 p\.p\./);
  });
});

describe('Período do remédio', () => {
  it('com intervalo de 14 dias, a última dose cobre 14 dias', () => {
    const ciclo: Ciclo = { ...base, intervalo_dias: 14, quantidade_total_mg: 10 };
    const aps = [1.25, 1.25, 1.5, 1.5, 1.75, 2.75].map((d, i) => ap(somarDias('2026-08-03', i * 14), d));
    const r = calcularCiclo(ciclo, aps, [], '2026-11-30');
    expect(r.proxima).toBeNull();
    expect(periodoProjeto(ciclo, r).fim).toBe(somarDias('2026-10-12', 14));
  });

  it('sem nenhuma aplicação, o projeto ainda não começou (início amanhã se a data planejada já passou)', () => {
    const ciclo: Ciclo = { ...base, data_inicio: '2026-10-26' };
    const r = calcularCiclo(ciclo, [], [], '2026-11-02');
    expect(periodoProjeto(ciclo, r, null, '2026-11-02').inicio).toBe('2026-11-03');
    // Data planejada no futuro continua valendo
    const futuro: Ciclo = { ...base, data_inicio: '2026-11-10' };
    expect(periodoProjeto(futuro, calcularCiclo(futuro, [], [], '2026-11-02'), null, '2026-11-02').inicio).toBe('2026-11-10');
  });
});

describe('Cardio e corridas', () => {
  it('o rótulo usa a distância feita', () => {
    expect(rotuloCardio('2026-11-02', { cardio_tipo: 'corrida', corrida_km: 8 })).toBe('Corrida 8 km');
    expect(rotuloCardio('2026-11-02', { cardio_tipo: 'corrida', corrida_km: null })).toBe('Corrida 5 km');
  });

  it('paces iguais na tela (5:13 e 5:13) dão diferença zero', () => {
    const t = (data: string, km: number, seg: number) => ({ id: data, data, treino: false, cardio: true, corrida_km: km, corrida_seg: seg, cardio_tipo: 'corrida' as const });
    const c = listarCorridas([t('2026-10-28', 8, 2502), t('2026-11-01', 5, 1564)]);
    expect(c[1].delta).toBe(0);
  });
});

describe('PDF: medição atípica e semanas sem remédio', () => {
  it('Semana a semana usa a medição normal refeita na mesma semana', () => {
    const atip = comp('2026-10-12', 95, 99, { atipica: true });
    const normal = comp('2026-10-15', 93, 96);
    const linhas = semanasDoCiclo({
      inicio: '2026-10-05',
      hoje: '2026-10-18',
      aplicacoes: [ap('2026-10-05', 1.75), ap('2026-10-12', 1.75)],
      serie: [
        { data: '2026-10-12', peso_kg: 95, origem: 'medida', atipica: true },
        { data: '2026-10-15', peso_kg: 93, origem: 'medida' },
      ],
      composicoes: [atip, normal],
      diario: [],
      treinos: null,
    });
    const s = linhas.find((l) => l.segunda === '2026-10-12')!;
    expect(s.peso_kg).toBe(93);
    expect(s.composicao?.data).toBe('2026-10-15');
    expect(s.atipica).toBe(false);
  });

  it('ocorrências depois do fim do remédio ficam sem dose e sem D+', () => {
    const reg = (data: string, obs: string) => ({ id: data, data, peso_kg: null, nausea: null, observacoes: obs, vomito: null, diarreia: null, intestino_preso: null });
    const o = ocorrencias([reg('2026-10-28', 'enjoo'), reg('2026-11-11', 'Sem remédio, fome voltou')], [ap('2026-10-26', 2)], '2026-11-02');
    expect(o[0]).toMatchObject({ d: 2, dose_mg: 2 });
    expect(o[1]).toMatchObject({ d: null, dose_mg: null, pos_remedio: true });
  });
});

describe('Fotos: ordem Antes/Depois em todas as poses', () => {
  const fotos = [
    { sessao: 'antes', pose: 'frente', data: '2026-09-07' },
    { sessao: 'antes', pose: 'lado', data: '2026-10-19' },
  ] as FotoInfo[];

  it('o Depois não pode ser anterior a nenhuma foto do Antes (nem o Antes posterior a alguma do Depois)', () => {
    expect(conflitoDataSessao(fotos, 'depois', '2026-10-05')).toMatch(/19\/10\/2026/);
    expect(conflitoDataSessao(fotos, 'depois', '2026-10-19')).toBeNull();
    const comDepois = [...fotos, { sessao: 'depois', pose: 'costas', data: '2026-11-02' }] as FotoInfo[];
    expect(conflitoDataSessao(comDepois, 'antes', '2026-11-05')).toMatch(/posterior à do Depois/);
  });

  it('importar backup deixa de fora a foto que inverteria a ordem com as do aparelho', () => {
    const f = (sessao: 'antes' | 'depois', pose: 'frente' | 'lado', data: string): FotoBackup => ({
      sessao,
      pose,
      data,
      tipo: 'image/jpeg',
      largura: 10,
      altura: 10,
      salva_em: '2026-11-02T10:00:00Z',
      base64: 'AAAA',
    });
    const r = separarFotosImportar([f('antes', 'frente', '2026-09-07'), f('depois', 'frente', '2026-10-05'), f('depois', 'lado', '2026-10-05')], [
      { sessao: 'antes', pose: 'frente', data: '2026-10-26' },
    ]);
    expect(r.fotos).toHaveLength(0);
    expect(r.conflito).toBe(2);
    const plano = planejarImportacao({ versao: 3, exportado_em: '2026-11-02', aplicacoes: [], fotos: [f('depois', 'lado', '2026-10-05')] } as unknown as Backup, {
      aplicacoes: [],
      medidas: [],
      diario: [],
      treinos: [],
      fotos: [{ sessao: 'antes', pose: 'frente', data: '2026-10-26' }],
    });
    expect(plano.ignoradas).toMatchObject({ fotos: 0, fotos_conflito: 1 });
  });
});
