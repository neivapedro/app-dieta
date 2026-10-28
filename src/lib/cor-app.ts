// Cor do app (Perfil → Aparência): troca os tokens da marca (--marca-a/-m/-b e --marca-forte)
// por um atributo no <html> (data-cor). Vale só neste aparelho (localStorage). O index.html
// aplica a cor guardada antes da primeira pintura, com a mesma chave e a mesma lista.

export const CORES_APP = [
  { id: 'roxo-rosa', nome: 'Roxo-rosa' },
  { id: 'azul', nome: 'Azul' },
  { id: 'verde', nome: 'Verde' },
  { id: 'laranja', nome: 'Laranja' },
  { id: 'grafite', nome: 'Grafite' },
] as const;

export type CorApp = (typeof CORES_APP)[number]['id'];

export const COR_PADRAO: CorApp = 'roxo-rosa';
export const CHAVE_COR = 'app-dieta:cor';

type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function armazenamento(): Armazenamento | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function ehCorApp(v: unknown): v is CorApp {
  return CORES_APP.some((c) => c.id === v);
}

/** Cor guardada neste aparelho; sem acesso ao armazenamento (ou valor estranho), a padrão. */
export function lerCorDoApp(arm: Armazenamento | null = armazenamento()): CorApp {
  try {
    const v = arm?.getItem(CHAVE_COR);
    return ehCorApp(v) ? v : COR_PADRAO;
  } catch {
    return COR_PADRAO;
  }
}

/** A padrão fica sem atributo (os tokens de :root valem). */
export function aplicarCorDoApp(cor: CorApp, raiz: { dataset: DOMStringMap } = document.documentElement): void {
  if (cor === COR_PADRAO) delete raiz.dataset.cor;
  else raiz.dataset.cor = cor;
}

/** Aplica já e guarda para a próxima abertura (falha ao guardar: vale só nesta sessão). */
export function escolherCorDoApp(cor: CorApp, arm: Armazenamento | null = armazenamento(), raiz?: { dataset: DOMStringMap }): void {
  aplicarCorDoApp(cor, raiz);
  try {
    if (cor === COR_PADRAO) arm?.removeItem(CHAVE_COR);
    else arm?.setItem(CHAVE_COR, cor);
  } catch {
    /* modo privado ou armazenamento cheio: a cor fica até fechar o app */
  }
}
