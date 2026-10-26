// Mira sincronizada: gráficos do mesmo grupo mostram a mesma data ao mesmo tempo
// (e dividem as margens dos eixos, para a mira cair na mesma vertical em todos).
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

type Medidas = number[];

interface Loja {
  ler: (id: string) => string | null;
  gravar: (id: string, data: string | null) => void;
  assinar: (fn: () => void) => () => void;
  /** maiores medidas do grupo, como texto estável ("40,12,0.6") */
  medidas: (grupo: string) => string;
  gravarMedidas: (grupo: string, quem: string, m: Medidas | null) => void;
}

function criarLoja(): Loja {
  const datas = new Map<string, string | null>();
  const grupos = new Map<string, Map<string, Medidas>>();
  const resumo = new Map<string, string>();
  const ouvintes = new Set<() => void>();
  const avisar = () => ouvintes.forEach((f) => f());
  const recalcular = (grupo: string) => {
    const g = grupos.get(grupo);
    let max: number[] = [];
    g?.forEach((m) => {
      max = m.map((v, i) => Math.max(v, max[i] ?? -Infinity));
    });
    const texto = max.join(',');
    if (resumo.get(grupo) === texto) return false;
    resumo.set(grupo, texto);
    return true;
  };
  return {
    ler: (id) => datas.get(id) ?? null,
    gravar: (id, data) => {
      if ((datas.get(id) ?? null) === data) return;
      datas.set(id, data);
      avisar();
    },
    assinar: (fn) => {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    medidas: (grupo) => resumo.get(grupo) ?? '',
    gravarMedidas: (grupo, quem, m) => {
      let g = grupos.get(grupo);
      if (!g) grupos.set(grupo, (g = new Map()));
      if (m) g.set(quem, m);
      else g.delete(quem);
      if (recalcular(grupo)) avisar();
    },
  };
}

// Sem provedor, os grupos ainda funcionam numa loja global
const lojaGlobal = criarLoja();
const ContextoSincronia = createContext<Loja>(lojaGlobal);

/** Envolve os gráficos que dividem a mira (prop `sincronia` com o mesmo id). */
export function ProvedorSincronia({ children }: { children: ReactNode }) {
  const [loja] = useState(criarLoja);
  return <ContextoSincronia.Provider value={loja}>{children}</ContextoSincronia.Provider>;
}

/** Data da mira do grupo `id` (sem id: estado só deste gráfico). */
export function useSincronia(id?: string): { data: string | null; setData: (d: string | null) => void } {
  const loja = useContext(ContextoSincronia);
  const [local, setLocal] = useState<string | null>(null);
  const assinar = useCallback((fn: () => void) => (id ? loja.assinar(fn) : () => {}), [loja, id]);
  const ler = useCallback(() => (id ? loja.ler(id) : null), [loja, id]);
  const doGrupo = useSyncExternalStore(assinar, ler, ler);
  const setData = useCallback((d: string | null) => (id ? loja.gravar(id, d) : setLocal(d)), [loja, id]);
  return { data: id ? doGrupo : local, setData };
}

/** Maior valor de cada medida entre os gráficos do grupo (sem grupo: as próprias). */
export function useMargemGrupo(grupo: string | undefined, proprias: Medidas | null): Medidas {
  const loja = useContext(ContextoSincronia);
  const quem = useId();
  const chave = proprias ? proprias.join(',') : '';
  useLayoutEffect(() => {
    if (!grupo) return;
    loja.gravarMedidas(grupo, quem, chave ? chave.split(',').map(Number) : null);
  }, [grupo, loja, quem, chave]);
  useEffect(() => () => {
    if (grupo) loja.gravarMedidas(grupo, quem, null);
  }, [grupo, loja, quem]);
  const assinar = useCallback((fn: () => void) => (grupo ? loja.assinar(fn) : () => {}), [loja, grupo]);
  const ler = useCallback(() => (grupo ? loja.medidas(grupo) : ''), [loja, grupo]);
  const doGrupo = useSyncExternalStore(assinar, ler, ler);
  const base = proprias ?? [0, 0, 0];
  if (!grupo || !doGrupo) return base;
  const g = doGrupo.split(',').map(Number);
  return base.map((v, i) => Math.max(v, g[i] ?? v));
}
