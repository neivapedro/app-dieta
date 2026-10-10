import { useCallback, useMemo } from 'react';
import { metaAgua } from '../lib/bemestar';
import { periodoTreinoPos } from '../lib/projeto';
import { calcularPlacar, horasExercicioDia, listarCorridas, medidaInicial, resumoEsforco, semanasDoProjeto } from '../lib/treino';
import { useDados } from './contexto';
import { useCalculos } from './useCalculos';
import { useProjeto } from './useProjeto';

/**
 * Cálculos da aba Treino; null quando a aba não está liberada para a conta.
 * Na fase pós-remédio (depois dos 7 dias seguintes à última dose), o placar,
 * as semanas e o check do dia são os da fase nova; `projeto` guarda o placar
 * do período do remédio (para o balanço).
 */
export function useTreino() {
  const { perfil, treinos } = useDados();
  const { hoje, composicoes } = useCalculos();
  const proj = useProjeto();
  return useMemo(() => {
    if (!perfil?.modulo_treino || !proj) return null;
    const periodoProj = proj.periodo;
    const placarProjeto = calcularPlacar(treinos, periodoProj.inicio, periodoProj.fim, hoje);
    const pos = proj.pos;
    // Até 7 dias depois da última dose o check do dia ainda conta no placar do projeto
    const placarPos = !!pos && hoje > periodoProj.fim;
    const { inicio, fim } = placarPos ? periodoTreinoPos(pos!.inicio, periodoProj.fim, proj.decisao?.data) : periodoProj;
    const placar = placarPos ? calcularPlacar(treinos, inicio, fim, hoje) : placarProjeto;
    const semanas = semanasDoProjeto(treinos, inicio, fim, hoje, composicoes);
    const corridas = listarCorridas(treinos);
    const inicial = medidaInicial(composicoes.filter((c) => !c.atipica), periodoProj.inicio);
    // Projeto encerrado: o resultado é a última medição até o fim, não uma posterior
    // Medição atípica fica só no histórico: não vira o "agora"
    const normais = composicoes.filter((c) => !c.atipica);
    const ate = placarProjeto.encerrado ? normais.filter((c) => c.data <= periodoProj.fim) : normais;
    const atual = ate.length ? ate[ate.length - 1] : null;
    const doDia = (data: string) => treinos.find((t) => t.data === data);
    const esforco = resumoEsforco(treinos, hoje);
    return {
      inicio,
      fim,
      placar,
      semanas,
      corridas,
      inicial,
      atual,
      composicoes,
      metas: perfil.metas_projeto ?? null,
      doDia,
      hoje,
      esforco,
      projeto: { inicio: periodoProj.inicio, fim: periodoProj.fim, placar: placarProjeto },
      pos,
      /** O placar, as semanas e o check do dia são os da fase pós-remédio */
      placarPos,
    };
  }, [perfil, proj, treinos, composicoes, hoje]);
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
