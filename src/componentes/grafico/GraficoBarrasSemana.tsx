// Barras por categoria (semanas, fases) em SVG: topo arredondado, toque numa barra seleciona.
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { caminhoBarra, casasDoPasso, dominioY, escalaLinear, formatarNumero, posicaoDica, ticksBonitos } from '../../lib/grafico-escalas';
import { corCss, useDesenhoInicial, useGesto, useLargura } from './comum';
import type { PropsGraficoBarrasSemana } from './tipos';

const larguraTexto = (t: string) => t.length * 6.3 + 2;

export function GraficoBarrasSemana({ barras, series, selecionada, aoSelecionar, max, altura = 200, formato, titulo }: PropsGraficoBarrasSemana) {
  const [corpoRef, largura] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);
  const animar = useDesenhoInicial(largura > 0, 900);
  const dicaRef = useRef<HTMLDivElement>(null);

  const todos = useMemo(() => barras.flatMap((b) => b.valores.map((v) => v.valor)).filter((v): v is number => v !== null && Number.isFinite(v)), [barras]);
  const inteiros = todos.every((v) => Number.isInteger(v));
  const fmt = formato ?? ((v: number) => formatarNumero(v, inteiros ? 0 : 1));
  const legenda = series.length > 1;

  const geo = useMemo(() => {
    if (largura <= 0 || !barras.length) return null;
    const mt = 14;
    const mb = 22;
    const plotH = Math.max(40, altura - mt - mb);
    const alvo = Math.max(2, Math.round(plotH / 44));
    const t = max !== undefined && Number.isFinite(max) ? ticksBonitos(Math.min(0, ...todos), max, alvo, inteiros && max >= 4) : dominioY(todos.length ? todos : [0, 1], { comZero: true, alvo, inteiro: inteiros });
    const fmtEixo = formato ?? ((v: number) => formatarNumero(v, casasDoPasso(t.passo)));
    const rot = t.valores.map(fmtEixo);
    const ml = Math.ceil(Math.max(...rot.map(larguraTexto))) + 8;
    const mr = 6;
    const plotW = Math.max(40, largura - ml - mr);
    const ys = escalaLinear([t.min, t.max], [mt + plotH, mt]);
    const banda = plotW / barras.length;
    const n = Math.max(1, series.length);
    const w = Math.max(3, Math.min(24, (banda * 0.68 - (n - 1) * 2) / n));
    const grupo = n * w + (n - 1) * 2;
    // Rótulos: pula alguns quando não cabem
    const maiorRot = Math.max(...barras.map((b) => larguraTexto(b.rotulo)));
    const pulo = Math.max(1, Math.ceil((maiorRot + 6) / banda));
    return { mt, mb, plotH, plotW, ml, t, rot, ys, banda, w, grupo, pulo };
  }, [largura, barras, altura, max, todos, formato, series.length, inteiros]);

  const indiceEm = (x: number) => {
    if (!geo) return null;
    const i = Math.floor((x - geo.ml) / geo.banda);
    return i >= 0 && i < barras.length ? i : null;
  };

  const { ref, handlers } = useGesto<SVGSVGElement>({
    aoMover: (x) => setAtivo(indiceEm(x)),
    aoSoltar: () => setAtivo(null),
    aoTocar: (x) => {
      const i = indiceEm(x);
      if (i === null) return;
      const chave = barras[i].chave;
      aoSelecionar?.(selecionada === chave ? null : chave);
      setAtivo(null);
    },
  });

  const [focoI, setFocoI] = useState<number | null>(null);
  const aoTeclar = (e: KeyboardEvent) => {
    if (!barras.length) return;
    const atual = focoI ?? (selecionada ? barras.findIndex((b) => b.chave === selecionada) : -1);
    let novo: number | null = null;
    if (e.key === 'ArrowRight') novo = Math.min(barras.length - 1, atual + 1);
    else if (e.key === 'ArrowLeft') novo = atual < 0 ? barras.length - 1 : Math.max(0, atual - 1);
    else if (e.key === 'Home') novo = 0;
    else if (e.key === 'End') novo = barras.length - 1;
    else if ((e.key === 'Enter' || e.key === ' ') && atual >= 0) {
      e.preventDefault();
      const chave = barras[atual].chave;
      aoSelecionar?.(selecionada === chave ? null : chave);
      return;
    } else if (e.key === 'Escape') {
      setFocoI(null);
      setAtivo(null);
      return;
    } else return;
    e.preventDefault();
    setFocoI(novo);
    setAtivo(novo);
  };

  const mostrar = ativo;
  useLayoutEffect(() => {
    const el = dicaRef.current;
    if (el && geo && mostrar !== null) el.style.left = `${posicaoDica(geo.ml + geo.banda * (mostrar + 0.5), el.offsetWidth, largura, geo.grupo / 2 + 8)}px`;
  });

  const temSel = !!selecionada && barras.some((b) => b.chave === selecionada);
  const resumo = `${titulo}. ` + barras.map((b) => `${b.rotulo}: ${b.valores.map((v) => (series.length > 1 ? `${series.find((s) => s.id === v.serie)?.nome ?? v.serie} ` : '') + (v.valor === null ? 'sem dado' : fmt(v.valor))).join(', ')}`).join('; ');
  // Valor no topo só com uma série e poucas barras largas
  const rotularTopo = !!geo && series.length === 1 && geo.banda >= 30;

  return (
    <div className={`gr gr-barras${ativo !== null ? ' gr-com-mira' : ''}`}>
      {legenda && (
        <div className="gr-cab">
          <ul className="gr-legenda" aria-label="Legenda">
            {series.map((s, i) => (
              <li key={s.id}>
                <svg className="gr-chave" width={10} height={10} viewBox="0 0 10 10" aria-hidden="true">
                  <rect x={1.5} y={1} width={7} height={8} rx={2} style={{ fill: corCss(s.cor, i) }} />
                </svg>
                {s.nome}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="gr-corpo" ref={corpoRef} style={{ height: altura }}>
        {!barras.length ? (
          <div className="gr-vazio">Sem dados no período</div>
        ) : (
          geo && (
            <>
              <div className="gr-foco" tabIndex={0} role="img" aria-label={resumo} onKeyDown={aoTeclar} onBlur={() => setFocoI(null)}>
                <svg ref={ref} className="gr-svg" width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true" {...handlers}>
                  <rect className="gr-fundo-toque" x={0} y={0} width={largura} height={altura} />
                  {geo.t.valores.map((v, i) => {
                    const y = Math.round(geo.ys(v)) + 0.5;
                    return (
                      <g key={i}>
                        <line className={v === 0 ? 'gr-grade gr-grade-base' : 'gr-grade'} x1={geo.ml} x2={geo.ml + geo.plotW} y1={y} y2={y} />
                        <text className="gr-eixo" x={geo.ml - 7} y={geo.ys(v)} textAnchor="end" dominantBaseline="central">
                          {geo.rot[i]}
                        </text>
                      </g>
                    );
                  })}
                  {barras.map((b, i) => {
                    const cx = geo.ml + geo.banda * (i + 0.5);
                    const sel = b.chave === selecionada;
                    const apagada = temSel && !sel;
                    const y0 = geo.ys(Math.max(geo.t.min, Math.min(0, geo.t.max)));
                    return (
                      <g key={b.chave} className={`gr-barra-grupo${apagada ? ' gr-apagada' : ''}${sel ? ' gr-selecionada' : ''}`}>
                        {(sel || ativo === i || focoI === i) && (
                          <rect className={focoI === i ? 'gr-barra-fundo gr-barra-foco' : 'gr-barra-fundo'} x={cx - geo.banda / 2 + 2} y={geo.mt - 6} width={geo.banda - 4} height={geo.plotH + 6} rx={8} />
                        )}
                        {series.map((s, k) => {
                          const v = b.valores.find((q) => q.serie === s.id)?.valor ?? null;
                          const x = cx - geo.grupo / 2 + k * (geo.w + 2);
                          if (v === null || !Number.isFinite(v)) return <line key={s.id} className="gr-barra-nula" x1={x + 1} x2={x + geo.w - 1} y1={y0 - 1} y2={y0 - 1} />;
                          return (
                            <path
                              key={s.id}
                              className={`gr-barra gr-barra-cat${animar ? ' gr-crescer' : ''}`}
                              d={caminhoBarra(x, geo.w, y0, geo.ys(v), Math.min(4, geo.w / 2))}
                              style={{ fill: corCss(s.cor, k), animationDelay: animar ? `${i * 30}ms` : undefined }}
                            />
                          );
                        })}
                        {rotularTopo && b.valores[0]?.valor != null && (
                          <text className="gr-barra-valor" x={cx} y={geo.ys(Math.max(0, b.valores.find((q) => q.serie === series[0].id)?.valor ?? 0)) - 5} textAnchor="middle">
                            {fmt(b.valores.find((q) => q.serie === series[0].id)?.valor ?? 0)}
                          </text>
                        )}
                        {i % geo.pulo === 0 && (
                          <text className={`gr-eixo${sel ? ' gr-eixo-forte' : ''}`} x={cx} y={altura - 5} textAnchor="middle">
                            {b.rotulo}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
              {mostrar !== null && barras[mostrar] && (
                <div className="gr-dica" ref={dicaRef} style={{ top: geo.mt }} aria-hidden="true">
                  <div className="gr-dica-data">{barras[mostrar].rotulo}</div>
                  {series.map((s, k) => {
                    const v = barras[mostrar].valores.find((q) => q.serie === s.id)?.valor ?? null;
                    return (
                      <div key={s.id} className="gr-dica-linha">
                        <svg className="gr-chave" width={10} height={10} viewBox="0 0 10 10" aria-hidden="true">
                          <rect x={1.5} y={1} width={7} height={8} rx={2} style={{ fill: corCss(s.cor, k) }} />
                        </svg>
                        <span className="gr-dica-nome">{s.nome}</span>
                        <span className="gr-dica-valor">{v === null ? '–' : fmt(v)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )
        )}
      </div>
      <div className="gr-sr" aria-live="polite">
        {focoI !== null && barras[focoI] ? `${barras[focoI].rotulo}: ${barras[focoI].valores.map((v) => (v.valor === null ? 'sem dado' : fmt(v.valor))).join(', ')}` : ''}
      </div>
    </div>
  );
}
