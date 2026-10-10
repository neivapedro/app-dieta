import { useCallback, useMemo } from 'react';
import { metaAgua } from '../lib/bemestar';
import { calcularPlacar, horasExercicioDia, listarCorridas, medidaInicial, periodoProjeto, resumoEsforco, semanasDoProjeto } from '../lib/treino';
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
    const inicial = medidaInicial(composicoes.filter((c) => !c.atipica), inicio);
    // Projeto encerrado: o resultado é a última medição até o fim, não uma posterior
    // Medição atípica fica só no histórico: não vira o "agora"
    const normais = composicoes.filter((c) => !c.atipica);
    const ate = placar.encerrado ? normais.filter((c) => c.data <= fim) : normais;
    const atual = ate.length ? ate[ate.length - 1] : null;
    const doDia = (data: string) => treinos.find((t) => t.data === data);
    const esforco = resumoEsforco(treinos, hoje);
    return { inicio, fim, placar, semanas, corridas, inicial, atual, composicoes, metas: perfil.metas_projeto ?? null, doDia, hoje, esforco };
  }, [perfil, ciclo, resumo, treinos, composicoes, hoje]);
}

/**
 * Meta de água de uma data: 2,0 L + 0,7 L por hora de treino e cardio do dia
 * (conta sem a aba Treino: só os 2,0 L).
 */
export function useMetaAgua() {
  const { perfil, treinos, hoje } = useDados();
  const t = useTreino();
  const comTreino = !!perfil?.modulo_treino;
  // O treino de hoje ainda não marcado só conta como previsto dentro do período do projeto
  const inicio = t?.inicio ?? null;
  const fim = t?.fim ?? null;
  return useCallback(
    (data: string) => {
      const noProjeto = inicio !== null && fim !== null && data >= inicio && data <= fim;
      const horas = comTreino ? horasExercicioDia(data, treinos.find((x) => x.data === data), noProjeto ? hoje : null) : 0;
      return { meta: metaAgua(horas), horas };
    },
    [comTreino, treinos, hoje, inicio, fim],
  );
}
