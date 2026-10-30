// "Seu resumo": frases curtas calculadas dos registros (lib/insights.ts), em cartões
// que deslizam para o lado. Tocar no cartão abre a tela de onde o número vem;
// "De onde vem" mostra o período e os dados usados.
import '../estilos/insights.css';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useMetaAgua, useTreino } from '../dados/useTreino';
import { dadosCorrelacao } from '../lib/correlacoes';
import { gerarInsights, type CategoriaInsight, type Insight, type TomInsight } from '../lib/insights';
import { ChipConquistas, useGaleria } from './conquistas';
import { EstadoVazio } from './estado-vazio';
import { Folha, Icone, IconeChip, type CorChip } from './ui';

/** As frases do resumo com os dados da conta (as mesmas fontes da Análise). */
export function useInsights(): Insight[] {
  const { diario, treinos, perfil } = useDados();
  const { hoje, composicoes, serie, resumo, sexo } = useCalculos();
  const t = useTreino();
  const metaAguaDe = useMetaAgua();
  return useMemo(() => {
    const metaAgua = (d: string) => metaAguaDe(d).meta;
    const linhas = resumo?.linhas ?? [];
    const aplicacoes = linhas.map((l) => l.aplicacao);
    const treinosConta = t ? treinos : null;
    const correlacoes = aplicacoes.length
      ? dadosCorrelacao({
          inicio: aplicacoes[0].data,
          hoje,
          aplicacoes,
          serie,
          composicoes,
          diario,
          treinos: treinosConta,
          periodosTreino: t ? [t.projeto, ...(t.placarPos ? [{ inicio: t.inicio, fim: t.fim }] : [])] : undefined,
          metaAgua,
        })
      : null;
    return gerarInsights({
      hoje,
      composicoes,
      serie,
      diario,
      treinos: treinosConta,
      metaAgua,
      metas: perfil?.metas_projeto ?? null,
      sexo,
      aplicacoes: linhas.map((l) => ({ data: l.aplicacao.data, atraso_dias: l.atraso_dias })),
      correlacoes,
    });
  }, [diario, treinos, perfil, hoje, composicoes, serie, resumo, sexo, t, metaAguaDe]);
}

const COR_CATEGORIA: Record<CategoriaInsight, CorChip> = { corpo: 'marca', habito: 'marca', remedio: 'marca', treino: 'marca' };

/** Ícone pelo assunto da frase (sono, água, plano…), senão o da categoria. */
function iconeDe(i: Insight): string {
  if (i.id.startsWith('sono') || i.id.includes('sono_')) return 'lua';
  if (i.id.startsWith('agua') || i.id.includes('agua')) return 'gota';
  if (i.id.startsWith('dieta')) return 'prato';
  if (i.id.startsWith('diario')) return 'diario';
  if (i.id.startsWith('nausea')) return 'enjoo';
  if (i.id.startsWith('peso')) return 'balanca';
  if (i.id.startsWith('meta')) return 'alvo';
  if (i.id.startsWith('corrida') || i.id.startsWith('pace')) return 'raio';
  return { corpo: 'medidas', habito: 'check', remedio: 'frasco', treino: 'treino' }[i.categoria];
}

const ROTULO_TOM: Record<TomInsight, string> = { bom: 'Bom sinal', neutro: 'Para saber', atencao: 'Atenção' };

/** "Análise › Corpo", "Treino"… (para o leitor de tela e o botão da folha) */
function destino(link: string): string {
  const aba = /aba=(\w+)/.exec(link)?.[1];
  if (link.startsWith('/analise')) return `Análise › ${{ corpo: 'Corpo', habitos: 'Hábitos', remedio: 'Remédio' }[aba ?? ''] ?? 'Geral'}`;
  if (link.startsWith('/treino')) return 'Treino';
  if (link.startsWith('/ciclo')) return aba === 'diario' ? 'Diário' : 'Ciclo';
  return 'Início';
}

function CartaoInsight({ i, aoOrigem }: { i: Insight; aoOrigem: () => void }) {
  const corpo = (
    <>
      <div className="insight-topo">
        <IconeChip nome={iconeDe(i)} cor={COR_CATEGORIA[i.categoria]} />
        <span className={`insight-tom tom-${i.tom}`}>{ROTULO_TOM[i.tom]}</span>
      </div>
      <p className="insight-frase">{i.frase}</p>
    </>
  );
  return (
    <div className={`insight-cartao tom-${i.tom}`} role="listitem">
      {i.link ? (
        <Link to={i.link} className="insight-corpo" aria-label={`${i.frase}. Abrir ${destino(i.link)}`}>
          {corpo}
        </Link>
      ) : (
        <div className="insight-corpo">{corpo}</div>
      )}
      <div className="insight-rodape">
        <button type="button" className="insight-origem" onClick={aoOrigem}>
          De onde vem
        </button>
        {i.link && (
          <span className="insight-destino" aria-hidden="true">
            {destino(i.link)} ›
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Cartão "Seu resumo". No Início, sem frases, não aparece; na Análise, mostra um
 * estado vazio curto. O cabeçalho leva à galeria de conquistas.
 */
export function ResumoInsights({ onde }: { onde: 'inicio' | 'analise' }) {
  const lista = useInsights();
  const galeria = useGaleria();
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const [origem, setOrigem] = useState<Insight | null>(null);
  if (!lista.length && onde === 'inicio') return null;

  function aoRolar() {
    const el = trilho.current;
    const primeiro = el?.firstElementChild as HTMLElement | null;
    if (!el || !primeiro) return;
    const passo = primeiro.offsetWidth + 10;
    setAtual(Math.min(Math.max(Math.round(el.scrollLeft / passo), 0), lista.length - 1));
  }

  return (
    <section className={`cartao insights insights-${onde}`} aria-label="Seu resumo">
      <div className="secao-cab insights-cab">
        <IconeChip nome="brilho" cor="marca" />
        <div className="cresce">
          <h2>Seu resumo</h2>
          <div className="secao-sub">Só fatos dos seus registros</div>
        </div>
        <ChipConquistas g={galeria} />
      </div>
      {lista.length ? (
        <>
          <div className="insights-trilho" ref={trilho} onScroll={aoRolar} data-sem-puxar="" data-sem-deslizar-abas="" role="list" aria-label="Frases do resumo">
            {lista.map((i) => (
              <CartaoInsight key={i.id} i={i} aoOrigem={() => setOrigem(i)} />
            ))}
          </div>
          {lista.length > 1 && (
            <div className="insights-pontos" aria-hidden="true">
              {lista.map((i, k) => (
                <span key={i.id} className={k === atual ? 'ativo' : ''} />
              ))}
            </div>
          )}
        </>
      ) : (
        <EstadoVazio compacto icone="brilho" titulo="Seu resumo aparece em breve">
          Com alguns dias de Diário e duas medições, aparecem aqui frases sobre a sua evolução, só com o que você registrou.
        </EstadoVazio>
      )}
      {origem && (
        <Folha titulo="De onde vem" aoFechar={() => setOrigem(null)}>
          <div className="pilha insight-folha">
            <p className="insight-folha-frase">{origem.frase}</p>
            <p className="insight-folha-origem">{origem.origem}</p>
            <p className="mudo">Só fatos dos seus registros: não é orientação médica nem de dose.</p>
            {origem.link && (
              <Link to={origem.link} className="botao" onClick={() => setOrigem(null)}>
                <Icone nome="analise" />
                Abrir {destino(origem.link)}
              </Link>
            )}
          </div>
        </Folha>
      )}
    </section>
  );
}
