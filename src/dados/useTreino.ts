import { useMemo } from 'react';
import { periodoTreinoPos } from '../lib/projeto';
import { calcularPlacar, listarCorridas, medidaInicial, semanasDoProjeto } from '../lib/treino';
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
    const inicial = medidaInicial(composicoes, periodoProj.inicio);
    // Projeto encerrado: o resultado é a última medição até o fim, não uma posterior
    const ate = placarProjeto.encerrado ? composicoes.filter((c) => c.data <= periodoProj.fim) : composicoes;
    const atual = ate.length ? ate[ate.length - 1] : null;
    const doDia = (data: string) => treinos.find((t) => t.data === data);
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
      projeto: { inicio: periodoProj.inicio, fim: periodoProj.fim, placar: placarProjeto },
      pos,
      /** O placar, as semanas e o check do dia são os da fase pós-remédio */
      placarPos,
    };
  }, [perfil, proj, treinos, composicoes, hoje]);
}
