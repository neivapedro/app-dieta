import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Diario } from './Diario';
import { AvisoRapido } from '../componentes/dose';
import { FormAplicacao } from '../componentes/formularios';
import { Campo, CampoNumero, Escolhas, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { CicloSalvoEmParte } from '../dados/repositorio';
import { useCalculos } from '../dados/useCalculos';
import {
  CAPACIDADES_SERINGA,
  MARCAS_SERINGA,
  REGRAS_FASE,
  consumoPlano,
  fasesNumeradas,
  guiaSeringa,
  marcacao,
  mgParaMl,
  passoDaMarca,
  verificarPlano,
} from '../lib/ciclo';
import { diaDaSemana, formatarData } from '../lib/datas';
import { compararFases } from '../lib/registroDecisoes';
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
  const [aviso, setAviso] = useState<string | null>(null);
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
          {resumo.fim_hipotese && ' Doses marcadas "se subir" são hipótese: a dose só sobe quando você decide no fim da fase (Início).'}
        </p>
        {resumo.degrau.estado === 'pendente' && resumo.proxima && (
          <div className="alerta" style={{ marginBottom: 8 }}>
            Fim da fase: a próxima dose (
            {resumo.proxima.situacao === 'atrasada' ? `atrasada desde ${formatarData(resumo.proxima.data)}` : formatarData(resumo.proxima.data)}) continua {num(resumo.proxima.dose_mg)} mg até você decidir no Início. A lista abaixo
            mostra o plano se subir.
          </div>
        )}
        {resumo.degrau.estado === 'fora_do_plano' && (
          <div className="alerta" style={{ marginBottom: 8 }}>
            A última dose ({num(resumo.degrau.degrau?.bloco.dose_mg)} mg) não bate com nenhuma fase do Plano: a próxima continua {num(resumo.degrau.dose_mg)} mg. Confirme no Início qual
            fase seguir; a lista abaixo é a hipótese das fases seguintes.
          </div>
        )}
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
                  <div className="detalhe">
                    Fase {d.fase.indice + 1} · {d.fase.fase.nome}
                    {d.hipotese && <span className="aviso-txt"> · se subir</span>}
                  </div>
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
        )}
        <p className="mudo" style={{ marginTop: 8 }}>
          Prevista: a dose que o app indicava pelas aplicações anteriores (a mesma até completar a fase; a seguinte só depois de decidir subir). UI pela
          concentração gravada em cada aplicação. Peso médio e náusea máxima consideram os registros do Diário entre uma aplicação e a seguinte. Toque numa
          linha para editar.
        </p>
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

function Plano() {
  const { ciclo, executar, registrarAlteracoes } = useDados();
  const { resumo } = useCalculos();
  const [fases, setFases] = useState<FaseEdicao[]>(ciclo!.fases.map(paraEdicao));
  const [salvo, setSalvo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const fasesValidas = fases.map(deEdicao);
  const rascunho: TCiclo = { ...ciclo!, fases: fasesValidas };
  const verif = verificarPlano(rascunho);
  const numeradas = fasesNumeradas(fasesValidas);
  // Fase em que está a dose atual (ou a seguinte, se já decidiu subir)
  const faseAtual = resumo?.proxima?.fase?.indice ?? null;

  function alterar(i: number, campo: keyof FaseEdicao, valor: string) {
    setFases(fases.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
    setSalvo(false);
  }

  function repetir(i: number, semanas: number) {
    alterar(i, 'semanas', String(fasesValidas[i].semanas + semanas));
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
    await executar((r) => r.salvarCiclo({ ...ciclo!, fases: fasesValidas }));
    // Dose e semanas de cada fase entram no registro de decisões
    registrarAlteracoes(compararFases(antes, fasesValidas));
    setSalvo(true);
  }

  return (
    <>
      <div className={`alerta ${verif.situacao === 'excesso' ? 'erro' : verif.situacao === 'sobra' ? 'info' : ''}`}>
        <span>
          {verif.mensagem} Consumo previsto: <b>{mg(consumoPlano(fasesValidas))}</b> em {numeradas.at(-1)?.fim ?? 0} aplicações.
          {verif.situacao !== 'sobra' && (
            <>
              {' '}
              Reserva sugerida: ~{num(verif.reserva_ml, 1)} ml = {mg(verif.reserva_mg)} (fica no fundo do frasco e na agulha; não entra no cálculo).
            </>
          )}
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
              <button className="botao pequeno" onClick={() => repetir(i, 1)}>Repetir +1 semana</button>
              <button className="botao pequeno" onClick={() => repetir(i, 4)}>+4 semanas</button>
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
              {REGRAS_FASE.map(([s, o]) => (
                <tr key={s}>
                  <td style={{ whiteSpace: 'normal' }}>{s}</td>
                  <td style={{ whiteSpace: 'normal', textAlign: 'left' }}>{o}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mudo" style={{ marginTop: 8 }}>
          No fim de cada fase o Início mostra estas regras com os seus números. A dose só sobe quando você toca em Subir. Ajustes de dose devem ser
          combinados com seu médico.
        </p>
      </section>
    </>
  );
}

// ---------- Parâmetros do ciclo (aba Painel) ----------

const OPCOES_CAPACIDADE = CAPACIDADES_SERINGA.map((c) => ({ valor: c as number, rotulo: `${c} UI` }));
const OPCOES_MARCA = MARCAS_SERINGA.map((m) => ({ valor: m as number, rotulo: `de ${paraTexto(m)} em ${paraTexto(m)} UI` }));

function Ajustes() {
  const { ciclo, aplicacoes, executar, gravar } = useDados();
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
    if (concMudou && !mudancaConc) return setMsg({ tipo: 'erro', texto: 'Diga se a concentração nova é de um frasco novo ou a correção de um erro de digitação.' });
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
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  return (
    <form className="cartao pilha" onSubmit={salvar}>
      <h2>Parâmetros do ciclo</h2>
      <Campo rotulo="Nome do ciclo">
        <input value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo rotulo="Data da 1ª aplicação" dica={!inicio ? "Informe a data." : `${diaDaSemana(inicio)}. Usada até a 1ª aplicação ser registrada; depois, vale a data real.`}>
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
      </Campo>
      <div className="grade">
        <CampoNumero rotulo="Quantidade total" sufixo="mg" valor={total} aoMudar={setTotal} dica="A sua parte do frasco." />
        <CampoNumero rotulo="Concentração" sufixo="mg/ml" valor={conc} aoMudar={(v) => {
            setConc(v);
            setMudancaConc(null);
          }} dica="mg por ml depois de diluído." />
        <CampoNumero rotulo="Intervalo entre doses" sufixo="dias" valor={intervalo} aoMudar={setIntervalo} />
      </div>
      {previa && (
        <div className="alerta info">
          <span>
            {resumo?.aplicacoes_realizadas ? 'Próxima dose' : '1ª dose'}: <b>{mg(dosePrevia)} = {ui(previa.ui_pratica)}</b> na seringa U-100 — confira com quem
            preparou o frasco.
          </span>
        </div>
      )}
      {concMudou && (
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
      )}
      <Campo rotulo="Capacidade da seringa U-100" grupo dica="O aviso de dose acima da seringa usa este limite (sem informar, 100 UI).">
        <Escolhas opcoes={OPCOES_CAPACIDADE} valor={capacidade} aoMudar={setCapacidade} permitirVazio />
      </Campo>
      <Campo
        rotulo="Intervalo entre as marcas"
        grupo
        dica={`Leitura de ${paraTexto(passo)} em ${paraTexto(passo)} UI (um quarto da marca). Ex.: ${guiaSeringa(previa?.ui_pratica ?? 6.25, marca)}.`}
      >
        <Escolhas opcoes={OPCOES_MARCA} valor={marca} aoMudar={(v) => v !== null && setMarca(v)} />
      </Campo>
      <Campo rotulo="Frasco aberto em (opcional)" dica={aberto ? 'O Início mostra há quantos dias o frasco está aberto.' : 'Data em que o frasco foi aberto ou diluído.'}>
        <input type="date" value={aberto} onChange={(e) => setAberto(e.target.value)} />
      </Campo>
      <div className="bloco">
        <div className="rotulo">Volume total da sua parte</div>
        <div className="valor">{num(mgParaMl(totalN, concN))} ml · {num(mgParaMl(totalN, concN) * 100, 0)} UI</div>
      </div>
      {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
      <button className="botao primario">Salvar parâmetros</button>
    </form>
  );
}
