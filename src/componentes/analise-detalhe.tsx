// Detalhe de um indicador (folha ao tocar no KPI): histórico com zoom, início × agora,
// melhor e pior semana, variação por fase, esta semana × anterior e a previsão.
import { useMemo, type ReactNode } from 'react';
import { GraficoBarrasSemana, type Marco, type Periodo, type PontoSerie, type Referencia, type Serie } from './grafico';
import { GraficoJanela } from './analise-graficos';
import { GraficoPrevisao } from './analise-previsao';
import { Kpi, Variacoes } from './painel';
import { Bloco, Folha, Vazio } from './ui';
import { estaSemanaVsAnterior, extremosSemanais, rotuloSemana, variacaoPorFase, variacoesSemanais } from '../lib/analise-detalhe';
import type { Previsao } from '../lib/analise-previsao';
import { formatarData } from '../lib/datas';
import { corVariacao, num, sinal } from '../lib/formato';

/** KPI tocável: abre o detalhe da medida. */
export function KpiToque({ aoAbrir, ...kpi }: Parameters<typeof Kpi>[0] & { aoAbrir: () => void }) {
  return (
    <button type="button" className="kpi-toque" onClick={aoAbrir} aria-haspopup="dialog" title={`Ver o detalhe de ${kpi.rotulo.toLowerCase()}`}>
      <Kpi {...kpi} />
      <span className="kpi-toque-seta" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export interface DetalheMetrica {
  titulo: string;
  /** Nome no texto da previsão ("peso", "cintura") */
  nome: string;
  pontos: PontoSerie[];
  unidade: string;
  casas: number;
  menorMelhor: boolean;
  /** Limiar de ruído da fita/balança (abaixo dele a variação fica cinza) */
  mdc?: number;
  inicio?: number | null;
  meta?: number | null;
  previsao?: Previsao | null;
  comoLer: ReactNode;
  /** Ritmo: barras da variação semanal no lugar do gráfico do histórico */
  extra?: ReactNode;
}

export function FolhaMetrica({
  d,
  marcos,
  fases,
  hoje,
  destaque,
  aoFechar,
}: {
  d: DetalheMetrica;
  marcos: Marco[];
  fases: { rotulo: string; de: string; ate: string }[];
  hoje: string;
  destaque: Periodo | null;
  aoFechar: () => void;
}) {
  const fmt = (v: number | null | undefined) => (v == null ? '–' : `${num(v, d.casas)}${d.unidade === '%' ? '%' : ` ${d.unidade}`}`);
  const fmtD = (v: number | null | undefined) => (v == null ? '–' : sinal(v, d.casas, d.unidade === '%' ? ' p.p.' : ` ${d.unidade}`));
  const normais = useMemo(() => d.pontos.filter((p) => p.valor !== null && !p.atipico).map((p) => ({ data: p.data, valor: p.valor as number })), [d.pontos]);
  const semanas = useMemo(() => variacoesSemanais(normais), [normais]);
  const ext = extremosSemanais(semanas, d.menorMelhor);
  const esta = estaSemanaVsAnterior(normais, hoje);
  const porFase = useMemo(() => variacaoPorFase(normais, fases), [normais, fases]);
  const escalaFase = Math.max(...porFase.map((f) => Math.abs(f.delta ?? 0)), d.mdc ?? 0.1);
  const series = useMemo<Serie[]>(() => [{ id: 'm', nome: d.titulo, tipo: 'area', pontos: d.pontos, cor: 'texto', unidade: d.unidade, casas: d.casas }], [d]);
  const referencias: Referencia[] = [
    ...(d.inicio != null ? [{ valor: d.inicio, rotulo: `início ${num(d.inicio, d.casas)}`, cor: 'neutro' as const }] : []),
    ...(d.meta != null ? [{ valor: d.meta, rotulo: `meta ${num(d.meta, d.casas)}`, cor: 'bom' as const }] : []),
  ];
  const atual = normais.length ? normais[normais.length - 1] : null;
  const primeira = normais[0] ?? null;
  const cor = (v: number | null) => corVariacao(v, d.menorMelhor, d.mdc ?? 0);

  return (
    <Folha titulo={d.titulo} aoFechar={aoFechar}>
      <div className="pilha analise-folha">
        {d.extra}
        {normais.length >= 2 ? (
          <GraficoJanela
            titulo={`${d.titulo}: histórico`}
            series={series}
            referencias={referencias}
            marcos={marcos}
            destaque={destaque}
            janela={null}
            altura={210}
            permitirZoom
            expandivel
          />
        ) : (
          <Vazio>Com 2 medições, aparece o histórico.</Vazio>
        )}

        <div className="grade">
          <Bloco rotulo={`Início${primeira ? ` · ${formatarData(primeira.data).slice(0, 5)}` : ''}`} valor={fmt(d.inicio ?? primeira?.valor)} />
          <Bloco rotulo={`Atual${atual ? ` · ${formatarData(atual.data).slice(0, 5)}` : ''}`} valor={fmt(atual?.valor)} />
          <Bloco
            rotulo={ext ? `Melhor · ${rotuloSemana(ext.melhor.segunda)}` : 'Melhor semana'}
            valor={ext ? <span className={cor(ext.melhor.delta)}>{fmtD(ext.melhor.delta)}</span> : '–'}
          />
          <Bloco rotulo={ext ? `Pior · ${rotuloSemana(ext.pior.segunda)}` : 'Pior semana'} valor={ext ? <span className={cor(ext.pior.delta)}>{fmtD(ext.pior.delta)}</span> : '–'} />
        </div>

        <div className="analise-semana">
          <div className="rotulo">Esta semana × anterior</div>
          {esta.atual && esta.anterior ? (
            <p>
              <b className="numero">{fmt(esta.atual.valor)}</b> × {fmt(esta.anterior.valor)} ({formatarData(esta.anterior.data).slice(0, 5)}):{' '}
              <b className={`numero ${cor(esta.delta)}`}>{fmtD(esta.delta)}</b>
            </p>
          ) : esta.anterior ? (
            <p className="texto-2">
              Sem medição nesta semana ainda. A última foi {fmt(esta.anterior.valor)} em {formatarData(esta.anterior.data).slice(0, 5)}.
            </p>
          ) : (
            <p className="texto-2">Aparece com medições em duas semanas seguidas.</p>
          )}
        </div>

        {fases.length > 0 && (
          <div>
            <div className="rotulo" style={{ marginBottom: 8 }}>
              Variação por fase
            </div>
            <Variacoes
              itens={porFase.map((f) => ({
                nome: f.rotulo,
                delta: f.delta,
                texto: f.delta === null ? 'poucos dados' : fmtD(f.delta),
                classe: cor(f.delta),
                escala: escalaFase,
              }))}
            />
          </div>
        )}

        {d.previsao && !d.previsao.alcancada && d.meta != null && (
          <div>
            <div className="rotulo" style={{ marginBottom: 6 }}>
              Previsão até a meta
            </div>
            <GraficoPrevisao nome={d.nome} pontos={d.pontos} previsao={d.previsao} unidade={d.unidade} marcos={marcos} destaque={destaque} altura={180} />
          </div>
        )}

        <details className="tabela-detalhe">
          <summary>Como ler</summary>
          <p className="mudo">
            {d.comoLer} Melhor e pior semana: a variação entre a última medição de uma semana e a da seguinte (levada a 7 dias). Fase: última medição até o
            início do bloco × última dentro dele. {d.mdc ? `Variações menores que o erro da medida (${num(d.mdc, 1)}${d.unidade === '%' ? ' p.p.' : ` ${d.unidade}`}) ficam cinza.` : ''}{' '}
            Medições atípicas aparecem como círculo vazado e ficam fora das contas.
          </p>
        </details>
      </div>
    </Folha>
  );
}

/** Ritmo semana a semana (% do peso), para o detalhe do Ritmo */
export function BarrasRitmo({ pontos }: { pontos: { data: string; valor: number }[] }) {
  const barras = useMemo(
    () =>
      variacoesSemanais(pontos)
        .slice(-12)
        .map((v) => ({ chave: v.segunda, rotulo: formatarData(v.segunda).slice(0, 5), valores: [{ serie: 'ritmo', valor: Math.round((-v.delta / v.de.valor) * 10000) / 100 }] })),
    [pontos],
  );
  if (barras.length < 2) return null;
  return (
    <div>
      <div className="rotulo" style={{ marginBottom: 6 }}>
        Perda por semana (% do peso)
      </div>
      <GraficoBarrasSemana titulo="Perda de peso por semana, em % do peso" barras={barras} series={[{ id: 'ritmo', nome: 'Perda', cor: 'texto' }]} altura={150} formato={(v) => `${num(v, 1)}%`} />
      <p className="mudo" style={{ marginTop: 4 }}>
        Faixa que preserva melhor a massa magra: 0,5 a 1% por semana. Barra para baixo = peso subiu.
      </p>
    </div>
  );
}
