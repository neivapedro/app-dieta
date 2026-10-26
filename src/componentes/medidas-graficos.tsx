// Gráficos da tela Medidas no motor SVG: evolução de uma medida (com leitura da mira) e o combinado.
import { useMemo, useState } from 'react';
import { formatarData } from '../lib/datas';
import { num, sinal } from '../lib/formato';
import type { Composicao } from '../lib/gordura';
import { leituraMedida, pontosMedida } from '../lib/medidas-grafico';
import type { ChavePainel } from '../lib/painel';
import { GraficoTempo, ProvedorSincronia, useSincronia, type Marco, type Periodo, type Referencia, type Serie } from './grafico';

const SINC_EVOLUCAO = 'med-evolucao';
const SINC_COMBINADO = 'med-combinado';

export interface InfoMedida {
  nome: string;
  /** unidade do valor, sem espaço: 'cm', 'kg', '%' */
  unidade: string;
  /** sufixo das diferenças: ' cm', ' kg', ' p.p.' */
  sufixoDif: string;
  meta: number | null | undefined;
  /** menor é melhor (todas, menos a massa magra) */
  menorMelhor: boolean;
}

/** Evolução de uma medida: área com início e meta, atípicas vazadas e marcos (dose, decisão, atípica). */
export function EvolucaoMedida(props: { composicoes: Composicao[]; metrica: ChavePainel; info: InfoMedida; inicio: number | null; marcos: Marco[] }) {
  return (
    <ProvedorSincronia>
      <Evolucao {...props} />
    </ProvedorSincronia>
  );
}

function Evolucao({ composicoes, metrica, info, inicio, marcos }: { composicoes: Composicao[]; metrica: ChavePainel; info: InfoMedida; inicio: number | null; marcos: Marco[] }) {
  const { data } = useSincronia(SINC_EVOLUCAO);
  const pontos = useMemo(() => pontosMedida(composicoes, metrica), [composicoes, metrica]);
  const series = useMemo<Serie[]>(() => [{ id: metrica, nome: info.nome, tipo: 'area', pontos, cor: 'texto', casas: 1, unidade: info.unidade }], [metrica, info.nome, info.unidade, pontos]);
  const referencias = useMemo<Referencia[]>(() => {
    const r: Referencia[] = [];
    if (inicio != null) r.push({ valor: inicio, rotulo: 'início', cor: 'neutro' });
    if (info.meta != null) r.push({ valor: info.meta, rotulo: 'meta', cor: 'aviso' });
    return r;
  }, [inicio, info.meta]);
  const l = leituraMedida(pontos, data, inicio, info.meta);
  const valor = (n: number) => (info.unidade === '%' ? `${num(n, 1)}%` : `${num(n, 1)} ${info.unidade}`);
  // Quanto falta para a meta, no sentido em que a medida melhora
  const falta = l?.paraMeta == null ? null : info.menorMelhor ? l.paraMeta : -l.paraMeta;
  return (
    <div className="med-evo">
      <div className={`med-leitura${l && !l.ultima ? ' ativa' : ''}`}>
        {l ? (
          <>
            <div className="med-leitura-linha">
              <span className="med-leitura-data">{l.ultima ? 'Última' : formatarData(l.data, true).slice(0, 5)}</span>
              <b className="numero">{valor(l.valor)}</b>
              {l.atipica && <span className="etiqueta aviso">atípica</span>}
            </div>
            <div className="med-leitura-linha med-leitura-difs">
              {l.atipica ? (
                <span>Fora das tendências e das contas</span>
              ) : (
                <>
                  {l.desdeInicio !== null && <span className="numero">{sinal(l.desdeInicio, 1, info.sufixoDif)} desde o início</span>}
                  {falta !== null &&
                    (falta > 0 ? (
                      <span className="numero">faltam {num(falta, 1)}{info.sufixoDif} para a meta</span>
                    ) : (
                      <span className="med-leitura-ok">meta atingida</span>
                    ))}
                </>
              )}
            </div>
          </>
        ) : (
          <span className="mudo">Sem medição normal</span>
        )}
      </div>
      <GraficoTempo
        titulo={`Evolução: ${info.nome.toLowerCase()}`}
        series={series}
        referencias={referencias}
        marcos={marcos}
        sincronia={SINC_EVOLUCAO}
        altura={210}
        permitirZoom
        expandivel
        legenda={false}
      />
    </div>
  );
}

/** Peso e massa magra (kg) em cima, % de gordura embaixo: mira e zoom juntos (a faixa de zoom fica no de baixo). */
export function GraficosCombinados({ composicoes, marcos }: { composicoes: Composicao[]; marcos: Marco[] }) {
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const kg = useMemo<Serie[]>(
    () => [
      { id: 'peso', nome: 'Peso', tipo: 'linha', pontos: pontosMedida(composicoes, 'peso_kg'), cor: 'texto', casas: 1, unidade: 'kg' },
      { id: 'magra', nome: 'Massa magra', tipo: 'linha', pontos: pontosMedida(composicoes, 'massa_magra_kg'), cor: 'neutro', casas: 1, unidade: 'kg' },
    ],
    [composicoes],
  );
  const bf = useMemo<Serie[]>(() => [{ id: 'bf', nome: '% de gordura', tipo: 'linha', pontos: pontosMedida(composicoes, 'bf'), cor: 'aviso', casas: 1, unidade: '%' }], [composicoes]);
  // O de cima segue a janela do de baixo (mesmo eixo do tempo)
  const datas = composicoes.map((c) => c.data);
  const alinhado = periodo ?? (datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null);
  return (
    <ProvedorSincronia>
      <div className="med-combinado">
        <GraficoTempo titulo="Peso e massa magra" series={kg} marcos={marcos} sincronia={SINC_COMBINADO} periodo={alinhado} altura={190} expandivel />
        <GraficoTempo titulo="% de gordura" series={bf} sincronia={SINC_COMBINADO} periodo={periodo} aoMudarPeriodo={setPeriodo} altura={130} legenda permitirZoom />
      </div>
    </ProvedorSincronia>
  );
}
