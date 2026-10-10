import { describe, expect, it } from 'vitest';
import type { Ciclo } from '../lib/tipos';
import { aplicarFila, enfileirar, type ItemFila } from './fila';

const t = (data: string, treino: boolean, cardio: boolean) => ({ data, treino, cardio, corrida_km: null, corrida_seg: null });

describe('Fila de gravação', () => {
  it('a operação mais nova do mesmo dia substitui a anterior', () => {
    let f: ItemFila[] = [];
    f = enfileirar(f, { tipo: 'treino', dado: t('2026-10-15', true, false) }, 1);
    f = enfileirar(f, { tipo: 'treino', dado: t('2026-10-15', true, true) }, 2);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ versao: 2, dado: { treino: true, cardio: true } });
  });

  it('aplica na tela o que ainda não foi enviado, por cima do servidor', () => {
    const servidor = { treinos: [{ id: 'a', ...t('2026-10-15', false, false) }], diario: [], dieta: null, outro: 1 };
    const f = enfileirar([], { tipo: 'treino', dado: t('2026-10-15', true, false) }, 1);
    const d = aplicarFila(servidor, f);
    expect(d.treinos).toEqual([{ id: 'a', ...t('2026-10-15', true, false) }]);
    expect(d.outro).toBe(1);
  });
});

describe('Fila: aplicação e medição', () => {
  it('nova aplicação aparece na hora e reenviar não duplica (mesmo id)', () => {
    const base = { treinos: [], diario: [], dieta: null, aplicacoes: [], medidas: [] };
    const ap = { id: 'x1', ciclo_id: 'c', data: '2026-10-15', dose_mg: 1.5, local: null, observacoes: null };
    let f = enfileirar([], { tipo: 'aplicacao', dado: ap }, 1);
    f = enfileirar(f, { tipo: 'aplicacao', dado: { ...ap, dose_mg: 1.25 } }, 2);
    expect(f).toHaveLength(1);
    const d = aplicarFila(base, f);
    expect(d.aplicacoes).toEqual([{ ...ap, dose_mg: 1.25 }]);
    expect(aplicarFila({ ...d }, f).aplicacoes).toHaveLength(1);
  });
});

describe('Fila: exclusão', () => {
  it('excluir substitui a edição pendente do mesmo registro e some da tela', () => {
    const reg = { data: '2026-10-17', peso_kg: 89.5, nausea: 1, observacoes: null };
    let f = enfileirar([], { tipo: 'diario', dado: reg }, 1);
    f = enfileirar(f, { tipo: 'excluir', dado: { alvo: 'diario', id: 'pendente:2026-10-17', data: '2026-10-17' } }, 2);
    expect(f).toHaveLength(1);
    expect(f[0].tipo).toBe('excluir');
    const base = { treinos: [], diario: [{ id: 'r1', ...reg }], dieta: null };
    expect(aplicarFila(base, f).diario).toEqual([]);
  });
  it('excluir aplicação pela fila', () => {
    const ap = { id: 'x1', ciclo_id: 'c', data: '2026-10-15', dose_mg: 1.5, local: null, observacoes: null };
    let f = enfileirar([], { tipo: 'aplicacao', dado: ap }, 1);
    f = enfileirar(f, { tipo: 'excluir', dado: { alvo: 'aplicacao', id: 'x1', data: ap.data } }, 2);
    expect(f).toHaveLength(1);
    expect(aplicarFila({ treinos: [], diario: [], dieta: null, aplicacoes: [ap], medidas: [] }, f).aplicacoes).toEqual([]);
  });
});

describe('Fila: decisões do fim de fase', () => {
  it('a decisão aparece no ciclo na hora; a mais nova substitui a anterior', () => {
    const fases = [{ nome: 'A', semanas: 4, dose_mg: 1.25, objetivo: '' }];
    const ciclo: Ciclo = { id: 'c', nome: 'x', data_inicio: '2026-10-08', quantidade_total_mg: 60, concentracao_mg_ml: 20, intervalo_dias: 7, passo_ui: 0.25, fases };
    const base = { treinos: [], diario: [], dieta: null, ciclo };
    const d1 = { id: 'd1', data: '2026-11-01', apos_aplicacao: 4, dose_mg: 1.25, fase_indice: 1, escolha: 'subir' as const };
    let f = enfileirar([], { tipo: 'decisoes', dado: { ciclo_id: 'c', decisoes: [d1], fases } }, 1);
    const fases2 = [{ ...fases[0], semanas: 5 }];
    f = enfileirar(f, { tipo: 'decisoes', dado: { ciclo_id: 'c', decisoes: [], fases: fases2 } }, 2);
    expect(f).toHaveLength(1);
    const d = aplicarFila(base, f);
    expect(d.ciclo!.decisoes).toEqual([]);
    expect(d.ciclo!.fases[0].semanas).toBe(5);
    // Outro ciclo não é tocado
    expect(aplicarFila({ ...base, ciclo: { ...ciclo, id: 'outro' } }, f).ciclo!.fases[0].semanas).toBe(4);
  });
});

describe('Fila: registro de decisões', () => {
  it('a linha aparece na hora, o motivo editado substitui e a exclusão some com ela', () => {
    const base = { treinos: [], diario: [], dieta: null, registroDecisoes: [] };
    const r = { id: 'r1', data: '2026-10-12', tipo: 'dieta' as const, campo: 'Fator de atividade', de: '1,2', para: '1,3', motivo: null, ref: null };
    let f = enfileirar([], { tipo: 'registro_decisao', dado: r }, 1);
    f = enfileirar(f, { tipo: 'registro_decisao', dado: { ...r, motivo: 'mudei de emprego' } }, 2);
    expect(f).toHaveLength(1);
    expect(aplicarFila(base, f).registroDecisoes).toEqual([{ ...r, motivo: 'mudei de emprego' }]);
    f = enfileirar(f, { tipo: 'excluir', dado: { alvo: 'registro_decisao', id: 'r1', data: r.data } }, 3);
    expect(f).toHaveLength(1);
    expect(aplicarFila({ ...base, registroDecisoes: [r] }, f).registroDecisoes).toEqual([]);
  });

  it('dados sem o registro (cópia antiga) não ganham o campo', () => {
    const r = { id: 'r1', data: '2026-10-12', tipo: 'nota' as const, campo: 'meta mantida', de: null, para: null };
    const d = aplicarFila({ treinos: [], diario: [], dieta: null }, enfileirar([], { tipo: 'registro_decisao', dado: r }, 1));
    expect('registroDecisoes' in d).toBe(false);
  });
});
