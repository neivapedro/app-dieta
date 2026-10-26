import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useMetaAgua, useTreino } from '../dados/useTreino';
import { diaDeSintoma, diaVazio, mediaSono7, TEXTO_SINTOMA_AGUA, TEXTO_SONO_BAIXO } from '../lib/bemestar';
import { progressoTarefas, tarefasDoDia, type ChaveTarefa, type EntradaTarefas, type Tarefa } from '../lib/inicio-hoje';
import { hojeLocal, somarDias } from '../lib/datas';
import { kg, lerPeso, num, paraTexto } from '../lib/formato';
import { diaCurto, horaDaFaixaOntem, pendenciasDeOntem, textoPendencias } from '../lib/rotina';
import { alertasSeguranca, AVISO_SEGURANCA } from '../lib/seguranca';
import { NIVEIS_NAUSEA, type RegistroDiario } from '../lib/tipos';
import { rotuloCardio, segundaDaSemana, tipoCardioEfetivo, tocarCardio, type TipoCardio } from '../lib/treino';
import { BotaoCorrida, FormDiaTreino, MarcadoresDia } from './treino';
import { Campo, Escolhas } from './ui';

const OPCOES_PLANO = [
  { valor: 'sim' as const, rotulo: 'Sim' },
  { valor: 'parcial' as const, rotulo: 'Em parte' },
  { valor: 'nao' as const, rotulo: 'Não' },
];

const OPCOES_NAUSEA = NIVEIS_NAUSEA.map((r, i) => ({ valor: i, rotulo: `${i} · ${r}` }));

type ChaveSintoma = 'vomito' | 'diarreia' | 'intestino_preso';
const SINTOMAS: [ChaveSintoma, string][] = [
  ['vomito', 'Vômito'],
  ['diarreia', 'Diarreia'],
  ['intestino_preso', 'Intestino preso'],
];

type CamposDia = Omit<RegistroDiario, 'id' | 'data'>;

/** O dia virou com o app aberto: só atualiza a tela, não grava no dia errado. */
function diaVirou(hoje: string): boolean {
  if (hojeLocal() === hoje) return false;
  window.dispatchEvent(new Event('focus'));
  return true;
}

/**
 * Grava um ou mais campos do Diário de um dia pela fila, mantendo os outros.
 * Um dia que fica sem nada é excluído (não deixa registro vazio no Diário).
 */
export function useGravarDia() {
  const { diario, gravar, hoje } = useDados();
  return (data: string, campos: Partial<CamposDia>) => {
    if (diaVirou(hoje)) return;
    const atual = diario.find((r) => r.data === data);
    const novo: CamposDia = {
      peso_kg: atual?.peso_kg ?? null,
      nausea: atual?.nausea ?? null,
      observacoes: atual?.observacoes ?? null,
      vomito: atual?.vomito ?? null,
      diarreia: atual?.diarreia ?? null,
      intestino_preso: atual?.intestino_preso ?? null,
      dieta_seguida: atual?.dieta_seguida ?? null,
      sono_h: atual?.sono_h ?? null,
      agua_l: atual?.agua_l ?? null,
      cor_urina: atual?.cor_urina ?? null,
      ...campos,
    };
    const vazio = diaVazio(novo);
    if (vazio) {
      if (atual) gravar({ tipo: 'excluir', dado: { alvo: 'diario', id: atual.id, data } });
      return;
    }
    gravar({ tipo: 'diario', dado: { data, ...novo } });
  };
}

/** Marca treino e/ou cardio de um dia pela fila, sem apagar o outro check, o tempo da corrida, o tipo do cardio nem o esforço. */
export function useGravarTreino() {
  const { treinos, gravar, hoje } = useDados();
  // cardioTipo: toque em Bike ou Corrida (marca, troca o tipo ou desmarca; ver tocarCardio)
  return (data: string, campos: { treino?: boolean; cardio?: boolean; cardioTipo?: TipoCardio }) => {
    if (diaVirou(hoje)) return;
    const atual = treinos.find((t) => t.data === data);
    gravar({
      tipo: 'treino',
      dado: {
        data,
        treino: campos.treino ?? !!atual?.treino,
        cardio: campos.cardio ?? !!atual?.cardio,
        corrida_km: atual?.corrida_km ?? null,
        corrida_seg: atual?.corrida_seg ?? null,
        // Desmarcar uma sessão apaga o esforço dela; o resto continua como estava
        cardio_tipo: atual?.cardio_tipo ?? null,
        esforco_treino: campos.treino === false ? null : (atual?.esforco_treino ?? null),
        esforco_cardio: campos.cardio === false ? null : (atual?.esforco_cardio ?? null),
        ...(campos.cardioTipo ? tocarCardio(data, atual, campos.cardioTipo) : {}),
      },
    });
  };
}

/** Início do ciclo: a 1ª aplicação ou a data planejada, o que vier antes. */
function inicioDoCiclo(planejado: string | undefined, primeira: string | undefined): string | null {
  const datas = [planejado, primeira].filter((d): d is string => !!d).sort();
  return datas[0] ?? null;
}

function temPlano(dieta: { refeicoes: { itens: unknown[] }[] } | null): boolean {
  return !!dieta?.refeicoes.some((r) => r.itens.length);
}

/** Das 05h às 12h: o que ficou sem marcar ontem, com 1 toque para gravar no dia de ontem. */
export function FaixaOntem() {
  const { treinos, diario, dieta, ciclo } = useDados();
  const { hoje, resumo } = useCalculos();
  const t = useTreino();
  const gravarDia = useGravarDia();
  const gravarTreino = useGravarTreino();
  if (!horaDaFaixaOntem(new Date().getHours())) return null;
  const ontem = somarDias(hoje, -1);
  // Na virada para a fase pós-remédio, ontem ainda pode ser do placar do projeto
  const periodo = t ? (ontem <= t.projeto.fim ? t.projeto : { inicio: t.inicio, fim: t.fim }) : null;
  const p = pendenciasDeOntem({ hoje, treinos, diario, periodoTreino: periodo, comDieta: temPlano(dieta), inicioCiclo: inicioDoCiclo(ciclo?.data_inicio, resumo?.linhas[0]?.aplicacao.data) });
  if (!p) return null;
  return (
    <section className="cartao faixa-ontem pilha" style={{ gap: 10 }} aria-label="Pendências de ontem">
      <p>
        <b>Ontem ({diaCurto(p.data)}):</b> {textoPendencias(p)}
      </p>
      {p.sequencia > 0 && (
        <p className="texto-2">
          Marque para manter seus 🔥 {p.sequencia} {p.sequencia === 1 ? 'dia seguido' : 'dias seguidos'}.
        </p>
      )}
      {(p.treino || p.cardio) && (
        <div className="linha">
          {p.treino && (
            <button className="botao pequeno" onClick={() => gravarTreino(p.data, { treino: true })}>
              Fiz o treino
            </button>
          )}
          {p.cardio && (
            <button className="botao pequeno" onClick={() => gravarTreino(p.data, { cardio: true })}>
              Fiz o cardio <span className="mudo">({rotuloCardio(p.data, treinos.find((x) => x.data === p.data)).toLowerCase()})</span>
            </button>
          )}
        </div>
      )}
      {p.dieta && (
        <div className="linha entre">
          <span className="rotulo">Segui o plano ontem?</span>
          <Escolhas opcoes={OPCOES_PLANO} valor={null} aoMudar={(v) => v && gravarDia(p.data, { dieta_seguida: v })} />
        </div>
      )}
    </section>
  );
}

/** Dados do checklist de hoje (o anel do topo e o cartão usam a mesma conta). */
export function useTarefasHoje(dose: EntradaTarefas['dose']) {
  const { diario, dieta, medidas } = useDados();
  const { hoje } = useCalculos();
  const metaAguaDe = useMetaAgua();
  const t = useTreino();
  const reg = diario.find((r) => r.data === hoje);
  // Dia com medição: o peso do dia é o da medição (não oferece um segundo peso)
  const medicaoHoje = medidas.find((m) => m.data === hoje && m.peso_kg > 0) ?? null;
  const comTreino = !!t && t.placar.iniciado && !t.placar.encerrado;
  const tr = t?.doDia(hoje) ?? null;
  // Às segundas, para quem já mede: a medição em jejum entra no checklist
  const segunda = segundaDaSemana(hoje);
  const medicao = medidas.length && hoje === segunda ? { feita: medidas.some((m) => m.data >= segunda) } : null;
  const comDieta = temPlano(dieta);
  const metaAgua = metaAguaDe(hoje).meta;
  const tarefas = tarefasDoDia({
    reg,
    pesoMedicao: medicaoHoje?.peso_kg ?? null,
    dose,
    medicao,
    comTreino,
    treinoDia: tr,
    comDieta,
    metaAgua,
  });
  return { tarefas, progresso: progressoTarefas(tarefas), reg, medicaoHoje, comTreino, tr, comDieta, metaAgua };
}

export type TarefasHoje = ReturnType<typeof useTarefasHoje>;

/** Anel de progresso pequeno (checklist do dia, frasco usado). */
export function AnelHoje({ fracao, texto, sub, tom, rotulo }: { fracao: number; texto: string; sub?: string; tom?: string; rotulo: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const f = Math.min(Math.max(fracao, 0), 1);
  return (
    <div className={`anel-hoje ${tom ?? ''}`} role="img" aria-label={rotulo}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="anel-hoje-trilho" />
        {f > 0 && <circle cx="32" cy="32" r={r} className="anel-hoje-valor" strokeDasharray={`${f * c} ${c}`} transform="rotate(-90 32 32)" />}
      </svg>
      <span className="anel-hoje-centro" aria-hidden="true">
        <b className="numero">{texto}</b>
        {sub && <span>{sub}</span>}
      </span>
    </div>
  );
}

// Ordem das linhas à noite: como era o "Fechar o dia" (náusea e sintomas, plano, peso; água e sono no fim)
const ORDEM_NOITE: ChaveTarefa[] = ['dose', 'medicao', 'nausea', 'plano', 'peso', 'agua', 'sono'];

function Marca({ feito }: { feito: boolean }) {
  return (
    <span className="tarefa-check" aria-hidden="true">
      {feito ? '✓' : ''}
    </span>
  );
}

/**
 * Checklist de hoje: treino e cardio com um toque, e o Diário do dia (peso, náusea,
 * água, sono, plano) abrindo o registro. Depois das 18h vira o "Fechar o dia": náusea,
 * sintomas, "segui o plano?" e peso gravam ali mesmo, cada toque na hora pela fila.
 */
export function ChecklistHoje({
  h,
  noite,
  etiqueta,
  aoDiario,
  aoMedir,
  aoDose,
}: {
  h: TarefasHoje;
  noite: boolean;
  etiqueta?: string;
  aoDiario: () => void;
  aoMedir: () => void;
  aoDose: () => void;
}) {
  const { diario } = useDados();
  const { hoje } = useCalculos();
  const t = useTreino();
  const gravarDia = useGravarDia();
  const gravarTreino = useGravarTreino();
  const { tarefas, progresso, reg, medicaoHoje, comTreino, tr } = h;
  const [peso, setPeso] = useState(paraTexto(reg?.peso_kg));
  // Campo não mexido acompanha o peso gravado (ex.: peso salvo junto com a aplicação)
  const [mexeuPeso, setMexeuPeso] = useState(false);
  const pesoGravado = reg?.peso_kg ?? null;
  useEffect(() => {
    if (!mexeuPeso) setPeso(paraTexto(pesoGravado));
  }, [pesoGravado, hoje, mexeuPeso]);
  const [erroPeso, setErroPeso] = useState<string | null>(null);
  const [treinoAberto, setTreinoAberto] = useState(false);
  // Sintomas que estavam "não" antes de ligar: desligar volta para "não"
  const naoAntes = useRef(new Set<string>());
  const corridaFeita = !!tr?.cardio && tipoCardioEfetivo(hoje, tr) === 'corrida';
  const sono = mediaSono7(diario, hoje);
  const placar = t?.placar;

  function salvarPeso(e: FormEvent) {
    e.preventDefault();
    const p = lerPeso(peso);
    if (p.erro) return setErroPeso(p.erro);
    setErroPeso(null);
    setMexeuPeso(false);
    gravarDia(hoje, { peso_kg: p.valor });
  }
  const pesoMudou = (lerPeso(peso).valor ?? null) !== (reg?.peso_kg ?? null) || !!lerPeso(peso).erro;

  const linhas = tarefas.filter((x) => x.chave !== 'treino' && x.chave !== 'cardio');
  if (noite) linhas.sort((a, b) => ORDEM_NOITE.indexOf(a.chave) - ORDEM_NOITE.indexOf(b.chave));

  // Linha que abre o registro (Diário, medição ou aplicação)
  const linhaBotao = (x: Tarefa, aoTocar: () => void, destaque?: boolean) => (
    <li key={x.chave} id={`tarefa-${x.chave}`} className={`tarefa ${x.feito ? 'feito' : ''} ${destaque && !x.feito ? 'tarefa-destaque' : ''}`}>
      <button type="button" className="tarefa-linha" onClick={aoTocar}>
        <Marca feito={x.feito} />
        <span className="tarefa-rotulo">{x.rotulo}</span>
        <span className="tarefa-valor numero">{x.detalhe}</span>
        <span className="tarefa-seta" aria-hidden="true">
          ›
        </span>
        <span className="oculto-visual">{x.feito ? ' · feito' : ' · a fazer'}</span>
      </button>
    </li>
  );
  // Linha que já está feita e não abre nada (ex.: aplicação registrada hoje)
  const linhaFeita = (x: Tarefa) => (
    <li key={x.chave} className="tarefa feito">
      <div className="tarefa-linha">
        <Marca feito />
        <span className="tarefa-rotulo">{x.rotulo}</span>
        <span className="tarefa-valor numero">{x.detalhe}</span>
      </div>
    </li>
  );
  // Linha com o controle embaixo (só no "Fechar o dia")
  const linhaControle = (x: Tarefa, controle: ReactNode) => (
    <li key={x.chave} id={`tarefa-${x.chave}`} className={`tarefa tarefa-com-controle ${x.feito ? 'feito' : ''}`}>
      <div className="tarefa-linha">
        <Marca feito={x.feito} />
        <span className="tarefa-rotulo">{x.rotulo}</span>
        <span className="tarefa-valor numero">{x.detalhe}</span>
      </div>
      <div className="tarefa-controle">{controle}</div>
    </li>
  );

  function linha(x: Tarefa) {
    if (x.chave === 'dose') return x.feito ? linhaFeita(x) : linhaBotao(x, aoDose, true);
    if (x.chave === 'medicao')
      return x.feito ? (
        linhaFeita(x)
      ) : (
        <li key={x.chave} className="tarefa tarefa-destaque">
          <button type="button" className="tarefa-linha" onClick={aoMedir}>
            <Marca feito={false} />
            <span className="tarefa-rotulo">
              Medição de segunda
              <span className="tarefa-sub">Em jejum, depois de ir ao banheiro e antes de beber água. Mesma fita e mesmo horário de sempre.</span>
            </span>
            <span className="tarefa-acao">Medir</span>
            <span className="oculto-visual"> · a fazer</span>
          </button>
        </li>
      );
    if (!noite) return linhaBotao(x, aoDiario);
    if (x.chave === 'nausea')
      return linhaControle(
        x,
        <>
          <Campo rotulo="Náusea (0 a 3)" grupo>
            <Escolhas opcoes={OPCOES_NAUSEA} valor={reg?.nausea ?? null} aoMudar={(v) => gravarDia(hoje, { nausea: v })} permitirVazio />
          </Campo>
          <Campo rotulo="Sintomas (toque para ligar ou desligar)" grupo>
            <div className="sintomas">
              {SINTOMAS.map(([k, rotulo]) => {
                const v = reg?.[k];
                // Desligar volta para "não" quando o dia já tem resposta de sintoma (não apaga um "não" respondido)
                const respondido = SINTOMAS.some(([j]) => j !== k && reg?.[j] != null) || naoAntes.current.has(k);
                return (
                  <button
                    type="button"
                    key={k}
                    aria-pressed={v === true}
                    className={`sintoma ${v === true ? 'sim' : v === false ? 'nao' : ''}`}
                    onClick={() => {
                      if (v === false) naoAntes.current.add(k);
                      gravarDia(hoje, { [k]: v === true ? (respondido ? false : null) : true });
                    }}
                  >
                    {rotulo}
                    {v === true ? ': sim' : v === false ? ': não' : ''}
                  </button>
                );
              })}
            </div>
          </Campo>
        </>,
      );
    if (x.chave === 'plano')
      return linhaControle(
        { ...x, rotulo: 'Segui o plano hoje?' },
        <Escolhas opcoes={OPCOES_PLANO} valor={reg?.dieta_seguida ?? null} aoMudar={(v) => gravarDia(hoje, { dieta_seguida: v })} permitirVazio />,
      );
    if (x.chave === 'peso')
      return medicaoHoje ? (
        <li key={x.chave} className="tarefa feito">
          <div className="tarefa-linha">
            <Marca feito />
            <span className="tarefa-rotulo">
              Peso
              <span className="tarefa-sub">
                Peso do dia: <b>{kg(medicaoHoje.peso_kg)}</b>, da medição de hoje.
              </span>
            </span>
          </div>
        </li>
      ) : (
        linhaControle(
          x,
          <form className="linha" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }} onSubmit={salvarPeso}>
            <label className="campo cresce">
              <span>Peso (kg, opcional)</span>
              <input
                inputMode="decimal"
                value={peso}
                onChange={(e) => {
                  setPeso(e.target.value.replace(/[^\d.,]/g, ''));
                  setMexeuPeso(true);
                  setErroPeso(null);
                }}
              />
            </label>
            <button className="botao" disabled={!pesoMudou} style={{ flex: 'none' }}>
              {reg?.peso_kg != null && !pesoMudou ? 'Salvo' : 'Salvar peso'}
            </button>
          </form>,
        )
      );
    return linhaBotao(x, aoDiario);
  }

  const titulo = noite ? 'Fechar o dia' : 'Checklist de hoje';
  return (
    <section id="checklist-hoje" className={`cartao checklist ${noite ? 'checklist-noite' : ''}`} aria-label={titulo}>
      <div className="checklist-cab">
        <div className="cresce">
          <h2>{titulo}</h2>
          <div className="secao-sub">
            {etiqueta ?? diaCurto(hoje)}
            {noite ? ' · cada toque grava na hora' : ' · toque para anotar'}
          </div>
        </div>
        <span className="checklist-contagem numero" aria-label={`${progresso.feitas} de ${progresso.total} feitos`}>
          <b>{progresso.feitas}</b> de {progresso.total}
        </span>
      </div>
      <div className="checklist-barra" aria-hidden="true">
        <div style={{ width: `${progresso.fracao * 100}%` }} />
      </div>
      {comTreino && (
        <div className="checklist-treino">
          <MarcadoresDia
            data={hoje}
            reg={tr}
            aoTreino={() => gravarTreino(hoje, { treino: !tr?.treino })}
            aoCardio={(tipo) => gravarTreino(hoje, { cardioTipo: tipo })}
          />
          {corridaFeita && <BotaoCorrida reg={tr} aoTocar={() => setTreinoAberto(true)} />}
          <div className="checklist-treino-pe">
            <span className="mudo cresce">
              {placar ? `Dia ${placar.diaAtual} de ${placar.totalDias}` : ''}
              {placar && placar.sequenciaAtual > 1 ? ` · 🔥 ${placar.sequenciaAtual} seguidos` : ''}
            </span>
            {!corridaFeita && (
              <button type="button" className="botao pequeno" onClick={() => setTreinoAberto(true)}>
                Esforço
              </button>
            )}
          </div>
        </div>
      )}
      <ul className="tarefas">{linhas.map(linha)}</ul>
      {erroPeso && <div className="alerta erro">{erroPeso}</div>}
      {diaDeSintoma(reg) && <div className="alerta info">{TEXTO_SINTOMA_AGUA}</div>}
      {sono.baixo && (
        <div className="alerta">
          {TEXTO_SONO_BAIXO} (média de 7 dias: {num(sono.media, 1)} h)
        </div>
      )}
      {reg?.observacoes && <p className="mudo obs-curta">Obs.: {reg.observacoes}</p>}
      <div className="checklist-pe">
        <span className="mudo cresce">{reg?.cor_urina ? `Urina ${reg.cor_urina}` : 'Urina e observações'}</span>
        <button type="button" className="botao pequeno" onClick={aoDiario}>
          Registro completo
        </button>
      </div>
      {treinoAberto && <FormDiaTreino data={hoje} foco={corridaFeita ? 'corrida' : undefined} aoFechar={() => setTreinoAberto(false)} />}
    </section>
  );
}

/** Alertas de segurança calculados com o Diário e as Medidas (Início e folha da aplicação). */
export function AlertasSeguranca({ compacto }: { compacto?: boolean }) {
  const { diario, aplicacoes } = useDados();
  const { composicoes, hoje } = useCalculos();
  const alertas = useMemo(() => alertasSeguranca({ diario, composicoes, aplicacoes, hoje }), [diario, composicoes, aplicacoes, hoje]);
  if (!alertas.length) return null;
  return (
    <section className="pilha" style={{ gap: 6 }} aria-label="Atenção">
      {!compacto && <h2 style={{ fontSize: '1rem' }}>Atenção</h2>}
      {alertas.map((a) => (
        <div key={a.regra} className={`alerta ${a.nivel === 'info' ? 'info' : ''}`}>
          {a.texto}
        </div>
      ))}
      <p className="mudo" style={{ fontSize: '0.78rem' }}>
        {AVISO_SEGURANCA}
      </p>
    </section>
  );
}
