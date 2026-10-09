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
