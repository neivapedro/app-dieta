import { useMemo } from 'react';
import { analisarFases, analisarGeral, serieDePeso } from '../lib/analise';
import { calcularCiclo } from '../lib/ciclo';
import { ajusteDoPerfil, historicoComposicao } from '../lib/gordura';
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
    const geral = analisarGeral(inicio, serie, composicoes, hoje);
    const fases = resumo ? analisarFases(resumo, serie, d.diario, hoje) : [];
    return { hoje, sexo, resumo, serie, composicoes, geral, fases };
  }, [d.ciclo, d.aplicacoes, d.diario, d.medidas, d.perfil, hoje]);
}
