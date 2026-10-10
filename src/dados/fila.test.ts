import { describe, expect, it } from 'vitest';
import type { Medida } from '../lib/tipos';
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

  it('medição atípica passa pela fila com a marca', () => {
    const m = { id: 'm1', data: '2026-10-12', altura_cm: 181, pescoco_cm: 41, cintura_cm: 97, quadril_cm: null, peso_kg: 95, atipica: true };
    const d = aplicarFila({ treinos: [], diario: [], dieta: null, medidas: [] as Medida[] }, enfileirar([], { tipo: 'medida', dado: m }, 1));
    expect(d.medidas![0].atipica).toBe(true);
  });
});


describe('Fila: força', () => {
  it('registro de força aparece na hora, edição substitui e exclusão remove', () => {
    const base = { treinos: [], diario: [], dieta: null, forca: [] };
    const f1 = { id: 'f1', data: '2026-10-19', exercicio: 'Supino', carga_kg: 80, reps: 8, rir: 1 };
    let f = enfileirar([], { tipo: 'forca', dado: f1 }, 1);
    f = enfileirar(f, { tipo: 'forca', dado: { ...f1, carga_kg: 82.5 } }, 2);
    expect(f).toHaveLength(1);
    const d = aplicarFila(base, f);
    expect(d.forca).toEqual([{ ...f1, carga_kg: 82.5 }]);
    const ex = enfileirar(f, { tipo: 'excluir', dado: { alvo: 'forca', id: 'f1', data: f1.data } }, 3);
    expect(ex).toHaveLength(1);
    expect(aplicarFila({ ...base, forca: [f1] }, ex).forca).toEqual([]);
  });

  it('dado sem a lista de força (cópia antiga) não quebra', () => {
    const f = enfileirar([], { tipo: 'forca', dado: { id: 'f1', data: '2026-10-19', exercicio: 'Supino', carga_kg: 80, reps: 8, rir: null } }, 1);
    const d = aplicarFila({ treinos: [], diario: [], dieta: null }, f);
    expect('forca' in d).toBe(false);
  });
});
