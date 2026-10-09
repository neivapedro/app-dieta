import { describe, expect, it } from 'vitest';
import { analisarFases, analisarGeral, serieDePeso } from './analise';
import { calcularCiclo, cicloPadrao, consumoPlano, faseDaDose, marcacao, mgParaUI, verificarPlano } from './ciclo';
import { diaDaSemana, somarDias } from './datas';
import { composicao, ganhos, percentualGordura } from './gordura';
import type { Aplicacao, Ciclo, Medida, RegistroDiario } from './tipos';

const ciclo: Ciclo = { id: 'c1', ...cicloPadrao('2026-10-08') };

function ap(data: string, dose: number, local: string | null = null): Aplicacao {
  return { id: data, ciclo_id: 'c1', data, dose_mg: dose, local, observacoes: null };
}

describe('% de gordura (Planilha Gorgonoidiana)', () => {
  it('reproduz a linha 13/10/26 da planilha: 24,9% · 72,5 kg magra · 24,0 kg gorda', () => {
    const m: Medida = { id: 'm', data: '2026-10-13', altura_cm: 182, pescoco_cm: 41, cintura_cm: 98, quadril_cm: null, peso_kg: 96.5 };
    const c = composicao(m, 'Masculino');
    expect(c.bf!).toBeCloseTo(24.89301412476658, 10); // valor calculado pelo Excel em G8
    expect(c.massa_magra_kg!).toBeCloseTo(72.47824136960025, 10);
    expect(c.massa_gorda_kg!).toBeCloseTo(24.02, 1);
  });

  it('usa a fórmula feminina com quadril e sem o ajuste de +2', () => {
    const bf = percentualGordura('Feminino', 165, 33, 80, 100)!;
    const esperado = 495 / (1.29579 - 0.35004 * Math.log10(147) + 0.221 * Math.log10(165)) - 450;
    expect(bf).toBeCloseTo(esperado, 10);
  });

  it('retorna null quando cintura ≤ pescoço', () => {
    expect(percentualGordura('Masculino', 180, 40, 40, null)).toBeNull();
  });

  it('ganhos = última − primeira', () => {
    const a = composicao({ id: 'a', data: '2026-10-13', altura_cm: 182, pescoco_cm: 41, cintura_cm: 98, quadril_cm: null, peso_kg: 96.5 }, 'Masculino');
    const b = composicao({ id: 'b', data: '2026-11-13', altura_cm: 182, pescoco_cm: 41, cintura_cm: 94, quadril_cm: null, peso_kg: 92 }, 'Masculino');
    const g = ganhos(a, b);
    expect(g.peso_kg).toBeCloseTo(-4.5);
    expect(g.cintura_cm).toBe(-4);
    expect(g.bf!).toBeLessThan(0);
  });
});

describe('Plano (aba Plano)', () => {
  it('consome exatamente 60 mg', () => {
    expect(consumoPlano(ciclo.fases)).toBeCloseTo(60);
    expect(verificarPlano(ciclo).situacao).toBe('exato');
  });

  it('avisa quando repetir uma fase passa do total', () => {
    const c = { ...ciclo, fases: ciclo.fases.map((f, i) => (i === 0 ? { ...f, semanas: 8 } : f)) };
    const v = verificarPlano(c);
    expect(v.situacao).toBe('excesso');
    expect(v.mensagem).toContain('5,00 mg a mais');
  });

  it('localiza a fase pelo número da aplicação', () => {
    expect(faseDaDose(ciclo.fases, 1).fase.dose_mg).toBe(1.25);
    expect(faseDaDose(ciclo.fases, 4).fase.dose_mg).toBe(1.25);
    expect(faseDaDose(ciclo.fases, 5).fase.dose_mg).toBe(1.5);
    expect(faseDaDose(ciclo.fases, 30).fase.dose_mg).toBe(2.5);
    expect(faseDaDose(ciclo.fases, 35).fase.nome).toBe('Manutenção');
  });

  it('converte mg em UI (U-100) e arredonda para a marcação da seringa', () => {
    expect(mgParaUI(2.5, 20)).toBeCloseTo(12.5);
    // padrão 0,25 UI: a dose do plano sai exata (1,25 mg = 6,25 UI)
    expect(marcacao(1.25, ciclo)).toMatchObject({ ui_pratica: 6.25 });
    expect(marcacao(1.25, ciclo).mg_pratica).toBeCloseTo(1.25);
    expect(marcacao(2.25, ciclo).ui_pratica).toBe(11.25);
    // seringa lida de meia em meia unidade
    const meia = { ...ciclo, passo_ui: 0.5 };
    expect(marcacao(1.25, meia)).toMatchObject({ ui_pratica: 6.5 });
    expect(marcacao(1.25, meia).mg_pratica).toBeCloseTo(1.3);
    expect(marcacao(1.75, meia).ui_pratica).toBe(9);
    expect(marcacao(2.25, meia).ui_pratica).toBe(11.5);
  });

});

describe('Agenda recalculada pela última aplicação', () => {
  it('sem aplicações, a próxima é a data de início', () => {
    const r = calcularCiclo(ciclo, [], [], '2026-10-05');
    expect(r.proxima).toMatchObject({ numero: 1, data: '2026-10-08', situacao: 'futura', dias: 3, dose_mg: 1.25 });
    expect(r.saldo_mg).toBe(60);
    expect(r.projecao).toHaveLength(30);
    expect(r.data_fim_prevista).toBe(somarDias('2026-10-08', 29 * 7));
  });

  it('quinta → atrasou para sexta → próxima vira a sexta seguinte', () => {
    expect(diaDaSemana('2026-10-08')).toBe('Quinta');
    const r = calcularCiclo(ciclo, [ap('2026-10-08', 1.25), ap('2026-10-16', 1.25)], [], '2026-10-17');
    expect(r.linhas[1].data_prevista).toBe('2026-10-15');
    expect(r.linhas[1].atraso_dias).toBe(1);
    expect(r.proxima!.data).toBe('2026-10-23');
    expect(diaDaSemana(r.proxima!.data)).toBe('Sexta');
    expect(r.proxima!.numero).toBe(3);
  });

  it('marca atrasada e projeta as próximas a partir de hoje', () => {
    const r = calcularCiclo(ciclo, [ap('2026-10-08', 1.25)], [], '2026-10-18');
    expect(r.proxima).toMatchObject({ data: '2026-10-15', situacao: 'atrasada', dias: 3 });
    expect(r.projecao[0].data).toBe('2026-10-18');
    expect(r.projecao[1].data).toBe('2026-10-25');
  });

  it('5ª aplicação sobe para 1,5 mg e saldo bate com o Painel', () => {
    const datas = ['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'];
    const r = calcularCiclo(ciclo, datas.map((d) => ap(d, 1.25)), [], '2026-11-01');
    expect(r.total_aplicado_mg).toBe(5);
    expect(r.saldo_mg).toBe(55);
    expect(r.saldo_ml).toBeCloseTo(2.75);
    expect(r.saldo_ui).toBeCloseTo(275);
    expect(r.percentual_usado).toBeCloseTo(5 / 60);
    expect(r.doses_manutencao_restantes).toBe(22);
    expect(r.proxima).toMatchObject({ numero: 5, dose_mg: 1.5, data: '2026-11-05' });
    expect(r.proxima!.fase.fase.nome).toBe('Primeira progressão');
  });

  it('dose diferente da prevista entra no saldo e na diferença', () => {
    const r = calcularCiclo(ciclo, [ap('2026-10-08', 1)], [], '2026-10-09');
    expect(r.linhas[0].diferenca_mg).toBeCloseTo(-0.25);
    expect(r.saldo_mg).toBe(59);
  });

  it('alerta aplicação duplicada e sugere rodízio do local', () => {
    const r = calcularCiclo(ciclo, [ap('2026-10-08', 1.25, 'Abdome direito'), ap('2026-10-09', 1.25, 'Abdome esquerdo')], [], '2026-10-10');
    expect(r.alertas.some((a) => a.includes('duplicado'))).toBe(true);
    expect(r.sugestao_local).toBe('Coxa direita');
  });

  it('encerra quando o saldo acaba', () => {
    const aps: Aplicacao[] = [];
    let data = '2026-10-08';
    for (let n = 1; n <= 30; n++) {
      aps.push({ ...ap(data, faseDaDose(ciclo.fases, n).fase.dose_mg), id: String(n).padStart(2, '0') });
      data = somarDias(data, 7);
    }
    const r = calcularCiclo(ciclo, aps, [], data);
    expect(r.saldo_mg).toBeCloseTo(0);
    expect(r.proxima).toBeNull();
    expect(r.projecao).toHaveLength(0);
  });

  it('peso médio e náusea máxima por semana usam o diário entre aplicações', () => {
    const diario: RegistroDiario[] = [
      { id: '1', data: '2026-10-08', peso_kg: 96, nausea: 1, observacoes: null },
      { id: '2', data: '2026-10-10', peso_kg: 95, nausea: 2, observacoes: null },
      { id: '3', data: '2026-10-15', peso_kg: 94, nausea: 0, observacoes: null },
    ];
    const r = calcularCiclo(ciclo, [ap('2026-10-08', 1.25), ap('2026-10-15', 1.25)], diario, '2026-10-16');
    expect(r.linhas[0].peso_medio).toBeCloseTo(95.5);
    expect(r.linhas[0].nausea_max).toBe(2);
    expect(r.linhas[1].peso_medio).toBe(94);
  });
});

describe('Análise do ciclo', () => {
  const medidas: Medida[] = [
    { id: 'm1', data: '2026-10-07', altura_cm: 182, pescoco_cm: 41, cintura_cm: 98, quadril_cm: null, peso_kg: 96.5 },
    { id: 'm2', data: '2026-11-10', altura_cm: 182, pescoco_cm: 41, cintura_cm: 95, quadril_cm: null, peso_kg: 93 },
  ];
  const diario: RegistroDiario[] = [
    { id: 'd1', data: '2026-10-20', peso_kg: 95.2, nausea: 1, observacoes: null },
    { id: 'd2', data: '2026-11-10', peso_kg: 99, nausea: null, observacoes: null },
  ];

  it('no mesmo dia, o peso da medição prevalece sobre o diário', () => {
    const serie = serieDePeso(diario, medidas);
    expect(serie.map((p) => p.peso_kg)).toEqual([96.5, 95.2, 93]);
  });

  it('compara medidas iniciais com as atuais', () => {
    const g = analisarGeral('2026-10-08', serieDePeso(diario, medidas), medidas, 'Masculino', '2026-11-12');
    expect(g.peso_inicial!.peso_kg).toBe(96.5);
    expect(g.peso_atual!.peso_kg).toBe(93);
    expect(g.variacao_kg).toBeCloseTo(-3.5);
    expect(g.medida_inicial!.cintura_cm).toBe(98);
    expect(g.medida_atual!.cintura_cm).toBe(95);
  });

  it('separa resultados por fase', () => {
    const aps = ['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05'].map((d) => ap(d, 1.25));
    const r = calcularCiclo(ciclo, aps, diario, '2026-11-12');
    const fases = analisarFases(r, serieDePeso(diario, medidas), diario, '2026-11-12');
    expect(fases).toHaveLength(2);
    expect(fases[0]).toMatchObject({ nome: 'Adaptação', doses: 4, inicio: '2026-10-08', fim: '2026-11-05', peso_inicio: 96.5, peso_fim: 95.2, em_andamento: false });
    expect(fases[1]).toMatchObject({ nome: 'Primeira progressão', doses: 1, em_andamento: true, peso_fim: 93 });
  });

  it('fase concluída não aparece como atual quando a próxima dose já é da fase seguinte', () => {
    const aps = ['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'].map((d) => ap(d, 1.25));
    const r = calcularCiclo(ciclo, aps, diario, '2026-11-01');
    const fases = analisarFases(r, serieDePeso(diario, medidas), diario, '2026-11-01');
    expect(fases[0]).toMatchObject({ doses: 4, em_andamento: false, fim: '2026-11-01' });
  });
});
