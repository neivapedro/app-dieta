import { describe, expect, it } from 'vitest';
import { aneisDoDia, anelFechados, diasNoCiclo, historicoAneis, resumoHistorico, type EntradaHistorico } from './aneis-dia';
import type { RegistroDiario, TreinoDia } from './tipos';

const reg = (r: Partial<RegistroDiario>): RegistroDiario => ({ id: 'r', data: '2026-11-02', peso_kg: null, nausea: null, observacoes: null, ...r });
const tr = (t: Partial<TreinoDia>): TreinoDia => ({ id: 't', data: '2026-11-02', treino: false, cardio: false, corrida_km: null, corrida_seg: null, ...t });

describe('aneisDoDia', () => {
  it('Treino: 0, 1 ou 2 sessões viram 0, 50 e 100%; fecha só com treino e cardio', () => {
    const base = { comTreino: true, comDieta: true, metaAgua: 3 };
    expect(aneisDoDia({ ...base }).externo).toMatchObject({ chave: 'treino', fracao: 0, fechado: false, texto: '0/2', anotado: false });
    expect(aneisDoDia({ ...base, treino: tr({ cardio: true }) }).externo).toMatchObject({ fracao: 0.5, fechado: false, texto: '1/2', descricao: 'cardio feito' });
    expect(aneisDoDia({ ...base, treino: tr({ treino: true, cardio: true }) }).externo).toMatchObject({ fracao: 1, fechado: true, texto: '2/2' });
  });

  it('Dieta: sim 100%, em parte 50%, não 0%; sem resposta mostra traço', () => {
    const base = { comTreino: true, comDieta: true, metaAgua: 3 };
    expect(aneisDoDia({ ...base, reg: reg({ dieta_seguida: 'sim' }) }).meio).toMatchObject({ chave: 'dieta', fracao: 1, fechado: true, texto: 'Sim' });
    expect(aneisDoDia({ ...base, reg: reg({ dieta_seguida: 'parcial' }) }).meio).toMatchObject({ fracao: 0.5, fechado: false, texto: 'Em parte' });
    expect(aneisDoDia({ ...base, reg: reg({ dieta_seguida: 'nao' }) }).meio).toMatchObject({ fracao: 0, fechado: false, anotado: true, texto: 'Não' });
    expect(aneisDoDia({ ...base }).meio).toMatchObject({ fracao: 0, anotado: false, texto: '—' });
  });

  it('Água: fração da meta, o número pode passar dela; fecha ao bater a meta', () => {
    const base = { comTreino: false, comDieta: false, metaAgua: 3.1 };
    expect(aneisDoDia({ ...base, reg: reg({ agua_l: 2 }) }).interno).toMatchObject({ chave: 'agua', fechado: false, texto: '2,0/3,1 L' });
    expect(aneisDoDia({ ...base, reg: reg({ agua_l: 2 }) }).interno.fracao).toBeCloseTo(2 / 3.1);
    const mais = aneisDoDia({ ...base, reg: reg({ agua_l: 4 }) }).interno;
    expect(mais.fracao).toBeGreaterThan(1);
    expect(mais).toMatchObject({ fechado: true, texto: '4,0/3,1 L' });
    expect(aneisDoDia({ ...base, reg: reg({ agua_l: 3.1 }) }).interno.fechado).toBe(true);
    expect(aneisDoDia({ ...base }).interno).toMatchObject({ fracao: 0, anotado: false, texto: '—/3,1 L' });
  });

  it('sem Treino: o anel de fora é o Diário (peso, náusea, água, sono e plano)', () => {
    const a = aneisDoDia({ comTreino: false, comDieta: true, metaAgua: 2, reg: reg({ nausea: 0, agua_l: 1, dieta_seguida: 'sim' }), pesoMedicao: 90 });
    expect(a.externo).toMatchObject({ chave: 'diario', rotulo: 'Diário', texto: '4/5', fechado: false });
    expect(a.externo.fracao).toBeCloseTo(0.8);
    const cheio = aneisDoDia({ comTreino: false, comDieta: false, metaAgua: 2, reg: reg({ peso_kg: 90, nausea: 0, agua_l: 1, sono_h: 7 }) });
    expect(cheio.externo).toMatchObject({ texto: '4/4', fechado: true });
  });

  it('sem plano de dieta: o anel do meio é o checklist (o de hoje quando informado)', () => {
    const hoje = aneisDoDia({ comTreino: true, comDieta: false, metaAgua: 3, checklist: { feitas: 2, total: 8 } });
    expect(hoje.meio).toMatchObject({ chave: 'checklist', rotulo: 'Checklist', texto: '2/8', fracao: 0.25, fechado: false });
    // Sem o checklist de hoje: Diário + treino e cardio
    const dia = aneisDoDia({ comTreino: true, comDieta: false, metaAgua: 3, treino: tr({ treino: true, cardio: true }), reg: reg({ peso_kg: 90, nausea: 0, agua_l: 1, sono_h: 7 }) });
    expect(dia.meio).toMatchObject({ texto: '6/6', fechado: true });
    expect(aneisDoDia({ comTreino: false, comDieta: false, metaAgua: 3, checklist: { feitas: 0, total: 0 } }).meio.fechado).toBe(false);
  });

  it('conta os anéis fechados', () => {
    const a = aneisDoDia({ comTreino: true, comDieta: true, metaAgua: 2, treino: tr({ treino: true, cardio: true }), reg: reg({ dieta_seguida: 'sim', agua_l: 2.5 }) });
    expect(anelFechados(a)).toBe(3);
    expect(anelFechados(aneisDoDia({ comTreino: true, comDieta: true, metaAgua: 2 }))).toBe(0);
  });
});

describe('historicoAneis', () => {
  const base = (o: Partial<EntradaHistorico> = {}): EntradaHistorico => ({
    inicio: '2026-10-21', // quarta
    hoje: '2026-11-03', // terça
    diario: [],
    treinos: [],
    medidas: [],
    comTreino: true,
    comDieta: true,
    metaAgua: () => 3,
    ...o,
  });

  it('semanas de segunda a domingo, a mais recente primeiro; antes do início e depois de hoje ficam de fora', () => {
    const s = historicoAneis(base());
    expect(s.map((x) => x.segunda)).toEqual(['2026-11-02', '2026-10-26', '2026-10-19']);
    expect(s.every((x) => x.dias.length === 7)).toBe(true);
    // Semana atual: seg e ter dentro, quarta em diante fora
    expect(s[0].dias.map((d) => d.fora)).toEqual([false, false, true, true, true, true, true]);
    expect(s[0].dias[1]).toMatchObject({ data: '2026-11-03', hoje: true });
    expect(s[0].dias[2].aneis).toBeNull();
    // Primeira semana: seg e ter antes do início
    expect(s[2].dias.map((d) => d.fora)).toEqual([true, true, false, false, false, false, false]);
    expect(s[2].dias[0].aneis).toBeNull();
  });

  it('antes do início do ciclo não há histórico', () => {
    expect(historicoAneis(base({ inicio: '2026-11-05' }))).toEqual([]);
    expect(diasNoCiclo('2026-11-05', '2026-11-03')).toBe(0);
    expect(diasNoCiclo('2026-10-21', '2026-11-03')).toBe(14);
  });

  it('usa o registro, o treino, a medição e a meta de água de cada dia', () => {
    const s = historicoAneis(
      base({
        diario: [reg({ data: '2026-10-28', dieta_seguida: 'sim', agua_l: 3.5 }), reg({ data: '2026-10-29', dieta_seguida: 'parcial', agua_l: 2.4 })],
        treinos: [tr({ data: '2026-10-28', treino: true, cardio: true }), tr({ data: '2026-10-29', treino: true })],
        metaAgua: (d) => (d === '2026-10-29' ? 2.4 : 3.4),
      }),
    );
    const qua = s[1].dias[2];
    const qui = s[1].dias[3];
    expect(qua.data).toBe('2026-10-28');
    expect(anelFechados(qua.aneis!)).toBe(3);
    expect(qui.aneis!.externo.fracao).toBe(0.5);
    expect(qui.aneis!.meio.fracao).toBe(0.5);
    expect(qui.aneis!.interno.fechado).toBe(true);
    const r = resumoHistorico(s);
    expect(r).toEqual({ dias: 14, completos: 1, porAnel: { externo: 1, meio: 1, interno: 2 } });
  });

  it('conta sem Treino: Diário no lugar do treino; o checklist de hoje vale só para hoje', () => {
    const s = historicoAneis(
      base({
        comTreino: false,
        comDieta: false,
        diario: [reg({ data: '2026-11-02', nausea: 0, agua_l: 3, sono_h: 7 })],
        medidas: [{ data: '2026-11-02', peso_kg: 91 }],
        checklistHoje: { feitas: 1, total: 5 },
      }),
    );
    const seg = s[0].dias[0];
    expect(seg.aneis!.externo).toMatchObject({ chave: 'diario', texto: '4/4', fechado: true });
    expect(seg.aneis!.meio).toMatchObject({ chave: 'checklist', texto: '4/4' });
    expect(s[0].dias[1].aneis!.meio).toMatchObject({ texto: '1/5' });
  });
});
