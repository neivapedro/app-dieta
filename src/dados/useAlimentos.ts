import { useCallback, useEffect, useState } from 'react';
import { lerAlimentos, type Alimento, type LinhaAlimento } from '../lib/dieta';

export interface BancoAlimentos {
  lista: Alimento[];
  mapa: Map<string, Alimento>;
}

let cache: Promise<BancoAlimentos> | null = null;

/** O banco (~650 alimentos) é baixado só quando a aba Dieta abre. */
function carregar(): Promise<BancoAlimentos> {
  cache ??= import('./alimentos.json')
    .then((m) => {
      const lista = lerAlimentos(m.default as LinhaAlimento[]);
      return { lista, mapa: new Map(lista.map((a) => [a.id, a])) };
    })
    .catch((e) => {
      // Falhou (sem sinal ou versão nova publicada): a próxima tentativa baixa de novo
      cache = null;
      throw e;
    });
  return cache;
}

export function useAlimentos(): { banco: BancoAlimentos | null; falhou: boolean; tentarDeNovo: () => void } {
  const [banco, setBanco] = useState<BancoAlimentos | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    setFalhou(false);
    carregar()
      .then((b) => vivo && setBanco(b))
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
    };
  }, [tentativa]);
  const tentarDeNovo = useCallback(() => setTentativa((t) => t + 1), []);
  return { banco, falhou, tentarDeNovo };
}
