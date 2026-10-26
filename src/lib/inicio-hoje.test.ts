import { describe, expect, it } from 'vitest';
import { progressoTarefas, tarefasDoDia } from './inicio-hoje';
import type { RegistroDiario, TreinoDia } from './tipos';

const reg = (r: Partial<RegistroDiario>): RegistroDiario => ({ id: 'r', data: '2026-11-02', peso_kg: null, nausea: null, observacoes: null, ...r });
const tr = (t: Partial<TreinoDia>): TreinoDia => ({ id: 't', data: '2026-11-02', treino: false, cardio: false, corrida_km: null, corrida_seg: null, ...t });

describe('tarefasDoDia', () => {
  it('conta sem Treino e sem dieta: peso, náusea, água e sono', () => {
    const t = tarefasDoDia({ comTreino: false, comDieta: false, metaAgua: 2.7 });
    expect(t.map((x) => x.chave)).toEqual(['peso', 'nausea', 'agua', 'sono']);
    expect(progressoTarefas(t)).toEqual({ feitas: 0, total: 4, fracao: 0 });
    expect(t.find((x) => x.chave === 'agua')!.detalhe).toBe('– de 2,7 L');
  });

  it('com Treino, dose devida, medição de segunda e dieta, na ordem do cartão', () => {
    const t = tarefasDoDia({
      comTreino: true,
      treinoDia: tr({ treino: true }),
      comDieta: true,
      metaAgua: 3,
      dose: { devida: true, feitaHoje: false, texto: '1,50 mg · 7,5 UI' },
      medicao: { feita: false },
      reg: reg({ peso_kg: 91.24, nausea: 1, vomito: true, agua_l: 1.5, sono_h: 7, dieta_seguida: 'parcial' }),
    });
    expect(t.map((x) => x.chave)).toEqual(['dose', 'medicao', 'treino', 'cardio', 'peso', 'nausea', 'agua', 'sono', 'plano']);
    expect(t.map((x) => x.feito)).toEqual([false, false, true, false, true, true, true, true, true]);
    expect(t[0].detalhe).toBe('1,50 mg · 7,5 UI');
    expect(t.find((x) => x.chave === 'peso')!.detalhe).toBe('91,2 kg');
    expect(t.find((x) => x.chave === 'nausea')!.detalhe).toBe('leve · vômito');
    expect(t.find((x) => x.chave === 'plano')!.detalhe).toBe('em parte');
    expect(progressoTarefas(t)).toEqual({ feitas: 6, total: 9, fracao: 6 / 9 });
  });

  it('dose fora do dia não entra; registrada hoje entra como feita', () => {
    expect(tarefasDoDia({ comTreino: false, comDieta: false, metaAgua: 2, dose: { devida: false, feitaHoje: false, texto: '' } })[0].chave).toBe('peso');
    const t = tarefasDoDia({ comTreino: false, comDieta: false, metaAgua: 2, dose: { devida: false, feitaHoje: true, texto: '' } });
    expect(t[0]).toMatchObject({ chave: 'dose', feito: true, detalhe: 'registrada hoje' });
  });

  it('peso da medição de hoje vale como o peso do dia', () => {
    const t = tarefasDoDia({ comTreino: false, comDieta: false, metaAgua: 2, pesoMedicao: 90.6, reg: reg({ peso_kg: null }) });
    expect(t[0]).toMatchObject({ chave: 'peso', feito: true, detalhe: '90,6 kg' });
  });

  it('sintoma sem náusea anotada aparece no detalhe, mas a tarefa segue aberta', () => {
    const t = tarefasDoDia({ comTreino: false, comDieta: false, metaAgua: 2, reg: reg({ diarreia: false, vomito: false }) });
    expect(t.find((x) => x.chave === 'nausea')).toMatchObject({ feito: false, detalhe: 'nenhum' });
  });

  it('lista vazia não divide por zero', () => {
    expect(progressoTarefas([])).toEqual({ feitas: 0, total: 0, fracao: 0 });
  });
});
