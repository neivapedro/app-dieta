import { useMemo } from 'react';
import { analisarFases, analisarGeral, serieDePeso } from '../lib/analise';
import { calcularCiclo } from '../lib/ciclo';
import { ajusteDoPerfil, historicoComposicao } from '../lib/gordura';
import { decisaoPosRemedio } from '../lib/projeto';
import { periodoProjeto } from '../lib/treino';
import { useDados } from './contexto';

export function useCalculos() {
  const d = useDados();
  const hoje = d.hoje;
  return useMemo(() => {
    const sexo = d.perfil?.sexo ?? 'Masculino';
    const resumo = d.ciclo ? calcularCiclo(d.ciclo, d.aplicacoes, d.diario, hoje) : null;
    const serie = serieDePeso(d.diario, d.medidas);
    // Altura do perfil (fonte única) e ajuste de calibração do % de gordura
    const composicoes = historicoComposicao(d.medidas, sexo, { altura_cm: d.perfil?.altura_cm, ajuste: ajusteDoPerfil(d.perfil) });
    const inicio = resumo?.linhas[0]?.aplicacao.data ?? d.ciclo?.data_inicio ?? hoje;
    // Remédio acabou (frasco sem próxima dose ou fase pós-remédio iniciada): as fases terminam no fim do
    // período do remédio (última dose + intervalo), e as semanas sem remédio ficam fora da análise por fase
    const pos = d.ciclo ? decisaoPosRemedio(d.ciclo, d.aplicacoes.filter((a) => a.ciclo_id === d.ciclo!.id)) : null;
    const fimRemedio = d.ciclo && resumo && resumo.linhas.length && (pos || !resumo.proxima) ? periodoProjeto(d.ciclo, resumo, pos?.bloco_inicio).fim : null;
    /** Último dia considerado nas fases: hoje ou, com o remédio concluído, o fim do período do remédio */
    const fimFases = fimRemedio && fimRemedio < hoje ? fimRemedio : hoje;
    const geral = analisarGeral(inicio, serie, composicoes, fimFases);
    const fases = resumo ? analisarFases(resumo, serie, d.diario, hoje, fimRemedio) : [];
    return { hoje, sexo, resumo, serie, composicoes, geral, fases, fimRemedio, fimFases };
  }, [d.ciclo, d.aplicacoes, d.diario, d.medidas, d.perfil, hoje]);
}
