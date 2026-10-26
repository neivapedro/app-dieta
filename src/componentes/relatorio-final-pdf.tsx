// ┌──────────────────────────────────────────────────────────────────────────┐
// │ ESPAÇO RESERVADO — PARTE 2: PDF final colorido (feito em outra etapa).   │
// │                                                                          │
// │ Recebe o modelo pronto (`relatorio`, de montarRelatorioFinal) e as fotos │
// │ deste aparelho (`fotos`: FotoTela, com `dados`/`url` de cada id usado em │
// │ relatorio.fotos.pares / relatorio.fotos.pdf). O gerador do PDF deve ser  │
// │ baixado à parte (import() dinâmico, como lib/relatorioPdf na Análise) e  │
// │ as fotos reduzidas com prepararFotosPdf (componentes/fotos.tsx), só se a │
// │ pessoa marcar "Incluir fotos". Até lá, o botão fica desligado.           │
// └──────────────────────────────────────────────────────────────────────────┘
import type { RelatorioFinal } from '../lib/relatorio-final';
import type { FotoTela } from './fotos';

export interface PropsPdfFinal {
  relatorio: RelatorioFinal;
  fotos: FotoTela[];
}

/** Botão do PDF final (Parte 2). Por enquanto, desligado, com o aviso de que vem aí. */
export function SlotPdfFinal(props: PropsPdfFinal) {
  void props;
  return (
    <div className="rf-slot-pdf" data-slot="pdf-final">
      <button type="button" className="botao bloco-largo" disabled aria-describedby="rf-slot-pdf-nota">
        PDF final
      </button>
      <p id="rf-slot-pdf-nota" className="mudo">
        O PDF final colorido, para guardar ou levar ao médico, chega numa próxima versão. O PDF da consulta continua na Análise › PDF.
      </p>
    </div>
  );
}
