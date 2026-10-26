import { useMemo } from 'react';
import { useFotos } from '../componentes/fotos';
import { montarRelatorioFinal, type RelatorioFinal } from '../lib/relatorio-final';
import { useDados } from './contexto';
import { useCalculos } from './useCalculos';
import { useMetaAgua } from './useTreino';

/**
 * Relatório final montado com os dados da conta (as mesmas contas da Análise) e as
 * fotos deste aparelho. `relatorio` é null antes de existir o ciclo. As fotos vêm
 * com o endereço temporário da imagem (só para mostrar; nunca saem do aparelho).
 */
export function useRelatorioFinal() {
  const d = useDados();
  const calc = useCalculos();
  const metaAguaDe = useMetaAgua();
  const { fotos, carregando: carregandoFotos } = useFotos();
  // Só os dados das fotos entram no modelo (a imagem fica no aparelho)
  const infoFotos = useMemo(() => fotos.map((f) => ({ id: f.id, sessao: f.sessao, rotulo: f.rotulo, data: f.data, ordem: f.ordem })), [fotos]);
  const relatorio = useMemo<RelatorioFinal | null>(() => {
    if (!d.ciclo || !calc.resumo) return null;
    const comTreino = !!d.perfil?.modulo_treino;
    return montarRelatorioFinal({
      perfil: d.perfil,
      ciclo: d.ciclo,
      resumo: calc.resumo,
      diario: d.diario,
      serie: calc.serie,
      composicoes: calc.composicoes,
      fases: calc.fases,
      hoje: calc.hoje,
      fimRemedio: calc.fimRemedio,
      posRemedio: calc.posRemedio,
      treinos: comTreino ? d.treinos : null,
      forca: comTreino ? d.forca : null,
      registroDecisoes: d.registroDecisoes,
      dieta: d.dieta,
      fotos: infoFotos,
      metaAgua: (data) => metaAguaDe(data).meta,
    });
  }, [d.ciclo, d.perfil, d.diario, d.treinos, d.forca, d.registroDecisoes, d.dieta, calc, infoFotos, metaAguaDe]);
  return { relatorio, fotos, carregandoFotos };
}
