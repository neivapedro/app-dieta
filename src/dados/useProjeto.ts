import { useMemo } from 'react';
import { decisaoPosRemedio, fasePos } from '../lib/projeto';
import { periodoProjeto } from '../lib/treino';
import { useDados } from './contexto';
import { useCalculos } from './useCalculos';

/**
 * Situação do projeto para qualquer conta (com ou sem Treino): período do
 * remédio, se o ciclo acabou e a fase pós-remédio, quando o usuário a iniciou.
 */
export function useProjeto() {
  const { ciclo, aplicacoes } = useDados();
  const { resumo, hoje } = useCalculos();
  return useMemo(() => {
    if (!ciclo || !resumo) return null;
    const decisao = decisaoPosRemedio(ciclo, aplicacoes.filter((a) => a.ciclo_id === ciclo.id));
    const pos = decisao ? fasePos(decisao.bloco_inicio!, hoje) : null;
    const periodo = periodoProjeto(ciclo, resumo, pos?.inicio);
    // Fim do remédio: frasco acabou, plano concluído (só sobra) ou fase pós-remédio iniciada
    const concluido = !resumo.proxima || resumo.degrau.estado === 'fim_plano' || !!pos;
    const ultimaDose = resumo.linhas.at(-1)?.aplicacao.data ?? null;
    return { periodo, pos, decisao, concluido, ultimaDose };
  }, [ciclo, aplicacoes, resumo, hoje]);
}
