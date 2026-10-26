import { useEffect, useRef, useState, type Ref } from 'react';
import { FormDiario } from '../componentes/formularios';
import { Pilulas } from '../componentes/painel';
import { Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useMetaAgua } from '../dados/useTreino';
import { diaDaSemana, formatarData, hojeLocal } from '../lib/datas';
import { kg, mg, num } from '../lib/formato';
import { mediaSono7, textosSintomas, TEXTO_SONO_BAIXO } from '../lib/bemestar';
import { corDoDia, gradeMes, limitesMeses, mesDe, nomeMes, resumoDoMes, rotuloDiaDose, somarMeses, type MetricaDia } from '../lib/ciclo-calendario';
import { NIVEIS_NAUSEA, type RegistroDiario } from '../lib/tipos';
import '../estilos/ciclo.css';

type Vista = 'calendario' | 'lista';
const OPCOES_VISTA: [Vista, string][] = [
  ['calendario', 'Calendário'],
  ['lista', 'Lista'],
];
const OPCOES_METRICA: [MetricaDia, string][] = [
  ['nausea', 'Náusea'],
  ['sono', 'Sono'],
  ['agua', 'Água'],
  ['dieta', 'Dieta'],
];
// Legenda de cada métrica: [tom, texto]
const LEGENDA: Record<MetricaDia, [string, string][]> = {
  nausea: [
    ['bom', '0 nenhuma'],
    ['aviso', '1 leve'],
    ['forte', '2 moderada'],
    ['ruim', '3 forte'],
  ],
  sono: [
    ['bom', '7 h ou mais'],
    ['aviso', '6 a 7 h'],
    ['ruim', 'menos de 6 h'],
  ],
  agua: [
    ['bom', 'meta do dia'],
    ['aviso', '75% da meta'],
    ['ruim', 'menos'],
  ],
  dieta: [
    ['bom', 'seguida'],
    ['aviso', 'em parte'],
    ['ruim', 'não seguida'],
  ],
};
const SEMANA = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const TEXTO_DIETA = { sim: 'seguida', parcial: 'em parte', nao: 'não seguida' } as const;
const POR_PAGINA = 21;

export function Diario() {
  const { diario, medidas } = useDados();
  const { resumo, hoje } = useCalculos();
  const metaAguaDe = useMetaAgua();
  const sono = mediaSono7(diario, hoje);
  const [editando, setEditando] = useState<RegistroDiario | null>(null);
  // Data do dia tocado: o formulário abre nela, não em hoje
  const [novo, setNovo] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('calendario');
  const [metrica, setMetrica] = useState<MetricaDia>('nausea');
  const [mes, setMes] = useState(mesDe(hoje));
  const [sel, setSel] = useState(hoje);
  const [qtd, setQtd] = useState(POR_PAGINA);
  const detalheRef = useRef<HTMLElement>(null);
  const [rolarDetalhe, setRolarDetalhe] = useState(false);
  useEffect(() => {
    if (!rolarDetalhe) return;
    detalheRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    setRolarDetalhe(false);
  }, [rolarDetalhe]);

  // Une registros do dia com as aplicações para mostrar uma linha do tempo única
  // Pode haver duas aplicações no mesmo dia (dose complementar): guarda todas
  const aplicacaoPorData = new Map<string, NonNullable<typeof resumo>['linhas']>();
  for (const l of resumo?.linhas ?? []) aplicacaoPorData.set(l.aplicacao.data, [...(aplicacaoPorData.get(l.aplicacao.data) ?? []), l]);
  const datas = [...new Set([...diario.map((r) => r.data), ...aplicacaoPorData.keys()])].sort().reverse();
  const regPorData = new Map(diario.map((r) => [r.data, r]));
  const pesoMedicao = new Map(medidas.filter((m) => m.peso_kg > 0).map((m) => [m.data, m.peso_kg]));
  const datasAplic = [...aplicacaoPorData.keys()].sort();
  const limites = limitesMeses(datas, hoje);

  const abrirDia = (d: string) => {
    const r = regPorData.get(d);
    if (r) setEditando(r);
    else setNovo(d);
  };
  const tocarDia = (d: string) => {
    // Segundo toque no mesmo dia abre o formulário; o primeiro mostra o resumo
    if (d === sel) return abrirDia(d);
    setSel(d);
    setRolarDetalhe(true);
  };

  /** Partes do texto do dia (peso, náusea, sintomas…), as mesmas da lista antiga */
  const partesDoDia = (d: string, r: RegistroDiario | undefined) => {
    const aps = aplicacaoPorData.get(d) ?? [];
    return [
      // Dia com medição: vale o peso da medição (o mesmo das outras telas)
      pesoMedicao.has(d) ? `${kg(pesoMedicao.get(d)!)} (medição)` : r?.peso_kg != null && kg(r.peso_kg),
      r?.nausea != null && `náusea ${r.nausea} (${NIVEIS_NAUSEA[r.nausea].toLowerCase()})`,
      ...textosSintomas(r),
      r?.sono_h != null && `sono ${num(r.sono_h, 1)} h`,
      r?.agua_l != null && `água ${num(r.agua_l, 1)} L`,
      r?.cor_urina && `urina ${r.cor_urina}`,
      r?.dieta_seguida && `dieta: ${TEXTO_DIETA[r.dieta_seguida]}`,
      ...aps.map((x) => x.aplicacao.local),
      r?.observacoes,
      ...aps.map((x) => x.aplicacao.observacoes),
    ].filter(Boolean) as string[];
  };

  const resumoMes = resumoDoMes(metrica, diario, mes, hoje);
  const textoResumoMes =
    resumoMes.media === null
      ? 'sem registros'
      : metrica === 'nausea'
        ? `média ${num(resumoMes.media, 1)}`
        : metrica === 'sono'
          ? `média ${num(resumoMes.media, 1)} h`
          : metrica === 'agua'
            ? `média ${num(resumoMes.media, 1)} L`
            : `seguida ${Math.round(resumoMes.media * 100)}%`;

  return (
    <div className="pilha">
      <section className="cartao">
        <div className="secao-cab cab-fixa">
          <div className="cresce">
            <h2>Diário</h2>
            <div className="secao-sub">Peso, náusea, sono e água · doses entram sozinhas</div>
          </div>
          <button className="botao pequeno primario" onClick={() => setNovo(hojeLocal())}>
            Registrar dia
          </button>
        </div>
        <div className="diario-barra">
          <Pilulas rotulo="Ver o diário como" opcoes={OPCOES_VISTA} valor={vista} aoMudar={setVista} />
          {sono.media !== null && (
            <span className="diario-sono" title={`${sono.noites} noites nos últimos 7 dias`}>
              Sono 7 d <b className={`numero ${sono.baixo ? 'aviso-txt' : ''}`}>{num(sono.media, 1)} h</b>
            </span>
          )}
        </div>
        {sono.baixo && (
          <div className="alerta" style={{ marginTop: 10 }}>
            {TEXTO_SONO_BAIXO}
          </div>
        )}
      </section>

      {vista === 'calendario' ? (
        <>
          <section className="cartao">
            <div className="cal-cab">
              <button className="icone-botao" aria-label="Mês anterior" disabled={mes <= limites.min} onClick={() => setMes(somarMeses(mes, -1))}>
                ‹
              </button>
              <div className="cal-mes">
                <strong>{nomeMes(mes).replace(/^./, (l) => l.toUpperCase())}</strong>
                <span className="secao-sub">
                  {resumoMes.dias ? `${textoResumoMes} · ${resumoMes.dias} ${resumoMes.dias === 1 ? 'dia' : 'dias'}` : 'sem registros desta medida'}
                </span>
              </div>
              <button className="icone-botao" aria-label="Próximo mês" disabled={mes >= limites.max} onClick={() => setMes(somarMeses(mes, 1))}>
                ›
              </button>
            </div>
            <div className="pilulas-rolagem cal-metricas">
              <Pilulas rotulo="Cor dos dias" opcoes={OPCOES_METRICA} valor={metrica} aoMudar={setMetrica} />
            </div>
            <div className="cal-grade" role="grid" aria-label={`Diário de ${nomeMes(mes)}`}>
              {SEMANA.map((s, i) => (
                <span key={i} className="cal-semana" aria-hidden="true">
                  {s}
                </span>
              ))}
              {gradeMes(mes).map((d, i) => {
                if (!d) return <span key={i} className="cal-vazio" />;
                const r = regPorData.get(d);
                const cor = corDoDia(metrica, r, metrica === 'agua' ? metaAguaDe(d).meta : undefined);
                const aps = aplicacaoPorData.get(d) ?? [];
                const futuro = d > hoje;
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    className={`dia-cal ${cor.tom ? `tom-${cor.tom}` : ''} ${aps.length ? 'dia-dose' : ''} ${d === hoje ? 'dia-hoje' : ''} ${d === sel ? 'dia-sel' : ''}`}
                    disabled={futuro}
                    aria-selected={d === sel}
                    aria-label={`${diaDaSemana(d)}, ${formatarData(d)}${aps.length ? ', dia da dose' : ''}${cor.tom ? `: ${cor.texto}` : ''}`}
                    onClick={() => tocarDia(d)}
                  >
                    <span className="dia-cal-num">{Number(d.slice(8))}</span>
                    <span className="dia-cal-val numero">{cor.texto}</span>
                    {aps.length > 0 && (
                      <span className="dia-cal-dose" aria-hidden="true">
                        💉
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="cal-legenda">
              {LEGENDA[metrica].map(([tom, texto]) => (
                <span key={tom}>
                  <i className={`tom-${tom}`} /> {texto}
                </span>
              ))}
              <span>
                <i className="anel-dose" /> dose
              </span>
            </div>
          </section>

          <DetalheDia
            ref={detalheRef}
            hoje={hoje}
            data={sel}
            registro={regPorData.get(sel)}
            aplicacoes={(aplicacaoPorData.get(sel) ?? []).map((x) => ({ id: x.aplicacao.id, numero: x.numero, dose: x.aplicacao.dose_mg, local: x.aplicacao.local, obs: x.aplicacao.observacoes }))}
            pesoMedicao={pesoMedicao.get(sel) ?? null}
            rotuloDose={rotuloDiaDose(sel, datasAplic)}
            metaAgua={metaAguaDe(sel).meta}
            aoAbrir={() => abrirDia(sel)}
          />
        </>
      ) : (
        <section className="cartao">
          {datas.length === 0 ? (
            <Vazio>Nenhum registro ainda.</Vazio>
          ) : (
            <>
              <div className="lista">
                {datas.slice(0, qtd).map((d) => {
                  const r = regPorData.get(d);
                  const aps = aplicacaoPorData.get(d) ?? [];
                  const a = aps[0];
                  const rotulo = rotuloDiaDose(d, datasAplic);
                  return (
                    <div className="item item-acao diario-item" key={d} onClick={() => abrirDia(d)}>
                      <div className={`marcador ${a ? 'feito' : ''}`}>{d.slice(8, 10)}</div>
                      <div className="cresce">
                        <div className="titulo">
                          {diaDaSemana(d).slice(0, 3)}, {formatarData(d, true)}
                          {aps.map((x) => (
                            <span key={x.aplicacao.id} className="etiqueta destaque">
                              💉 {x.numero}ª · {mg(x.aplicacao.dose_mg)}
                            </span>
                          ))}
                          {!a && rotulo && rotulo !== 'D0' && Number(rotulo.slice(1)) <= 6 && (
                            <span className="etiqueta" title="Dias depois da última dose (D0 = dia da dose)">
                              {rotulo}
                            </span>
                          )}
                        </div>
                        <div className="detalhe">{partesDoDia(d, r).join(' · ') || 'Sem registro do dia'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {datas.length > qtd && (
                <button className="botao pequeno bloco-largo" style={{ marginTop: 8 }} onClick={() => setQtd(qtd + POR_PAGINA * 2)}>
                  Mostrar mais ({datas.length - qtd})
                </button>
              )}
            </>
          )}
        </section>
      )}
      {novo && <FormDiario dataInicial={novo} aoFechar={() => setNovo(null)} />}
      {editando && <FormDiario registro={editando} aoFechar={() => setEditando(null)} />}
    </div>
  );
}

interface AplicDia {
  id: string;
  numero: number;
  dose: number;
  local: string | null | undefined;
  obs: string | null | undefined;
}

/** Resumo do dia escolhido no calendário, com o botão para registrar ou editar. */
function DetalheDia({
  ref,
  hoje,
  data,
  registro: r,
  aplicacoes,
  pesoMedicao,
  rotuloDose,
  metaAgua,
  aoAbrir,
}: {
  ref: Ref<HTMLElement>;
  hoje: string;
  data: string;
  registro: RegistroDiario | undefined;
  aplicacoes: AplicDia[];
  pesoMedicao: number | null;
  rotuloDose: string | null;
  metaAgua: number;
  aoAbrir: () => void;
}) {
  const sintomas = textosSintomas(r);
  const notas = [...aplicacoes.map((a) => a.local), r?.observacoes, ...aplicacoes.map((a) => a.obs)].filter(Boolean) as string[];
  const nada = !r && !aplicacoes.length && pesoMedicao === null;
  const tomNausea = corDoDia('nausea', r).tom;
  const tomSono = corDoDia('sono', r).tom;
  const tomAgua = corDoDia('agua', r, metaAgua).tom;
  const tomDieta = corDoDia('dieta', r).tom;
  return (
    <section className="cartao dia-detalhe" ref={ref} aria-live="polite">
      <div className="secao-cab">
        <div className="cresce">
          <h2>
            {diaDaSemana(data)}, {formatarData(data, true)}
          </h2>
          <div className="linha dia-detalhe-etiquetas">
            {aplicacoes.map((a) => (
              <span key={a.id} className="etiqueta destaque">
                💉 {a.numero}ª · {mg(a.dose)}
              </span>
            ))}
            {!aplicacoes.length && rotuloDose && (
              <span className="etiqueta" title="Dias depois da última dose (D0 = dia da dose)">
                {rotuloDose}
              </span>
            )}
            {data === hoje && <span className="etiqueta">hoje</span>}
          </div>
        </div>
        <button className="botao pequeno" onClick={aoAbrir}>
          {r ? 'Editar dia' : 'Registrar'}
        </button>
      </div>
      {nada ? (
        <Vazio>Sem registro neste dia. Toque em Registrar para anotar peso, náusea, sono e água.</Vazio>
      ) : (
        <>
          <div className="dia-metricas">
            <div className="dia-metrica">
              <span className="rotulo">Peso</span>
              <b className="numero">{pesoMedicao !== null ? kg(pesoMedicao) : r?.peso_kg != null ? kg(r.peso_kg) : '–'}</b>
              {pesoMedicao !== null && <small>medição</small>}
            </div>
            <div className={`dia-metrica ${tomNausea ? `tom-${tomNausea}` : ''}`}>
              <span className="rotulo">Náusea</span>
              <b className="numero">{r?.nausea != null ? r.nausea : '–'}</b>
              {r?.nausea != null && <small>{NIVEIS_NAUSEA[r.nausea].toLowerCase()}</small>}
            </div>
            <div className={`dia-metrica ${tomSono ? `tom-${tomSono}` : ''}`}>
              <span className="rotulo">Sono</span>
              <b className="numero">{r?.sono_h != null ? `${num(r.sono_h, 1)} h` : '–'}</b>
            </div>
            <div className={`dia-metrica ${tomAgua ? `tom-${tomAgua}` : ''}`}>
              <span className="rotulo">Água</span>
              <b className="numero">{r?.agua_l != null ? `${num(r.agua_l, 1)} L` : '–'}</b>
              {r?.agua_l != null && <small>meta {num(metaAgua, 1)} L</small>}
            </div>
            <div className={`dia-metrica ${tomDieta ? `tom-${tomDieta}` : ''}`}>
              <span className="rotulo">Dieta</span>
              <b>{r?.dieta_seguida ? TEXTO_DIETA[r.dieta_seguida] : '–'}</b>
            </div>
            <div className="dia-metrica">
              <span className="rotulo">Urina</span>
              <b>{r?.cor_urina ?? '–'}</b>
            </div>
          </div>
          {(sintomas.length > 0 || notas.length > 0) && <p className="texto-2 dia-notas">{[...sintomas, ...notas].join(' · ')}</p>}
        </>
      )}
    </section>
  );
}
