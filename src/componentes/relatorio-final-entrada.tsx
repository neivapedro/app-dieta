// Atalho para o Relatório final, usado na Análise e no Início. Arquivo à parte (e leve):
// a tela do relatório só é baixada quando aberta.
import { Link } from 'react-router-dom';
import { useCalculos } from '../dados/useCalculos';

/**
 * Atalho para o Relatório final. Na Análise aparece sempre ("Prévia…" com o ciclo em
 * andamento); no Início, só com o ciclo concluído ("Seu relatório final está pronto").
 */
export function CartaoRelatorioFinal({ onde }: { onde: 'analise' | 'inicio' }) {
  const { resumo, fimRemedio, hoje } = useCalculos();
  // Concluído: o período do remédio (última dose + intervalo) já terminou
  const concluido = !!fimRemedio && fimRemedio < hoje;
  if (onde === 'inicio' && !concluido) return null;
  if (!resumo?.linhas.length) return null;
  const titulo = concluido ? (onde === 'inicio' ? 'Seu relatório final está pronto' : 'Relatório final') : 'Prévia do relatório final';
  const sub = concluido
    ? 'Antes e depois, gráficos, recordes e hábitos do ciclo inteiro.'
    : 'Como o relatório do fim do ciclo vai ficar, com os dados de até hoje.';
  return (
    <Link to="/relatorio-final" className={`rf-entrada ${concluido ? 'pronto' : ''}`} data-onde={onde}>
      <span className="rf-entrada-icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z" />
          <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
        </svg>
      </span>
      <span className="rf-entrada-texto">
        <b>{titulo}</b>
        <small>{sub}</small>
      </span>
      <span className="rf-entrada-seta" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
