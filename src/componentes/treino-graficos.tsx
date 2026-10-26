// Gráficos do Treino no motor SVG: pace das corridas (com recordes) e aderência × medidas por semana.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { diaSemanaCurto, formatarData, somarDias } from '../lib/datas';
import { num, sinal } from '../lib/formato';
import { posicaoDica } from '../lib/grafico-escalas';
import { formatarKm, formatarTempo, type Corrida, type Semana } from '../lib/treino';
import { marcosRecordes, recordesCorridas, semanaDaData, semanaDaMedicao, type MetricaSemanal } from '../lib/treino-grafico';
import { GraficoBarrasSemana, GraficoTempo, ProvedorSincronia, useSincronia, type Periodo, type Serie } from './grafico';

const SINC_PACE = 'treino-pace';

/**
 * Pace das corridas: linha em segundos por km (mais baixo = mais rápido), linha do melhor pace
 * e marcos nos recordes. A dica é desta tela: o pace aparece em min:s /km.
 */
export function GraficoPaceCorridas({ corridas }: { corridas: Corrida[] }) {
  return (
    <ProvedorSincronia>
      <Pace corridas={corridas} />
    </ProvedorSincronia>
  );
}

function Pace({ corridas }: { corridas: Corrida[] }) {
  const { data } = useSincronia(SINC_PACE);
  const raiz = useRef<HTMLDivElement>(null);
  const dica = useRef<HTMLDivElement>(null);
  const series = useMemo<Serie[]>(
    () => [{ id: 'pace', nome: 'Pace', tipo: 'linha', pontos: corridas.map((c) => ({ data: c.data, valor: Math.round(c.pace) })), cor: 'texto', casas: 0, unidade: 's/km' }],
    [corridas],
  );
  const marcos = useMemo(() => marcosRecordes(corridas), [corridas]);
  const recordes = useMemo(() => new Map(recordesCorridas(corridas).map((r) => [r.data, r])), [corridas]);
  const melhor = corridas.length ? Math.min(...corridas.map((c) => Math.round(c.pace))) : null;
  const corrida = data ? corridas.find((c) => c.data === data) ?? null : null;
  const recorde = corrida ? recordes.get(corrida.data) : undefined;

  // A dica segue a linha da mira do gráfico (mesma posição da dica padrão)
  useLayoutEffect(() => {
    const el = dica.current;
    const r = raiz.current;
    if (!el || !r) return;
    const linha = r.querySelector('.gr-mira-linha');
    const corpo = r.querySelector('.gr-corpo');
    if (!linha || !corpo) {
      el.style.visibility = 'hidden';
      return;
    }
    const rr = r.getBoundingClientRect();
    const rc = corpo.getBoundingClientRect();
    const x = linha.getBoundingClientRect().left - rc.left;
    el.style.left = `${rc.left - rr.left + posicaoDica(x, el.offsetWidth, rc.width, 12)}px`;
    el.style.top = `${rc.top - rr.top + 10}px`;
    el.style.visibility = 'visible';
  });

  return (
    <div className="treino-pace" ref={raiz}>
      <GraficoTempo
        titulo="Pace das corridas (segundos por km; mais baixo = mais rápido)"
        series={series}
        marcos={marcos}
        referencias={melhor !== null ? [{ valor: melhor, rotulo: `melhor ${formatarTempo(melhor)}`, cor: 'bom' }] : []}
        sincronia={SINC_PACE}
        altura={200}
        formatoEsq={(v) => formatarTempo(v)}
        legenda={false}
      />
      {corrida && (
        <div className="gr-dica pace-dica" ref={dica} aria-hidden="true" style={{ visibility: 'hidden' }}>
          <div className="gr-dica-data">
            {diaSemanaCurto(corrida.data)}, {formatarData(corrida.data, true).slice(0, 5)}
          </div>
          <div className="gr-dica-linha">
            <span className="gr-dica-nome">Pace</span>
            <span className="gr-dica-valor">{formatarTempo(corrida.pace)} /km</span>
          </div>
          <div className="gr-dica-linha">
            <span className="gr-dica-nome">Distância</span>
            <span className="gr-dica-valor">{formatarKm(corrida.km)}</span>
          </div>
          <div className="gr-dica-linha">
            <span className="gr-dica-nome">Tempo</span>
            <span className="gr-dica-valor">{formatarTempo(corrida.segundos)}</span>
          </div>
          {corrida.delta !== null && (
            <div className={`pace-dica-delta ${corrida.delta < 0 ? 'pace-mais-rapida' : corrida.delta > 0 ? 'pace-mais-lenta' : ''}`}>
              {corrida.delta === 0 ? 'igual à anterior' : `${corrida.delta < 0 ? '−' : '+'}${formatarTempo(Math.abs(corrida.delta))} vs anterior`}
            </div>
          )}
          {recorde && <div className="pace-dica-recorde">★ Recorde{recorde.pace && recorde.distancia ? ' de pace e distância' : recorde.pace ? ' de pace' : ' de distância'}</div>}
        </div>
      )}
    </div>
  );
}

const METRICA: Record<MetricaSemanal, { nome: string; unidade: string; sufixo: string }> = {
  cintura_cm: { nome: 'Cintura', unidade: 'cm', sufixo: ' cm' },
  bf: { nome: '% de gordura', unidade: '%', sufixo: ' p.p.' },
  massa_magra_kg: { nome: 'Massa magra', unidade: 'kg', sufixo: ' kg' },
  peso_kg: { nome: 'Peso', unidade: 'kg', sufixo: ' kg' },
};

/**
 * Aderência por semana (barras; toque numa semana para destacá-la) e, embaixo, a medida da
 * segunda-feira seguinte na mesma linha do tempo.
 */
export function AderenciaMedidas({ semanas, metrica }: { semanas: Semana[]; metrica: MetricaSemanal }) {
  const [sel, setSel] = useState<string | null>(null);
  const r = METRICA[metrica];
  const segundas = useMemo(() => semanas.map((s) => s.segunda), [semanas]);
  const barras = useMemo(
    () => semanas.map((s) => ({ chave: s.segunda, rotulo: `S${s.numero}`, valores: [{ serie: 'ad', valor: s.aderencia === null ? null : Math.round(s.aderencia * 100) }] })),
    [semanas],
  );
  const pontos = useMemo(
    () => semanas.filter((s) => s.medida && s.medida[metrica] !== null).map((s) => ({ data: s.medida!.data, valor: s.medida![metrica] as number })),
    [semanas, metrica],
  );
  const series = useMemo<Serie[]>(() => [{ id: metrica, nome: r.nome, tipo: 'linha', pontos, cor: 'aviso', casas: 1, unidade: r.unidade }], [metrica, r.nome, r.unidade, pontos]);
  const periodo = useMemo<Periodo | null>(() => (semanas.length ? { de: semanas[0].segunda, ate: somarDias(semanas[semanas.length - 1].segunda, 7) } : null), [semanas]);
  const iSel = sel ? semanas.findIndex((s) => s.segunda === sel) : -1;
  const semana = iSel >= 0 ? semanas[iSel] : null;
  // Semana + a segunda seguinte (o dia da medição que mostra o resultado dela)
  const destaque = semana ? { de: semana.segunda, ate: somarDias(semana.segunda, 7) } : null;
  const valorDe = (s: Semana | undefined) => (s?.medida ? (s.medida[metrica] as number | null) : null);
  const anterior = iSel > 0 ? semanas.slice(0, iSel).reverse().find((s) => valorDe(s) !== null) : undefined;
  const v = valorDe(semana ?? undefined);
  const va = valorDe(anterior);
  const fmt = (n: number) => (r.unidade === '%' ? `${num(n, 1)}%` : `${num(n, 1)} ${r.unidade}`);

  return (
    <div className="aderencia-graficos">
      <GraficoBarrasSemana
        titulo="Aderência por semana"
        barras={barras}
        series={[{ id: 'ad', nome: 'Aderência', cor: 'neutro' }]}
        selecionada={sel}
        aoSelecionar={setSel}
        max={100}
        altura={150}
        formato={(n) => `${Math.round(n)}%`}
      />
      <div className="aderencia-semana" aria-live="polite">
        {semana ? (
          <>
            <b>
              S{semana.numero} · {formatarData(semana.segunda, true).slice(0, 5)} a {formatarData(somarDias(semana.segunda, 6), true).slice(0, 5)}
            </b>
            <span>
              Aderência <b className="numero">{semana.aderencia === null ? '–' : `${Math.round(semana.aderencia * 100)}%`}</b>
            </span>
            <span>
              {r.nome} na segunda seguinte <b className="numero">{v === null ? 'sem medição' : fmt(v)}</b>
              {v !== null && va !== null && <span className="numero mudo"> ({sinal(v - va, 1, r.sufixo)})</span>}
            </span>
          </>
        ) : (
          <span className="mudo">Toque numa semana para ver o resultado dela na medida.</span>
        )}
      </div>
      {pontos.length > 0 ? (
        <GraficoTempo
          titulo={`${r.nome} na segunda-feira seguinte`}
          series={series}
          periodo={periodo}
          destaque={destaque}
          aoTocarData={(d) => {
            const s = semanaDaMedicao(segundas, d) ?? semanaDaData(segundas, d);
            if (s) setSel(s);
          }}
          altura={140}
          legenda
        />
      ) : (
        <p className="mudo aderencia-sem-medida">Sem medição de segunda-feira para {r.nome.toLowerCase()} ainda.</p>
      )}
    </div>
  );
}
