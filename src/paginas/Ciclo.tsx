import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Diario } from './Diario';
import { FormAplicacao } from '../componentes/formularios';
import { Campo, CampoNumero, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { consumoPlano, fasesNumeradas, marcacao, mgParaMl, verificarPlano } from '../lib/ciclo';
import { diaDaSemana, formatarData } from '../lib/datas';
import { mg, num, paraNumero, paraTexto, sinal, ui } from '../lib/formato';
import type { Aplicacao, Ciclo as TCiclo, Fase } from '../lib/tipos';

type Aba = 'agenda' | 'diario' | 'plano' | 'ajustes';
const ABAS_CICLO: [Aba, string][] = [
  ['agenda', 'Agenda'],
  ['diario', 'Diário'],
  ['plano', 'Plano'],
  ['ajustes', 'Ajustes'],
];

export function Ciclo() {
  // A sub-aba fica no endereço (?aba=diario), para o link antigo do Diário continuar funcionando
  const [params, setParams] = useSearchParams();
  const aba = (ABAS_CICLO.find(([k]) => k === params.get('aba'))?.[0] ?? 'agenda') as Aba;
  const setAba = (a: Aba) => setParams(a === 'agenda' ? {} : { aba: a }, { replace: true });
  return (
    <div className="pilha">
      <div className="abas">
        {ABAS_CICLO.map(([k, r]) => (
          <button key={k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>
            {r}
          </button>
        ))}
      </div>
      {aba === 'agenda' && <Agenda />}
      {aba === 'diario' && <Diario />}
      {aba === 'plano' && <Plano />}
      {aba === 'ajustes' && <Ajustes />}
    </div>
  );
}

// ---------- Agenda (equivale às abas Diário + Semanal da planilha) ----------

function Agenda() {
  const { resumo } = useCalculos();
  const [editando, setEditando] = useState<Aplicacao | null>(null);
  const [novo, setNovo] = useState(false);
  const [todas, setTodas] = useState(false);
  if (!resumo) return null;
  const proximas = todas ? resumo.projecao : resumo.projecao.slice(0, 6);
  const realizadas = [...resumo.linhas].reverse();

  return (
    <>
      <section className="cartao">
        <div className="cartao-cab">
          <h2>Próximas aplicações</h2>
          <button className="botao pequeno primario" onClick={() => setNovo(true)}>Registrar</button>
        </div>
        <p className="mudo" style={{ marginBottom: 8 }}>
          Datas recalculadas a partir da última aplicação real{resumo.proxima?.situacao === 'atrasada' ? ', considerando que a dose atrasada será tomada hoje' : ''}.
        </p>
        {proximas.length === 0 ? (
          <Vazio>Nenhuma aplicação restante no plano.</Vazio>
        ) : (
          <div className="lista">
            {proximas.map((d, i) => (
              <div className="item" key={d.numero}>
                <div className="marcador">{d.numero}</div>
                <div className="cresce">
                  <div className="titulo">
                    {diaDaSemana(d.data)}, {formatarData(d.data)}
                    {i === 0 && resumo.proxima?.situacao === 'atrasada' && <span className="etiqueta ruim" style={{ marginLeft: 6 }}>atrasada</span>}
                  </div>
                  <div className="detalhe">Fase {d.fase.indice + 1} · {d.fase.fase.nome}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="titulo numero">{num(d.dose_mg)} mg</div>
                  <div className="detalhe numero">{ui(d.ui)} · saldo {num(d.saldo_apos_mg)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {resumo.projecao.length > 6 && (
          <button className="botao pequeno bloco-largo" style={{ marginTop: 8 }} onClick={() => setTodas(!todas)}>
            {todas ? 'Mostrar menos' : `Ver todas (${resumo.projecao.length})`}
          </button>
        )}
      </section>

      <section className="cartao">
        <h2>Aplicações realizadas</h2>
        {realizadas.length === 0 ? (
          <Vazio>Nenhuma aplicação registrada ainda.</Vazio>
        ) : (
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
                    <td>{l.fase.indice + 1}</td>
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
        )}
        <p className="mudo" style={{ marginTop: 8 }}>Peso médio e náusea máxima consideram os registros do Diário entre uma aplicação e a seguinte. Toque numa linha para editar.</p>
      </section>

      {editando && <FormAplicacao aplicacao={editando} aoFechar={() => setEditando(null)} />}
      {novo && <FormAplicacao aoFechar={() => setNovo(false)} />}
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

function Plano() {
  const { ciclo, executar } = useDados();
  const { resumo } = useCalculos();
  const [fases, setFases] = useState<FaseEdicao[]>(ciclo!.fases.map(paraEdicao));
  const [salvo, setSalvo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const fasesValidas = fases.map(deEdicao);
  const rascunho: TCiclo = { ...ciclo!, fases: fasesValidas };
  const verif = verificarPlano(rascunho);
  const numeradas = fasesNumeradas(fasesValidas);
  const faseAtual = resumo?.proxima?.fase.indice ?? null;

  function alterar(i: number, campo: keyof FaseEdicao, valor: string) {
    setFases(fases.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
    setSalvo(false);
  }

  function repetir(i: number) {
    alterar(i, 'semanas', String(fasesValidas[i].semanas + 4));
  }

  async function salvar() {
    if (fasesValidas.some((f) => f.dose_mg <= 0)) return setErro('Toda fase precisa de uma dose maior que zero.');
    setErro(null);
    await executar((r) => r.salvarCiclo({ ...ciclo!, fases: fasesValidas }));
    setSalvo(true);
  }

  return (
    <>
      <div className={`alerta ${verif.situacao === 'excesso' ? 'erro' : verif.situacao === 'exato' ? 'info' : ''}`}>
        <span>
          {verif.mensagem} Consumo previsto: <b>{mg(consumoPlano(fasesValidas))}</b> em {numeradas.at(-1)?.fim ?? 0} aplicações.
        </span>
      </div>

      {fases.map((f, i) => {
        const fv = fasesValidas[i];
        const m = marcacao(fv.dose_mg, ciclo!);
        const loc = numeradas[i];
        return (
          <section className="cartao pilha" key={i}>
            <div className="cartao-cab" style={{ marginBottom: 0 }}>
              <div className="linha">
                <span className="etiqueta destaque">Fase {i + 1}</span>
                <span className="mudo">aplicações {loc.inicio}–{loc.fim}</span>
              </div>
              {faseAtual === i && <span className="etiqueta bom">atual</span>}
            </div>
            <Campo rotulo="Nome">
              <input value={f.nome} onChange={(e) => alterar(i, 'nome', e.target.value)} />
            </Campo>
            <div className="grade">
              <CampoNumero rotulo="Dose semanal" sufixo="mg" valor={f.dose} aoMudar={(v) => alterar(i, 'dose', v)} />
              <CampoNumero rotulo="Nº de semanas" valor={f.semanas} aoMudar={(v) => alterar(i, 'semanas', v)} />
            </div>
            <div className="grade grade-4">
              <div className="bloco"><div className="rotulo">Volume</div><div className="valor">{num(mgParaMl(fv.dose_mg, ciclo!.concentracao_mg_ml), 4)} ml</div></div>
              <div className="bloco"><div className="rotulo">Seringa U-100</div><div className="valor">{ui(m.ui)}</div></div>
              <div className="bloco"><div className="rotulo">Puxar até</div><div className="valor">{ui(m.ui_pratica)}</div></div>
              <div className="bloco"><div className="rotulo">Consumo</div><div className="valor">{mg(fv.dose_mg * fv.semanas)}</div></div>
            </div>
            <Campo rotulo="Objetivo da fase">
              <textarea value={f.objetivo} onChange={(e) => alterar(i, 'objetivo', e.target.value)} />
            </Campo>
            <div className="linha">
              <button className="botao pequeno" onClick={() => repetir(i)}>Repetir fase (+4 semanas)</button>
              {fases.length > 1 && (
                <button className="botao pequeno perigo" onClick={() => { setFases(fases.filter((_, j) => j !== i)); setSalvo(false); }}>
                  Remover
                </button>
              )}
            </div>
          </section>
        );
      })}

      <button
        className="botao"
        onClick={() => {
          setFases([...fases, { nome: 'Nova fase', semanas: '4', dose: fases.at(-1)?.dose ?? '2,5', objetivo: '' }]);
          setSalvo(false);
        }}
      >
        Adicionar fase
      </button>

      {erro && <div className="alerta erro">{erro}</div>}
      <div style={{ position: 'sticky', bottom: 'calc(var(--nav-altura) + 12px + env(safe-area-inset-bottom))' }}>
        <button className="botao primario bloco-largo" disabled={salvo} onClick={salvar}>
          {salvo ? 'Plano salvo' : 'Salvar plano'}
        </button>
      </div>

      <section className="cartao">
        <h2>Regras para subir de fase</h2>
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr><th>Situação ao fim da fase</th><th style={{ textAlign: 'left' }}>O que fazer</th></tr>
            </thead>
            <tbody>
              {[
                ['Tolerou bem (sem náusea relevante, comendo e se hidratando normalmente)', 'Sobe para a próxima fase.'],
                ['Efeitos leves, mas incômodos', 'Repete a fase por mais 4 semanas (botão "Repetir fase").'],
                ['Vômitos frequentes, não consegue se hidratar, dor abdominal forte, palpitação persistente', 'Suspende e procura atendimento médico.'],
                ['Já satisfeito com o resultado numa dose menor', 'Pode permanecer nela; não é obrigatório chegar à dose final.'],
              ].map(([s, o]) => (
                <tr key={s}>
                  <td style={{ whiteSpace: 'normal' }}>{s}</td>
                  <td style={{ whiteSpace: 'normal', textAlign: 'left' }}>{o}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mudo" style={{ marginTop: 8 }}>Ajustes de dose devem ser combinados com seu médico.</p>
      </section>
    </>
  );
}

// ---------- Parâmetros do ciclo (aba Painel) ----------

function Ajustes() {
  const { ciclo, executar } = useDados();
  const c = ciclo!;
  const [nome, setNome] = useState(c.nome);
  const [inicio, setInicio] = useState(c.data_inicio);
  const [total, setTotal] = useState(paraTexto(c.quantidade_total_mg));
  const [conc, setConc] = useState(paraTexto(c.concentracao_mg_ml));
  const [intervalo, setIntervalo] = useState(String(c.intervalo_dias));
  const [passo, setPasso] = useState(paraTexto(c.passo_ui));
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);

  const totalN = paraNumero(total) ?? 0;
  const concN = paraNumero(conc) ?? 0;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const intervaloN = Math.round(paraNumero(intervalo) ?? 0);
    const passoN = paraNumero(passo) ?? 0;
    if (totalN <= 0 || concN <= 0 || intervaloN <= 0 || passoN <= 0) return setMsg({ tipo: 'erro', texto: 'Todos os valores precisam ser maiores que zero.' });
    try {
      await executar((r) => r.salvarCiclo({ ...c, nome: nome.trim() || c.nome, data_inicio: inicio, quantidade_total_mg: totalN, concentracao_mg_ml: concN, intervalo_dias: intervaloN, passo_ui: passoN }));
      setMsg({ tipo: 'info', texto: 'Parâmetros salvos. Tudo foi recalculado.' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  return (
    <form className="cartao pilha" onSubmit={salvar}>
      <h2>Parâmetros do ciclo</h2>
      <Campo rotulo="Nome do ciclo">
        <input value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo rotulo="Data da 1ª aplicação" dica={`${diaDaSemana(inicio)}. Usada até a 1ª aplicação ser registrada; depois, vale a data real.`}>
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
      </Campo>
      <div className="grade">
        <CampoNumero rotulo="Quantidade total" sufixo="mg" valor={total} aoMudar={setTotal} />
        <CampoNumero rotulo="Concentração" sufixo="mg/ml" valor={conc} aoMudar={setConc} />
        <CampoNumero rotulo="Intervalo entre doses" sufixo="dias" valor={intervalo} aoMudar={setIntervalo} />
        <CampoNumero rotulo="Menor marcação da seringa" sufixo="UI" valor={passo} aoMudar={setPasso} dica="Use 0,5 para seringa com marcas de meia unidade; 0,25 se você mede no meio entre duas marcas." />
      </div>
      <div className="bloco">
        <div className="rotulo">Volume total da sua parte</div>
        <div className="valor">{num(mgParaMl(totalN, concN))} ml · {num(mgParaMl(totalN, concN) * 100, 0)} UI</div>
      </div>
      {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
      <button className="botao primario">Salvar parâmetros</button>
    </form>
  );
}
