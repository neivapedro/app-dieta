// Gráficos da Análise sobre o motor em SVG: zoom preso ao filtro de período, a linha do
// tempo empilhada (peso, cintura, náusea e sono na mesma data) e a faixa de fases tocável.
import { useMemo, useState } from 'react';
import { GraficoTempo, type Marco, type Periodo, type PontoSerie, type PropsGraficoTempo, type Serie } from './grafico';

/**
 * Zoom relativo ao filtro: começa no período escolhido; "Ver tudo" (ou toque duplo)
 * mostra o histórico inteiro e, de novo, volta ao período. Trocar o filtro zera o zoom.
 */
export function useZoomJanela(janela: Periodo | null): [Periodo | null, (p: Periodo | null) => void] {
  const [zoom, setZoom] = useState<Periodo | 'tudo' | null>(null);
  const chave = janela ? `${janela.de}|${janela.ate}` : '';
  const [antes, setAntes] = useState(chave);
  if (antes !== chave) {
    setAntes(chave);
    setZoom(null);
  }
  const periodo = zoom === 'tudo' ? null : (zoom ?? janela);
  const mudar = (p: Periodo | null) => setZoom(p ?? (zoom === null && janela ? 'tudo' : null));
  return [periodo, mudar];
}

type PropsJanela = Omit<PropsGraficoTempo, 'periodo' | 'aoMudarPeriodo'> & { janela: Periodo | null };

/** GraficoTempo que mostra o período do filtro (e deixa ampliar a partir dele). */
export function GraficoJanela({ janela, ...props }: PropsJanela) {
  const [periodo, mudar] = useZoomJanela(janela);
  return <GraficoTempo {...props} periodo={periodo} aoMudarPeriodo={mudar} />;
}

/** Extensão das datas com valor (para alinhar gráficos empilhados) */
export function extensaoSeries(series: Serie[]): Periodo | null {
  let de: string | null = null;
  let ate: string | null = null;
  for (const s of series)
    for (const p of s.pontos) {
      if (p.valor === null) continue;
      if (de === null || p.data < de) de = p.data;
      if (ate === null || p.data > ate) ate = p.data;
    }
  return de && ate ? { de, ate } : null;
}

/**
 * Linha do tempo: 3 gráficos empilhados com o mesmo eixo do tempo e a mira sincronizada
 * (arraste num e a mesma data aparece nos três). Precisa de um ProvedorSincronia em volta.
 */
export function LinhaDoTempo({
  peso,
  cintura,
  nausea,
  sono,
  marcos,
  destaque,
  janela,
}: {
  peso: PontoSerie[];
  cintura: PontoSerie[];
  nausea: PontoSerie[];
  sono: PontoSerie[];
  marcos: Marco[];
  destaque: Periodo | null;
  janela: Periodo | null;
}) {
  const sPeso = useMemo<Serie[]>(() => [{ id: 'peso', nome: 'Peso', tipo: 'area', pontos: peso, cor: 'texto', unidade: 'kg', casas: 1 }], [peso]);
  const sCintura = useMemo<Serie[]>(() => [{ id: 'cintura', nome: 'Cintura', tipo: 'linha', pontos: cintura, cor: 'bom', unidade: 'cm', casas: 1 }], [cintura]);
  const sBem = useMemo<Serie[]>(
    () => [
      { id: 'nausea', nome: 'Náusea (0 a 3)', tipo: 'barra', pontos: nausea, cor: 'ruim', casas: 0 },
      { id: 'sono', nome: 'Sono', tipo: 'linha', pontos: sono, cor: 'aviso', eixo: 'dir', unidade: 'h', casas: 1 },
    ],
    [nausea, sono],
  );
  // Sem filtro, os três usam a mesma extensão (senão cada um teria o seu eixo do tempo)
  const todos = useMemo(() => extensaoSeries([...sPeso, ...sCintura, ...sBem]), [sPeso, sCintura, sBem]);
  const [periodo, mudar] = useZoomJanela(janela);
  const alinhado = periodo ?? todos;
  if (!todos) return null;
  const vazio = (s: Serie[]) => !s.some((x) => x.pontos.some((p) => p.valor !== null));
  return (
    <div className="analise-linha-tempo">
      <GraficoTempo
        titulo="Linha do tempo: peso"
        series={sPeso}
        marcos={marcos}
        destaque={destaque}
        sincronia="analise-linha"
        periodo={alinhado}
        aoMudarPeriodo={mudar}
        permitirZoom
        expandivel
        altura={170}
        legenda
      />
      {!vazio(sCintura) && <GraficoTempo titulo="Linha do tempo: cintura" series={sCintura} destaque={destaque} sincronia="analise-linha" periodo={alinhado} altura={130} legenda />}
      {!vazio(sBem) && (
        <GraficoTempo
          titulo="Linha do tempo: náusea e sono"
          series={sBem}
          destaque={destaque}
          sincronia="analise-linha"
          periodo={alinhado}
          altura={140}
          referencias={[{ valor: 7, rotulo: '7 h', eixo: 'dir', cor: 'aviso' }]}
        />
      )}
    </div>
  );
}

/** Blocos de dose aplicados (largura pelo nº de doses): toque destaca o bloco nos gráficos. */
export function FaixaFases({
  fases,
  selecionada,
  aoSelecionar,
}: {
  fases: { chave: string; rotulo: string; doses: number }[];
  selecionada: string | null;
  aoSelecionar: (chave: string | null) => void;
}) {
  if (!fases.length) return null;
  return (
    <div className="analise-faixa-fases" role="group" aria-label="Blocos de dose: toque para destacar nos gráficos">
      {fases.map((f) => (
        <button
          key={f.chave}
          type="button"
          style={{ flexGrow: f.doses }}
          className={selecionada === f.chave ? 'ativo' : selecionada ? 'apagado' : ''}
          aria-pressed={selecionada === f.chave}
          onClick={() => aoSelecionar(selecionada === f.chave ? null : f.chave)}
          title={f.rotulo}
        >
          <span>{f.rotulo}</span>
          <small>
            {f.doses} {f.doses === 1 ? 'dose' : 'doses'}
          </small>
        </button>
      ))}
    </div>
  );
}
