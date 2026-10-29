// Linha de lista com ações ao deslizar para a esquerda (como no Mail do iPhone): Editar e Apagar.
// É um atalho para o toque: as mesmas ações continuam no botão da linha (teclado e leitor de
// tela usam o caminho de sempre; por isso os botões daqui ficam fora do foco e do leitor).
// Só uma linha aberta por vez; tocar fora fecha; a rolagem vertical segue nativa.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { vibrarLeve } from '../lib/haptico';
import { direcaoGesto, velocidadeGesto } from '../lib/movimento-gestos';
import { movimentoReduzido } from './movimento';

export type AcaoLinha = {
  rotulo: string;
  aoTocar: () => unknown;
  perigo?: boolean;
  /** Pede um segundo toque antes de agir (o mesmo aviso do botão Excluir do formulário) */
  confirmar?: string;
};

// A linha aberta agora (abrir outra fecha esta)
let fecharAberta: (() => void) | null = null;

const CURVA = 'cubic-bezier(0.32, 0.72, 0, 1)';
// Começando aqui, o gesto é do campo, não da linha
const SEM_DESLIZAR = 'input, select, textarea, [contenteditable="true"], [data-sem-deslizar]';

export function LinhaDeslizante({ acoes, children, className }: { acoes: AcaoLinha[]; children: ReactNode; className?: string }) {
  const raiz = useRef<HTMLDivElement>(null);
  const frente = useRef<HTMLDivElement>(null);
  const caixaAcoes = useRef<HTMLDivElement>(null);
  const [aberta, setAberta] = useState(false);
  const [armada, setArmada] = useState<number | null>(null);
  const x = useRef(0);
  // Depois de um arraste, o clique que o navegador ainda mandar não abre a linha
  const engolirClique = useRef(0);

  const largura = () => caixaAcoes.current?.offsetWidth ?? 0;

  const posicionar = (v: number, animar: boolean) => {
    const f = frente.current;
    if (!f) return;
    x.current = v;
    f.style.transition = animar && !movimentoReduzido() ? `transform 0.32s ${CURVA}` : 'none';
    f.style.transform = v ? `translateX(${v}px)` : '';
  };

  const fechar = () => {
    posicionar(0, true);
    setAberta(false);
    setArmada(null);
    if (fecharAberta === fechar) fecharAberta = null;
  };
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;

  const abrir = () => {
    if (fecharAberta && fecharAberta !== fecharRef.current) fecharAberta();
    posicionar(-largura(), true);
    setAberta(true);
    fecharAberta = () => fecharRef.current();
  };

  // Gesto: decide a direção cedo; na horizontal a linha acompanha o dedo
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    let g: { x0: number; y0: number; base: number; dir: 'h' | 'v' | null; amostras: { y: number; t: number }[] } | null = null;
    const inicio = (e: TouchEvent) => {
      g = null;
      if (e.touches.length !== 1 || (e.target instanceof Element && e.target.closest(SEM_DESLIZAR))) return;
      const t = e.touches[0];
      g = { x0: t.clientX, y0: t.clientY, base: x.current, dir: null, amostras: [{ y: t.clientX, t: e.timeStamp }] };
    };
    const mover = (e: TouchEvent) => {
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (!g.dir) {
        const d = direcaoGesto(dx, dy, 10);
        if (!d) return;
        if (d === 'vertical') {
          g = null;
          return;
        }
        g.dir = 'h';
        // Abrindo esta, a outra aberta fecha
        if (fecharAberta && fecharAberta !== fecharRef.current) fecharAberta();
      }
      if (e.cancelable) e.preventDefault();
      g.amostras.push({ y: t.clientX, t: e.timeStamp });
      if (g.amostras.length > 8) g.amostras.shift();
      const w = largura();
      let v = g.base + dx;
      // Elástico além das ações e para a direita
      if (v < -w) v = -w + (v + w) * 0.25;
      if (v > 0) v *= 0.2;
      posicionar(v, false);
    };
    const soltar = () => {
      const gg = g;
      g = null;
      if (!gg || gg.dir !== 'h') return;
      engolirClique.current = performance.now();
      const w = largura();
      const vel = velocidadeGesto(gg.amostras);
      const abre = vel <= -0.4 || (vel < 0.4 && x.current < -w / 2);
      if (abre) {
        if (!aberta) vibrarLeve();
        abrir();
      } else fechar();
    };
    el.addEventListener('touchstart', inicio, { passive: true });
    el.addEventListener('touchmove', mover, { passive: false });
    el.addEventListener('touchend', soltar);
    el.addEventListener('touchcancel', soltar);
    return () => {
      el.removeEventListener('touchstart', inicio);
      el.removeEventListener('touchmove', mover);
      el.removeEventListener('touchend', soltar);
      el.removeEventListener('touchcancel', soltar);
    };
  });

  // Aberta: tocar fora (ou rolar a página) fecha
  useEffect(() => {
    if (!aberta) return;
    const fora = (e: Event) => {
      if (raiz.current && e.target instanceof Node && !raiz.current.contains(e.target)) fecharRef.current();
    };
    document.addEventListener('pointerdown', fora, true);
    return () => document.removeEventListener('pointerdown', fora, true);
  }, [aberta]);

  // Apagar armado: volta ao normal sozinho (como o botão Excluir)
  useEffect(() => {
    if (armada === null) return;
    const t = setTimeout(() => setArmada(null), 5000);
    return () => clearTimeout(t);
  }, [armada]);

  // Ao sair da página (ou a linha sumir), não fica registrada como aberta
  useEffect(
    () => () => {
      if (fecharAberta === fecharRef.current) fecharAberta = null;
    },
    [],
  );

  // A largura das ações muda quando o Apagar pede confirmação: a frente acompanha
  useLayoutEffect(() => {
    if (aberta) posicionar(-largura(), true);
  }, [armada]);

  return (
    <div ref={raiz} className={`linha-deslizante ${aberta ? 'aberta' : ''} ${className ?? ''}`}>
      <div ref={caixaAcoes} className={`linha-acoes ${armada !== null ? 'armada' : ''}`} aria-hidden="true">
        {acoes.map((a, i) =>
          armada !== null && armada !== i ? null : (
            <button
              type="button"
              key={a.rotulo}
              tabIndex={-1}
              className={`linha-acao ${a.perigo ? 'perigo' : ''}`}
              onClick={() => {
                if (a.confirmar && armada !== i) {
                  vibrarLeve();
                  return setArmada(i);
                }
                fechar();
                void Promise.resolve(a.aoTocar()).catch(() => undefined);
              }}
            >
              {armada === i ? `${a.confirmar} Toque de novo para confirmar.` : a.rotulo}
            </button>
          ),
        )}
      </div>
      <div
        ref={frente}
        className="linha-frente"
        onClickCapture={(e) => {
          // Com as ações à mostra, tocar na linha só fecha; logo depois de um arraste, nada
          if (aberta || performance.now() - engolirClique.current < 350) {
            e.preventDefault();
            e.stopPropagation();
            if (aberta) fechar();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
