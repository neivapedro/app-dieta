// Deslizar o dedo para o lado no conteúdo da página troca para a sub-aba vizinha
// (Ciclo, Treino, Análise). A direção é decidida cedo: na vertical a rolagem segue nativa.
import { useCallback, useEffect, useRef, useState } from 'react';
import { destinoAba, LIMIAR_DIRECAO_ABA, seguirDedoAba, velocidadeGesto } from '../lib/movimento-gestos';
import { movimentoReduzido } from './movimento';

// Onde o gesto para o lado pertence a outra coisa: gráficos, fotos, comparador, campos, folhas
const SEM_DESLIZAR =
  '.folha-fundo, [role="dialog"], [aria-modal="true"], .gr, .gr-zoom, .gr-tela-cheia, .grafico, .grafico-interativo, [data-sem-puxar], [data-sem-deslizar], .foto-carrossel, [role="slider"], input, textarea, select, [contenteditable="true"], .linha-deslizante';
/** Começo junto da borda da tela: é o "voltar" do Safari, não a troca de aba */
const BORDA = 16;
const CURVA = 'cubic-bezier(0.32, 0.72, 0, 1)';

function bloqueado(alvo: EventTarget | null, raiz: HTMLElement): boolean {
  let el = alvo instanceof Element ? alvo : null;
  if (!el || el.closest(SEM_DESLIZAR)) return true;
  // Dentro de algo que rola para o lado de verdade (tabela, pílulas, carrossel)
  while (el && el !== raiz && el !== document.body) {
    const est = getComputedStyle(el);
    if (/(auto|scroll)/.test(est.overflowX) && el.scrollWidth > el.clientWidth + 1) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Liga o gesto ao contêiner da página (devolve a ref). `aoMudar` é o próprio setter da página
 * (mantém o ?aba= e as confirmações dela). O conteúdo (menos a barra de abas) acompanha o dedo
 * com resistência e encaixa; com "reduzir movimento", só troca.
 */
export function useDeslizarAbas<K extends string>(abas: readonly K[], atual: K, aoMudar: (k: K) => void) {
  const estado = useRef({ abas, atual, aoMudar });
  estado.current = { abas, atual, aoMudar };
  // Ref de callback: em algumas páginas o contêiner só aparece depois dos dados carregarem
  const [el, setEl] = useState<HTMLElement | null>(null);
  const ref = useCallback((n: HTMLElement | null) => setEl(n), []);
  // Direção da última troca pelo gesto (para o conteúdo novo entrar do lado certo)
  const entrada = useRef<{ dir: number; t: number } | null>(null);
  // Tirar o deslocamento depois do encaixe (o conteúdo novo cancela e anima por conta própria)
  const fim = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!el) return;
    let g: { x0: number; y0: number; dir: 'h' | 'v' | null; amostras: { y: number; t: number }[]; dx: number } | null = null;

    const posicionar = (x: number, transicao: boolean) => {
      el.style.setProperty('--deslize-transicao', transicao ? `transform 0.3s ${CURVA}` : 'none');
      el.style.setProperty('--deslize', `${x.toFixed(1)}px`);
    };
    const limpar = () => {
      el.classList.remove('deslizando-abas');
      el.style.removeProperty('--deslize');
      el.style.removeProperty('--deslize-transicao');
    };
    const voltar = () => {
      if (movimentoReduzido()) return limpar();
      posicionar(0, true);
      clearTimeout(fim.current);
      fim.current = setTimeout(limpar, 320);
    };

    const inicio = (e: TouchEvent) => {
      g = null;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX < BORDA || t.clientX > window.innerWidth - BORDA) return;
      if (document.body.style.overflow === 'hidden' || bloqueado(e.target, el)) return;
      g = { x0: t.clientX, y0: t.clientY, dir: null, amostras: [{ y: t.clientX, t: e.timeStamp }], dx: 0 };
    };

    const mover = (e: TouchEvent) => {
      if (!g) return;
      if (e.touches.length !== 1) {
        if (g.dir === 'h') voltar();
        g = null;
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (!g.dir) {
        if (Math.abs(dx) < LIMIAR_DIRECAO_ABA && Math.abs(dy) < LIMIAR_DIRECAO_ABA) return;
        if (Math.abs(dx) <= Math.abs(dy)) {
          // Vertical: a rolagem é do navegador
          g = null;
          return;
        }
        g.dir = 'h';
        clearTimeout(fim.current);
      }
      if (e.cancelable) e.preventDefault();
      g.dx = dx;
      g.amostras.push({ y: t.clientX, t: e.timeStamp });
      if (g.amostras.length > 8) g.amostras.shift();
      if (movimentoReduzido()) return;
      const { abas: lista, atual: a } = estado.current;
      const i = lista.indexOf(a);
      const vizinha = dx < 0 ? i < lista.length - 1 : i > 0;
      el.classList.add('deslizando-abas');
      posicionar(seguirDedoAba(dx, el.clientWidth || window.innerWidth, vizinha), false);
    };

    const soltar = (e: TouchEvent) => {
      const gg = g;
      g = null;
      if (!gg || gg.dir !== 'h') return;
      const { abas: lista, atual: a, aoMudar: mudar } = estado.current;
      const i = lista.indexOf(a);
      const passo = destinoAba(gg.dx, velocidadeGesto(gg.amostras), el.clientWidth || window.innerWidth);
      const j = i + passo;
      if (passo !== 0 && j >= 0 && j < lista.length) {
        entrada.current = { dir: passo, t: performance.now() };
        // Síncrono no toque: o tique tátil e o confirm do Plano precisam do gesto
        mudar(lista[j]);
        if (e.cancelable) e.preventDefault();
      }
      voltar();
    };

    const cancelar = () => {
      if (g?.dir === 'h') voltar();
      g = null;
    };

    el.addEventListener('touchstart', inicio, { passive: true });
    el.addEventListener('touchmove', mover, { passive: false });
    el.addEventListener('touchend', soltar, { passive: false });
    el.addEventListener('touchcancel', cancelar);
    return () => {
      clearTimeout(fim.current);
      limpar();
      el.removeEventListener('touchstart', inicio);
      el.removeEventListener('touchmove', mover);
      el.removeEventListener('touchend', soltar);
      el.removeEventListener('touchcancel', cancelar);
    };
  }, [el]);

  // Trocou pelo gesto: o conteúdo novo entra pelo lado de onde o dedo veio
  useEffect(() => {
    const e = entrada.current;
    entrada.current = null;
    if (!el || !e || performance.now() - e.t > 1000 || movimentoReduzido()) return;
    clearTimeout(fim.current);
    el.classList.add('deslizando-abas');
    el.style.setProperty('--deslize-transicao', 'none');
    el.style.setProperty('--deslize', `${e.dir * 36}px`);
    const quadro = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.setProperty('--deslize-transicao', `transform 0.32s ${CURVA}`);
        el.style.setProperty('--deslize', '0px');
      }),
    );
    fim.current = setTimeout(() => {
      el.classList.remove('deslizando-abas');
      el.style.removeProperty('--deslize');
      el.style.removeProperty('--deslize-transicao');
    }, 380);
    return () => cancelAnimationFrame(quadro);
  }, [atual, el]);

  return ref;
}
