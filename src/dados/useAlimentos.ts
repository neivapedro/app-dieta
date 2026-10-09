import { useEffect, useState } from 'react';
import { lerAlimentos, type Alimento, type LinhaAlimento } from '../lib/dieta';

export interface BancoAlimentos {
  lista: Alimento[];
  mapa: Map<string, Alimento>;
}

let cache: Promise<BancoAlimentos> | null = null;

/** O banco (~640 alimentos) é baixado só quando a aba Dieta abre. */
function carregar(): Promise<BancoAlimentos> {
  cache ??= import('./alimentos.json').then((m) => {
    const lista = lerAlimentos(m.default as LinhaAlimento[]);
    return { lista, mapa: new Map(lista.map((a) => [a.id, a])) };
  });
  return cache;
}

export function useAlimentos(): BancoAlimentos | null {
  const [banco, setBanco] = useState<BancoAlimentos | null>(null);
  useEffect(() => {
    let vivo = true;
    carregar().then((b) => vivo && setBanco(b));
    return () => {
      vivo = false;
    };
  }, []);
  return banco;
}
