import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PE, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useMetaAgua, useTreino } from '../dados/useTreino';
import { tendenciaMedidas } from '../lib/conferencia';
import { formatarData, somarDias } from '../lib/datas';
import { num } from '../lib/formato';
import { montarRecap, NIVEL_NAUSEA, textoSemana, type Recap } from '../lib/recap-semana';
import { faltasNosPeriodos, sugestaoSemana } from '../lib/semana';
import { BotaoCompartilharProgresso } from './compartilhar';
import { Anel, tomAdesao } from './painel';
import { Icone } from './ui';
import '../estilos/compartilhar.css';

/** Tempo de cada cartão antes de passar sozinho (com "menos movimento", não passa sozinho). */
const DURACAO_MS = 9000;

/** As contas da semana (as mesmas do Resumo da semana). */
export function useRecap(data?: string): Recap | null {
  const { aplicacoes, treinos, diario, ciclo, dieta } = useDados();
  const { composicoes, resumo, hoje } = useCalculos();
  const treino = useTreino();
  const metaAgua = useMetaAgua();
  return useMemo(() => {
    const i = data ? composicoes.findIndex((c) => c.data === data) : composicoes.length - 1;
    const idx = i >= 0 ? i : composicoes.length - 1;
    const atual = composicoes[idx];
    if (!atual) return null;
    const inicio = resumo?.linhas[0]?.aplicacao.data ?? ciclo?.data_inicio ?? composicoes[0].data;
    const de = somarDias(atual.data, -7);
    const ate = somarDias(atual.data, -1);
    const faltas = treino
      ? faltasNosPeriodos(treinos, de, ate, treino.placarPos ? [treino.projeto, { inicio: treino.inicio, fim: treino.fim }] : [{ inicio: treino.inicio, fim: treino.fim }])
      : null;
    const tend = tendenciaMedidas(composicoes.slice(0, idx + 1), 42);
    return montarRecap({
      data: atual.data,
      composicoes,
      diario,
      aplicacoes: ciclo ? aplicacoes.filter((a) => a.ciclo_id === ciclo.id) : aplicacoes,
      treinos: treino ? treinos : null,
      faltas,
      corridas: treino?.corridas ?? [],
      inicio,
      hoje,
      metaAgua: (d) => metaAgua(d).meta,
      sugestao: sugestaoSemana(tend, atual.peso_kg, diario, dieta?.config.ajuste_kcal ?? null, inicio),
    });
  }, [data, composicoes, resumo, ciclo, aplicacoes, treinos, diario, dieta, treino, hoje, metaAgua]);
}

// ---------- Cartões ----------

function Cartao({ classe, sobre, titulo, children, rodape }: { classe: string; sobre: string; titulo: ReactNode; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className={`recap-conteudo ${classe}`}>
      <div className="recap-anima">
        <p className="recap-sobre">{sobre}</p>
        <h2 className="recap-titulo">{titulo}</h2>
        {children}
      </div>
      {rodape && <p className="recap-rodape">{rodape}</p>}
    </div>
  );
}

function CartaoNumeros({ r, sobre }: { r: Recap; sobre: string }) {
  const { itens, anterior, atipica } = r.numeros;
  return (
    <Cartao
      classe="recap-c-numeros"
      sobre={sobre}
      titulo={
        <>
          A semana
          <br />
          em números
        </>
      }
      rodape={anterior ? 'Sem cor: variação menor que o erro da fita e da balança.' : undefined}
    >
      <ul className="recap-lista-numeros">
        {itens.map((it) => (
          <li key={it.chave}>
            <span className="recap-rotulo">{it.rotulo}</span>
            <span className={`recap-grande numero ${it.tom ? `recap-${it.tom}` : ''}`}>{anterior ? it.texto : it.agora.replace(' agora', '')}</span>
            <span className="recap-sub numero">{anterior ? it.agora : 'agora'}</span>
          </li>
        ))}
      </ul>
      <p className="recap-nota">
        {atipica
          ? 'Medição atípica: fica no histórico, fora das tendências.'
          : anterior
            ? `Comparada com a medição de ${formatarData(anterior).slice(0, 5)}.`
            : 'Primeira medição: a comparação começa na próxima.'}
      </p>
    </Cartao>
  );
}

function CartaoConstancia({ r, sobre }: { r: Recap; sobre: string }) {
  const c = r.constancia;
  const a = c.adesao;
  const anel = (rotulo: string, feito: number, total: number, unidade: string) => {
    const f = total ? feito / total : null;
    return <Anel key={rotulo} rotulo={rotulo} fracao={f} tom={tomAdesao(f)} detalhe={total ? `${num(feito, feito % 1 ? 1 : 0)} de ${total} ${unidade}` : 'sem registro'} />;
  };
  return (
    <Cartao classe="recap-c-constancia" sobre={sobre} titulo="Constância">
      {c.vazio ? (
        <p className="recap-vazio">Sem registros nesta semana. Anote o dia no Diário para ver a constância aqui.</p>
      ) : (
        <>
          <div className="aneis recap-aneis">
            {c.treino && anel('Treino', c.treino.feito, c.treino.dias, 'dias')}
            {c.cardio && anel('Cardio', c.cardio.feito, c.cardio.dias, 'dias')}
            {a && a.dieta.total > 0 && anel('Dieta', a.dieta.feito, a.dieta.total, 'dias')}
            {a && anel('Água', a.agua.feito, a.agua.total, 'dias')}
            {a && anel('Sono 7 h+', a.sono.feito, a.sono.total, 'noites')}
            {a && !c.treino && anel('Diário', a.registro.feito, a.registro.total, 'dias')}
          </div>
          {c.faltas && <p className="recap-texto">{c.faltas}</p>}
        </>
      )}
    </Cartao>
  );
}

function CartaoCorpo({ r, sobre }: { r: Recap; sobre: string }) {
  const { dias, efeitos, pico, texto } = r.corpo;
  const contagem = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  // Só os sintomas respondidos no Diário (sem resposta, o chip não aparece)
  const sintomas: [string, number][] = [];
  for (const [rotulo, n] of [
    ['Vômito', efeitos.vomito],
    ['Diarreia', efeitos.diarreia],
    ['Intestino preso', efeitos.intestino_preso],
  ] as [string, number | null][])
    if (n !== null) sintomas.push([rotulo, n]);
  return (
    <Cartao classe="recap-c-corpo" sobre={sobre} titulo="Depois da dose" rodape="Só descreve o que você anotou no Diário. Náusea de 0 (nenhuma) a 3 (forte).">
      {dias.length > 0 && (
        <div className="recap-nausea" role="img" aria-label={`Náusea por dia: ${dias.map((d) => `${d.dia} ${d.nausea === null ? 'sem registro' : NIVEL_NAUSEA[d.nausea]}`).join(', ')}`}>
          {dias.map((d) => (
            <div key={d.data} className={`recap-dia ${pico?.data === d.data ? 'pico' : ''}`}>
              <div className="recap-dia-barra">
                <span className={`n${d.nausea ?? 'x'}`} style={{ '--n': d.nausea === null ? 0 : Math.max(d.nausea / 3, 0.08) } as CSSProperties} />
              </div>
              <span className="recap-dia-sem">{d.dia}</span>
              <span className={`recap-dia-d ${d.apos === 0 ? 'dose' : ''}`}>{d.apos === null ? '·' : d.apos === 0 ? 'dose' : `D${d.apos}`}</span>
            </div>
          ))}
        </div>
      )}
      <p className="recap-texto recap-destaque-texto">{texto}</p>
      {sintomas.length > 0 && (
        <div className="recap-chips">
          {sintomas.map(([rotulo, n]) => (
            <span key={rotulo} className={n ? 'com' : ''}>
              {rotulo} · {contagem(n)}
            </span>
          ))}
        </div>
      )}
    </Cartao>
  );
}

function CartaoDestaque({ r, sobre }: { r: Recap; sobre: string }) {
  const [principal, ...outros] = r.destaques;
  return (
    <Cartao classe="recap-c-destaque" sobre={sobre} titulo="Destaque da semana">
      {principal ? (
        <>
          <div className="recap-trofeu">
            <span className="recap-rotulo">{principal.titulo}</span>
            <span className="recap-enorme numero">{principal.valor}</span>
            <span className="recap-texto">{principal.detalhe}</span>
          </div>
          {outros.length > 0 && (
            <div className="recap-outros">
              <span className="recap-rotulo">Também nesta semana</span>
              <ul>
                {outros.slice(0, 3).map((d) => (
                  <li key={d.tipo}>
                    <span>{d.titulo}</span>
                    <b className="numero">{d.valor}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="recap-vazio">Semana registrada. Os destaques aparecem com mais registros: corridas, treinos e medidas.</p>
      )}
    </Cartao>
  );
}

function CartaoFoco({ r, sobre, aoCompartilhar, aoFechar }: { r: Recap; sobre: string; aoCompartilhar: (aberto: boolean) => void; aoFechar: () => void }) {
  return (
    <Cartao classe="recap-c-foco" sobre={sobre} titulo="Foco da próxima semana" rodape="Vem das regras do app. É só uma sugestão: nada muda sozinho.">
      <ol className="recap-lista-foco">
        {r.foco.map((f, i) => (
          <li key={i}>
            <span className="recap-foco-n" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <b>{f.texto}</b>
              {f.detalhe && <small>{f.detalhe}</small>}
            </span>
          </li>
        ))}
      </ol>
      <div className="recap-acoes">
        <BotaoCompartilharProgresso periodo={{ de: somarDias(r.data, -7), ate: r.data }} rotulo="Compartilhar a semana" classe="primario" aoMudarAberto={aoCompartilhar} />
        <button type="button" className="botao" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Cartao>
  );
}

// ---------- Stories ----------

const INTERATIVO = 'button, a, input, label, select, textarea, summary';

/**
 * Resumo da semana em tela cheia, como stories: arraste para os lados ou toque nas
 * laterais para trocar de cartão, arraste para baixo ou toque no X para fechar.
 */
export function RecapSemana({ data, aoFechar }: { data?: string; aoFechar: () => void }) {
  const r = useRecap(data);
  const [atual, setAtual] = useState(0);
  const [giro, setGiro] = useState(0);
  const [segurando, setSegurando] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);
  const [escondido, setEscondido] = useState(false);
  const [arrasto, setArrasto] = useState<{ dx: number; dy: number } | null>(null);
  const gesto = useRef<{ id: number; x: number; y: number; t: number; eixo: 'x' | 'y' | null } | null>(null);
  const palco = useRef<HTMLDivElement>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const sobre = r ? (r.antesDoCiclo ? `Medição · ${formatarData(r.data).slice(0, 5)}` : `Semana ${r.semana} · ${textoSemana(r.de, r.ate)}`) : '';
  const cartoes = r
    ? [
        { id: 'numeros', titulo: 'A semana em números', el: <CartaoNumeros r={r} sobre={sobre} /> },
        { id: 'constancia', titulo: 'Constância', el: <CartaoConstancia r={r} sobre={sobre} /> },
        { id: 'corpo', titulo: 'Depois da dose', el: <CartaoCorpo r={r} sobre={sobre} /> },
        { id: 'destaque', titulo: 'Destaque da semana', el: <CartaoDestaque r={r} sobre={sobre} /> },
        { id: 'foco', titulo: 'Foco da próxima semana', el: <CartaoFoco r={r} sobre={sobre} aoCompartilhar={setCompartilhando} aoFechar={aoFechar} /> },
      ]
    : [];
  const total = cartoes.length;

  const ir = useCallback(
    (passo: number) => {
      setAtual((i) => Math.min(Math.max(i + passo, 0), Math.max(total - 1, 0)));
      setGiro((g) => g + 1);
    },
    [total],
  );

  // Teclado: setas trocam, Esc fecha (só os stories, não a folha de baixo)
  const estado = useRef({ ir, aoFechar, compartilhando });
  estado.current = { ir, aoFechar, compartilhando };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (estado.current.compartilhando) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        estado.current.aoFechar();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        estado.current.ir(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        estado.current.ir(-1);
      }
    };
    window.addEventListener('keydown', tecla, true);
    const visivel = () => setEscondido(document.hidden);
    document.addEventListener('visibilitychange', visivel);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const antes = document.activeElement as HTMLElement | null;
    raiz.current?.focus();
    return () => {
      window.removeEventListener('keydown', tecla, true);
      document.removeEventListener('visibilitychange', visivel);
      document.body.style.overflow = overflow;
      antes?.focus?.();
    };
  }, []);

  function inicio(e: PE<HTMLDivElement>) {
    if (!palco.current?.contains(e.target as Node)) return; // eventos da folha de compartilhar (portal)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element).closest(INTERATIVO)) return;
    gesto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), eixo: null };
    setSegurando(true);
  }
  function mover(e: PE<HTMLDivElement>) {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.eixo) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) g.eixo = 'x';
      else if (dy > 10 && dy > Math.abs(dx)) g.eixo = 'y';
      else return;
      palco.current?.setPointerCapture?.(e.pointerId);
    }
    setArrasto(g.eixo === 'x' ? { dx, dy: 0 } : { dx: 0, dy: Math.max(dy, 0) });
  }
  function fim(e: PE<HTMLDivElement>) {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    gesto.current = null;
    setSegurando(false);
    setArrasto(null);
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const tempo = performance.now() - g.t;
    if (g.eixo === 'x') {
      if (dx < -50) ir(1);
      else if (dx > 50) ir(-1);
    } else if (g.eixo === 'y') {
      if (dy > 110) aoFechar();
    } else if (tempo < 400) {
      // Toque: terço esquerdo volta, o resto avança
      const caixa = palco.current!.getBoundingClientRect();
      if (e.clientX - caixa.left < caixa.width * 0.3) ir(-1);
      else ir(1);
    }
  }
  function cancelar() {
    gesto.current = null;
    setSegurando(false);
    setArrasto(null);
  }

  if (!r) return null;
  const pausado = segurando || compartilhando || escondido;
  const deslize = arrasto?.dx ?? 0;
  const descida = arrasto?.dy ?? 0;
  // Nas pontas, o arrasto para o lado de fora resiste
  const resistencia = (atual === 0 && deslize > 0) || (atual === total - 1 && deslize < 0) ? 0.3 : 1;

  return createPortal(
    <div
      ref={raiz}
      className={`recap ${pausado ? 'pausado' : ''} ${arrasto ? 'arrastando' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Resumo da semana em stories · ${sobre}`}
      tabIndex={-1}
      style={
        {
          '--recap-duracao': `${DURACAO_MS}ms`,
          transform: descida ? `translateY(${descida}px) scale(${1 - Math.min(descida / 2400, 0.08)})` : undefined,
          opacity: descida ? Math.max(1 - descida / 600, 0.4) : undefined,
        } as CSSProperties
      }
    >
      <div className="recap-topo">
        <div className="recap-barras" aria-hidden="true">
          {cartoes.map((c, i) => (
            <div key={c.id} className={`recap-barra ${i < atual ? 'passou' : i === atual ? 'ativa' : ''}`}>
              <span key={i === atual ? `a${giro}` : 'b'} className="recap-encher" onAnimationEnd={() => i === atual && atual < total - 1 && ir(1)} />
            </div>
          ))}
        </div>
        <div className="recap-cab">
          <span className="marca-mini recap-marca" aria-hidden="true">
            <img src={`${import.meta.env.BASE_URL}braco.webp`} alt="" />
          </span>
          <span className="recap-cab-texto">
            <b>Resumo da semana</b>
            <span>{sobre}</span>
          </span>
          <button type="button" className="icone-botao recap-fechar" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>
      </div>
      <div ref={palco} className="recap-palco" onPointerDown={inicio} onPointerMove={mover} onPointerUp={fim} onPointerCancel={cancelar} onContextMenu={(e) => e.preventDefault()}>
        <div className="recap-trilho" style={{ transform: `translateX(calc(${-atual * 100}% + ${deslize * resistencia}px))` }}>
          {cartoes.map((c, i) => (
            <section key={c.id} className={`recap-cartao recap-cartao-${c.id} ${i === atual ? 'ativa' : ''}`} aria-hidden={i !== atual} inert={i !== atual}>
              {c.el}
            </section>
          ))}
        </div>
      </div>
      <div className="recap-nav-leitor">
        <button type="button" className="oculto-visual" onClick={() => ir(-1)} disabled={atual === 0}>
          Cartão anterior
        </button>
        <button type="button" className="oculto-visual" onClick={() => ir(1)} disabled={atual === total - 1}>
          Próximo cartão
        </button>
        <p className="oculto-visual" aria-live="polite">
          Cartão {atual + 1} de {total}: {cartoes[atual]?.titulo}
        </p>
      </div>
    </div>,
    document.body,
  );
}

/** Botão de destaque que abre os stories da semana. */
export function BotaoStories({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <button type="button" className="botao botao-stories" onClick={aoAbrir}>
      <span className="botao-stories-anel" aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}braco.webp`} alt="" />
      </span>
      <span className="botao-stories-texto">
        <b>Ver em stories</b>
        <small>A semana em 5 cartões</small>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}
