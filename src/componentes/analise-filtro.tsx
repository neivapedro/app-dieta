// Filtro de período da Análise (fixo no alto ao rolar) e a etiqueta do destaque cruzado.
import { useEffect, useRef } from 'react';
import { textoIntervalo, type OpcaoPeriodo } from '../lib/analise-periodo';
import { diferencaDias } from '../lib/datas';

/** Destaque cruzado: um bloco de dose, uma semana ou um dia, sombreado em todos os gráficos de tempo */
export interface DestaqueAnalise {
  chave: string;
  rotulo: string;
  de: string;
  ate: string;
}

export function BarraPeriodo({
  opcoes,
  atual,
  aoMudar,
  destaque,
  aoLimparDestaque,
  hoje,
}: {
  opcoes: OpcaoPeriodo[];
  atual: OpcaoPeriodo;
  aoMudar: (chave: string) => void;
  destaque: DestaqueAnalise | null;
  aoLimparDestaque: () => void;
  hoje: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Fica logo abaixo do cabeçalho de vidro (a altura dele muda com a área segura do iPhone)
  useEffect(() => {
    const topo = document.querySelector<HTMLElement>('.topo');
    const el = ref.current;
    if (!topo || !el) return;
    const medir = () => el.style.setProperty('--analise-topo', `${topo.offsetHeight}px`);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(topo);
    return () => ro.disconnect();
  }, []);
  // A pílula escolhida fica visível na faixa rolável
  const faixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = faixa.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    const f = faixa.current;
    if (b && f && (b.offsetLeft < f.scrollLeft || b.offsetLeft + b.offsetWidth > f.scrollLeft + f.clientWidth)) f.scrollLeft = b.offsetLeft - 24;
  }, [atual.chave]);
  const dias = diferencaDias(atual.de, atual.ate) + 1;
  return (
    <div className="analise-filtro nao-imprimir" ref={ref}>
      <div className="analise-filtro-pilulas" ref={faixa}>
        <div className="pilulas" role="radiogroup" aria-label="Período da análise">
          {opcoes.map((o) => (
            <button key={o.chave} type="button" role="radio" aria-checked={o.chave === atual.chave} className={o.chave === atual.chave ? 'ativo' : ''} onClick={() => aoMudar(o.chave)}>
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="analise-filtro-linha">
        <span className="analise-filtro-datas numero">
          {textoIntervalo(atual.de, atual.ate, hoje)} <span className="texto-3">· {dias} {dias === 1 ? 'dia' : 'dias'}</span>
        </span>
        {destaque && (
          <button type="button" className="analise-chip" onClick={aoLimparDestaque} aria-label={`Destacando ${destaque.rotulo}. Tocar para limpar`}>
            <i aria-hidden="true" />
            Destacando: {destaque.rotulo}
            <span aria-hidden="true" className="analise-chip-x">
              ×
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
