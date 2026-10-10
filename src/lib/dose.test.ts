import { describe, expect, it } from 'vitest';
import { numerosDaFase } from './analise';
import {
  blocosDeDose,
  calcularCiclo,
  capacidadeSeringa,
  cicloPadrao,
  descreverFaseAtual,
  guiaSeringa,
  localizarDegraus,
  marcacao,
  marcasVizinhas,
  passoDaMarca,
  situacaoDoDegrau,
  textoSeringa,
} from './ciclo';
import { somarDias } from './datas';
import type { Aplicacao, Ciclo, DecisaoFase, RegistroDiario } from './tipos';

const base: Ciclo = { id: 'c1', ...cicloPadrao('2026-10-08') };

function ap(data: string, dose: number, extra: Partial<Aplicacao> = {}): Aplicacao {
  return { id: data, ciclo_id: 'c1', data, dose_mg: dose, local: null, observacoes: null, ...extra };
}

/** n aplicações semanais a partir de `inicio` com a mesma dose */
function semanas(inicio: string, n: number, dose: number): Aplicacao[] {
  return Array.from({ length: n }, (_, i) => ap(somarDias(inicio, i * 7), dose));
}

function subir(apos: number, dose: number, nova: number): DecisaoFase {
  return { id: `s${apos}`, data: '2026-11-01', apos_aplicacao: apos, dose_mg: dose, fase_indice: null, escolha: 'subir', dose_nova_mg: nova };
}

describe('Próxima dose pela dose realmente aplicada', () => {
  it('blocos de doses iguais seguidas (±0,01 mg)', () => {
    const b = blocosDeDose([ap('2026-10-01', 1.25), ap('2026-10-08', 1.255), ap('2026-10-15', 1.5), ap('2026-10-22', 1.25)]);
    expect(b.map((x) => [x.dose_mg, x.aplicacoes, x.primeira])).toEqual([
      [1.25, 2, 0],
      [1.5, 1, 2],
      [1.25, 1, 3],
    ]);
  });

  it('sem aplicações: 1ª dose da 1ª fase', () => {
    const s = situacaoDoDegrau(base.fases, []);
    expect(s).toMatchObject({ estado: 'inicio', dose_mg: 1.25, feitas: 0, previstas: 4 });
  });

  it('enquanto o degrau não completa, a próxima é a mesma dose', () => {
    const s = situacaoDoDegrau(base.fases, semanas('2026-10-08', 3, 1.25));
    expect(s).toMatchObject({ estado: 'em_curso', dose_mg: 1.25, feitas: 3, previstas: 4 });
    expect(s.fase!.indice).toBe(0);
  });

  it('degrau completo: não sobe sozinho, mostra a dose seguinte como opção', () => {
    const s = situacaoDoDegrau(base.fases, semanas('2026-10-08', 4, 1.25));
    expect(s).toMatchObject({ estado: 'pendente', dose_mg: 1.25, feitas: 4 });
    expect(s.fase_seguinte!.fase.dose_mg).toBe(1.5);
  });

  it('decisão "subir" vale só para a próxima dose depois daquela aplicação', () => {
    const aps = semanas('2026-10-08', 4, 1.25);
    const s = situacaoDoDegrau(base.fases, aps, [subir(4, 1.25, 1.5)]);
    expect(s).toMatchObject({ estado: 'subir', dose_mg: 1.5 });
    expect(s.fase!.indice).toBe(1);
    // Aplicou 1,25 de novo mesmo assim: a decisão antiga não vale mais
    const s2 = situacaoDoDegrau(base.fases, [...aps, ap('2026-11-05', 1.25)], [subir(4, 1.25, 1.5)]);
    expect(s2).toMatchObject({ estado: 'pendente', dose_mg: 1.25, feitas: 5 });
  });

  it('5ª dose repetida (cenário 1 da auditoria): a fase 2 conta 4 doses de 1,5 mg a partir da 1ª de 1,5', () => {
    const aps = [...semanas('2026-10-08', 5, 1.25), ...semanas('2026-11-12', 3, 1.5)];
    const s = situacaoDoDegrau(base.fases, aps);
    expect(s).toMatchObject({ estado: 'em_curso', dose_mg: 1.5, feitas: 3, previstas: 4 });
    const r = calcularCiclo(base, aps, [], '2026-11-27');
    // 5ª: prevista 1,25 (degrau completo sem decisão), fase 1
    expect(r.linhas[4]).toMatchObject({ dose_prevista: 1.25, diferenca_mg: 0 });
    // 6ª (1ª de 1,5) foi sem decisão: prevista 1,25, diferença +0,25
    expect(r.linhas[5].dose_prevista).toBe(1.25);
    expect(r.linhas[5].diferenca_mg).toBeCloseTo(0.25);
    expect(r.linhas[5].fase!.indice).toBe(1);
  });

  it('repetir fase estende o degrau no Plano', () => {
    const fases = base.fases.map((f, i) => (i === 0 ? { ...f, semanas: 5 } : f));
    const s = situacaoDoDegrau(fases, semanas('2026-10-08', 4, 1.25));
    expect(s).toMatchObject({ estado: 'em_curso', dose_mg: 1.25, feitas: 4, previstas: 5 });
  });

  it('fases seguidas com a mesma dose formam um degrau só', () => {
    const fases = [...base.fases.slice(0, 5), { ...base.fases[5], semanas: 4 }, { ...base.fases[5], nome: 'Manutenção 2', semanas: 6 }];
    const d = localizarDegraus(fases, blocosDeDose(semanas('2026-10-08', 5, 2.5)));
    expect(d[0]).toMatchObject({ primeira_fase: 5, ultima_fase: 6, semanas: 10 });
  });

  it('a busca da fase parte da fase do bloco anterior (dose repetida no plano)', () => {
    const fases = [
      { nome: 'A', semanas: 2, dose_mg: 1, objetivo: '' },
      { nome: 'B', semanas: 2, dose_mg: 2, objetivo: '' },
      { nome: 'C', semanas: 2, dose_mg: 1, objetivo: '' },
      { nome: 'D', semanas: 2, dose_mg: 3, objetivo: '' },
    ];
    const aps = [...semanas('2026-10-01', 2, 1), ...semanas('2026-10-15', 2, 2), ap('2026-10-29', 1)];
    const d = localizarDegraus(fases, blocosDeDose(aps));
    expect(d.map((x) => x.primeira_fase)).toEqual([0, 1, 2]);
    // Voltou a uma dose menor que não existe à frente: usa a fase anterior com essa dose
    const volta = localizarDegraus(base.fases, blocosDeDose([...semanas('2026-10-08', 4, 1.25), ap('2026-11-05', 1.5), ap('2026-11-12', 1.25)]));
    expect(volta.map((x) => x.primeira_fase)).toEqual([0, 1, 0]);
  });

  it('dose fora do plano: pede confirmação e não sobe; confirmada, conta pela fase escolhida', () => {
    const aps = [...semanas('2026-10-08', 4, 1.25), ...semanas('2026-11-05', 2, 1.4)];
    const s = situacaoDoDegrau(base.fases, aps);
    expect(s).toMatchObject({ estado: 'fora_do_plano', dose_mg: 1.4, fase: null, ultima_fase_conhecida: 0 });
    const r = calcularCiclo(base, aps, [], '2026-11-13');
    expect(r.linhas[5].fase).toBeNull();
    expect(descreverFaseAtual(r)).toBe('Dose fora do plano (1,40 mg)');
    // Projeção: o resto do plano depois da fase conhecida, tudo como hipótese
    expect(r.projecao[0]).toMatchObject({ dose_mg: 1.5, hipotese: true });

    const conf: DecisaoFase = { id: 'c', data: '2026-11-13', apos_aplicacao: 6, dose_mg: 1.4, fase_indice: 1, escolha: 'confirmar_fase', bloco_inicio: '2026-11-05' };
    const s2 = situacaoDoDegrau(base.fases, aps, [conf]);
    expect(s2).toMatchObject({ estado: 'em_curso', dose_mg: 1.4, feitas: 2, previstas: 4 });
    expect(s2.fase!.indice).toBe(1);
  });

  it('última fase completa: dose extra com a sobra, sem decisão', () => {
    const aps: Aplicacao[] = [];
    let data = '2026-10-08';
    for (const f of base.fases) {
      aps.push(...semanas(data, f.semanas, f.dose_mg));
      data = somarDias(data, f.semanas * 7);
    }
    const c = { ...base, quantidade_total_mg: 65 };
    const r = calcularCiclo(c, aps, [], data);
    expect(r.degrau.estado).toBe('fim_plano');
    expect(r.proxima).toMatchObject({ extra: true, dose_mg: 2.5 });
    expect(r.projecao).toHaveLength(0);
  });

  it('pausa de 14 dias ou mais: alerta, sem sugerir dose de reinício', () => {
    const aps = semanas('2026-07-16', 4, 1.25).concat(semanas('2026-08-13', 2, 1.5).map((a) => ({ ...a })));
    // última em 20/08; hoje 17/09 = 28 dias
    const r = calcularCiclo(base, aps, [], '2026-09-17');
    expect(r.pausa_dias).toBe(28);
    expect(r.proxima!.dose_mg).toBe(1.5);
    expect(calcularCiclo(base, aps, [], '2026-09-02').pausa_dias).toBeNull();
  });

  it('projeção: resto do degrau firme, fases seguintes como hipótese', () => {
    const r = calcularCiclo(base, semanas('2026-10-08', 2, 1.25), [], '2026-10-16');
    expect(r.projecao.slice(0, 3).map((p) => [p.dose_mg, p.hipotese])).toEqual([
      [1.25, false],
      [1.25, false],
      [1.5, true],
    ]);
    expect(r.doses_plano_restantes).toBe(28);
    expect(r.fim_hipotese).toBe(true);
  });

  it('decidido subir: a fase nova inteira deixa de ser hipótese', () => {
    const r = calcularCiclo({ ...base, decisoes: [subir(4, 1.25, 1.5)] }, semanas('2026-10-08', 4, 1.25), [], '2026-11-01');
    expect(r.proxima).toMatchObject({ dose_mg: 1.5, estado: 'subir' });
    expect(r.projecao.slice(0, 5).map((p) => [p.dose_mg, p.hipotese])).toEqual([
      [1.5, false],
      [1.5, false],
      [1.5, false],
      [1.5, false],
      [1.75, true],
    ]);
    expect(descreverFaseAtual(r)).toBe('Fase 1 concluída · decidido subir: 1,50 mg em 05/11/2026');
  });

  it('"Fase atual" não dá a troca como fato antes da decisão', () => {
    const r = calcularCiclo(base, semanas('2026-10-08', 4, 1.25), [], '2026-11-01');
    expect(descreverFaseAtual(r)).toBe('Fase 1 concluída · próxima seria 1,50 mg em 05/11/2026');
    const r2 = calcularCiclo(base, semanas('2026-10-08', 2, 1.25), [], '2026-10-16');
    expect(descreverFaseAtual(r2)).toBe('1 · Adaptação · 1,25 mg (2 de 4 doses feitas)');
  });
});

describe('Concentração gravada em cada aplicação', () => {
  it('UI e saldo em ml de cada linha usam a concentração da própria aplicação', () => {
    const c = { ...base, concentracao_mg_ml: 10 };
    const aps = [ap('2026-10-08', 1.25, { concentracao_mg_ml: 20 }), ap('2026-10-15', 1.25)];
    const r = calcularCiclo(c, aps, [], '2026-10-16');
    expect(r.linhas[0].ui_aplicada).toBeCloseTo(6.25);
    expect(r.linhas[0].saldo_ml).toBeCloseTo(58.75 / 20);
    // Sem concentração gravada (registro antigo): usa a do ciclo
    expect(r.linhas[1].ui_aplicada).toBeCloseTo(12.5);
    expect(r.saldo_ml).toBeCloseTo(57.5 / 10);
  });
});

describe('Seringa configurável', () => {
  it('passo de leitura = 1/4 da marca; capacidade padrão 100 UI', () => {
    expect(passoDaMarca(1)).toBe(0.25);
    expect(passoDaMarca(0.5)).toBe(0.125);
    expect(capacidadeSeringa(base)).toBe(100);
    expect(capacidadeSeringa({ seringa_capacidade_ui: 30 })).toBe(30);
    expect(marcacao(1.25, { concentracao_mg_ml: 20, passo_ui: passoDaMarca(0.5) }).ui_pratica).toBe(6.25);
  });

  it('textos da seringa usam o intervalo entre marcas', () => {
    expect(textoSeringa(base)).toBe('seringa U-100, marcas de 1 em 1 UI');
    expect(textoSeringa({ seringa_capacidade_ui: 30, seringa_marca_ui: 0.5 })).toBe('seringa U-100 de 30 UI, marcas de 0,5 em 0,5 UI');
    expect(guiaSeringa(6.25, 0.5)).toBe('no meio entre as marcas 6 e 6,5');
    expect(guiaSeringa(6.5, 0.5)).toBe('exatamente na marca 6,5');
    expect(guiaSeringa(8.75, 0.5)).toContain('no meio entre as marcas 8,5 e 9');
    expect(guiaSeringa(6.25)).toContain('um quarto depois da marca 6');
  });

  it('marcas vizinhas com os mg de cada uma', () => {
    const u = marcasVizinhas(6.25, 1, 20)!;
    expect(u.map((x) => x.ui)).toEqual([6, 7]);
    expect(u[0].mg).toBeCloseTo(1.2);
    expect(u[1].mg).toBeCloseTo(1.4);
    expect(marcasVizinhas(10, 1, 20)).toBeNull();
    expect(marcasVizinhas(6.5, 0.5, 20)).toBeNull();
    const v = marcasVizinhas(6.25, 0.5, 20)!;
    expect(v.map((x) => x.ui)).toEqual([6, 6.5]);
    expect(v[1].mg).toBeCloseTo(1.3);
  });
});

describe('Números do fim da fase', () => {
  it('conta sintomas em X de Y dias registrados e "segui o plano = não"', () => {
    const r = (data: string, x: Partial<RegistroDiario>): RegistroDiario => ({ id: data, data, peso_kg: null, nausea: null, observacoes: null, ...x });
    const diario = [
      r('2026-10-07', { nausea: 3 }), // antes da fase
      r('2026-10-08', { nausea: 1, vomito: true }),
      r('2026-10-09', { nausea: 2, dieta_seguida: 'nao' }),
      r('2026-10-10', { intestino_preso: true, dieta_seguida: 'parcial' }),
      r('2026-10-11', { nausea: 0, diarreia: false }),
    ];
    const n = numerosDaFase(diario, '2026-10-08', '2026-10-11');
    expect(n).toMatchObject({ dias_registrados: 4, nausea_max: 2, vomito: 1, diarreia: 0, intestino_preso: 1, dieta_nao: 1 });
    expect(n.nausea_media).toBeCloseTo(1);
    expect(numerosDaFase([], '2026-10-08', '2026-10-11')).toMatchObject({ dias_registrados: 0, nausea_media: null });
  });
});

describe('Edge Functions seguem a mesma regra da próxima dose', () => {
  it('lembrete e calendário (supabase/functions/_shared/dose.ts) batem com o app', async () => {
    const { planoDeDoses } = await import('../../supabase/functions/_shared/dose');
    const cenarios: [Aplicacao[], DecisaoFase[]][] = [
      [[], []],
      [semanas('2026-10-08', 2, 1.25), []],
      [semanas('2026-10-08', 4, 1.25), []],
      [semanas('2026-10-08', 4, 1.25), [subir(4, 1.25, 1.5)]],
      [[...semanas('2026-10-08', 4, 1.25), ...semanas('2026-11-05', 2, 1.4)], []],
      [[...semanas('2026-10-08', 5, 1.25), ...semanas('2026-11-12', 3, 1.5)], []],
    ];
    for (const [aps, decisoes] of cenarios) {
      const app = calcularCiclo({ ...base, quantidade_total_mg: 500, decisoes }, aps, [], '2026-12-31');
      const edge = planoDeDoses(base.fases, aps, decisoes);
      expect(edge.estado).toBe(app.degrau.estado);
      expect(edge.proxima.dose_mg).toBe(app.proxima!.dose_mg);
      expect(edge.resto.map((d) => [d.dose_mg, d.hipotese])).toEqual(app.projecao.map((d) => [d.dose_mg, d.hipotese]));
    }
  });
});
