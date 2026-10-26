import { describe, expect, it, vi } from 'vitest';
import { aplicarBadge, pendentesHoje, temBadge, type EntradaBadge } from './badge-hoje';
import type { RegistroDiario, TreinoDia } from './tipos';

// 2026-11-02 é segunda-feira; 2026-11-04, quarta
const reg = (r: Partial<RegistroDiario>): RegistroDiario => ({ id: 'r', data: '2026-11-04', peso_kg: null, nausea: null, observacoes: null, ...r });
const tr = (t: Partial<TreinoDia>): TreinoDia => ({ id: 't', data: '2026-11-04', treino: false, cardio: false, corrida_km: null, corrida_seg: null, ...t });
const base = (e: Partial<EntradaBadge> = {}): EntradaBadge => ({
  hoje: '2026-11-04',
  diario: [],
  medidas: [],
  comDieta: false,
  proxima: { situacao: 'futura' },
  ultimaDose: '2026-10-29',
  posRemedio: false,
  comTreino: false,
  temResumo: true,
  ...e,
});

describe('pendentesHoje', () => {
  it('conta sem Treino e sem dieta, nada anotado: peso, náusea, água e sono', () => {
    expect(pendentesHoje(base())).toBe(4);
  });

  it('dose devida hoje (ou atrasada) e não registrada entra; registrada hoje sai', () => {
    expect(pendentesHoje(base({ proxima: { situacao: 'hoje' } }))).toBe(5);
    expect(pendentesHoje(base({ proxima: { situacao: 'atrasada' } }))).toBe(5);
    expect(pendentesHoje(base({ proxima: { situacao: 'hoje' }, ultimaDose: '2026-11-04' }))).toBe(4);
    // Fase pós-remédio ou sem resumo: a dose não entra
    expect(pendentesHoje(base({ proxima: { situacao: 'atrasada' }, posRemedio: true }))).toBe(4);
    expect(pendentesHoje(base({ proxima: { situacao: 'hoje' }, temResumo: false }))).toBe(4);
  });

  it('com Treino: treino e cardio não marcados contam', () => {
    expect(pendentesHoje(base({ comTreino: true }))).toBe(6);
    expect(pendentesHoje(base({ comTreino: true, treinoDia: tr({ treino: true }) }))).toBe(5);
    expect(pendentesHoje(base({ comTreino: true, treinoDia: tr({ treino: true, cardio: true }) }))).toBe(4);
  });

  it('diário preenchido zera; dieta acrescenta "Segui o plano"', () => {
    const cheio = reg({ peso_kg: 90, nausea: 0, agua_l: 2, sono_h: 7 });
    expect(pendentesHoje(base({ diario: [cheio] }))).toBe(0);
    expect(pendentesHoje(base({ diario: [cheio], comDieta: true }))).toBe(1);
    expect(pendentesHoje(base({ diario: [{ ...cheio, dieta_seguida: 'sim' }], comDieta: true }))).toBe(0);
    // Registro de outro dia não conta
    expect(pendentesHoje(base({ diario: [{ ...cheio, data: '2026-11-03' }] }))).toBe(4);
  });

  it('medição de hoje vale como o peso; às segundas a medição entra para quem já mede', () => {
    expect(pendentesHoje(base({ medidas: [{ data: '2026-11-04', peso_kg: 90 }] }))).toBe(3);
    const seg = base({ hoje: '2026-11-02', medidas: [{ data: '2026-10-26', peso_kg: 91 }] });
    expect(pendentesHoje(seg)).toBe(5);
    expect(pendentesHoje({ ...seg, medidas: [...seg.medidas, { data: '2026-11-02', peso_kg: 90 }] })).toBe(3);
  });
});

describe('aplicarBadge', () => {
  it('sem suporte: não faz nada', async () => {
    expect(temBadge({})).toBe(false);
    expect(await aplicarBadge(3, {})).toBe(false);
    expect(await aplicarBadge(3, null)).toBe(false);
  });

  it('número > 0 põe o badge; 0 limpa', async () => {
    const nav = { setAppBadge: vi.fn(async () => undefined), clearAppBadge: vi.fn(async () => undefined) };
    expect(await aplicarBadge(3, nav)).toBe(true);
    expect(nav.setAppBadge).toHaveBeenCalledWith(3);
    await aplicarBadge(0, nav);
    expect(nav.clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it('sem clearAppBadge usa setAppBadge(0); falha (sem permissão) fica em silêncio', async () => {
    const so = { setAppBadge: vi.fn(async () => undefined) };
    await aplicarBadge(0, so);
    expect(so.setAppBadge).toHaveBeenCalledWith(0);
    const nega = { setAppBadge: vi.fn(() => Promise.reject(new Error('NotAllowedError'))) };
    expect(await aplicarBadge(2, nega)).toBe(false);
    const lanca = {
      setAppBadge: () => {
        throw new Error('x');
      },
    };
    expect(await aplicarBadge(2, lanca)).toBe(false);
  });
});
