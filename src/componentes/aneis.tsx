// Anéis do dia no Início (Treino/Diário, Dieta/Checklist, Água) e o histórico do ciclo em anéis.
import { useEffect, useId, useRef, useState } from 'react';
import { useDados } from '../dados/contexto';
import { useMetaAgua } from '../dados/useTreino';
import { useProjeto } from '../dados/useProjeto';
import { aneisDoDia, anelFechados, historicoAneis, POSICOES, resumoHistorico, type AneisDia, type PosicaoAnel, type SemanaAneis } from '../lib/aneis-dia';
import { diaCurto } from '../lib/rotina';
import type { TarefasHoje } from './inicio';

/** Fica true quando o elemento aparece na tela (sem IntersectionObserver: logo depois de montar). */
function useVisto<T extends Element>() {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    let quadro = 0;
    // Um quadro depois: o anel vazio chega a ser pintado e a transição desenha a volta
    const marcar = () => (quadro = requestAnimationFrame(() => (quadro = requestAnimationFrame(() => setVisto(true)))));
    if (!el || typeof IntersectionObserver === 'undefined') {
      marcar();
      return () => cancelAnimationFrame(quadro);
    }
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          io.disconnect();
          marcar();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(quadro);
    };
  }, []);
  return { ref, visto };
}

const GEOMETRIA = {
  grande: { lado: 120, traco: 12, raios: [53, 39, 25] },
  mini: { lado: 32, traco: 3, raios: [14.5, 10.5, 6.5] },
} as const;

/** Três anéis concêntricos (fora → dentro: Treino/Diário, Dieta/Checklist, Água). */
export function AneisSvg({ aneis, tamanho = 'grande', desenhado = true }: { aneis: AneisDia; tamanho?: 'grande' | 'mini'; desenhado?: boolean }) {
  const g = GEOMETRIA[tamanho];
  const c0 = g.lado / 2;
  const id = useId().replace(/:/g, '');
  const grande = tamanho === 'grande';
  return (
    <svg viewBox={`0 0 ${g.lado} ${g.lado}`} className={`aneis-svg aneis-${tamanho} ${desenhado ? 'desenhado' : ''}`} aria-hidden="true">
      {grande && (
        <defs>
          <filter id={`brilho-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>
      )}
      {POSICOES.map((pos, i) => {
        const a = aneis[pos];
        const r = g.raios[i];
        const c = 2 * Math.PI * r;
        // Água pode passar da meta: o anel desenha no máximo a volta inteira
        const f = desenhado ? Math.min(Math.max(a.fracao, 0), 1) : 0;
        const giro = `rotate(-90 ${c0} ${c0})`;
        return (
          <g key={pos} className={`anel-${pos} ${a.fechado ? 'fechado' : ''}`} strokeWidth={g.traco}>
            <circle cx={c0} cy={c0} r={r} className="anel-trilho" />
            {grande && a.fechado && <circle cx={c0} cy={c0} r={r} className="anel-brilho" filter={`url(#brilho-${id})`} />}
            <circle
              cx={c0}
              cy={c0}
              r={r}
              className={`anel-arco ${f > 0 ? '' : 'vazio'}`}
              transform={giro}
              style={{ strokeDasharray: `${f * c} ${c}`, transitionDelay: grande ? `${i * 90}ms` : undefined }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Os anéis de hoje com a legenda; cada linha abre a ação do anel. */
export function AneisHoje({ aneis, acoes }: { aneis: AneisDia; acoes: Record<PosicaoAnel, () => void> }) {
  const { ref, visto } = useVisto<HTMLDivElement>();
  const resumo = POSICOES.map((p) => `${aneis[p].rotulo}: ${aneis[p].descricao}${aneis[p].fechado ? ', fechado' : ''}`).join('; ');
  return (
    <div className="aneis-hoje" ref={ref}>
      <div className="aneis-hoje-figura" role="img" aria-label={`Anéis de hoje. ${resumo}.`}>
        <AneisSvg aneis={aneis} desenhado={visto} />
      </div>
      <ul className="aneis-legenda">
        {POSICOES.map((p) => {
          const a = aneis[p];
          return (
            <li key={p}>
              <button type="button" className={`aneis-legenda-linha anel-${p} ${a.fechado ? 'fechado' : ''} ${a.anotado ? '' : 'vazio'}`} onClick={acoes[p]}>
                <span className="aneis-ponto" aria-hidden="true" />
                <span className="aneis-legenda-rotulo">{a.rotulo}</span>
                <span className="aneis-legenda-valor numero">
                  {a.texto}
                  {a.fechado && (
                    <span className="aneis-ok" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </span>
                <span className="aneis-legenda-seta" aria-hidden="true">
                  ›
                </span>
                <span className="oculto-visual">{` · ${a.descricao}${a.fechado ? ' · fechado' : ''}`}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const DIAS_COLUNA = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const SEMANAS_PADRAO = 4;

/** "Seu ciclo em anéis": um dia por célula, semanas em linhas (a mais recente em cima). */
export function HistoricoAneis({ semanas }: { semanas: SemanaAneis[] }) {
  const [tudo, setTudo] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const { ref, visto } = useVisto<HTMLDivElement>();
  const { hoje } = useDados();
  if (!semanas.length) return null;
  const visiveis = tudo ? semanas : semanas.slice(0, SEMANAS_PADRAO);
  const r = resumoHistorico(semanas);
  const exemplo = semanas[0].dias.find((d) => d.aneis)?.aneis ?? null;
  const celSel = sel ? semanas.flatMap((s) => s.dias).find((d) => d.data === sel && d.aneis) ?? null : null;
  return (
    <section className="cartao historico-aneis" aria-label="Seu ciclo em anéis">
      <div className="secao-cab">
        <div>
          <h2>Seu ciclo em anéis</h2>
          <div className="secao-sub numero">
            3 anéis em {r.completos} de {r.dias} {r.dias === 1 ? 'dia' : 'dias'}
          </div>
        </div>
        {semanas.length > SEMANAS_PADRAO && (
          <button type="button" className="botao pequeno" onClick={() => setTudo(!tudo)} aria-expanded={tudo}>
            {tudo ? `Últimas ${SEMANAS_PADRAO}` : 'Ver tudo'}
          </button>
        )}
      </div>
      {exemplo && (
        <div className="historico-legenda" aria-hidden="true">
          {POSICOES.map((p) => (
            <span key={p} className={`anel-${p}`}>
              <span className="aneis-ponto" />
              {exemplo[p].rotulo} <b className="numero">{r.porAnel[p]}</b>
            </span>
          ))}
        </div>
      )}
      <div className="historico-grade" ref={ref}>
        <div className="historico-linha historico-cab" aria-hidden="true">
          {DIAS_COLUNA.map((d, i) => (
            <span key={i}>
              {d}
            </span>
          ))}
        </div>
        {visiveis.map((s) => (
          <div className="historico-linha" key={s.segunda}>
            {s.dias.map((d) =>
              d.aneis ? (
                <button
                  type="button"
                  key={d.data}
                  className={`historico-dia ${d.hoje ? 'hoje' : ''} ${sel === d.data ? 'sel' : ''} ${anelFechados(d.aneis) === 3 ? 'completo' : ''}`}
                  aria-pressed={sel === d.data}
                  aria-label={`${diaCurto(d.data)}${d.hoje ? ' (hoje)' : ''}: ${anelFechados(d.aneis)} de 3 anéis fechados`}
                  onClick={() => setSel(sel === d.data ? null : d.data)}
                >
                  <AneisSvg aneis={d.aneis} tamanho="mini" desenhado={visto} />
                  <span className="historico-num numero">{Number(d.data.slice(8))}</span>
                </button>
              ) : (
                <span key={d.data} className={`historico-dia fora ${d.data > hoje ? 'futuro' : ''}`} aria-hidden="true">
                  <span className="historico-num numero">{Number(d.data.slice(8))}</span>
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      {celSel?.aneis && (
        <div className="historico-detalhe" role="region" aria-live="polite" aria-label={`Anéis de ${diaCurto(celSel.data)}`}>
          <div className="historico-detalhe-cab">
            <b>
              {diaCurto(celSel.data)}
              {celSel.hoje ? ' · hoje' : ''}
            </b>
            <span className="mudo numero">{anelFechados(celSel.aneis)} de 3 fechados</span>
            <button type="button" className="historico-fechar" onClick={() => setSel(null)} aria-label="Fechar o detalhe do dia">
              ×
            </button>
          </div>
          <ul>
            {POSICOES.map((p) => {
              const a = celSel.aneis![p];
              return (
                <li key={p} className={`anel-${p} ${a.fechado ? 'fechado' : ''}`}>
                  <span className="aneis-ponto" aria-hidden="true" />
                  <span className="cresce">{a.rotulo}</span>
                  <span className="numero">{a.texto}</span>
                  <span className="historico-estado">{a.fechado ? 'fechado' : a.anotado ? `${Math.round(Math.min(a.fracao, 1) * 100)}%` : 'sem registro'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Anéis de hoje (a mesma conta do checklist) e as semanas do ciclo. */
export function useAneis(h: TarefasHoje) {
  const { diario, treinos, medidas, hoje } = useDados();
  const proj = useProjeto();
  const metaAguaDe = useMetaAgua();
  const base = { comTreino: h.comTreino, comDieta: h.comDieta };
  const checklist = { feitas: h.progresso.feitas, total: h.progresso.total };
  const hojeAneis = aneisDoDia({ ...base, treino: h.tr, reg: h.reg, pesoMedicao: h.medicaoHoje?.peso_kg ?? null, metaAgua: h.metaAgua, checklist });
  const semanas = proj
    ? historicoAneis({ ...base, inicio: proj.periodo.inicio, hoje, diario, treinos, medidas, metaAgua: (d) => metaAguaDe(d).meta, checklistHoje: checklist })
    : [];
  return { hoje: hojeAneis, semanas };
}
