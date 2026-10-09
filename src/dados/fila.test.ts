import { describe, expect, it } from 'vitest';
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
