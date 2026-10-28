import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import { CHAVE_COR, CORES_APP, COR_PADRAO, aplicarCorDoApp, escolherCorDoApp, lerCorDoApp } from './cor-app';

function memoria(inicial: Record<string, string> = {}) {
  const d = { ...inicial };
  return {
    d,
    getItem: (k: string) => (k in d ? d[k] : null),
    setItem: (k: string, v: string) => void (d[k] = v),
    removeItem: (k: string) => void delete d[k],
  };
}

describe('cor do app', () => {
  it('lê a cor guardada e cai na padrão com valor estranho, vazio ou armazenamento quebrado', () => {
    expect(lerCorDoApp(memoria({ [CHAVE_COR]: 'azul' }))).toBe('azul');
    expect(lerCorDoApp(memoria({ [CHAVE_COR]: 'rosa-choque' }))).toBe(COR_PADRAO);
    expect(lerCorDoApp(memoria())).toBe(COR_PADRAO);
    expect(lerCorDoApp(null)).toBe(COR_PADRAO);
    const quebrado = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {}, removeItem: () => {} };
    expect(lerCorDoApp(quebrado)).toBe(COR_PADRAO);
  });

  it('aplica no atributo data-cor (a padrão tira o atributo) e guarda só as não padrão', () => {
    const raiz = { dataset: {} as DOMStringMap };
    const arm = memoria();
    escolherCorDoApp('verde', arm, raiz);
    expect(raiz.dataset.cor).toBe('verde');
    expect(arm.d[CHAVE_COR]).toBe('verde');
    escolherCorDoApp(COR_PADRAO, arm, raiz);
    expect(raiz.dataset.cor).toBeUndefined();
    expect(arm.d[CHAVE_COR]).toBeUndefined();
    aplicarCorDoApp('grafite', raiz);
    expect(raiz.dataset.cor).toBe('grafite');
  });

  it('não quebra quando o armazenamento recusa gravar', () => {
    const raiz = { dataset: {} as DOMStringMap };
    const cheio = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
    expect(() => escolherCorDoApp('laranja', cheio, raiz)).not.toThrow();
    expect(raiz.dataset.cor).toBe('laranja');
  });

  it('o index.html aplica a mesma chave e as mesmas cores antes da primeira pintura', () => {
    expect(html).toContain(CHAVE_COR);
    for (const c of CORES_APP) if (c.id !== COR_PADRAO) expect(html).toContain(c.id);
  });
});
