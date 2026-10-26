import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Diario } from './Diario';
import { AvisoRapido } from '../componentes/dose';
import { FormAplicacao } from '../componentes/formularios';
import { LinhaDoses } from '../componentes/painel';
import { Campo, CampoNumero, Escolhas, Folha, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { CicloSalvoEmParte } from '../dados/repositorio';
import { useCalculos } from '../dados/useCalculos';
import {
  CAPACIDADE_PADRAO_UI,
  CAPACIDADES_SERINGA,
  MARCAS_SERINGA,
  REGRAS_FASE,
  capacidadeSeringa,
  consumoPlano,
  fasesNumeradas,
  guiaSeringa,
  marcacao,
  mgParaMl,
  passoDaMarca,
  semanasDoDegrau,
  semanasFeitasNaFase,
  verificarPlano,
  type FaseLocalizada,
} from '../lib/ciclo';
import { segmentosPorFase } from '../lib/ciclo-calendario';
import { diaDaSemana, formatarData, hojeLocal } from '../lib/datas';
import { compararFases } from '../lib/registroDecisoes';
import { mg, num, paraNumero, paraTexto, pct, sinal, ui } from '../lib/formato';
import { diaCurto } from '../lib/rotina';
import type { Aplicacao, Ciclo as TCiclo, Fase } from '../lib/tipos';
import '../estilos/ciclo.css';

type Aba = 'agenda' | 'diario' | 'plano' | 'ajustes';
const ABAS_CICLO: [Aba, string][] = [
  ['agenda', 'Agenda'],
  ['diario', 'Diário'],
  ['plano', 'Plano'],
  ['ajustes', 'Ajustes'],
];

/** Plano com mudanças não salvas (para avisar antes de sair dele) */
const planoComMudancas = { atual: false };

export function Ciclo() {
  // A sub-aba fica no endereço (?aba=diario), para o link antigo do Diário continuar funcionando
  const [params, setParams] = useSearchParams();
  const aba = (ABAS_CICLO.find(([k]) => k === params.get('aba'))?.[0] ?? 'agenda') as Aba;
  const setAba = (a: Aba) => {
    if (aba === 'plano' && a !== 'plano' && planoComMudancas.atual && !window.confirm('O plano tem mudanças não salvas. Sair sem salvar?')) return;
    planoComMudancas.atual = false;
    setParams(a === 'agenda' ? {} : { aba: a }, { replace: true });
    window.scrollTo({ top: 0 });
  };
  return (
    <div className="pilha">
      <div className="abas abas-painel" role="tablist" aria-label="Seções do ciclo">
        {ABAS_CICLO.map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>
            {r}
          </button>
        ))}
      </div>
      {aba === 'agenda' && <Agenda />}
      {aba === 'diario' && <Diario />}
      {aba === 'plano' && <Plano />}
      {aba === 'ajustes' && <Ajustes />}
      <Link to="/retatrutida" className="cartao cartao-link">
        <span className="cresce">
          <strong>Entenda a retatrutida →</strong>
          <span className="mudo">Como age no corpo, o que os estudos mostram e comparação com semaglutida e tirzepatida.</span>
        </span>
      </Link>
    </div>
  );
}

/** "seg 02/11" e, se o ano não for o de hoje, "/27" */
function dataCurta(data: string, hoje: string): string {
  return `${diaCurto(data)}${data.slice(0, 4) !== hoje.slice(0, 4) ? `/${data.slice(2, 4)}` : ''}`;
}

const nomeFase = (f: FaseLocalizada | null) => (f ? `Fase ${f.indice + 1} · ${f.fase.nome}` : 'Fora do plano');

// ---------- Agenda (equivale às abas Diário + Semanal da planilha) ----------

const REALIZADAS_INICIAIS = 5;

function Agenda() {
  const { ciclo } = useDados();
  const { resumo, hoje } = useCalculos();
  const [editando, setEditando] = useState<Aplicacao | null>(null);
  const [novo, setNovo] = useState(false);
  const [todas, setTodas] = useState(false);
  const [todasFeitas, setTodasFeitas] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  if (!resumo) return null;
  const proximas = todas ? resumo.projecao : resumo.projecao.slice(0, 6);
  const realizadas = [...resumo.linhas].reverse();
  const p0 = resumo.proxima;
  const atrasada = p0?.situacao === 'atrasada';
  const capacidade = ciclo ? capacidadeSeringa(ciclo) : CAPACIDADE_PADRAO_UI;

  return (
    <>
      <section className="cartao hero agenda-hero">
        <div className="hero-cab">
          <div className="cresce">
            <div className="sobretitulo">
              {p0 ? `Próxima dose · ${p0.numero}ª` : 'Agenda'}
              {atrasada && <span className="etiqueta ruim agenda-etiqueta">atrasada</span>}
              {p0?.situacao === 'hoje' && <span className="etiqueta bom agenda-etiqueta">hoje</span>}
            </div>
            <div className="hero-titulo numero">
              {p0 ? (
                <>
                  <span className="sem-quebra">{dataCurta(p0.data, hoje)} ·</span> <span className="sem-quebra">{num(p0.dose_mg)} mg</span>
                </>
              ) : (
                'Sem próxima dose'
              )}
            </div>
            <div className="hero-sub">
              {p0 ? (
                <>
                  {ui(p0.ui_pratica)} · {nomeFase(p0.fase)}
                </>
              ) : (
                'Nenhuma aplicação restante no plano.'
              )}
            </div>
          </div>
          <button className="botao pequeno primario" onClick={() => setNovo(true)}>
            Registrar
          </button>
        </div>
        {(resumo.linhas.length > 0 || resumo.projecao.length > 0) && (
          <div className="agenda-doses">
            <LinhaDoses
              feitas={resumo.linhas.map((l) => ({ numero: l.numero, dose: l.aplicacao.dose_mg, data: l.aplicacao.data }))}
              previstas={resumo.projecao.map((d) => ({ numero: d.numero, dose: d.dose_mg, data: d.data, hipotese: d.hipotese }))}
            />
          </div>
        )}
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="rotulo">Aplicadas</div>
            <div className="valor">{resumo.aplicacoes_realizadas}</div>
            <div className="hero-stat-sub">{mg(resumo.total_aplicado_mg)}</div>
          </div>
          <div className="hero-stat">
            <div className="rotulo">Saldo</div>
            <div className="valor">{mg(Math.max(resumo.saldo_mg, 0))}</div>
            <div className="hero-stat-sub">{pct(resumo.percentual_usado, 0)} usado</div>
          </div>
          <div className="hero-stat">
            <div className="rotulo">Última dose</div>
            <div className="valor">{resumo.data_fim_prevista ? formatarData(resumo.data_fim_prevista, true).slice(0, 5) : '–'}</div>
            <div className="hero-stat-sub">{resumo.data_fim_prevista ? `${resumo.data_fim_prevista.slice(0, 4)}${resumo.fim_hipotese ? ' · se subir' : ''}` : ''}</div>
          </div>
        </div>
      </section>

      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>Próximas aplicações</h2>
            <div className="secao-sub">Datas pela última aplicação real</div>
          </div>
        </div>
        {resumo.degrau.estado === 'pendente' && p0 && (
          <div className="alerta agenda-alerta">
            Fim da fase: a próxima dose ({atrasada ? `atrasada desde ${formatarData(p0.data)}` : formatarData(p0.data)}) continua {num(p0.dose_mg)} mg até você decidir no Início. A
            lista abaixo mostra o plano se subir.
          </div>
        )}
        {resumo.degrau.estado === 'fora_do_plano' && (
          <div className="alerta agenda-alerta">
            A última dose ({num(resumo.degrau.degrau?.bloco.dose_mg)} mg) não bate com nenhuma fase do Plano: a próxima continua {num(resumo.degrau.dose_mg)} mg. Confirme no Início qual
            fase seguir; a lista abaixo é a hipótese das fases seguintes.
          </div>
        )}
        {proximas.length === 0 && p0 && !p0.saldo_suficiente ? (
          // O saldo não cobre a próxima dose: a projeção fica vazia, mas a dose continua no plano (como no Início)
          <ol className="tempo">
            <li className="tempo-dose tempo-proxima">
              <span className="tempo-ponto" aria-hidden="true" />
              <div className="tempo-data">
                <b className="numero">{dataCurta(p0.data, hoje)}</b>
                <span>
                  {p0.numero}ª · {nomeFase(p0.fase)}
                  {atrasada && <span className="etiqueta ruim agenda-etiqueta">atrasada</span>}
                </span>
                <span className="aviso-txt">Última do frasco: só restam {num(Math.max(resumo.saldo_mg, 0))} mg (o plano previa {num(p0.dose_plano_mg)} mg).</span>
              </div>
              <div className="tempo-valor numero">
                <b>{num(p0.dose_mg)} mg</b>
                <span>{ui(p0.ui)}</span>
              </div>
            </li>
          </ol>
        ) : proximas.length === 0 ? (
          <Vazio>Nenhuma aplicação restante no plano.</Vazio>
        ) : (
          <ol className="tempo">
            {segmentosPorFase(proximas).map((seg) => (
              <Fragment key={`${seg.fase}-${seg.doses[0].numero}`}>
                <li className={`tempo-fase ${seg.hipotese ? 'tempo-hipotese' : ''}`}>
                  <span className="chip-fase">
                    F{seg.fase + 1} · {seg.doses[0].fase.fase.nome}
                  </span>
                  {seg.hipotese && <span className="chip-hipotese">se subir</span>}
                </li>
                {seg.doses.map((d) => {
                  const primeira = d.numero === proximas[0].numero;
                  const passa = d.ui > capacidade + 1e-9;
                  return (
                    <li key={d.numero} className={`tempo-dose ${primeira ? 'tempo-proxima' : ''} ${d.hipotese ? 'tempo-hipotese' : ''}`}>
                      <span className="tempo-ponto" aria-hidden="true" />
                      <div className="tempo-data">
                        <b className="numero">{dataCurta(d.data, hoje)}</b>
                        <span>
                          {d.numero}ª{primeira && !atrasada && ' · próxima'}
                          {primeira && atrasada && <span className="etiqueta ruim agenda-etiqueta">atrasada</span>}
                        </span>
                        {passa && <span className="ruim">passa da seringa de {capacidade} UI</span>}
                      </div>
                      <div className="tempo-valor numero">
                        <b>{num(d.dose_mg)} mg</b>
                        <span>{ui(d.ui)}</span>
                        <span className="tempo-saldo">saldo {num(d.saldo_apos_mg)}</span>
                      </div>
                    </li>
                  );
                })}
              </Fragment>
            ))}
          </ol>
        )}
        {resumo.doses_plano_restantes > resumo.projecao.length && (
          <p className="mudo" style={{ marginTop: 8 }}>
            Doses restantes no plano: {resumo.doses_plano_restantes} · o frasco cobre {resumo.projecao.length}. {resumo.doses_plano_restantes - resumo.projecao.length}{' '}
            {resumo.doses_plano_restantes - resumo.projecao.length === 1 ? 'dose fica' : 'doses ficam'} sem saldo.
          </p>
        )}
        {resumo.projecao.length > 6 && (
          <button className="botao pequeno bloco-largo" style={{ marginTop: 8 }} onClick={() => setTodas(!todas)}>
            {todas ? 'Mostrar menos' : `Ver todas (${resumo.projecao.length})`}
          </button>
        )}
        <details className="tabela-detalhe">
          <summary>Como ler</summary>
          <p className="mudo">
            Datas recalculadas a partir da última aplicação real{atrasada ? ', considerando que a dose atrasada será tomada hoje' : ''}. UI pela concentração atual; saldo em mg
            depois de cada dose.
            {resumo.fim_hipotese && ' Doses marcadas "se subir" (tracejadas) são hipótese: a dose só sobe quando você decide no fim da fase (Início).'}
          </p>
        </details>
      </section>

      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>Aplicações realizadas</h2>
            <div className="secao-sub">
              {realizadas.length ? `${realizadas.length} ${realizadas.length === 1 ? 'aplicação' : 'aplicações'} · ${mg(resumo.total_aplicado_mg)} · toque para editar` : 'Registradas pelo botão Registrar'}
            </div>
          </div>
        </div>
        {realizadas.length === 0 ? (
          <Vazio>Nenhuma aplicação registrada ainda.</Vazio>
        ) : (
          <>
            <div className="aplics">
              {(todasFeitas ? realizadas : realizadas.slice(0, REALIZADAS_INICIAIS)).map((l) => {
                const dif = Math.abs(l.diferenca_mg) > 1e-9;
                return (
                  <button type="button" key={l.aplicacao.id} className="aplic" onClick={() => setEditando(l.aplicacao)}>
                    <span className="aplic-no numero">{l.numero}</span>
                    <span className="aplic-corpo">
                      <span className="aplic-data numero">
                        {diaCurto(l.aplicacao.data)}/{l.aplicacao.data.slice(2, 4)}
                      </span>
                      <span className="aplic-detalhe">
                        {l.fase ? `F${l.fase.indice + 1}` : <span className="aviso-txt">fora do plano</span>}
                        {l.aplicacao.local ? ` · ${l.aplicacao.local}` : ''}
                      </span>
                      {(dif || l.atraso_dias !== 0) && (
                        <span className="aplic-etiquetas">
                          {dif && <span className="etiqueta aviso">{sinal(l.diferenca_mg, 2)} mg vs prevista</span>}
                          {l.atraso_dias !== 0 && (
                            <span className="etiqueta aviso">
                              {l.atraso_dias > 0 ? '+' : ''}
                              {l.atraso_dias} d
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="aplic-valor numero">
                      <b>{num(l.aplicacao.dose_mg)} mg</b>
                      <span>{ui(l.ui_aplicada)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {realizadas.length > REALIZADAS_INICIAIS && (
              <button className="botao pequeno bloco-largo" style={{ marginTop: 8 }} onClick={() => setTodasFeitas(!todasFeitas)}>
                {todasFeitas ? 'Mostrar menos' : `Ver todas (${realizadas.length})`}
              </button>
            )}
            <details className="tabela-detalhe">
              <summary>Ver tabela</summary>
              <div className="tabela-rolagem">
                <table>
                  <thead>
                    <tr>
                      <th>Nº · Data</th>
                      <th>Fase</th>
                      <th>Prevista</th>
                      <th>Aplicada</th>
                      <th>Dif.</th>
                      <th>UI</th>
                      <th>Atraso</th>
                      <th>Saldo</th>
                      <th>Peso méd.</th>
                      <th>Náusea máx.</th>
                      <th>Local</th>
                    </tr>
                  </thead>
                  <tbody>
                    {realizadas.map((l) => (
                      <tr key={l.aplicacao.id} className="item-acao" onClick={() => setEditando(l.aplicacao)}>
                        <td>
                          <b>{l.numero}</b> · {formatarData(l.aplicacao.data, true)} <span className="mudo">{diaDaSemana(l.aplicacao.data).slice(0, 3)}</span>
                        </td>
                        <td>{l.fase ? l.fase.indice + 1 : <span className="aviso-txt">fora</span>}</td>
                        <td>{num(l.dose_prevista)}</td>
                        <td>{num(l.aplicacao.dose_mg)}</td>
                        <td className={Math.abs(l.diferenca_mg) > 1e-9 ? 'aviso-txt' : 'mudo'}>{Math.abs(l.diferenca_mg) > 1e-9 ? sinal(l.diferenca_mg, 2) : '–'}</td>
                        <td>{num(l.ui_aplicada, 2)}</td>
                        <td className={l.atraso_dias > 0 ? 'aviso-txt' : 'mudo'}>{l.atraso_dias === 0 ? 'no dia' : `${l.atraso_dias > 0 ? '+' : ''}${l.atraso_dias} d`}</td>
                        <td>{num(l.saldo_mg)}</td>
                        <td>{num(l.peso_medio, 1)}</td>
                        <td>{l.nausea_max ?? '–'}</td>
                        <td>{l.aplicacao.local ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details className="tabela-detalhe">
              <summary>Como ler</summary>
              <p className="mudo">
                Prevista: a dose que o app indicava pelas aplicações anteriores (a mesma até completar a fase; a seguinte só depois de decidir subir). UI pela concentração
                gravada em cada aplicação. Peso médio (Diário e medições) e náusea máxima (Diário) consideram os registros entre uma aplicação e a seguinte. Toque numa
                aplicação ou numa linha da tabela para editar.
              </p>
            </details>
          </>
        )}
      </section>

      {editando && <FormAplicacao aplicacao={editando} aoFechar={() => setEditando(null)} aoSalvar={setAviso} />}
      {novo && <FormAplicacao aoFechar={() => setNovo(false)} aoSalvar={setAviso} />}
      {aviso && <AvisoRapido texto={aviso} aoSumir={() => setAviso(null)} />}
    </>
  );
}

// ---------- Plano de escalonamento ----------

interface FaseEdicao {
  nome: string;
  semanas: string;
  dose: string;
  objetivo: string;
}

function paraEdicao(f: Fase): FaseEdicao {
  return { nome: f.nome, semanas: String(f.semanas), dose: paraTexto(f.dose_mg), objetivo: f.objetivo };
}

function deEdicao(f: FaseEdicao): Fase {
  return { nome: f.nome.trim() || 'Fase', semanas: Math.max(1, Math.round(paraNumero(f.semanas) ?? 1)), dose_mg: paraNumero(f.dose) ?? 0, objetivo: f.objetivo };
}

const TEXTO_SITUACAO = { sobra: 'Sobra', sem_margem: 'Sem margem', excesso: 'Excesso' } as const;
const TOM_SITUACAO = { sobra: 'bom', sem_margem: 'aviso', excesso: 'ruim' } as const;

function Plano() {
  const { ciclo, executar, registrarAlteracoes } = useDados();
  const { resumo } = useCalculos();
  const [fases, setFases] = useState<FaseEdicao[]>(ciclo!.fases.map(paraEdicao));
  const [salvo, setSalvo] = useState(true);
  // "✓ Plano salvo" só aparece depois de salvar nesta visita (não ao abrir)
  const [acabouDeSalvar, setAcabouDeSalvar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Mudanças não salvas: avisa antes de trocar de aba, sair pela barra de baixo ou fechar o app
  useEffect(() => {
    planoComMudancas.atual = !salvo;
    if (salvo) return;
    const antesDeSair = (e: BeforeUnloadEvent) => e.preventDefault();
    const aoClicar = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href]');
      if (!link || !link.closest('.nav, .topo, .cartao-link')) return;
      if (!window.confirm('O plano tem mudanças não salvas. Sair sem salvar?')) {
        e.preventDefault();
        e.stopPropagation();
      } else planoComMudancas.atual = false;
    };
    window.addEventListener('beforeunload', antesDeSair);
    document.addEventListener('click', aoClicar, true);
    return () => {
      window.removeEventListener('beforeunload', antesDeSair);
      document.removeEventListener('click', aoClicar, true);
    };
  }, [salvo]);
  useEffect(() => () => void (planoComMudancas.atual = false), []);
  // Fase aberta na folha de edição
  const [aberta, setAberta] = useState<number | null>(null);

  const fasesValidas = fases.map(deEdicao);
  const rascunho: TCiclo = { ...ciclo!, fases: fasesValidas };
  const verif = verificarPlano(rascunho);
  const numeradas = fasesNumeradas(fasesValidas);
  const consumo = consumoPlano(fasesValidas);
  const total = ciclo!.quantidade_total_mg;
  // Fase em que está a dose atual (ou a seguinte, se já decidiu subir)
  const faseAtual = resumo?.proxima?.fase?.indice ?? null;
  const capacidade = capacidadeSeringa(ciclo!);

  function alterar(i: number, campo: keyof FaseEdicao, valor: string) {
    setFases((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
    setSalvo(false);
  }

  function repetir(i: number, semanas: number) {
    // Fase do degrau atual: conta a partir das doses já feitas (como o "Repetir fase" do Início)
    const d = resumo?.degrau.degrau;
    const base = d && d.ultima_fase === i ? Math.max(fasesValidas[i].semanas, semanasFeitasNaFase(fasesValidas, d, i)) : fasesValidas[i].semanas;
    alterar(i, 'semanas', String(base + semanas));
  }

  function remover(i: number) {
    setFases(fases.filter((_, j) => j !== i));
    setSalvo(false);
    setAberta(null);
  }

  function adicionar() {
    setFases([...fases, { nome: 'Nova fase', semanas: '4', dose: fases.at(-1)?.dose ?? '2,5', objetivo: '' }]);
    setSalvo(false);
    setAberta(fases.length);
  }

  async function salvar() {
    if (fasesValidas.some((f) => f.dose_mg <= 0)) return setErro('Toda fase precisa de uma dose maior que zero.');
    const semanasInvalidas = fases.some((f) => {
      const n = paraNumero(f.semanas);
      return n === null || n < 1 || !Number.isInteger(n);
    });
    if (semanasInvalidas) return setErro('Toda fase precisa de um número inteiro de semanas (1 ou mais).');
    setErro(null);
    const antes = ciclo!.fases;
    // Estender o degrau atual (Repetir pelo Plano) desfaz um "Subir" já decidido, como o Repetir do Início
    const s = resumo?.degrau;
    const desfazSubir =
      s?.estado === 'subir' && s.decisao && s.degrau?.primeira_fase != null && semanasDoDegrau(fasesValidas, s.degrau.primeira_fase) > s.feitas
        ? s.decisao
        : null;
    const decisoes = desfazSubir ? (ciclo!.decisoes ?? []).filter((x) => x.id !== desfazSubir.id) : ciclo!.decisoes;
    try {
      await executar((r) => r.salvarCiclo({ ...ciclo!, fases: fasesValidas, ...(desfazSubir ? { decisoes } : {}) }));
    } catch {
      // O aviso do topo (sem conexão, etc.) já foi mostrado por executar
      return;
    }
    // Dose e semanas de cada fase entram no registro de decisões
    registrarAlteracoes(compararFases(antes, fasesValidas), desfazSubir ? [desfazSubir.id] : []);
    setSalvo(true);
    setAcabouDeSalvar(true);
  }

  // Escala do medidor: o frasco, ou o plano quando ele passa do frasco
  const escala = Math.max(total, consumo) || 1;
  const maxDose = Math.max(...fasesValidas.map((f) => f.dose_mg), 0) || 1;

  return (
    <>
      <section className="cartao">
        <div className="secao-cab cab-fixa">
          <div className="cresce">
            <h2>Frasco × plano</h2>
            <div className="secao-sub">
              Consumo previsto em {numeradas.at(-1)?.fim ?? 0} aplicações
            </div>
          </div>
          <span className={`etiqueta ${TOM_SITUACAO[verif.situacao]}`}>{TEXTO_SITUACAO[verif.situacao]}</span>
        </div>
        <div
          className={`frasco-medidor ${verif.situacao}`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={consumo}
          aria-label={`O plano consome ${mg(consumo)} de ${mg(total)}`}
        >
          {fasesValidas.map((f, i) => (
            <i key={i} style={{ width: `${((f.dose_mg * f.semanas) / escala) * 100}%` }} title={`Fase ${i + 1}: ${mg(f.dose_mg * f.semanas)}`} />
          ))}
          {consumo > total && total > 0 && <span className="frasco-fim" style={{ left: `${(total / escala) * 100}%` }} />}
        </div>
        <div className="frasco-rotulos numero">
          <span>
            Plano <b>{mg(consumo)}</b>
          </span>
          <span>
            Frasco <b>{mg(total)}</b>
          </span>
        </div>
        <p className={`frasco-msg ${verif.situacao === 'excesso' ? 'ruim' : verif.situacao === 'sem_margem' ? 'aviso-txt' : 'texto-2'}`}>{verif.mensagem}</p>
        {verif.situacao !== 'sobra' && (
          <p className="mudo frasco-reserva">
            Reserva sugerida: ~{num(verif.reserva_ml, 1)} ml = {mg(verif.reserva_mg)} (fica no fundo do frasco e na agulha; não entra no cálculo).
          </p>
        )}
      </section>

      <section className="cartao">
        <div className="secao-cab cab-fixa">
          <div className="cresce">
            <h2>Fases</h2>
            <div className="secao-sub">Toque numa fase para editar</div>
          </div>
          <button className="botao pequeno" onClick={adicionar}>
            Adicionar fase
          </button>
        </div>
        <ol className="fases">
          {fasesValidas.map((fv, i) => {
            const loc = numeradas[i];
            const m = marcacao(fv.dose_mg, ciclo!);
            const atual = faseAtual === i;
            const feita = faseAtual !== null && i < faseAtual;
            return (
              <li key={i} className={`fase-passo ${atual ? 'fase-atual' : ''} ${feita ? 'fase-feita' : ''}`}>
                <button type="button" className="fase-botao" onClick={() => setAberta(i)} aria-label={`Editar fase ${i + 1}: ${fv.nome}`}>
                  <span className="fase-no numero" aria-hidden="true">
                    {feita ? '✓' : i + 1}
                  </span>
                  <span className="fase-corpo">
                    <span className="fase-nome">
                      <span className="fase-nome-texto">{fv.nome}</span>
                      {atual && <span className="etiqueta bom">atual</span>}
                    </span>
                    <span className="fase-meta numero">
                      <span className="sem-quebra">
                        {fv.semanas} {fv.semanas === 1 ? 'semana' : 'semanas'}
                      </span>{' '}
                      · <span className="sem-quebra">aplic. {loc.inicio}–{loc.fim}</span>
                    </span>
                    <span className="fase-barra" aria-hidden="true">
                      <i style={{ width: `${(fv.dose_mg / maxDose) * 100}%` }} />
                    </span>
                  </span>
                  <span className="fase-valor numero">
                    <b>{num(fv.dose_mg)} mg</b>
                    <span className={m.ui_pratica > capacidade ? 'ruim' : undefined}>{ui(m.ui_pratica)}</span>
                    <span>{mg(fv.dose_mg * fv.semanas)}</span>
                  </span>
                  <span className="fase-seta" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {erro && <div className="alerta erro" style={{ marginTop: 10 }}>{erro}</div>}
        {salvo && acabouDeSalvar && <p className="plano-salvo">✓ Plano salvo</p>}
      </section>

      <section className="cartao">
        <details className="tabela-detalhe regras">
          <summary>Regras para subir de fase</summary>
          <ul className="regras-lista">
            {REGRAS_FASE.map(([s, o]) => (
              <li key={s}>
                <span className="regras-situacao">{s}</span>
                <span className="regras-acao">{o}</span>
              </li>
            ))}
          </ul>
          <p className="mudo" style={{ marginTop: 8 }}>
            No fim de cada fase o Início mostra estas regras com os seus números. A dose só sobe quando você toca em Subir. Ajustes de dose devem ser combinados com seu médico.
          </p>
        </details>
      </section>

      {!salvo && (
        <>
          {/* Espaço no fim: a barra fixa não cobre o último cartão */}
          <div className="plano-espaco" aria-hidden="true" />
          <div className="plano-salvar">
            <span className="cresce">Alterações não salvas</span>
            <button className="botao primario" onClick={salvar}>
              Salvar plano
            </button>
          </div>
        </>
      )}

      {aberta !== null && fases[aberta] && (
        <FolhaFase
          i={aberta}
          f={fases[aberta]}
          fv={fasesValidas[aberta]}
          loc={numeradas[aberta]}
          ciclo={ciclo!}
          atual={faseAtual === aberta}
          alterar={(campo, v) => alterar(aberta, campo, v)}
          repetir={(n) => repetir(aberta, n)}
          remover={fases.length > 1 ? () => remover(aberta) : null}
          aoFechar={() => setAberta(null)}
        />
      )}
    </>
  );
}

/** Edição de uma fase numa folha: todos os campos e ações da fase. */
function FolhaFase({
  i,
  f,
  fv,
  loc,
  ciclo,
  atual,
  alterar,
  repetir,
  remover,
  aoFechar,
}: {
  i: number;
  f: FaseEdicao;
  fv: Fase;
  loc: FaseLocalizada;
  ciclo: TCiclo;
  atual: boolean;
  alterar: (campo: keyof FaseEdicao, v: string) => void;
  repetir: (semanas: number) => void;
  remover: (() => void) | null;
  aoFechar: () => void;
}) {
  const m = marcacao(fv.dose_mg, ciclo);
  const capacidade = capacidadeSeringa(ciclo);
  return (
    <Folha titulo={`Fase ${i + 1}`} aoFechar={aoFechar}>
      <div className="pilha folha-fase">
        <div className="linha">
          <span className="mudo">
            aplicações {loc.inicio}–{loc.fim}
          </span>
          {atual && <span className="etiqueta bom">atual</span>}
        </div>
        <Campo rotulo="Nome">
          <input value={f.nome} onChange={(e) => alterar('nome', e.target.value)} />
        </Campo>
        <div className="grade">
          <CampoNumero rotulo="Dose semanal" sufixo="mg" valor={f.dose} aoMudar={(v) => alterar('dose', v)} />
          <CampoNumero rotulo="Nº de semanas" valor={f.semanas} aoMudar={(v) => alterar('semanas', v)} />
        </div>
        {/* Valor inválido: avisa já aqui (a prévia usa 1 semana até corrigir; Salvar recusa) */}
        {(() => {
          const n = paraNumero(f.semanas);
          const d = paraNumero(f.dose);
          if (d === null || d <= 0) return <div className="alerta erro">Informe uma dose maior que zero.</div>;
          if (n === null || n < 1 || !Number.isInteger(n)) return <div className="alerta erro">Informe um número inteiro de semanas (1 ou mais). A prévia usa 1 semana até corrigir.</div>;
          return null;
        })()}
        <div className="grade grade-4">
          <Info rotulo="Volume">{num(mgParaMl(fv.dose_mg, ciclo.concentracao_mg_ml), 4)} ml</Info>
          <Info rotulo="Seringa U-100">{ui(m.ui)}</Info>
          <Info rotulo="Puxar até" classe={m.ui_pratica > capacidade ? 'ruim' : ''}>
            {ui(m.ui_pratica)}
          </Info>
          <Info rotulo="Consumo">{mg(fv.dose_mg * fv.semanas)}</Info>
        </div>
        {m.ui_pratica > capacidade && (
          <div className="alerta erro">{ui(m.ui_pratica)} passa da capacidade da seringa ({capacidade} UI): confira a dose ou a seringa em Ajustes.</div>
        )}
        <Campo rotulo="Objetivo da fase">
          <textarea value={f.objetivo} onChange={(e) => alterar('objetivo', e.target.value)} />
        </Campo>
        <div className="linha">
          <button type="button" className="botao pequeno" onClick={() => repetir(1)}>
            Repetir +1 semana
          </button>
          <button type="button" className="botao pequeno" onClick={() => repetir(4)}>
            +4 semanas
          </button>
          {remover && (
            <button type="button" className="botao pequeno perigo" onClick={remover}>
              Remover
            </button>
          )}
        </div>
        <button type="button" className="botao primario bloco-largo" onClick={aoFechar}>
          Pronto
        </button>
        <p className="mudo" style={{ textAlign: 'center' }}>
          As mudanças valem depois de tocar em Salvar plano.
        </p>
      </div>
    </Folha>
  );
}

function Info({ rotulo, classe, children }: { rotulo: string; classe?: string; children: ReactNode }) {
  return (
    <div className="bloco">
      <div className="rotulo">{rotulo}</div>
      <div className={`valor ${classe ?? ''}`}>{children}</div>
    </div>
  );
}

// ---------- Parâmetros do ciclo ----------

const OPCOES_CAPACIDADE = CAPACIDADES_SERINGA.map((c) => ({ valor: c as number, rotulo: `${c} UI` }));
const OPCOES_MARCA = MARCAS_SERINGA.map((m) => ({ valor: m as number, rotulo: `de ${paraTexto(m)} em ${paraTexto(m)} UI` }));

/** Linha de ajuste no estilo do iPhone: rótulo à esquerda, valor à direita. */
function LinhaAjuste({ rotulo, unidade, children }: { rotulo: string; unidade?: string; children: ReactNode }) {
  return (
    <label className="ajuste">
      <span className="ajuste-rotulo">{rotulo}</span>
      <span className="ajuste-valor">
        {children}
        {unidade && <span className="ajuste-unidade">{unidade}</span>}
      </span>
    </label>
  );
}

/** Input numérico que aceita vírgula (o mesmo filtro do CampoNumero). */
function NumeroAjuste({ valor, aoMudar, rotulo }: { valor: string; aoMudar: (v: string) => void; rotulo: string }) {
  return <input inputMode="decimal" aria-label={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value.replace(/[^\d.,]/g, ''))} />;
}

function Ajustes() {
  const { ciclo, aplicacoes, executar, gravar, limparErro } = useDados();
  const { resumo } = useCalculos();
  const c = ciclo!;
  const [nome, setNome] = useState(c.nome);
  const [inicio, setInicio] = useState(c.data_inicio);
  const [total, setTotal] = useState(paraTexto(c.quantidade_total_mg));
  const [conc, setConc] = useState(paraTexto(c.concentracao_mg_ml));
  const [intervalo, setIntervalo] = useState(String(c.intervalo_dias));
  const [capacidade, setCapacidade] = useState<number | null>(c.seringa_capacidade_ui ?? null);
  const [marca, setMarca] = useState<number>(c.seringa_marca_ui ?? 1);
  const [aberto, setAberto] = useState(c.frasco_aberto_em ?? '');
  // Concentração mudou com aplicações já registradas: novo frasco ou correção de digitação?
  const [mudancaConc, setMudancaConc] = useState<'novo' | 'correcao' | null>(null);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);

  const totalN = paraNumero(total) ?? 0;
  const concN = paraNumero(conc) ?? 0;
  const passo = passoDaMarca(marca);
  const doCiclo = aplicacoes.filter((a) => a.ciclo_id === c.id);
  const concMudou = concN > 0 && Math.abs(concN - c.concentracao_mg_ml) > 1e-9 && doCiclo.length > 0;
  // Prévia ao vivo: a próxima dose com a concentração digitada
  const dosePrevia = resumo?.proxima?.dose_mg ?? c.fases[0]?.dose_mg ?? 0;
  const previa = concN > 0 && dosePrevia > 0 ? marcacao(dosePrevia, { concentracao_mg_ml: concN, passo_ui: passo }) : null;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const intervaloN = Math.round(paraNumero(intervalo) ?? 0);
    if (totalN <= 0 || concN <= 0 || intervaloN <= 0) return setMsg({ tipo: 'erro', texto: 'Todos os valores precisam ser maiores que zero.' });
    if (!inicio) return setMsg({ tipo: 'erro', texto: 'Informe a data da 1ª aplicação.' });
    // O total não pode ser menor que o que já foi aplicado neste ciclo
    const aplicado = doCiclo.reduce((s, a) => s + a.dose_mg, 0);
    if (totalN + 1e-9 < aplicado)
      return setMsg({ tipo: 'erro', texto: `Já foram aplicados ${mg(aplicado)} neste ciclo: a quantidade total não pode ser menor (você digitou ${mg(totalN)}).` });
    if (concMudou && !mudancaConc) return setMsg({ tipo: 'erro', texto: 'Diga se a concentração nova é de um frasco novo ou a correção de um erro de digitação.' });
    const mudouIntervalo = intervaloN !== c.intervalo_dias && doCiclo.length > 0;
    // Gravado sem algum campo novo (banco sem o SQL de evolução): o resto vale
    let emParte: string | null = null;
    try {
      await executar(async (r) => {
        try {
          await r.salvarCiclo({
            ...c,
            nome: nome.trim() || c.nome,
            data_inicio: inicio,
            quantidade_total_mg: totalN,
            concentracao_mg_ml: concN,
            intervalo_dias: intervaloN,
            passo_ui: passo,
            seringa_capacidade_ui: capacidade,
            // Marcas de 1 UI sem nunca ter escolhido: continua "não informada"
            seringa_marca_ui: c.seringa_marca_ui == null && marca === 1 ? null : marca,
            frasco_aberto_em: aberto || null,
            // Troca do intervalo com doses já feitas: vale daqui em diante (as antigas seguem o de antes)
            decisoes: mudouIntervalo
              ? [
                  ...(c.decisoes ?? []),
                  {
                    id: crypto.randomUUID(),
                    data: hojeLocal(),
                    apos_aplicacao: doCiclo.length,
                    dose_mg: resumo?.proxima?.dose_mg ?? 0,
                    fase_indice: null,
                    escolha: 'intervalo',
                    intervalo_anterior: c.intervalo_dias,
                    intervalo_dias: intervaloN,
                  },
                ]
              : c.decisoes,
          });
        } catch (e) {
          if (!(e instanceof CicloSalvoEmParte)) throw e;
          emParte = e.message;
        }
      });
      if (concMudou) {
        // Novo frasco: as aplicações antigas guardam a concentração de antes.
        // Correção: todas passam a usar a concentração certa.
        for (const a of doCiclo) {
          const nova = mudancaConc === 'correcao' ? concN : (a.concentracao_mg_ml ?? c.concentracao_mg_ml);
          if (a.concentracao_mg_ml !== nova) gravar({ tipo: 'aplicacao', dado: { ...a, concentracao_mg_ml: nova } });
        }
      }
      setMudancaConc(null);
      setMsg(emParte ? { tipo: 'erro', texto: `Os outros parâmetros foram salvos. ${emParte}` } : { tipo: 'info', texto: 'Parâmetros salvos. Tudo foi recalculado.' });
    } catch (e) {
      // Uma mensagem só, perto do botão (executar já tinha posto a mesma no aviso do topo)
      limparErro();
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  const passaSeringa = !!previa && previa.ui_pratica > (capacidade ?? CAPACIDADE_PADRAO_UI) + 1e-9;

  return (
    <form className="pilha ajustes" onSubmit={salvar}>
      <div className="grupo">
        <div className="grupo-titulo">Ciclo</div>
        <div className="grupo-lista">
          <LinhaAjuste rotulo="Nome do ciclo">
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </LinhaAjuste>
          <LinhaAjuste rotulo="Data da 1ª aplicação">
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </LinhaAjuste>
          <LinhaAjuste rotulo="Intervalo entre doses" unidade="dias">
            <NumeroAjuste rotulo="Intervalo entre doses (dias)" valor={intervalo} aoMudar={setIntervalo} />
          </LinhaAjuste>
        </div>
        <div className="grupo-rodape">
          {!inicio ? 'Informe a data.' : `1ª aplicação: ${diaDaSemana(inicio).toLowerCase()}. Usada até a 1ª aplicação ser registrada; depois, vale a data real.`}
        </div>
      </div>

      <div className="grupo">
        <div className="grupo-titulo">Frasco</div>
        <div className="grupo-lista">
          <LinhaAjuste rotulo="Quantidade total" unidade="mg">
            <NumeroAjuste rotulo="Quantidade total (mg)" valor={total} aoMudar={setTotal} />
          </LinhaAjuste>
          <LinhaAjuste rotulo="Concentração" unidade="mg/ml">
            <NumeroAjuste
              rotulo="Concentração (mg/ml)"
              valor={conc}
              aoMudar={(v) => {
                setConc(v);
                setMudancaConc(null);
              }}
            />
          </LinhaAjuste>
          <LinhaAjuste rotulo="Frasco aberto em">
            <input type="date" value={aberto} onChange={(e) => setAberto(e.target.value)} />
          </LinhaAjuste>
          <div className="ajuste ajuste-leitura">
            <span className="ajuste-rotulo">Volume total da sua parte</span>
            <span className="ajuste-valor numero">
              {num(mgParaMl(totalN, concN))} ml · {num(mgParaMl(totalN, concN) * 100, 0)} UI
            </span>
          </div>
        </div>
        <div className="grupo-rodape">
          Quantidade total: a sua parte do frasco. Concentração: mg por ml depois de diluído. Frasco aberto (opcional):{' '}
          {aberto ? 'o Início mostra há quantos dias o frasco está aberto.' : 'data em que o frasco foi aberto ou diluído.'}
        </div>
      </div>

      {previa && (
        <div className={`alerta ${passaSeringa ? 'erro' : 'info'}`}>
          <span>
            {resumo?.aplicacoes_realizadas ? 'Próxima dose' : '1ª dose'}: <b>{mg(dosePrevia)} = {ui(previa.ui_pratica)}</b> na seringa U-100
            {passaSeringa
              ? `: passa da capacidade da seringa (${capacidade ?? CAPACIDADE_PADRAO_UI} UI). Confira a dose, a concentração ou a seringa.`
              : ' — confira com quem preparou o frasco.'}
          </span>
        </div>
      )}
      {concMudou && (
        <div className="grupo">
          <div className="grupo-lista grupo-escolhas">
            <Campo rotulo="A concentração mudou. O que aconteceu?" grupo dica="Frasco novo: as aplicações já feitas continuam com a concentração antiga. Correção: todas são recalculadas.">
              <Escolhas
                opcoes={[
                  { valor: 'novo' as const, rotulo: 'Frasco novo' },
                  { valor: 'correcao' as const, rotulo: 'Corrigi um erro' },
                ]}
                valor={mudancaConc}
                aoMudar={setMudancaConc}
              />
            </Campo>
          </div>
        </div>
      )}

      <div className="grupo">
        <div className="grupo-titulo">Seringa U-100</div>
        <div className="grupo-lista grupo-escolhas">
          <Campo rotulo="Capacidade da seringa U-100" grupo>
            <Escolhas opcoes={OPCOES_CAPACIDADE} valor={capacidade} aoMudar={setCapacidade} permitirVazio />
          </Campo>
          <Campo rotulo="Intervalo entre as marcas" grupo>
            <Escolhas opcoes={OPCOES_MARCA} valor={marca} aoMudar={(v) => v !== null && setMarca(v)} />
          </Campo>
        </div>
        <div className="grupo-rodape">
          O aviso de dose acima da seringa usa a capacidade (sem informar, 100 UI). Leitura de {paraTexto(passo)} em {paraTexto(passo)} UI (um quarto da marca). Ex.:{' '}
          {guiaSeringa(previa && !passaSeringa ? previa.ui_pratica : 6.25, marca)}.
        </div>
      </div>

      {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
      <button className="botao primario bloco-largo">Salvar parâmetros</button>
    </form>
  );
}
