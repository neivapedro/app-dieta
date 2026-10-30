import { useEffect, type RefObject } from 'react';

/** Quanto rolar numa direção (px, somado) antes de a barra de abas encolher ou voltar. */
const LIMIAR_ENCOLHER = 28;
const LIMIAR_VOLTAR = 16;
/** Perto do topo a barra fica sempre inteira. */
const TOPO_LIVRE = 32;

/**
 * Rolagem da tela, medida uma vez por quadro (ouvinte passivo + requestAnimationFrame):
 * - título grande (`titulo`): em cada linha dele, `--sumir` vai de 0 a 1 enquanto ela passa por baixo do cabeçalho;
 *   quando o título já passou mais da metade, o cabeçalho ganha `.compacto` e mostra o título pequeno;
 * - barra de abas (`nav`): rolando para baixo ganha `.mini`; para cima ou no topo, volta.
 *   Com "Reduzir movimento" ela fica sempre inteira.
 * Sem título grande (subtela do Perfil), o cabeçalho fica compacto o tempo todo.
 * `chave` muda a cada tela: recomeça do zero (a tela nova abre no topo).
 */
export function useRolagemDaTela(
  refs: { topo: RefObject<HTMLElement | null>; nav: RefObject<HTMLElement | null>; titulo: RefObject<HTMLElement | null> },
  chave: string,
) {
  useEffect(() => {
    const topo = refs.topo.current;
    const nav = refs.nav.current;
    if (!topo || !nav) return;
    let ultimoY = Math.max(0, window.scrollY);
    let acumulado = 0;
    let mini = false;
    let quadro = 0;
    let sumirAntes = '';
    let reduzir: MediaQueryList | null = null;
    try {
      reduzir = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    } catch {
      reduzir = null;
    }

    const medir = () => {
      quadro = 0;
      const y = Math.max(0, window.scrollY);
      const dy = y - ultimoY;
      ultimoY = y;

      const titulo = refs.titulo.current;
      const h1 = titulo?.querySelector('h1');
      let compacto = true;
      if (titulo && h1) {
        // Título na linha dos botões (.na-linha): começa a sumir logo que a tela rola; senão, ao passar por baixo do cabeçalho
        const r0 = topo.getBoundingClientRect();
        const base = titulo.classList.contains('na-linha') ? r0.top + parseFloat(getComputedStyle(topo).paddingTop) + 3 : r0.bottom;
        // Cada linha (título e subtítulo) esmaece enquanto passa por baixo do cabeçalho
        let assinatura = '';
        const linhas = [...titulo.children] as HTMLElement[];
        const progresso = linhas.map((el) => {
          const r = el.getBoundingClientRect();
          const p = r.height ? Math.min(1, Math.max(0, (base - r.top) / r.height)) : 0;
          const v = p.toFixed(3);
          assinatura += v;
          return v;
        });
        if (assinatura !== sumirAntes) {
          linhas.forEach((el, i) => el.style.setProperty('--sumir', progresso[i]));
          sumirAntes = assinatura;
        }
        // O pequeno entra quando o grande já está mais da metade escondido (troca cruzada, sem vão sem título)
        compacto = Number(progresso[linhas.indexOf(h1)] ?? 1) >= 0.6;
      }
      topo.classList.toggle('compacto', compacto);

      if (y < TOPO_LIVRE || reduzir?.matches) {
        mini = false;
        acumulado = 0;
      } else if (dy !== 0) {
        if (dy > 0 !== acumulado > 0) acumulado = 0;
        acumulado += dy;
        if (acumulado > LIMIAR_ENCOLHER) mini = true;
        else if (acumulado < -LIMIAR_VOLTAR) mini = false;
      }
      nav.classList.toggle('mini', mini);
    };
    const pedir = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir, { passive: true });
    return () => {
      window.removeEventListener('scroll', pedir);
      window.removeEventListener('resize', pedir);
      if (quadro) cancelAnimationFrame(quadro);
    };
    // refs são estáveis; a medição recomeça a cada tela
  }, [chave]);
}
