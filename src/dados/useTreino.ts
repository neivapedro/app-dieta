import { useMemo } from 'react';
import { calcularPlacar, listarCorridas, medidaInicial, periodoProjeto, semanasDoProjeto } from '../lib/treino';
import { useDados } from './contexto';
import { useCalculos } from './useCalculos';

/** Cálculos da aba Treino; null quando a aba não está liberada para a conta. */
export function useTreino() {
  const { perfil, ciclo, treinos } = useDados();
  const { hoje, resumo, composicoes } = useCalculos();
  return useMemo(() => {
    if (!perfil?.modulo_treino || !ciclo || !resumo) return null;
    const { inicio, fim } = periodoProjeto(ciclo, resumo);
    const placar = calcularPlacar(treinos, inicio, fim, hoje);
    const semanas = semanasDoProjeto(treinos, inicio, fim, hoje, composicoes);
    const corridas = listarCorridas(treinos);
    const inicial = medidaInicial(composicoes, inicio);
    const atual = composicoes.length ? composicoes[composicoes.length - 1] : null;
    const doDia = (data: string) => treinos.find((t) => t.data === data);
    return { inicio, fim, placar, semanas, corridas, inicial, atual, metas: perfil.metas_projeto ?? null, doDia, hoje };
  }, [perfil, ciclo, resumo, treinos, composicoes, hoje]);
}
