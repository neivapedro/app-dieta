import { describe, expect, it, vi } from 'vitest';
import { aplicarBadge, pendentesHoje, temBadge, type EntradaBadge } from './badge-hoje';
import type { RegistroDiario } from './tipos';

// 2026-11-02 é segunda-feira; 2026-11-04, quarta
const reg = (r: Partial<RegistroDiario>): RegistroDiario => ({ id: 'r', data: '2026-11-04', peso_kg: null, nausea: null, observacoes: null, ...r });
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

describe('pendentesHoje: só o importante', () => {
  // Quem já usa o Diário: registro de anteontem (02/11) e de ontem (03/11)
  const usando = [reg({ data: '2026-11-02', peso_kg: 90 }), reg({ data: '2026-11-03', sono_h: 7 })];

  it('dia comum com ontem registrado: nada, mesmo com os hábitos de hoje em branco', () => {
    expect(pendentesHoje(base({ diario: usando }))).toBe(0);
    expect(pendentesHoje(base({ diario: usando, comTreino: true, comDieta: true }))).toBe(0);
  });

  it('dose devida hoje (ou atrasada) e não registrada conta; registrada hoje, pós-remédio ou sem resumo não', () => {
    expect(pendentesHoje(base({ diario: usando, proxima: { situacao: 'hoje' } }))).toBe(1);
    expect(pendentesHoje(base({ diario: usando, proxima: { situacao: 'atrasada' } }))).toBe(1);
    expect(pendentesHoje(base({ diario: usando, proxima: { situacao: 'hoje' }, ultimaDose: '2026-11-04' }))).toBe(0);
    expect(pendentesHoje(base({ diario: usando, proxima: { situacao: 'atrasada' }, posRemedio: true }))).toBe(0);
    expect(pendentesHoje(base({ diario: usando, proxima: { situacao: 'hoje' }, temResumo: false }))).toBe(0);
  });

  it('segunda: medição pendente conta para quem já mede; feita (ou sem histórico) não', () => {
    const seg = base({ hoje: '2026-11-02', diario: [reg({ data: '2026-10-30', peso_kg: 91 }), reg({ data: '2026-11-01', sono_h: 7 })], medidas: [{ data: '2026-10-26', peso_kg: 91 }] });
    expect(pendentesHoje(seg)).toBe(1);
    expect(pendentesHoje({ ...seg, medidas: [...seg.medidas, { data: '2026-11-02', peso_kg: 90 }] })).toBe(0);
    expect(pendentesHoje({ ...seg, medidas: [] })).toBe(0);
  });

  it('ontem sem nenhum registro conta (só para quem já usa o Diário)', () => {
    expect(pendentesHoje(base({ diario: [reg({ data: '2026-11-01', peso_kg: 90 })] }))).toBe(1);
    // Registro vazio de ontem não vale; um campo qualquer ou a pesagem da medição vale
    expect(pendentesHoje(base({ diario: [reg({ data: '2026-11-01', peso_kg: 90 }), reg({ data: '2026-11-03' })] }))).toBe(1);
    expect(pendentesHoje(base({ diario: [reg({ data: '2026-11-01', peso_kg: 90 }), reg({ data: '2026-11-03', dieta_seguida: 'nao' })] }))).toBe(0);
    expect(pendentesHoje(base({ diario: [reg({ data: '2026-11-01', peso_kg: 90 })], medidas: [{ data: '2026-11-03', peso_kg: 90 }] }))).toBe(0);
    // Conta nova (ainda sem Diário antes de ontem): nada
    expect(pendentesHoje(base())).toBe(0);
  });

  it('soma: dose atrasada + ontem em branco', () => {
    expect(pendentesHoje(base({ diario: [reg({ data: '2026-11-01', peso_kg: 90 })], proxima: { situacao: 'atrasada' } }))).toBe(2);
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
