import '../estilos/analise.css';
import '../estilos/medidas.css';
import '../estilos/relatorio-final.css';
import { Link } from 'react-router-dom';
import { BotaoStoriesFinal } from '../componentes/relatorio-final-compartilhar';
import { CalorNausea, GraficosCorpo, GraficosHabitos, GraficosTreino } from '../componentes/relatorio-final-graficos';
import { SlotPdfFinal } from '../componentes/relatorio-final-pdf';
import { LinhaConquistas } from '../componentes/conquistas';
import {
  AneisHabitos,
  CapaRelatorio,
  Degraus,
  FotosRelatorio,
  IndiceSecoes,
  Ladrilho,
  LinhaDoTempoRelatorio,
  MetasRelatorio,
  NumerosHabitos,
  RecordesRelatorio,
  Registros,
  Secao,
  TabelaNumeros,
  type CorRelatorio,
} from '../componentes/relatorio-final';
import { Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useRelatorioFinal } from '../dados/useRelatorioFinal';
import { formatarData } from '../lib/datas';
import { num, pct, sinal } from '../lib/formato';
import { semQuebra } from '../lib/relatorio-final';
import { formatarKm, formatarTempo } from '../lib/treino';

/**
 * Relatório final do ciclo: capa com o antes e depois, gráficos coloridos de tocar,
 * fases e decisões, hábitos, recordes e metas. Com o ciclo em andamento, é a prévia.
 */
export function RelatorioFinal() {
  const { ciclo, registroDecisoes } = useDados();
  const { composicoes } = useCalculos();
  const { relatorio: r, fotos, carregandoFotos } = useRelatorioFinal();
  if (!r || !ciclo) return null;

  const voltar = (
    <Link to="/analise" className="rf-voltar">
      <span aria-hidden="true">‹</span> Análise
    </Link>
  );
  if (!r.remedio.aplicacoes)
    return (
      <div className="pilha rf">
        {voltar}
        <section className="cartao">
          <h2>Relatório final</h2>
          <Vazio>O relatório começa na primeira aplicação. Registre a dose no Início e ele vai se montando com o Diário, as medidas e as fotos.</Vazio>
        </section>
      </div>
    );

  const urlDe = (id: string) => fotos.find((f) => f.id === id)?.url;
  const indice: { id: string; rotulo: string; cor: CorRelatorio }[] = [
    { id: 'rf-fotos', rotulo: 'Fotos', cor: 'roxo' },
    { id: 'rf-corpo', rotulo: 'Corpo', cor: 'azul' },
    { id: 'rf-fases', rotulo: 'Fases', cor: 'indigo' },
    { id: 'rf-nausea', rotulo: 'Náusea', cor: 'laranja' },
    { id: 'rf-habitos', rotulo: 'Hábitos', cor: 'verde' },
    ...(r.treino ? [{ id: 'rf-treino', rotulo: 'Treino', cor: 'rosa' as const }] : []),
    { id: 'rf-recordes', rotulo: 'Recordes', cor: 'ciano' },
    { id: 'rf-metas', rotulo: 'Metas', cor: 'verde' },
  ];
  const t = r.treino;
  const linhasCorpo = [
    r.massa_magra.texto,
    r.qualidade && !r.qualidade.sem_perda ? `De onde veio a perda (${r.qualidade.medicoes} medições): ${r.qualidade.texto}.` : null,
    r.ritmo_medio && r.ritmo_medio.faixa !== 'ganho' ? `Ritmo médio: ${num(r.ritmo_medio.pct, 2)}% do peso por semana (${sinal(r.ritmo_medio.kg_semana, 2, ' kg')}/sem).` : null,
  ]
    .filter((x): x is string => !!x)
    .map(semQuebra);

  return (
    <div className="pilha rf">
      {voltar}
      {r.textos.aviso_previa && (
        <div className="alerta info rf-aviso" role="note">
          <span className="cresce">{r.textos.aviso_previa}</span>
        </div>
      )}

      <CapaRelatorio r={r} urlDe={urlDe} />

      <IndiceSecoes itens={indice} />

      <Secao id="rf-resumo" cor="indigo" titulo="Destaques" sub="O que os seus registros mostram no ciclo">
        {r.destaques.length ? (
          <div className="destaques">
            {r.destaques.map((d) => (
              <div key={d.texto} className={`destaque destaque-${d.tom}`}>
                <span className="destaque-icone" aria-hidden="true">
                  {d.tom === 'bom' ? '✓' : d.tom === 'atencao' ? '!' : 'i'}
                </span>
                <span>{d.texto}</span>
              </div>
            ))}
          </div>
        ) : (
          <Vazio>Os destaques aparecem com medições e registros no Diário. Variações menores que o erro da fita não entram.</Vazio>
        )}
        <div className="rotulo rf-rotulo-grafico">Tudo o que você registrou</div>
        <Registros r={r} />
      </Secao>

      <Secao id="rf-fotos" cor="roxo" titulo="Antes e depois" sub={r.fotos.total ? `${r.fotos.antes} no Antes · ${r.fotos.depois} no Depois` : 'Fotos guardadas só neste aparelho'}>
        <FotosRelatorio r={r} fotos={fotos} composicoes={composicoes} carregando={carregandoFotos} />
      </Secao>

      <Secao
        id="rf-corpo"
        cor="azul"
        titulo="Corpo"
        sub={r.numeros.cintura.data_inicio ? `Medições de ${formatarData(r.numeros.cintura.data_inicio, true)}${r.numeros.cintura.delta !== null ? ` a ${formatarData(r.numeros.cintura.data_fim!, true)}` : ''}` : 'Medições com fita, em jejum, às segundas'}
      >
        {r.numeros.cintura.inicio !== null || r.numeros.peso.inicio !== null ? (
          <>
            <TabelaNumeros r={r} />
            <ul className="rf-linhas-info">
              {linhasCorpo.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        ) : (
          <Vazio>
            Nenhuma medição no período. <Link to="/medidas">Registrar medidas</Link>
          </Vazio>
        )}
        <GraficosCorpo r={r} decisoes={ciclo.decisoes ?? []} registros={registroDecisoes} />
        <p className="mudo rf-nota">{r.textos.medicao}</p>
      </Secao>

      <Secao id="rf-fases" cor="indigo" titulo="Fases e decisões" sub={`${r.fases.length} ${r.fases.length === 1 ? 'bloco' : 'blocos'} de dose · ${r.remedio.aplicacoes} aplicações · ${num(r.remedio.total_mg)} mg`}>
        <Degraus fases={r.fases} />
        <LinhaDoTempoRelatorio r={r} />
      </Secao>

      <Secao id="rf-nausea" cor="laranja" titulo="Náusea depois da dose" sub="Média de 0 a 3 por dia depois da aplicação, em cada bloco">
        <CalorNausea r={r} />
      </Secao>

      <Secao id="rf-habitos" cor="verde" titulo="Hábitos" sub={`${formatarData(r.habitos.de, true)} a ${formatarData(r.habitos.ate, true)}${r.estado === 'previa' ? ' (até ontem)' : ''}`}>
        <AneisHabitos r={r} />
        <NumerosHabitos r={r} />
        <GraficosHabitos r={r} />
      </Secao>

      {t && (
        <Secao id="rf-treino" cor="rosa" titulo="Treino" sub={`Placar de ${formatarData(t.inicio, true)} a ${formatarData(t.fim, true)}`}>
          <div className="rf-mini-grade">
            <Ladrilho cor="rosa" rotulo="Treinos" valor={`${t.treino.feito} de ${t.treino.meta}`} sub={t.treino.aderencia === null ? '–' : pct(t.treino.aderencia, 0)} />
            <Ladrilho cor="ciano" rotulo="Cardios" valor={`${t.cardio.feito} de ${t.cardio.meta}`} sub={t.cardio.aderencia === null ? '–' : pct(t.cardio.aderencia, 0)} />
            <Ladrilho cor="laranja" rotulo="Corridas" valor={String(t.corridas.feito)} sub={t.corridas.km > 0 ? `${formatarKm(t.corridas.km)} anotados` : 'sem distância'} />
            <Ladrilho cor="azul" rotulo="Melhor pace" valor={t.melhor_pace ? `${formatarTempo(t.melhor_pace.pace)} /km` : '–'} sub={t.melhor_pace ? formatarData(t.melhor_pace.data, true) : 'sem corrida com tempo'} />
          </div>
          <GraficosTreino r={r} />
        </Secao>
      )}

      <Secao id="rf-recordes" cor="ciano" titulo="Recordes" sub="Calculados dos seus registros">
        <RecordesRelatorio r={r} />
      </Secao>

      <Secao id="rf-metas" cor="verde" titulo="Metas do projeto" sub={r.estado === 'concluido' ? 'Do início até a medição final' : 'Do início até a medição mais recente'}>
        <MetasRelatorio r={r} />
      </Secao>

      <Secao id="rf-compartilhar" cor="rosa" titulo="Compartilhar e guardar">
        <div className="pilha" style={{ gap: 12 }}>
          <BotaoStoriesFinal r={r} fotos={fotos} />
          <SlotPdfFinal relatorio={r} fotos={fotos} carregandoFotos={carregandoFotos} />
        </div>
      </Secao>

      <LinhaConquistas />

      {r.pos_remedio && <p className="mudo rf-pos">{r.pos_remedio.texto}</p>}
      <p className="rf-rodape">{r.textos.rodape}</p>
    </div>
  );
}

export default RelatorioFinal;
