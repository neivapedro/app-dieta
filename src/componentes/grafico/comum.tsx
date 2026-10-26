// Peças comuns dos gráficos: cores do tema, medida da largura, gesto de toque e tela cheia.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as PE } from 'react';
import { createPortal } from 'react-dom';
import type { CorSerie } from './tipos';

const VARS: Record<CorSerie, string> = {
  texto: 'var(--texto)',
  neutro: 'var(--texto-3)',
  aviso: 'var(--aviso)',
  bom: 'var(--bom)',
  ruim: 'var(--ruim)',
  destaque: 'var(--destaque)',
};
/** Ordem fixa das cores quando a série não diz a sua (nunca cicla por posição de filtro) */
export const ORDEM_CORES: CorSerie[] = ['texto', 'aviso', 'neutro', 'bom', 'ruim', 'destaque'];

export const corCss = (c: CorSerie | undefined, i = 0) => VARS[c ?? ORDEM_CORES[i % ORDEM_CORES.length]];

/** id seguro para usar em url(#…) */
export function useIdSvg(prefixo: string): string {
  return prefixo + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Largura do elemento (ResizeObserver); 0 até medir. */
export function useLargura<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.floor(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((ents) => {
      const nova = Math.floor(ents[0].contentRect.width);
      setW((v) => (v === nova ? v : nova));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function movimentoReduzido(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** true no primeiro desenho (para a animação de entrada), depois false. */
export function useDesenhoInicial(pronto: boolean, ms = 1300): boolean {
  const [animar, setAnimar] = useState(() => !movimentoReduzido());
  useEffect(() => {
    if (!pronto || !animar) return;
    const t = setTimeout(() => setAnimar(false), ms);
    return () => clearTimeout(t);
  }, [pronto, animar, ms]);
  return animar;
}

// ---------- Gesto: mira por arraste horizontal / toque longo, toque, toque duplo e pinça ----------

type Tipo = 'toque' | 'mouse';
export interface OpcoesGesto {
  /** mira seguindo o dedo (ou o mouse passando) */
  aoMover: (x: number, y: number, tipo: Tipo) => void;
  /** fim da mira (dedo saiu, mouse saiu) */
  aoSoltar: (tipo: Tipo) => void;
  aoTocar: (x: number, y: number, tipo: Tipo) => void;
  aoDuploToque?: () => void;
  /** pinça: posições x dos dois dedos */
  aoPinca?: (x1: number, x2: number, inicio: boolean) => void;
  aoPincaFim?: () => void;
}

const LIMIAR = 8; // px até decidir entre mira (horizontal) e rolagem (vertical)
const TOQUE_LONGO = 250; // ms

interface Dedo {
  x: number;
  y: number;
  x0: number;
  y0: number;
  t0: number;
}

/**
 * Gesto no elemento (com `touch-action: pan-y`): a página continua rolando na vertical;
 * arraste horizontal ou toque longo liga a mira; dois dedos fazem a pinça.
 */
export function useGesto<T extends Element>(op: OpcoesGesto) {
  // Ref de callback: o SVG só aparece depois de medir a largura, então os ouvintes
  // nativos precisam ser ligados quando o elemento existir (não só na montagem)
  const [el, setEl] = useState<T | null>(null);
  const ref = useCallback((n: T | null) => setEl(n), []);
  const opRef = useRef(op);
  opRef.current = op;
  const st = useRef({
    modo: 'nada' as 'nada' | 'pendente' | 'mira' | 'pinca' | 'rolando',
    dedos: new Map<number, Dedo>(),
    timer: 0 as ReturnType<typeof setTimeout> | 0,
    ultimoToque: { t: 0, x: 0, y: 0 },
    quadro: 0,
    pendenteMover: null as null | { x: number; y: number; tipo: Tipo },
  });

  // Durante a mira/pinça, o iPhone não pode rolar a página nem dar zoom nela
  useEffect(() => {
    if (!el) return;
    const bloquear = (e: Event) => {
      const m = st.current.modo;
      if (m === 'mira' || m === 'pinca') e.cancelable && e.preventDefault();
    };
    const gesto = (e: Event) => e.preventDefault();
    el.addEventListener('touchmove', bloquear, { passive: false });
    el.addEventListener('gesturestart', gesto);
    return () => {
      el.removeEventListener('touchmove', bloquear);
      el.removeEventListener('gesturestart', gesto);
    };
  }, [el]);

  useEffect(() => () => {
    clearTimeout(st.current.timer || undefined);
    cancelAnimationFrame(st.current.quadro);
  }, []);

  const rel = (e: PE<T>) => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const tipoDe = (e: PE<T>): Tipo => (e.pointerType === 'mouse' ? 'mouse' : 'toque');

  // Um movimento por quadro de tela
  const mover = (x: number, y: number, tipo: Tipo) => {
    const s = st.current;
    s.pendenteMover = { x, y, tipo };
    if (s.quadro) return;
    s.quadro = requestAnimationFrame(() => {
      s.quadro = 0;
      const p = s.pendenteMover;
      s.pendenteMover = null;
      if (p) opRef.current.aoMover(p.x, p.y, p.tipo);
    });
  };

  const xsPinca = () => [...st.current.dedos.values()].slice(0, 2).map((d) => d.x);

  const handlers = {
    onPointerDown: (e: PE<T>) => {
      const s = st.current;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const { x, y } = rel(e);
      s.dedos.set(e.pointerId, { x, y, x0: x, y0: y, t0: performance.now() });
      if (e.pointerType === 'mouse') (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      clearTimeout(s.timer || undefined);
      if (s.dedos.size === 2 && opRef.current.aoPinca) {
        s.modo = 'pinca';
        const [a, b] = xsPinca();
        opRef.current.aoPinca(a, b, true);
        return;
      }
      if (s.dedos.size > 1) return;
      s.modo = 'pendente';
      const tipo = tipoDe(e);
      if (tipo === 'toque') {
        s.timer = setTimeout(() => {
          if (s.modo !== 'pendente') return;
          s.modo = 'mira';
          const d = s.dedos.get(e.pointerId);
          if (d) opRef.current.aoMover(d.x, d.y, 'toque');
        }, TOQUE_LONGO);
      }
    },
    onPointerMove: (e: PE<T>) => {
      const s = st.current;
      const { x, y } = rel(e);
      const d = s.dedos.get(e.pointerId);
      const tipo = tipoDe(e);
      if (!d) {
        // mouse passando sem botão: mira de passagem
        if (tipo === 'mouse' && e.buttons === 0) mover(x, y, 'mouse');
        return;
      }
      d.x = x;
      d.y = y;
      if (s.modo === 'pinca') {
        const [a, b] = xsPinca();
        if (b !== undefined) opRef.current.aoPinca?.(a, b, false);
        return;
      }
      if (s.modo === 'pendente') {
        const dx = Math.abs(x - d.x0);
        const dy = Math.abs(y - d.y0);
        if (dx > LIMIAR && dx > dy * 1.2) {
          clearTimeout(s.timer || undefined);
          s.modo = 'mira';
        } else if (dy > LIMIAR) {
          // Rolagem da página: o navegador assume (e manda pointercancel)
          clearTimeout(s.timer || undefined);
          s.modo = 'rolando';
          return;
        } else return;
      }
      if (s.modo === 'mira') mover(x, y, tipo);
    },
    onPointerUp: (e: PE<T>) => {
      const s = st.current;
      const d = s.dedos.get(e.pointerId);
      s.dedos.delete(e.pointerId);
      clearTimeout(s.timer || undefined);
      const tipo = tipoDe(e);
      if (s.modo === 'pinca') {
        if (s.dedos.size === 0) {
          s.modo = 'nada';
          opRef.current.aoPincaFim?.();
        }
        return;
      }
      if (d && s.modo === 'pendente' && performance.now() - d.t0 < 500) {
        const agora = performance.now();
        const u = s.ultimoToque;
        if (opRef.current.aoDuploToque && agora - u.t < 320 && Math.hypot(d.x - u.x, d.y - u.y) < 30) {
          s.ultimoToque = { t: 0, x: 0, y: 0 };
          opRef.current.aoDuploToque();
        } else {
          s.ultimoToque = { t: agora, x: d.x, y: d.y };
          opRef.current.aoTocar(d.x, d.y, tipo);
        }
      } else if (s.modo === 'mira') {
        cancelAnimationFrame(s.quadro);
        s.quadro = 0;
        if (tipo === 'toque') opRef.current.aoSoltar(tipo);
      }
      s.modo = 'nada';
    },
    onPointerCancel: (e: PE<T>) => {
      const s = st.current;
      s.dedos.delete(e.pointerId);
      clearTimeout(s.timer || undefined);
      if (s.modo === 'mira') opRef.current.aoSoltar(tipoDe(e));
      if (s.modo === 'pinca' && s.dedos.size === 0) opRef.current.aoPincaFim?.();
      if (s.dedos.size === 0) s.modo = 'nada';
    },
    onPointerLeave: (e: PE<T>) => {
      if (e.pointerType === 'mouse' && !st.current.dedos.size) {
        cancelAnimationFrame(st.current.quadro);
        st.current.quadro = 0;
        opRef.current.aoSoltar('mouse');
      }
    },
  };
  return { ref, handlers };
}

// ---------- Tela cheia ----------

/** Camada de tela cheia (acima das folhas e da navegação). Esc fecha; a página não rola por baixo. */
export function TelaCheia({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: (altura: number) => ReactNode }) {
  const corpo = useRef<HTMLDivElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const [altura, setAltura] = useState(0);
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        aoFechar();
      }
    };
    document.addEventListener('keydown', esc, true);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('gr-tela-cheia-aberta');
    fecharRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', esc, true);
      document.body.style.overflow = ov;
      document.documentElement.classList.remove('gr-tela-cheia-aberta');
      antes?.focus?.({ preventScroll: true });
    };
  }, [aoFechar]);
  useLayoutEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const medir = () => setAltura(Math.floor(el.getBoundingClientRect().height));
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    window.addEventListener('orientationchange', medir);
    return () => {
      ro?.disconnect();
      window.removeEventListener('orientationchange', medir);
    };
  }, []);
  return createPortal(
    <div className="gr-tela-cheia" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="gr-tela-cheia-cab">
        <h2>{titulo}</h2>
        <button ref={fecharRef} type="button" className="gr-botao-icone gr-fechar" onClick={aoFechar} aria-label="Fechar tela cheia">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="gr-tela-cheia-corpo" ref={corpo}>
        {altura > 0 && children(altura)}
      </div>
    </div>,
    document.body,
  );
}

/** Ícone de expandir (quatro cantos) */
export function IconeExpandir() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}
