// Padrões (aba Hábitos): textos de associação e as dispersões de hábitos × resultados,
// no período do filtro. Associação, não prova de causa; nunca sugere dose.
import { useMemo, useState } from 'react';
import { GraficoDispersao } from './grafico';
import { Pilulas } from './painel';
import { Vazio } from './ui';
import { analisesDispersao, AVISO_DOSE, insightsCorrelacoes, R_MINIMO, textoR, TEXTO_COMO_LER, type DadosCorrelacao, type IdDispersao } from '../lib/correlacoes';
import { formatarData, somarDias } from '../lib/datas';
import { num } from '../lib/formato';

const CURTO: Record<IdDispersao, string> = {
  sono_nausea: 'Sono × náusea',
  adesao_cintura: 'Adesão × cintura',
  dose_peso: 'Dose × peso',
  sono_magra: 'Sono × magra',
  agua_sintoma: 'Água × sintomas',
};

export function Padroes({ dados, aoDestacar, destaque }: { dados: DadosCorrelacao; aoDestacar: (d: { chave: string; rotulo: string; de: string; ate: string } | null) => void; destaque: string | null }) {
  const insights = useMemo(() => insightsCorrelacoes(dados), [dados]);
  const analises = useMemo(() => analisesDispersao(dados), [dados]);
  const [id, setId] = useState<IdDispersao>('sono_nausea');
  const [ponto, setPonto] = useState<number | null>(null);
  const a = analises.find((x) => x.id === id) ?? analises[0];
  const fmt = (v: number, e: { unidade?: string; casas?: number }) => `${num(v, e.casas ?? 1)}${e.unidade ? (e.unidade === '%' ? '%' : ` ${e.unidade}`) : ''}`;
  const pontos = a.pontos.map((p) => ({ ...p, destaque: destaque === p.data }));
  const sel = ponto !== null ? a.pontos[ponto] : null;
  const estado =
    a.texto ??
    (a.n < a.minimo
      ? `Poucos dados: ${a.n} de no mínimo ${a.minimo} ${a.escopo === 'dia' ? 'dias' : 'semanas'} com os dois valores neste período.`
      : a.r !== null && Math.abs(a.r) >= R_MINIMO
        ? `Associação ainda não confirmada neste período (${textoR(a.r)} com ${a.n} ${a.escopo === 'dia' ? 'dias' : 'semanas'}): com poucos pontos, um r alto pode ser acaso.`
        : `Sem associação clara neste período${a.r !== null ? ` (${textoR(a.r)})` : ''}.`);

  return (
    <>
      {insights.length ? (
        <div className="destaques">
          {insights.map((d) => (
            <div key={d.texto} className={`destaque destaque-${d.tom}`}>
              <span className="destaque-icone" aria-hidden="true">
                {d.tom === 'bom' ? '✓' : d.tom === 'atencao' ? '!' : 'i'}
              </span>
              <span>{d.texto}</span>
            </div>
          ))}
        </div>
      ) : (
        <Vazio>Os padrões aparecem com 5 semanas (ou 14 dias) de registros e uma associação clara. Tente o período Ciclo.</Vazio>
      )}

      <div className="pilulas-rolagem analise-padroes-pilulas">
        <Pilulas
          rotulo="Par de variáveis"
          opcoes={analises.map((x) => [x.id, CURTO[x.id]] as [IdDispersao, string])}
          valor={a.id}
          aoMudar={(v) => {
            setId(v);
            setPonto(null);
          }}
        />
      </div>
      <div className="analise-dispersao">
        {a.pontos.length >= 2 ? (
          <GraficoDispersao
            key={a.id}
            titulo={a.titulo}
            pontos={pontos}
            eixoX={a.eixoX}
            eixoY={a.eixoY}
            tendencia={a.pontos.length >= 3}
            altura={230}
            aoTocarPonto={(i) => {
              const p = a.pontos[i];
              const mesmo = ponto === i;
              setPonto(mesmo ? null : i);
              // A semana (ou o dia) do ponto fica destacada nos gráficos de tempo
              if (mesmo) aoDestacar(null);
              else
                aoDestacar(
                  a.escopo === 'semana'
                    ? { chave: p.data, rotulo: `semana de ${formatarData(p.data).slice(0, 5)}`, de: p.data, ate: somarDias(p.data, 6) }
                    : { chave: p.data, rotulo: `dia ${formatarData(p.data).slice(0, 5)}`, de: p.data, ate: p.data },
                );
            }}
          />
        ) : (
          <Vazio>Sem pontos com os dois valores neste período.</Vazio>
        )}
        {sel && (
          <p className="texto-2 analise-ponto">
            {a.escopo === 'semana' ? 'Semana de' : 'Dia'} {sel.rotulo}: {a.eixoX.nome.toLowerCase()} {fmt(sel.x, a.eixoX)} · {a.eixoY.nome.toLowerCase()} {fmt(sel.y, a.eixoY)}
          </p>
        )}
        <p className={a.texto ? 'analise-padrao-texto' : 'mudo analise-padrao-texto'}>{estado}</p>
        {a.sobre_dose && !a.texto && <p className="mudo">{AVISO_DOSE}</p>}
      </div>
      <details className="tabela-detalhe">
        <summary>Como ler</summary>
        <p className="mudo">{TEXTO_COMO_LER}</p>
      </details>
    </>
  );
}
