import { useRef, useState, type PointerEvent as EventoPonteiro } from 'react';
import { formatarData } from '../lib/datas';
import { corVariacao } from '../lib/formato';
import { DIAS_MEDICAO_FOTO, medicaoProxima, numerosDaMedicao } from '../lib/fotos';
import { MDC, type Composicao } from '../lib/gordura';
import { paresComparar, passoCortina, posicaoCortina, type ChaveComparar } from '../lib/medidas-comparar';
import type { FotoTela } from './fotos';
import { Pilulas } from './painel';

/**
 * Antes × Depois sobrepostos com uma cortina: arrastar para o lado mostra mais
 * de uma ou da outra. Um dedo para cima ou para baixo continua rolando a página
 * (touch-action: pan-y); um toque leva a cortina até o ponto tocado.
 */
export function ComparadorFotos({ fotos, composicoes, feminino }: { fotos: FotoTela[]; composicoes: Composicao[]; feminino: boolean }) {
  const pares = paresComparar(fotos);
  const [chave, setChave] = useState<ChaveComparar | null>(null);
  const [pos, setPos] = useState(50);
  const [arrastando, setArrastando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  // Gesto em andamento: decide no começo se é para o lado (cortina) ou para cima/baixo (rolar a página)
  const gesto = useRef<{ id: number; x0: number; y0: number; ativo: boolean } | null>(null);
  if (!pares.length) return null;
  const par = pares.find((p) => p.chave === chave) ?? pares[0];

  const doPonto = (x: number) => {
    const r = caixa.current?.getBoundingClientRect();
    if (r) setPos(posicaoCortina(x, r.left, r.width));
  };
  const capturar = (id: number) => {
    try {
      caixa.current?.setPointerCapture?.(id);
    } catch {
      // o ponteiro já não está ativo
    }
  };
  const baixar = (e: EventoPonteiro<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Mouse: arrasta na hora; dedo: espera ver para que lado vai
    const mouse = e.pointerType === 'mouse';
    gesto.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ativo: mouse };
    if (mouse) {
      e.preventDefault();
      capturar(e.pointerId);
      setArrastando(true);
      doPonto(e.clientX);
    }
  };
  const mover = (e: EventoPonteiro<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.ativo) {
      const dx = Math.abs(e.clientX - g.x0);
      const dy = Math.abs(e.clientY - g.y0);
      if (dx > 6 && dx > dy) {
        g.ativo = true;
        capturar(e.pointerId);
        setArrastando(true);
      } else if (dy > 6) {
        // Rolagem da página: a cortina fica onde está
        gesto.current = null;
        return;
      } else return;
    }
    doPonto(e.clientX);
  };
  const soltar = (e: EventoPonteiro<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    gesto.current = null;
    setArrastando(false);
    // Toque parado: a cortina vai até o ponto tocado (com animação)
    if (!g.ativo) doPonto(e.clientX);
  };
  const cancelar = () => {
    gesto.current = null;
    setArrastando(false);
  };

  const { antes, depois } = par;
  const cA = medicaoProxima(composicoes, antes.data);
  const cD = medicaoProxima(composicoes, depois.data);
  const numeros = cD && cA && cA.data !== cD.data ? numerosDaMedicao(cD, feminino, cA) : [];
  const proporcao = Math.min(Math.max(antes.largura / antes.altura || 0.75, 0.56), 1.33);
  const diaCurto = (d: string) => formatarData(d, true);

  return (
    <div className="cmp">
      {pares.length > 1 ? (
        <div className="pilulas-rolagem">
          <Pilulas rotulo="Pose do comparador" opcoes={pares.map((p) => [p.chave, p.rotulo] as [ChaveComparar, string])} valor={par.chave} aoMudar={setChave} />
        </div>
      ) : (
        <div className="cmp-pose">
          {par.chave === 'geral' ? 'Primeira do Antes × mais recente do Depois' : `${par.rotulo}: primeira do Antes × mais recente do Depois`}
        </div>
      )}
      <div
        ref={caixa}
        className={`cmp-caixa${arrastando ? ' arrastando' : ''}`}
        style={{ aspectRatio: String(proporcao) }}
        onPointerDown={baixar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={cancelar}
      >
        <img className="cmp-foto" src={depois.url} alt={`Depois, ${diaCurto(depois.data)}`} draggable={false} />
        <img
          className="cmp-foto cmp-antes"
          src={antes.url}
          alt={`Antes, ${diaCurto(antes.data)}`}
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
        <span className="cmp-etiqueta esquerda" style={{ opacity: pos > 18 ? 1 : 0 }}>
          Antes · {diaCurto(antes.data)}
        </span>
        <span className="cmp-etiqueta direita" style={{ opacity: pos < 82 ? 1 : 0 }}>
          Depois · {diaCurto(depois.data)}
        </span>
        <div className="cmp-linha" style={{ left: `${pos}%` }}>
          <div
            className="cmp-alca"
            role="slider"
            tabIndex={0}
            aria-label="Cortina entre Antes e Depois"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            aria-valuetext={`${Math.round(pos)}% Antes`}
            onKeyDown={(e) => {
              const p = passoCortina(pos, e.key);
              if (p === null) return;
              e.preventDefault();
              setPos(p);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
            </svg>
          </div>
        </div>
      </div>
      {numeros.length > 0 ? (
        <div className="cmp-numeros">
          {numeros.map((n) => (
            <div key={n.chave} className="cmp-numero">
              <span className="cmp-numero-rotulo">{n.rotulo === '% de gordura' ? 'Gordura' : n.rotulo}</span>
              <b className="numero">{n.valor}</b>
              <span className={`cmp-delta numero ${corVariacao(n.delta, true, MDC[n.chave])}`}>{n.variacao}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mudo" style={{ margin: 0 }}>
          {!cA || !cD
            ? `Os números aparecem com uma medição até ${DIAS_MEDICAO_FOTO} dias de cada foto.`
            : 'As duas fotos estão perto da mesma medição: sem variação para mostrar.'}
        </p>
      )}
      {numeros.length > 0 && cA && cD && (
        <p className="mudo cmp-nota">
          Variação entre as medições de {diaCurto(cA.data)} e {diaCurto(cD.data)}.
        </p>
      )}
    </div>
  );
}
