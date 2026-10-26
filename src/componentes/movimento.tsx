// Movimento com propósito: números que contam ao aparecer, folha que arrasta para fechar
// e sai deslizando, e o "puxar para atualizar". Tudo some com "Reduzir movimento".
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as PE, type RefObject } from 'react';
import { DURACAO_CONTAGEM, deveFecharFolha, direcaoGesto, LIMITE_PUXAR, resistencia, valorContagem, velocidadeGesto } from '../lib/movimento-gestos';

/** "Reduzir movimento" ligado no aparelho */
export function movimentoReduzido(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const podeAnimar = () => typeof window !== 'undefined' && typeof requestAnimationFrame === 'function' && typeof IntersectionObserver === 'function' && !movimentoReduzido();

/**
 * Valor que conta de 0 (ou do valor anterior) até o alvo, com ease-out, quando o
 * elemento do `ref` entra na tela. Sem animação (movimento reduzido): o alvo direto.
 */
export function useContagem<T extends Element>(alvo: number, duracao = DURACAO_CONTAGEM): { ref: RefObject<T | null>; valor: number } {
  const ref = useRef<T>(null);
  const [valor, setValor] = useState(() => (podeAnimar() && Number.isFinite(alvo) ? 0 : alvo));
  const atual = useRef(valor);
  const visto = useRef(false);
  useEffect(() => {
    const final = () => {
      atual.current = alvo;
      setValor(alvo);
    };
    if (!Number.isFinite(alvo) || !podeAnimar()) return final();
    let raf = 0;
    let obs: IntersectionObserver | null = null;
    const animar = () => {
      const de = Number.isFinite(atual.current) ? atual.current : 0;
      if (de === alvo) return final();
      const t0 = performance.now();
      const passo = (agora: number) => {
        const t = (agora - t0) / duracao;
        const v = valorContagem(de, alvo, t);
        atual.current = v;
        setValor(v);
        if (t < 1) raf = requestAnimationFrame(passo);
      };
      raf = requestAnimationFrame(passo);
    };
    if (visto.current) animar();
    else if (ref.current) {
      obs = new IntersectionObserver(
        (es) => {
          if (!es.some((e) => e.isIntersecting)) return;
          visto.current = true;
          obs?.disconnect();
          animar();
        },
        { threshold: 0.15 },
      );
      obs.observe(ref.current);
    } else {
      visto.current = true;
      final();
    }
    return () => {
      cancelAnimationFrame(raf);
      obs?.disconnect();
    };
  }, [alvo, duracao]);
  return { ref, valor };
}

/**
 * Número que conta até o valor ao aparecer, formatado a cada quadro (pt-BR).
 * Leitor de tela ouve só o valor final; ao terminar, fica só o texto final.
 */
export function Numero({ valor, formato, className }: { valor: number; formato: (n: number) => string; className?: string }) {
  const { ref, valor: v } = useContagem<HTMLSpanElement>(valor);
  const final = formato(valor);
  const animando = v !== valor;
  return (
    <span ref={ref} className={`numero-anim ${className ?? ''}`} role={animando ? 'img' : undefined} aria-label={animando ? final : undefined}>
      {animando ? formato(v) : final}
    </span>
  );
}

/* ---------- Folha: arrastar para fechar e animação de saída ---------- */

const ALVOS_CLIQUE = 'button, a, input, select, textarea, label, [role="button"], [role="radio"], [role="tab"]';

/**
 * Arrastar a folha para baixo pela alça ou pelo cabeçalho (só com a folha no topo
 * da rolagem). Fecha passando de 25% da altura ou num gesto rápido.
 * Devolve os eventos para a alça/cabeçalho e o deslocamento atual (para a saída).
 */
export function useArrastarFolha(folhaRef: RefObject<HTMLElement | null>, fundoRef: RefObject<HTMLElement | null>, aoFechar: () => void) {
  const gesto = useRef<{ id: number; y0: number; arrastando: boolean; amostras: { y: number; t: number }[] } | null>(null);
  const desloc = useRef(0);

  // Na rolagem do topo, o cabeçalho também arrasta (fora dele, o cabeçalho rola a folha normalmente)
  useEffect(() => {
    const folha = folhaRef.current;
    if (!folha) return;
    const marcar = () => folha.classList.toggle('no-topo', folha.scrollTop <= 0);
    marcar();
    folha.addEventListener('scroll', marcar, { passive: true });
    return () => folha.removeEventListener('scroll', marcar);
  }, [folhaRef]);

  function mover(d: number) {
    const folha = folhaRef.current;
    const fundo = fundoRef.current;
    desloc.current = d;
    if (folha) {
      folha.style.transition = 'none';
      folha.style.transform = d > 0 ? `translateY(${d}px)` : '';
    }
    if (fundo) {
      const h = folha?.offsetHeight || 1;
      fundo.style.backgroundColor = d > 0 ? `rgb(0 0 0 / ${(0.5 * Math.max(0, 1 - d / h)).toFixed(3)})` : '';
    }
  }

  function voltar() {
    const folha = folhaRef.current;
    const fundo = fundoRef.current;
    desloc.current = 0;
    if (folha) {
      folha.style.transition = 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)';
      folha.style.transform = '';
    }
    if (fundo) {
      fundo.style.transition = 'background-color 0.32s ease';
      fundo.style.backgroundColor = '';
    }
  }

  const eventos = {
    onPointerDown(e: PE<HTMLElement>) {
      const folha = folhaRef.current;
      if (!folha || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if ((e.target as Element).closest?.(ALVOS_CLIQUE)) return;
      if (folha.scrollTop > 0) return;
      gesto.current = { id: e.pointerId, y0: e.clientY, arrastando: false, amostras: [{ y: e.clientY, t: e.timeStamp }] };
    },
    onPointerMove(e: PE<HTMLElement>) {
      const g = gesto.current;
      if (!g || g.id !== e.pointerId) return;
      const dy = e.clientY - g.y0;
      if (!g.arrastando) {
        if (dy < -6) {
          gesto.current = null;
          return;
        }
        if (dy < 6) return;
        g.arrastando = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* sem captura: segue com os eventos que chegarem */
        }
      }
      g.amostras.push({ y: e.clientY, t: e.timeStamp });
      if (g.amostras.length > 8) g.amostras.shift();
      // Para cima não sobe além do lugar (só um leve elástico)
      mover(dy > 0 ? dy : 0);
    },
    onPointerUp(e: PE<HTMLElement>) {
      const g = gesto.current;
      if (!g || g.id !== e.pointerId) return;
      gesto.current = null;
      if (!g.arrastando) return;
      const altura = folhaRef.current?.offsetHeight ?? 0;
      if (deveFecharFolha(desloc.current, altura, velocidadeGesto(g.amostras))) aoFechar();
      else voltar();
    },
    onPointerCancel(e: PE<HTMLElement>) {
      const g = gesto.current;
      if (!g || g.id !== e.pointerId) return;
      gesto.current = null;
      if (g.arrastando) voltar();
    },
  };
  return { eventos, desloc };
}

/**
 * Ao desmontar (fechou por qualquer caminho), uma cópia visual da folha desce e o
 * fundo some, sem atrasar o aoFechar de quem usa a folha. Inerte e removida no fim.
 */
export function useSaidaFolha(fundoRef: RefObject<HTMLElement | null>, folhaRef: RefObject<HTMLElement | null>, desloc: RefObject<number>) {
  const rolagem = useRef(0);
  useLayoutEffect(() => {
    const fundo = fundoRef.current;
    const folha = folhaRef.current;
    if (!fundo || !folha) return;
    const guardar = () => (rolagem.current = folha.scrollTop);
    folha.addEventListener('scroll', guardar, { passive: true });
    return () => {
      folha.removeEventListener('scroll', guardar);
      if (movimentoReduzido()) return;
      const pai = fundo.parentNode;
      const prox = fundo.nextSibling;
      const d = desloc.current ?? 0;
      const topo = rolagem.current;
      // Depois do commit: se a folha continua na página (remontagem do modo estrito), não há saída
      queueMicrotask(() => {
        if (fundo.isConnected) return;
        try {
          const copia = fundo.cloneNode(true) as HTMLElement;
          copia.classList.add('saindo');
          copia.setAttribute('aria-hidden', 'true');
          copia.setAttribute('inert', '');
          copia.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
          const f = copia.querySelector<HTMLElement>('.folha');
          if (f) {
            f.style.setProperty('--desloc', `${d}px`);
            f.removeAttribute('role');
          }
          const destino = pai && pai.isConnected ? pai : document.body;
          destino.insertBefore(copia, prox && prox.parentNode === destino ? prox : null);
          if (f) f.scrollTop = topo;
          let feito = false;
          const remover = () => {
            if (feito) return;
            feito = true;
            copia.remove();
          };
          f?.addEventListener('animationend', remover);
          setTimeout(remover, 450);
        } catch {
          /* sem a animação de saída */
        }
      });
    };
  }, [fundoRef, folhaRef, desloc]);
}

/* ---------- Puxar para atualizar ---------- */

// Onde o gesto pertence a outra coisa: folhas, gráficos, carrossel, campos
const SEM_PUXAR =
  '.folha-fundo, [role="dialog"], [aria-modal="true"], .grafico, .grafico-interativo, .recharts-wrapper, [data-sem-puxar], .foto-carrossel, input, textarea, select, [contenteditable="true"]';

function bloqueado(alvo: EventTarget | null): boolean {
  let el = alvo instanceof Element ? alvo : null;
  if (!el) return false;
  if (el.closest(SEM_PUXAR)) return true;
  // Dentro de algo que rola para o lado, ou de uma área própria já rolada para baixo
  while (el && el !== document.body && el !== document.documentElement) {
    const est = getComputedStyle(el);
    if (/(auto|scroll)/.test(est.overflowX) && el.scrollWidth > el.clientWidth + 1) return true;
    if (/(auto|scroll)/.test(est.overflowY) && el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

const rolagemPagina = () => Math.max(window.scrollY || 0, document.scrollingElement?.scrollTop ?? 0);

type FasePuxar = 'parado' | 'puxando' | 'pronto' | 'atualizando' | 'voltando';

/**
 * Página no topo e o dedo desce: um indicador acompanha (com resistência);
 * soltando depois do limite, chama aoAtualizar e gira até terminar (mínimo 500 ms).
 */
export function PuxarAtualizar({ aoAtualizar }: { aoAtualizar: () => Promise<unknown> }) {
  const [fase, setFase] = useState<FasePuxar>('parado');
  const indicador = useRef<HTMLDivElement>(null);
  const ocupado = useRef(false);
  const atualizar = useRef(aoAtualizar);
  atualizar.current = aoAtualizar;

  useEffect(() => {
    let ini: { x: number; y: number } | null = null;
    let decidido = false;
    let dist = 0;
    let fim: ReturnType<typeof setTimeout> | undefined;
    const el = () => indicador.current;

    const posicionar = (d: number, transicao: boolean) => {
      const i = el();
      if (!i) return;
      const topo = document.querySelector('.topo')?.getBoundingClientRect().bottom ?? 0;
      i.style.top = `${Math.max(0, topo)}px`;
      i.style.transition = transicao ? 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease' : 'none';
      i.style.transform = `translate(-50%, ${d - 44}px)`;
      i.style.opacity = d <= 0 ? '0' : String(Math.min(1, d / 36));
      // O arco cresce até o limite e gira com o dedo; atualizando, o CSS gira o ícone
      const fr = Math.min(1, d / LIMITE_PUXAR);
      const arco = i.querySelector<SVGElement>('.puxar-arco');
      if (arco) arco.style.strokeDasharray = ocupado.current ? '62 100' : `${(fr * 80).toFixed(1)} 100`;
      const icone = i.querySelector<SVGElement>('.puxar-icone');
      if (icone) icone.style.transform = ocupado.current ? '' : `rotate(${Math.round(fr * 270 - 90)}deg)`;
    };

    const esconder = () => {
      ini = null;
      posicionar(0, true);
      setFase('voltando');
      clearTimeout(fim);
      fim = setTimeout(() => !ocupado.current && setFase('parado'), 320);
    };

    const disparar = () => {
      ocupado.current = true;
      setFase('atualizando');
      posicionar(LIMITE_PUXAR * 0.8, true);
      const minimo = new Promise((r) => setTimeout(r, 500));
      let promessa: Promise<unknown>;
      try {
        promessa = Promise.resolve(atualizar.current());
      } catch {
        promessa = Promise.resolve();
      }
      void Promise.allSettled([promessa, minimo]).then(() => {
        ocupado.current = false;
        esconder();
      });
    };

    const inicio = (e: TouchEvent) => {
      ini = null;
      if (ocupado.current || e.touches.length !== 1) return;
      if (rolagemPagina() > 0 || document.body.style.overflow === 'hidden') return;
      if (bloqueado(e.target)) return;
      ini = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      decidido = false;
      dist = 0;
    };

    const mover = (e: TouchEvent) => {
      if (!ini) return;
      if (e.touches.length !== 1) return esconder();
      const dx = e.touches[0].clientX - ini.x;
      const dy = e.touches[0].clientY - ini.y;
      if (!decidido) {
        const dir = direcaoGesto(dx, dy);
        if (!dir) return;
        if (dir === 'horizontal' || dy < 0) {
          ini = null;
          return;
        }
        decidido = true;
        clearTimeout(fim);
        setFase('puxando');
      }
      if (rolagemPagina() > 0) return esconder();
      if (e.cancelable) e.preventDefault();
      dist = resistencia(dy);
      posicionar(dist, false);
      setFase(dist >= LIMITE_PUXAR ? 'pronto' : 'puxando');
    };

    const soltar = () => {
      if (!ini) return;
      const ok = decidido && dist >= LIMITE_PUXAR;
      ini = null;
      if (!decidido) return;
      if (ok) disparar();
      else esconder();
    };

    const cancelar = () => {
      if (ini && decidido) esconder();
      ini = null;
    };

    document.addEventListener('touchstart', inicio, { passive: true });
    document.addEventListener('touchmove', mover, { passive: false });
    document.addEventListener('touchend', soltar);
    document.addEventListener('touchcancel', cancelar);
    return () => {
      clearTimeout(fim);
      document.removeEventListener('touchstart', inicio);
      document.removeEventListener('touchmove', mover);
      document.removeEventListener('touchend', soltar);
      document.removeEventListener('touchcancel', cancelar);
    };
  }, []);

  return (
    <>
      <div ref={indicador} className={`puxar puxar-${fase}`} aria-hidden="true" style={{ opacity: 0 }}>
        <svg viewBox="0 0 24 24" className="puxar-icone">
          <circle cx="12" cy="12" r="8.5" className="puxar-trilho" />
          <circle cx="12" cy="12" r="8.5" className="puxar-arco" pathLength={100} />
        </svg>
      </div>
      <div className="oculto-visual" role="status" aria-live="polite">
        {fase === 'atualizando' ? 'Atualizando os dados…' : ''}
      </div>
    </>
  );
}
