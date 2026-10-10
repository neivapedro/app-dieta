import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useMetaAgua, useTreino } from '../dados/useTreino';
import { diaDeSintoma, mediaSono7, TEXTO_SINTOMA_AGUA, TEXTO_SONO_BAIXO } from '../lib/bemestar';
import { diferencaDias, formatarData, hojeLocal, somarDias } from '../lib/datas';
import { calcularMetas, calcularSaldo, macrosDaRefeicao, proximaRefeicao, resumoPlano, somar, textoItemPlano } from '../lib/dieta';
import { kg, lerPeso, num, paraTexto } from '../lib/formato';
import { diaCurto, horaDaFaixaOntem, pendenciasDeOntem, textoPendencias } from '../lib/rotina';
import { alertasSeguranca, AVISO_SEGURANCA } from '../lib/seguranca';
import { NIVEIS_NAUSEA, type RegistroDiario } from '../lib/tipos';
import { aderenciaRecente, formatarTempo, rotuloCardio, segundaDaSemana, tipoCardioEfetivo } from '../lib/treino';
import { gr, kcal } from './dieta';
import { FormDiaTreino, Marcador } from './treino';
import { Bloco, Campo, Escolhas } from './ui';

function minutosAgora(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

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
    const vazio =
      novo.peso_kg === null &&
      novo.nausea === null &&
      !novo.observacoes &&
      novo.vomito == null &&
      novo.diarreia == null &&
      novo.intestino_preso == null &&
      !novo.dieta_seguida &&
      novo.sono_h == null &&
      novo.agua_l == null &&
      novo.cor_urina == null;
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
  return (data: string, campos: { treino?: boolean; cardio?: boolean }) => {
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
      },
    });
  };
}

function temPlano(dieta: { refeicoes: { itens: unknown[] }[] } | null): boolean {
  return !!dieta?.refeicoes.some((r) => r.itens.length);
}

/** Das 05h às 12h: o que ficou sem marcar ontem, com 1 toque para gravar no dia de ontem. */
export function FaixaOntem() {
  const { treinos, diario, dieta } = useDados();
  const { hoje } = useCalculos();
  const t = useTreino();
  const gravarDia = useGravarDia();
  const gravarTreino = useGravarTreino();
  if (!horaDaFaixaOntem(new Date().getHours())) return null;
  const ontem = somarDias(hoje, -1);
  // Na virada para a fase pós-remédio, ontem ainda pode ser do placar do projeto
  const periodo = t ? (ontem <= t.projeto.fim ? t.projeto : { inicio: t.inicio, fim: t.fim }) : null;
  const p = pendenciasDeOntem({ hoje, treinos, diario, periodoTreino: periodo, comDieta: temPlano(dieta) });
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

/**
 * Depois das 18h: treino, cardio, náusea, sintomas, "segui o plano?" e peso
 * num cartão só, cada toque gravando na hora pela fila (sem abrir folha).
 */
export function CartaoFecharDia({ etiqueta }: { etiqueta?: string }) {
  const { diario, dieta } = useDados();
  const { hoje } = useCalculos();
  const t = useTreino();
  const gravarDia = useGravarDia();
  const gravarTreino = useGravarTreino();
  const reg = diario.find((r) => r.data === hoje);
  const [peso, setPeso] = useState(paraTexto(reg?.peso_kg));
  const [erroPeso, setErroPeso] = useState<string | null>(null);
  const [corridaAberta, setCorridaAberta] = useState(false);
  const comTreino = !!t && t.placar.iniciado && !t.placar.encerrado;
  const tr = t?.doDia(hoje);
  const corrida = tipoCardioEfetivo(hoje, tr) === 'corrida';

  function salvarPeso(e: FormEvent) {
    e.preventDefault();
    const p = lerPeso(peso);
    if (p.erro) return setErroPeso(p.erro);
    setErroPeso(null);
    gravarDia(hoje, { peso_kg: p.valor });
  }

  const pesoMudou = (lerPeso(peso).valor ?? null) !== (reg?.peso_kg ?? null) || !!lerPeso(peso).erro;

  return (
    <section className="cartao pilha" style={{ gap: 12 }} aria-label="Fechar o dia">
      <div className="cartao-cab" style={{ marginBottom: 0 }}>
        <h2>Fechar o dia</h2>
        <span className="mudo">{etiqueta ?? diaCurto(hoje)}</span>
      </div>
      {comTreino && (
        <div className="linha" style={{ flexWrap: 'nowrap' }}>
          <Marcador rotulo="Treino" detalhe="musculação" feito={!!tr?.treino} aoTocar={() => gravarTreino(hoje, { treino: !tr?.treino })} />
          <Marcador rotulo="Cardio" detalhe={rotuloCardio(hoje, tr)} feito={!!tr?.cardio} aoTocar={() => gravarTreino(hoje, { cardio: !tr?.cardio })} />
        </div>
      )}
      {comTreino && corrida && tr?.cardio && (
        <button className="botao pequeno" onClick={() => setCorridaAberta(true)}>
          {tr.corrida_seg ? `Corrida: ${formatarTempo(tr.corrida_seg)} · editar` : 'Anotar o tempo da corrida (opcional)'}
        </button>
      )}
      <Campo rotulo="Náusea (0 a 3)" grupo>
        <Escolhas opcoes={OPCOES_NAUSEA} valor={reg?.nausea ?? null} aoMudar={(v) => gravarDia(hoje, { nausea: v })} permitirVazio />
      </Campo>
      <Campo rotulo="Sintomas (toque para ligar ou desligar)" grupo>
        <div className="sintomas">
          {SINTOMAS.map(([k, rotulo]) => (
            <button
              type="button"
              key={k}
              aria-pressed={reg?.[k] === true}
              className={`sintoma ${reg?.[k] === true ? 'sim' : ''}`}
              onClick={() => gravarDia(hoje, { [k]: reg?.[k] !== true })}
            >
              {rotulo}
              {reg?.[k] === true ? ': sim' : ''}
            </button>
          ))}
        </div>
      </Campo>
      {diaDeSintoma(reg) && <div className="alerta info">{TEXTO_SINTOMA_AGUA}</div>}
      {temPlano(dieta) && (
        <Campo rotulo="Segui o plano hoje?" grupo>
          <Escolhas opcoes={OPCOES_PLANO} valor={reg?.dieta_seguida ?? null} aoMudar={(v) => gravarDia(hoje, { dieta_seguida: v })} permitirVazio />
        </Campo>
      )}
      <form className="linha" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }} onSubmit={salvarPeso}>
        <label className="campo cresce">
          <span>Peso em jejum (kg, opcional)</span>
          <input
            inputMode="decimal"
            value={peso}
            onChange={(e) => {
              setPeso(e.target.value.replace(/[^\d.,]/g, ''));
              setErroPeso(null);
            }}
          />
        </label>
        <button className="botao" disabled={!pesoMudou} style={{ flex: 'none' }}>
          {reg?.peso_kg != null && !pesoMudou ? 'Salvo' : 'Salvar peso'}
        </button>
      </form>
      {erroPeso && <div className="alerta erro">{erroPeso}</div>}
      {corridaAberta && <FormDiaTreino data={hoje} marcarCardio aoFechar={() => setCorridaAberta(false)} />}
    </section>
  );
}

/** Registro do dia (peso, náusea, sintomas): logo abaixo da dose de D0 a D3, mais abaixo nos outros dias. */
export function CartaoRegistroDia({ aoEditar, etiqueta }: { aoEditar: () => void; etiqueta?: string }) {
  const { diario } = useDados();
  const { hoje } = useCalculos();
  const metaAguaDe = useMetaAgua();
  const reg = diario.find((r) => r.data === hoje);
  const sono = mediaSono7(diario, hoje);
  const metaAguaHoje = metaAguaDe(hoje).meta;
  return (
    <section className="cartao">
      <div className="cartao-cab">
        <h2>
          Hoje{etiqueta ? <span className="mudo" style={{ fontWeight: 500 }}> · {etiqueta}</span> : null}
        </h2>
        <button className="botao pequeno" onClick={aoEditar}>
          {reg ? 'Editar' : 'Registrar'}
        </button>
      </div>
      {reg ? (
        <div className="grade grade-3">
          <Bloco rotulo="Peso" valor={kg(reg.peso_kg)} />
          <Bloco rotulo="Náusea" valor={reg.nausea === null ? '–' : NIVEIS_NAUSEA[reg.nausea]} />
          <Bloco
            rotulo="Sintomas"
            valor={[reg.vomito && 'vômito', reg.diarreia && 'diarreia', reg.intestino_preso && 'intestino preso'].filter(Boolean).join(', ') || '–'}
          />
        </div>
      ) : (
        <p className="mudo">Anote peso, náusea, efeitos, sono e água de hoje. Vale para qualquer dia, não só o da aplicação.</p>
      )}
      {reg && (reg.sono_h != null || reg.agua_l != null || reg.cor_urina) ? (
        <p className="texto-2" style={{ marginTop: 8 }}>
          {[
            reg.sono_h != null && `Sono ${num(reg.sono_h, 1)} h`,
            reg.agua_l != null && `Água ${num(reg.agua_l, 1)} de ${num(metaAguaHoje, 1)} L`,
            reg.cor_urina && `urina ${reg.cor_urina}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
      {diaDeSintoma(reg) && (
        <div className="alerta info" style={{ marginTop: 8 }}>
          {TEXTO_SINTOMA_AGUA}
        </div>
      )}
      {sono.baixo && (
        <div className="alerta" style={{ marginTop: 8 }}>
          {TEXTO_SONO_BAIXO} (média de 7 dias: {num(sono.media, 1)} h)
        </div>
      )}
      {reg?.observacoes && (
        <p className="mudo obs-curta" style={{ marginTop: 8 }}>
          Obs.: {reg.observacoes}
        </p>
      )}
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

/** Cartão do Início: o plano do dia × a meta, a próxima refeição e "segui o plano?". */
export function CartaoDietaHoje({ semPergunta }: { semPergunta?: boolean }) {
  const { dieta, diario, treinos } = useDados();
  const { composicoes, hoje } = useCalculos();
  const treino = useTreino();
  const { banco } = useAlimentos();
  const gravarDia = useGravarDia();
  if (!dieta || !temPlano(dieta)) return null;
  const ultima = [...composicoes].reverse().find((c) => c.massa_magra_kg !== null) ?? null;
  const aderencia = treino ? aderenciaRecente(treinos, treino.inicio, hoje, 28, treino.fim) : null;
  const metas = ultima ? calcularMetas(dieta.config, { peso_kg: ultima.peso_kg, massa_magra_kg: ultima.massa_magra_kg! }, aderencia) : null;
  const total = banco ? somar(dieta.refeicoes.map((r) => macrosDaRefeicao(r, banco.mapa))) : null;
  const saldo = metas && total ? calcularSaldo(metas, total) : null;
  const plano = saldo ? resumoPlano(saldo) : null;
  const prox = proximaRefeicao(dieta.refeicoes, minutosAgora());
  const regHoje = diario.find((r) => r.data === hoje);

  return (
    <section className="cartao">
      <div className="cartao-cab">
        <h2>Dieta de hoje</h2>
        <Link to="/dieta" className="botao pequeno">
          Abrir
        </Link>
      </div>
      {plano && saldo ? (
        <Link to="/dieta" className="resumo-plano" aria-label="Ver o plano na Dieta">
          {plano.fechado ? (
            <span>
              <b className="bom">Plano fechado ✓</b> {kcal(plano.kcal_meta)}
            </span>
          ) : (
            <span>
              Plano <b>{num(plano.kcal_plano, 0)}</b> de {kcal(plano.kcal_meta)}
              {plano.faltam.length > 0 && <> · falta {plano.faltam.map((f) => `${f.nome} ${gr(f.g)} g`).join(', ')}</>}
              {plano.passam.length > 0 && (
                <>
                  {' '}
                  · <span className="ruim">passou {plano.passam.map((f) => `${f.nome} ${gr(f.g)} g`).join(', ')}</span>
                </>
              )}
            </span>
          )}
        </Link>
      ) : null}
      {metas && saldo && saldo.meta.carb < 0 && (
        <div className="alerta" style={{ display: 'block', marginBottom: 8 }}>
          A proteína e a gordura já passam da meta de kcal. Reduza o g/kg delas ou o déficit em Ajustar, na aba Dieta.
        </div>
      )}
      {metas ? null : (
        <p className="texto-2" style={{ marginBottom: 8 }}>
          Registre uma medição para calcular a meta.
        </p>
      )}
      {ultima && diferencaDias(ultima.data, hoje) > 10 && (
        <p className="texto-2" style={{ marginBottom: 8 }}>
          Meta calculada com a medição de {formatarData(ultima.data)}.
        </p>
      )}
      {prox && banco && (
        <div className="texto-2" style={{ marginBottom: semPergunta ? 0 : 10 }}>
          <b>
            {prox.nome}
            {prox.horario ? ` · ${prox.horario}` : ''}
          </b>
          <ul className="itens-plano">
            {prox.itens.map((i, k) => (
              <li key={`${k}-${i.alimento_id}`}>{textoItemPlano(i, banco.mapa.get(i.alimento_id))}</li>
            ))}
          </ul>
        </div>
      )}
      {!semPergunta && (
        <div className="linha entre">
          <span className="rotulo">Segui o plano hoje?</span>
          <Escolhas opcoes={OPCOES_PLANO} valor={regHoje?.dieta_seguida ?? null} aoMudar={(v) => gravarDia(hoje, { dieta_seguida: v })} permitirVazio />
        </div>
      )}
    </section>
  );
}

/** Às segundas, enquanto não houver medição na semana: lembrete da medição em jejum. */
export function CartaoMedicaoSegunda({ aoMedir }: { aoMedir: () => void }) {
  const { medidas } = useDados();
  const { hoje } = useCalculos();
  if (!medidas.length) return null;
  const segunda = segundaDaSemana(hoje);
  if (hoje !== segunda) return null;
  if (medidas.some((m) => m.data >= segunda)) return null;
  return (
    <section className="cartao proxima hoje">
      <div className="cartao-cab">
        <h2>Medição de segunda</h2>
        <span className="etiqueta destaque">Hoje</span>
      </div>
      <p className="texto-2" style={{ marginBottom: 10 }}>
        Em jejum, depois de ir ao banheiro e antes de beber água. Mesma fita e mesmo horário de sempre.
      </p>
      <button className="botao primario bloco-largo" onClick={aoMedir}>
        Fazer a medição
      </button>
    </section>
  );
}
