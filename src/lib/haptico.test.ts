import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirVibracao, ESPACO_SUCESSO_MS, reiniciarHaptico, vibracaoLigada, vibrarLeve, vibrarSucesso } from './haptico';

/** DOM mínimo: elementos com atributos, estilo, filhos e click() que alterna o switch pelo label */
function domFalso() {
  const cliques: string[] = [];
  let ativo: unknown = null;
  const criar = (tag: string) => {
    const el: Record<string, unknown> & { filhos: unknown[]; atributos: Record<string, string> } = {
      tagName: tag.toUpperCase(),
      filhos: [],
      atributos: {},
      style: { cssText: '' },
      isConnected: false,
      checked: false,
      ouvintes: [] as ((e: unknown) => void)[],
      setAttribute(k: string, v: string) {
        this.atributos[k] = v;
      },
      appendChild(f: Record<string, unknown>) {
        this.filhos.push(f);
      },
      addEventListener(_t: string, f: (e: unknown) => void) {
        (this.ouvintes as ((e: unknown) => void)[]).push(f);
      },
      click() {
        cliques.push(tag);
        (this.ouvintes as ((e: unknown) => void)[]).forEach((f) => f({ stopPropagation() {} }));
        const input = this.filhos[0] as { checked: boolean } | undefined;
        if (input) input.checked = !input.checked;
      },
      focus: vi.fn(),
    };
    return el;
  };
  const body = {
    filhos: [] as Record<string, unknown>[],
    appendChild(f: Record<string, unknown>) {
      f.isConnected = true;
      this.filhos.push(f);
    },
  };
  const documento = {
    body,
    createElement: criar,
    get activeElement() {
      return ativo;
    },
    set activeElement(v) {
      ativo = v;
    },
  };
  return { documento, body, cliques };
}

function armazenamento() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('haptico', () => {
  let agora = 1000;
  beforeEach(() => {
    reiniciarHaptico();
    agora += 1000;
    vi.stubGlobal('performance', { now: () => agora });
    vi.stubGlobal('localStorage', armazenamento());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('Android: usa navigator.vibrate', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { userAgent: 'Android', vibrate });
    vibrarLeve();
    expect(vibrate).toHaveBeenCalledWith(10);
    agora += 100;
    vibrarSucesso();
    expect(vibrate).toHaveBeenLastCalledWith([12, ESPACO_SUCESSO_MS, 12]);
  });

  it('iPhone: um label + switch escondido, criado uma vez, alternado pelo clique', () => {
    const { documento, body, cliques } = domFalso();
    vi.stubGlobal('navigator', { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 });
    vi.stubGlobal('document', documento);
    vibrarLeve();
    agora += 100;
    vibrarLeve();
    expect(body.filhos).toHaveLength(1);
    const label = body.filhos[0] as { tagName: string; atributos: Record<string, string>; style: { cssText: string }; filhos: { type: string; atributos: Record<string, string>; checked: boolean }[] };
    expect(label.tagName).toBe('LABEL');
    expect(label.atributos['aria-hidden']).toBe('true');
    // Fora da tela, mas não display:none (senão não há tique)
    expect(label.style.cssText).toContain('left:-9999px');
    expect(label.style.cssText).not.toContain('display:none');
    const input = label.filhos[0];
    expect(input.type).toBe('checkbox');
    expect(input.atributos.switch).toBe('');
    expect(cliques).toEqual(['label', 'label']);
    expect(input.checked).toBe(false);
  });

  it('iPadOS (se apresenta como Mac com toque) também usa o switch', () => {
    const { documento, cliques } = domFalso();
    vi.stubGlobal('navigator', { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 });
    vi.stubGlobal('document', documento);
    vibrarLeve();
    expect(cliques).toEqual(['label']);
  });

  it('sucesso no iPhone: dois tiques espaçados', () => {
    vi.useFakeTimers();
    const { documento, cliques } = domFalso();
    vi.stubGlobal('navigator', { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 });
    vi.stubGlobal('document', documento);
    vibrarSucesso();
    expect(cliques).toHaveLength(1);
    vi.advanceTimersByTime(ESPACO_SUCESSO_MS);
    expect(cliques).toHaveLength(2);
  });

  it('dois chamados no mesmo toque viram um tique só', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { userAgent: 'Android', vibrate });
    vibrarLeve();
    agora += 5;
    vibrarLeve();
    expect(vibrate).toHaveBeenCalledTimes(1);
    agora += 100;
    vibrarLeve();
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('sem suporte (computador sem vibração): não faz nada e não cria nada', () => {
    const { documento, body } = domFalso();
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64', maxTouchPoints: 0 });
    vi.stubGlobal('document', documento);
    expect(() => vibrarLeve()).not.toThrow();
    expect(() => vibrarSucesso()).not.toThrow();
    expect(body.filhos).toHaveLength(0);
  });

  it('nunca lança erro, mesmo com a API quebrada ou sem document', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Android',
      vibrate: () => {
        throw new Error('bloqueado');
      },
    });
    expect(() => vibrarLeve()).not.toThrow();
    vi.stubGlobal('navigator', { userAgent: IPHONE });
    vi.stubGlobal('document', undefined);
    agora += 100;
    expect(() => vibrarLeve()).not.toThrow();
    vi.stubGlobal('navigator', undefined);
    agora += 100;
    expect(() => vibrarSucesso()).not.toThrow();
  });

  it('desligada pelo localStorage (vibracao=desligada): nada vibra', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { userAgent: 'Android', vibrate });
    expect(vibracaoLigada()).toBe(true);
    definirVibracao(false);
    expect(localStorage.getItem('vibracao')).toBe('desligada');
    expect(vibracaoLigada()).toBe(false);
    vibrarLeve();
    vibrarSucesso();
    expect(vibrate).not.toHaveBeenCalled();
    definirVibracao(true);
    expect(localStorage.getItem('vibracao')).toBeNull();
    vibrarLeve();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('localStorage indisponível: vibração segue ligada', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('privado');
      },
      setItem: () => {
        throw new Error('privado');
      },
    });
    expect(vibracaoLigada()).toBe(true);
    expect(() => definirVibracao(false)).not.toThrow();
  });
});
