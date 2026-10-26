// Faixa de zoom embaixo do gráfico: miniatura da série inteira com a janela visível
// e duas alças para arrastar. Arrastar o meio move a janela; tocar fora dela leva a janela até ali.
import { useEffect, useMemo, useRef, type PointerEvent as PE } from 'react';
import { caminhoLinha, dominioY, escalaLinear, limitarJanela, moverJanela, type Janela } from '../../lib/grafico-escalas';
import type { SerieDias } from '../../lib/grafico-dados';

interface Props {
  total: Janela;
  janela: Janela;
  largura: number;
  ml: number;
  mr: number;
  altura: number;
  minimo: number;
  serie?: { cor: string; d: SerieDias };
  aoMudar: (j: Janela, fim: boolean) => void;
  aoRedefinir: () => void;
}

type Alvo = 'esq' | 'dir' | 'mover' | 'pular';

export function BarraZoom({ total, janela, largura, ml, mr, altura, minimo, serie, aoMudar, aoRedefinir }: Props) {
  const w = Math.max(40, largura - ml - mr);
  const xs = escalaLinear([total.de, total.ate], [ml, ml + w]);
  const topo = 6;
  const h = altura - 12;
  const svgRef = useRef<SVGSVGElement>(null);
  const arraste = useRef<null | { alvo: Alvo; x0: number; y0: number; j0: Janela; ativo: boolean; id: number; t0: number }>(null);
  const ultimoToque = useRef(0);
  const atual = useRef<Janela>(janela);

  const mini = useMemo(() => {
    if (!serie) return '';
    const vs = serie.d.valores.filter((v): v is number => v !== null);
    if (vs.length < 2) return '';
    const t = dominioY(vs, { alvo: 2 });
    const ys = escalaLinear([t.min, t.max], [topo + h - 4, topo + 4]);
    return caminhoLinha(serie.d.dias.map((d, i) => ({ x: xs(d), y: serie.d.valores[i] === null ? null : ys(serie.d.valores[i]!) })));
  }, [serie, xs, h]);

  // O iPhone não rola a página enquanto uma alça é arrastada
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const bloquear = (e: TouchEvent) => {
      if (arraste.current?.ativo && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', bloquear, { passive: false });
    return () => el.removeEventListener('touchmove', bloquear);
  }, []);

  const x0 = xs(janela.de);
  const x1 = xs(janela.ate);
  const rel = (e: PE) => e.clientX - (e.currentTarget as Element).getBoundingClientRect().left;
  const relY = (e: PE) => e.clientY - (e.currentTarget as Element).getBoundingClientRect().top;

  const down = (e: PE<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const x = rel(e);
    let alvo: Alvo = 'pular';
    if (Math.abs(x - x0) <= 20 && Math.abs(x - x0) <= Math.abs(x - x1)) alvo = 'esq';
    else if (Math.abs(x - x1) <= 20) alvo = 'dir';
    else if (x > x0 && x < x1) alvo = 'mover';
    arraste.current = { alvo, x0: x, y0: relY(e), j0: janela, ativo: false, id: e.pointerId, t0: performance.now() };
    atual.current = janela;
    if (e.pointerType === 'mouse') e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PE<SVGSVGElement>) => {
    const a = arraste.current;
    if (!a || a.id !== e.pointerId) return;
    const x = rel(e);
    const dx = x - a.x0;
    if (!a.ativo) {
      const dy = Math.abs(relY(e) - a.y0);
      if (Math.abs(dx) > 4 && Math.abs(dx) > dy) a.ativo = true;
      else if (dy > 8) {
        arraste.current = null;
        return;
      } else return;
    }
    const dias = (dx / w) * (total.ate - total.de);
    let j: Janela;
    if (a.alvo === 'esq') j = limitarJanela({ de: Math.min(a.j0.de + dias, a.j0.ate - minimo), ate: a.j0.ate }, total, minimo);
    else if (a.alvo === 'dir') j = limitarJanela({ de: a.j0.de, ate: Math.max(a.j0.ate + dias, a.j0.de + minimo) }, total, minimo);
    else j = moverJanela(a.j0, dias, total);
    if (a.alvo === 'pular') a.alvo = 'mover';
    atual.current = j;
    aoMudar(j, false);
  };
  const up = (e: PE<SVGSVGElement>) => {
    const a = arraste.current;
    arraste.current = null;
    if (!a || a.id !== e.pointerId) return;
    if (a.ativo) {
      aoMudar(atual.current, true);
      return;
    }
    const agora = performance.now();
    if (agora - ultimoToque.current < 320) {
      ultimoToque.current = 0;
      aoRedefinir();
      return;
    }
    ultimoToque.current = agora;
    if (a.alvo === 'pular') {
      // Leva a janela até o ponto tocado
      const centro = xs.inverter(rel(e));
      const meio = (a.j0.ate - a.j0.de) / 2;
      aoMudar(limitarJanela({ de: centro - meio, ate: centro + meio }, total, a.j0.ate - a.j0.de), true);
    }
  };
  const cancel = () => {
    const a = arraste.current;
    arraste.current = null;
    if (a?.ativo) aoMudar(atual.current, true);
  };

  const ym = topo + h / 2;
  return (
    <div className="gr-zoom">
      <svg
        ref={svgRef}
        width={largura}
        height={altura}
        viewBox={`0 0 ${largura} ${altura}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        role="presentation"
        aria-hidden="true"
      >
        <rect className="gr-zoom-trilho" x={ml} y={topo} width={w} height={h} rx={8} />
        {mini && <path className="gr-zoom-mini" d={mini} style={{ stroke: serie?.cor }} />}
        <rect className="gr-zoom-fora" x={ml} y={topo} width={Math.max(0, x0 - ml)} height={h} />
        <rect className="gr-zoom-fora" x={x1} y={topo} width={Math.max(0, ml + w - x1)} height={h} />
        <rect className="gr-zoom-janela" x={x0} y={topo + 0.5} width={Math.max(2, x1 - x0)} height={h - 1} rx={7} />
        {[x0, x1].map((x, i) => (
          <g key={i} className="gr-zoom-alca" transform={`translate(${x},${ym})`}>
            <rect x={-5} y={-12} width={10} height={24} rx={5} />
            <line x1={-1.2} x2={-1.2} y1={-5} y2={5} />
            <line x1={1.2} x2={1.2} y1={-5} y2={5} />
          </g>
        ))}
      </svg>
    </div>
  );
}
