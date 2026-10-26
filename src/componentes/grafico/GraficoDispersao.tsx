// Dispersão em SVG: um ponto por semana/dia, reta de tendência opcional (mínimos quadrados) e r no canto.
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { casasDoPasso, dataCurta, dominioY, escalaLinear, formatarNumero, minimosQuadrados, posicaoDica } from '../../lib/grafico-escalas';
import { useDesenhoInicial, useGesto, useIdSvg, useLargura } from './comum';
import type { PropsGraficoDispersao } from './tipos';

const larguraTexto = (t: string) => t.length * 6.3 + 2;
const comUnidade = (t: string, u?: string) => (!u ? t : u === '%' ? `${t}%` : `${t} ${u}`);

export function GraficoDispersao({ pontos, eixoX, eixoY, tendencia, aoTocarPonto, altura = 240, titulo }: PropsGraficoDispersao) {
  const [corpoRef, largura] = useLargura<HTMLDivElement>();
  const idg = useIdSvg('gd');
  const [ativo, setAtivo] = useState<number | null>(null);
  const [fixo, setFixo] = useState(false);
  const animar = useDesenhoInicial(largura > 0, 900);
  const dicaRef = useRef<HTMLDivElement>(null);

  const validos = useMemo(() => pontos.map((p, i) => ({ ...p, i })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), [pontos]);
  const reta = useMemo(() => (tendencia ? minimosQuadrados(validos) : null), [tendencia, validos]);

  const geo = useMemo(() => {
    if (largura <= 0 || !validos.length) return null;
    const mt = 22;
    const mb = 36;
    const plotH = Math.max(40, altura - mt - mb);
    const tY = dominioY(validos.map((p) => p.y), { alvo: Math.max(2, Math.round(plotH / 46)), inteiro: eixoY.casas === 0 });
    const fmtY = (v: number) => formatarNumero(v, casasDoPasso(tY.passo));
    const rotY = tY.valores.map(fmtY);
    const ml = Math.ceil(Math.max(...rotY.map(larguraTexto))) + 8;
    const mr = 12;
    const plotW = Math.max(40, largura - ml - mr);
    const tX = dominioY(validos.map((p) => p.x), { alvo: Math.max(2, Math.floor(plotW / 64)), inteiro: eixoX.casas === 0 });
    const xs = escalaLinear([tX.min, tX.max], [ml, ml + plotW]);
    const ys = escalaLinear([tY.min, tY.max], [mt + plotH, mt]);
    return { mt, mb, plotH, plotW, ml, mr, tX, tY, rotY, xs, ys };
  }, [largura, validos, altura, eixoX.casas, eixoY.casas]);

  // Ordem por x para o teclado
  const ordemX = useMemo(() => [...validos].sort((a, b) => a.x - b.x || a.y - b.y).map((p) => p.i), [validos]);

  const maisPerto = (x: number, y: number, raio = 36) => {
    if (!geo) return null;
    let melhor: number | null = null;
    let dist = raio;
    for (const p of validos) {
      const d = Math.hypot(geo.xs(p.x) - x, geo.ys(p.y) - y);
      if (d < dist) {
        dist = d;
        melhor = p.i;
      }
    }
    return melhor;
  };
  // Na mira por arraste, vale o x (o dedo cobre o ponto)
  const maisPertoX = (x: number) => {
    if (!geo) return null;
    let melhor: number | null = null;
    let dist = Infinity;
    for (const p of validos) {
      const d = Math.abs(geo.xs(p.x) - x);
      if (d < dist) {
        dist = d;
        melhor = p.i;
      }
    }
    return melhor;
  };

  const { ref, handlers } = useGesto<SVGSVGElement>({
    aoMover: (x, y, tipo) => {
      const i = tipo === 'mouse' ? maisPerto(x, y, 28) : maisPertoX(x);
      setFixo(false);
      setAtivo(i);
    },
    aoSoltar: () => {
      if (!fixo) setAtivo(null);
    },
    aoTocar: (x, y) => {
      const i = maisPerto(x, y);
      if (i === null || (fixo && i === ativo)) {
        setFixo(false);
        setAtivo(null);
        return;
      }
      setFixo(true);
      setAtivo(i);
      aoTocarPonto?.(i);
    },
  });

  const aoTeclar = (e: KeyboardEvent) => {
    if (!ordemX.length) return;
    const pos = ativo === null ? -1 : ordemX.indexOf(ativo);
    let novo: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') novo = Math.min(ordemX.length - 1, pos + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') novo = pos < 0 ? ordemX.length - 1 : Math.max(0, pos - 1);
    else if (e.key === 'Home') novo = 0;
    else if (e.key === 'End') novo = ordemX.length - 1;
    else if (e.key === 'Escape') {
      setAtivo(null);
      setFixo(false);
      return;
    } else if (e.key === 'Enter' && ativo !== null) {
      aoTocarPonto?.(ativo);
      return;
    } else return;
    e.preventDefault();
    setFixo(true);
    setAtivo(ordemX[novo]);
  };

  const pa = ativo !== null ? pontos[ativo] : null;
  useLayoutEffect(() => {
    const el = dicaRef.current;
    if (el && geo && pa) {
      el.style.left = `${posicaoDica(geo.xs(pa.x), el.offsetWidth, largura, 14)}px`;
      // Acima do ponto; sem espaço, embaixo
      const y = geo.ys(pa.y);
      const acima = y - el.offsetHeight - 12;
      el.style.top = `${acima >= 0 ? acima : Math.max(0, Math.min(y + 12, altura - el.offsetHeight))}px`;
    }
  });

  const cx = eixoX.casas ?? 1;
  const cy = eixoY.casas ?? 1;
  const resumo = `${titulo}. ${validos.length} pontos de ${eixoX.nome} por ${eixoY.nome}.${reta ? ` Correlação r = ${formatarNumero(reta.r, 2)}.` : ''}`;

  return (
    <div className={`gr gr-dispersao${ativo !== null ? ' gr-com-mira' : ''}`}>
      <div className="gr-corpo" ref={corpoRef} style={{ height: altura }}>
        {!validos.length ? (
          <div className="gr-vazio">Sem dados suficientes</div>
        ) : (
          geo && (
            <>
              <div className="gr-foco" tabIndex={0} role="img" aria-label={resumo} onKeyDown={aoTeclar}>
                <svg ref={ref} className="gr-svg" width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true" {...handlers}>
                  <defs>
                    <clipPath id={`${idg}-clip`}>
                      <rect x={geo.ml} y={geo.mt} width={geo.plotW} height={geo.plotH} />
                    </clipPath>
                  </defs>
                  <rect className="gr-fundo-toque" x={0} y={0} width={largura} height={altura} />
                  {geo.tY.valores.map((v, i) => {
                    const y = Math.round(geo.ys(v)) + 0.5;
                    return (
                      <g key={`y${i}`}>
                        <line className={i === 0 ? 'gr-grade gr-grade-base' : 'gr-grade'} x1={geo.ml} x2={geo.ml + geo.plotW} y1={y} y2={y} />
                        <text className="gr-eixo" x={geo.ml - 7} y={geo.ys(v)} textAnchor="end" dominantBaseline="central">
                          {geo.rotY[i]}
                        </text>
                      </g>
                    );
                  })}
                  {geo.tX.valores.map((v, i) => {
                    const x = Math.round(geo.xs(v)) + 0.5;
                    return (
                      <g key={`x${i}`}>
                        {i > 0 && <line className="gr-grade gr-grade-v" x1={x} x2={x} y1={geo.mt} y2={geo.mt + geo.plotH} />}
                        <text className="gr-eixo" x={geo.xs(v)} y={geo.mt + geo.plotH + 15} textAnchor="middle">
                          {formatarNumero(v, casasDoPasso(geo.tX.passo))}
                        </text>
                      </g>
                    );
                  })}
                  <text className="gr-eixo-nome" x={geo.ml} y={11}>
                    {comUnidade(eixoY.nome, eixoY.unidade ? `(${eixoY.unidade})` : undefined)}
                  </text>
                  <text className="gr-eixo-nome" x={geo.ml + geo.plotW} y={altura - 4} textAnchor="end">
                    {comUnidade(eixoX.nome, eixoX.unidade ? `(${eixoX.unidade})` : undefined)}
                  </text>

                  {reta && (
                    <g clipPath={`url(#${idg}-clip)`}>
                      <line
                        className={`gr-tendencia${animar ? ' gr-desenhar' : ''}`}
                        pathLength={1}
                        x1={geo.xs(geo.tX.min)}
                        x2={geo.xs(geo.tX.max)}
                        y1={geo.ys(reta.a + reta.b * geo.tX.min)}
                        y2={geo.ys(reta.a + reta.b * geo.tX.max)}
                      />
                    </g>
                  )}
                  {validos.map((p) => (
                    <circle
                      key={p.i}
                      className={`gr-disp-ponto${p.destaque ? ' gr-disp-destaque' : ''}${ativo === p.i ? ' gr-disp-ativo' : ''}${animar ? ' gr-surgir' : ''}`}
                      cx={geo.xs(p.x)}
                      cy={geo.ys(p.y)}
                      r={ativo === p.i ? 6 : 4.5}
                    />
                  ))}
                </svg>
              </div>
              {reta && (
                <div className="gr-r" aria-hidden="true">
                  r = {formatarNumero(reta.r, 2)} <span>· n = {reta.n}</span>
                </div>
              )}
              {pa && (
                <div className="gr-dica" ref={dicaRef} aria-hidden="true">
                  {(pa.rotulo || pa.data) && <div className="gr-dica-data">{pa.rotulo ?? dataCurta(pa.data!)}</div>}
                  <div className="gr-dica-linha">
                    <span className="gr-dica-nome">{eixoX.nome}</span>
                    <span className="gr-dica-valor">{comUnidade(formatarNumero(pa.x, cx), eixoX.unidade)}</span>
                  </div>
                  <div className="gr-dica-linha">
                    <span className="gr-dica-nome">{eixoY.nome}</span>
                    <span className="gr-dica-valor">{comUnidade(formatarNumero(pa.y, cy), eixoY.unidade)}</span>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>
      <div className="gr-sr" aria-live="polite">
        {pa ? `${pa.rotulo ?? (pa.data ? dataCurta(pa.data) : '')}: ${eixoX.nome} ${formatarNumero(pa.x, cx)}, ${eixoY.nome} ${formatarNumero(pa.y, cy)}` : ''}
      </div>
      <div className="gr-sr">
        <table>
          <caption>{titulo}</caption>
          <thead>
            <tr>
              <th scope="col">Ponto</th>
              <th scope="col">{eixoX.nome}</th>
              <th scope="col">{eixoY.nome}</th>
            </tr>
          </thead>
          <tbody>
            {validos.map((p) => (
              <tr key={p.i}>
                <th scope="row">{p.rotulo ?? (p.data ? dataCurta(p.data) : p.i + 1)}</th>
                <td>{formatarNumero(p.x, cx)}</td>
                <td>{formatarNumero(p.y, cy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
