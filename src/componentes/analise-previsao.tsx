// Previsão em leque até a meta (peso e cintura): histórico, reta tracejada e faixa provável.
import { useMemo } from 'react';
import { type Faixa, type Marco, type Periodo, type PontoSerie, type Serie } from './grafico';
import { GraficoJanela } from './analise-graficos';
import { textoPrevisao, type Previsao } from '../lib/analise-previsao';
import { somarDias } from '../lib/datas';
import { num, sinal } from '../lib/formato';

export function GraficoPrevisao({
  nome,
  pontos,
  previsao,
  unidade,
  marcos,
  destaque,
  altura = 200,
}: {
  /** "peso", "cintura" (minúsculo, para o texto) */
  nome: string;
  pontos: PontoSerie[];
  previsao: Previsao;
  unidade: string;
  marcos?: Marco[];
  destaque?: Periodo | null;
  altura?: number;
}) {
  const series = useMemo<Serie[]>(
    () => [
      { id: 'hist', nome: nome[0].toUpperCase() + nome.slice(1), tipo: 'area', pontos, cor: 'texto', unidade, casas: 1 },
      ...(previsao.centro.length ? [{ id: 'prev', nome: 'No ritmo atual', tipo: 'linha' as const, pontos: previsao.centro, cor: 'aviso' as const, unidade, casas: 1, tracejado: true }] : []),
    ],
    [nome, pontos, previsao, unidade],
  );
  const faixas = useMemo<Faixa[]>(() => (previsao.faixa.length ? [{ id: 'faixa', nome: 'Faixa provável', pontos: previsao.faixa, cor: 'aviso' }] : []), [previsao]);
  // Janela: as últimas 8 semanas de histórico e a previsão inteira
  const ultimo = previsao.centro.length ? previsao.centro[previsao.centro.length - 1].data : previsao.ate;
  const janela = useMemo<Periodo>(() => ({ de: somarDias(previsao.ate, -56), ate: ultimo }), [previsao.ate, ultimo]);
  return (
    <div className="analise-previsao">
      <GraficoJanela
        titulo={`Previsão de ${nome} até a meta`}
        series={series}
        faixas={faixas}
        referencias={[{ valor: previsao.meta, rotulo: `meta ${num(previsao.meta, 1)}`, cor: 'bom' }]}
        marcos={marcos}
        destaque={destaque}
        janela={janela}
        altura={altura}
        permitirZoom
        expandivel
      />
      <p className="analise-previsao-texto">{textoPrevisao(nome, previsao)}</p>
      <p className="mudo">
        Reta das últimas {previsao.n} medições ({sinal(previsao.ritmo_semana, 2, ` ${unidade}`)}/sem.) com a faixa de 95%, que abre com o tempo. É a tendência, não uma
        promessa.
      </p>
    </div>
  );
}
