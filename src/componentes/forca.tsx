import { useState, type FormEvent } from 'react';
import { useDados } from '../dados/contexto';
import { useTreino } from '../dados/useTreino';
import { formatarData, hojeLocal, somarDias } from '../lib/datas';
import { calcularIndiceForca, chaveExercicio, EXERCICIOS_PADRAO, exerciciosDoPerfil, REPS_MAX_EPLEY, ultimoDoExercicio, umRmEpley } from '../lib/forca';
import { kg, num, paraNumero, paraTexto, sinal } from '../lib/formato';
import { segundaDaSemana } from '../lib/treino';
import type { RegistroForca } from '../lib/tipos';
import { Bloco, Campo, CampoNumero, Folha, Vazio } from './ui';

const variacao = (v: number | null) => (v === null ? '–' : sinal(v * 100, 1, '%'));

/** Cartão da aba Treino: índice de força nos exercícios-âncora, 1x por semana. */
export function CartaoForca({ esforcoSubiu }: { esforcoSubiu?: boolean }) {
  const t = useTreino();
  const { forca, perfil } = useDados();
  const [registrando, setRegistrando] = useState(false);
  const [editandoLista, setEditandoLista] = useState(false);
  if (!t) return null;
  const exercicios = exerciciosDoPerfil(perfil?.exercicios_forca);
  const indice = calcularIndiceForca(forca);
  const ultima = [...indice.semanas].reverse().find((s) => s.suavizado !== null) ?? null;
  const semanaAtual = segundaDaSemana(t.hoje);
  const feitaNaSemana = forca.some((r) => segundaDaSemana(r.data) === semanaAtual);
  // Massa magra da medição da mesma semana (segunda em jejum), ao lado do índice
  const magraDaSemana = (seg: string) => t.composicoes.find((c) => !c.atipica && c.data >= seg && c.data <= somarDias(seg, 6))?.massa_magra_kg ?? null;
  const recentes = indice.semanas.slice(-6).reverse();
  // Último registro de cada exercício da lista (e o 1RM contra a referência)
  const linhas = exercicios.map((nome) => {
    const r = ultimoDoExercicio(forca, nome);
    const e1rm = r ? umRmEpley(r.carga_kg, r.reps) : null;
    const ref = indice.referencias.get(chaveExercicio(nome)) ?? null;
    return { nome, r, e1rm, vsRef: e1rm !== null && ref ? e1rm / ref - 1 : null };
  });

  return (
    <section className="cartao">
      <div className="cartao-cab">
        <h2>Força</h2>
        <button className="botao pequeno primario" onClick={() => setRegistrando(true)}>
          {feitaNaSemana ? 'Editar semana' : 'Registrar semana'}
        </button>
      </div>
      {forca.length === 0 ? (
        <Vazio>
          1× por semana, anote a primeira série válida (perto da falha) de cada exercício-âncora: carga, repetições e RIR (repetições na reserva). O app
          estima o 1RM e acompanha o índice de força, um sinal de massa magra que não depende da fita.
        </Vazio>
      ) : (
        <>
          <div className="grade">
            <Bloco rotulo="Índice de força" valor={ultima ? variacao(ultima.suavizado) : '–'} classe={indice.nivel ? 'aviso-txt' : undefined} />
            <Bloco rotulo="Esta semana" valor={feitaNaSemana ? '✓ registrada' : 'pendente'} />
          </div>
          {indice.nivel && (
            <div className={`alerta ${indice.nivel === 'alerta' ? 'erro' : ''}`} style={{ display: 'block', marginTop: 10 }}>
              <b>
                {indice.nivel === 'alerta' ? 'Força 10% ou mais abaixo da referência' : 'Força caindo'} há 2 semanas ({variacao(indice.queda)}).
              </b>{' '}
              Queda de força pode indicar perda de massa magra; fadiga acumulada, sono curto, náusea e pouca comida também derrubam a força.
              {esforcoSubiu ? ' O esforço percebido da musculação também subiu.' : ''}
            </div>
          )}
          <div className="tabela-rolagem" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Exercício</th>
                  <th>Última série</th>
                  <th>1RM est.</th>
                  <th>vs ref.</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.nome}>
                    <td>{l.nome}</td>
                    <td>
                      {l.r ? `${num(l.r.carga_kg, 1)} kg × ${l.r.reps}` : '–'}
                      {l.r && <div className="sub-valor mudo">{formatarData(l.r.data, true).slice(0, 5)}{l.r.rir !== null ? ` · RIR ${l.r.rir}` : ''}</div>}
                    </td>
                    <td>{l.e1rm !== null ? kg(l.e1rm) : l.r ? <span className="texto-2">+{REPS_MAX_EPLEY} reps</span> : '–'}</td>
                    <td className={l.vsRef === null ? undefined : l.vsRef <= -0.05 ? 'aviso-txt' : l.vsRef >= 0.02 ? 'bom' : undefined}>{variacao(l.vsRef)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recentes.length > 1 && (
            <div className="tabela-rolagem" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th>Índice</th>
                    <th>Suavizado</th>
                    <th>Massa magra</th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.map((s) => (
                    <tr key={s.segunda}>
                      <td>{formatarData(s.segunda, true).slice(0, 5)}</td>
                      <td>{variacao(s.indice)}</td>
                      <td className={s.suavizado !== null && s.suavizado <= -0.05 ? 'aviso-txt' : undefined}>{variacao(s.suavizado)}</td>
                      <td>{kg(magraDaSemana(s.segunda))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="mudo" style={{ marginTop: 8 }}>
        1RM estimado por Epley = carga × (1 + reps/30), só com até {REPS_MAX_EPLEY} repetições. Referência de cada exercício: as 2 primeiras semanas.
        Índice = média das variações dos exercícios, suavizado em 2 leituras; queda de 5% em 2 leituras seguidas fica em atenção, de 10% em alerta. ±1
        repetição de uma semana para outra é normal (≈ 2,5%).
      </p>
      <button className="botao pequeno" style={{ marginTop: 8 }} onClick={() => setEditandoLista(true)}>
        Exercícios: {exercicios.length}
      </button>
      {registrando && <FormForca exercicios={exercicios} aoFechar={() => setRegistrando(false)} />}
      {editandoLista && <FormExerciciosForca atuais={exercicios} aoFechar={() => setEditandoLista(false)} />}
    </section>
  );
}

interface LinhaForca {
  carga: string;
  reps: string;
  rir: string;
}

/** Registro da semana: a primeira série válida de cada exercício-âncora. */
export function FormForca({ exercicios, aoFechar }: { exercicios: string[]; aoFechar: () => void }) {
  const { forca, gravar } = useDados();
  // Semana já registrada: abre na data do registro (editar não muda o dia sem querer)
  const [data, setData] = useState(() => {
    const hoje = hojeLocal();
    const daSemanaAtual = forca.filter((r) => segundaDaSemana(r.data) === segundaDaSemana(hoje)).sort((a, b) => b.data.localeCompare(a.data));
    return daSemanaAtual[0]?.data ?? hoje;
  });
  // Registro do exercício já feito na semana da data escolhida (editar em vez de duplicar)
  const daSemana = (d: string, nome: string) =>
    forca
      .filter((r) => segundaDaSemana(r.data) === segundaDaSemana(d) && chaveExercicio(r.exercicio) === chaveExercicio(nome))
      .sort((a, b) => b.data.localeCompare(a.data))[0] ?? null;
  const preencher = (d: string): LinhaForca[] =>
    exercicios.map((nome) => {
      const r = d ? daSemana(d, nome) : null;
      return { carga: paraTexto(r?.carga_kg), reps: r ? String(r.reps) : '', rir: r?.rir != null ? String(r.rir) : '' };
    });
  const [linhas, setLinhas] = useState<LinhaForca[]>(() => preencher(data));
  const [erro, setErro] = useState<string | null>(null);

  function trocarData(nova: string) {
    setData(nova);
    setLinhas(preencher(nova));
    setErro(null);
  }

  const mudar = (i: number, campo: keyof LinhaForca, v: string) => {
    setLinhas(linhas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));
    setErro(null);
  };

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!data) return setErro('Informe a data.');
    const gravacoes: RegistroForca[] = [];
    const exclusoes: RegistroForca[] = [];
    for (const [i, nome] of exercicios.entries()) {
      const l = linhas[i];
      const existente = daSemana(data, nome);
      if (!l.carga.trim() && !l.reps.trim() && !l.rir.trim()) {
        // Campos apagados: remove o registro da semana
        if (existente) exclusoes.push(existente);
        continue;
      }
      const carga = paraNumero(l.carga);
      const reps = paraNumero(l.reps);
      const rir = l.rir.trim() ? paraNumero(l.rir) : null;
      if (carga === null || carga <= 0 || carga > 600) return setErro(`${nome}: informe a carga em kg (até 600).`);
      if (reps === null || !Number.isInteger(reps) || reps < 1 || reps > 50) return setErro(`${nome}: repetições de 1 a 50, número inteiro.`);
      if (l.rir.trim() && (rir === null || !Number.isInteger(rir) || rir < 0 || rir > 10)) return setErro(`${nome}: RIR de 0 a 10, número inteiro.`);
      // Sem mudança: não regrava
      if (existente && existente.data === data && existente.carga_kg === carga && existente.reps === reps && existente.rir === rir) continue;
      gravacoes.push({ id: existente?.id ?? crypto.randomUUID(), data, exercicio: nome, carga_kg: carga, reps, rir });
    }
    if (!gravacoes.length && !exclusoes.length && !exercicios.some((nome) => daSemana(data, nome))) return setErro('Preencha ao menos um exercício.');
    // Pela fila: aparece na hora e, sem internet, é enviado quando a conexão voltar
    for (const r of gravacoes) gravar({ tipo: 'forca', dado: r });
    for (const r of exclusoes) gravar({ tipo: 'excluir', dado: { alvo: 'forca', id: r.id, data: r.data } });
    aoFechar();
  }

  return (
    <Folha titulo="Força da semana" aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <p className="mudo">
          A primeira série válida de cada exercício, levada perto da falha (RIR 0 a 1), sempre no mesmo dia da semana. RIR = repetições que ainda
          sobravam.
        </p>
        <Campo rotulo="Data">
          <input type="date" value={data} max={hojeLocal()} onChange={(e) => trocarData(e.target.value)} required />
        </Campo>
        {exercicios.map((nome, i) => {
          const l = linhas[i];
          const carga = paraNumero(l.carga);
          const reps = paraNumero(l.reps);
          const e1rm = carga && reps ? umRmEpley(carga, reps) : null;
          const anterior = ultimoDoExercicio(forca, nome, data ? segundaDaSemana(data) : undefined);
          return (
            <div key={nome} className="pilha" style={{ gap: 6 }}>
              <b>{nome}</b>
              <div className="grade grade-3">
                <CampoNumero rotulo="Carga" sufixo="kg" valor={l.carga} aoMudar={(v) => mudar(i, 'carga', v)} />
                <Campo rotulo="Reps">
                  <input inputMode="numeric" value={l.reps} onChange={(e) => mudar(i, 'reps', e.target.value.replace(/\D/g, ''))} />
                </Campo>
                <Campo rotulo="RIR">
                  <input inputMode="numeric" value={l.rir} placeholder="opc." onChange={(e) => mudar(i, 'rir', e.target.value.replace(/\D/g, ''))} />
                </Campo>
              </div>
              <small className="texto-2">
                {e1rm !== null
                  ? `1RM estimado: ${kg(e1rm)}. `
                  : carga && reps && reps > REPS_MAX_EPLEY
                    ? `Acima de ${REPS_MAX_EPLEY} repetições o app guarda só a carga. `
                    : ''}
                {anterior ? `Anterior: ${num(anterior.carga_kg, 1)} kg × ${anterior.reps} (${formatarData(anterior.data, true).slice(0, 5)}).` : ''}
              </small>
            </div>
          );
        })}
        {erro && <div className="alerta erro">{erro}</div>}
        <button className="botao primario">Salvar</button>
      </form>
    </Folha>
  );
}

/** Lista de exercícios-âncora (3 a 4 é o ideal; trocar o nome começa uma referência nova). */
export function FormExerciciosForca({ atuais, aoFechar }: { atuais: string[]; aoFechar: () => void }) {
  const { executar, limparErro } = useDados();
  const [nomes, setNomes] = useState<string[]>(() => [...atuais, ...Array(Math.max(0, 6 - atuais.length)).fill('')].slice(0, 6));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(lista: string[] | null) {
    if (lista) {
      const chaves = lista.map(chaveExercicio);
      if (!lista.length) return setErro('Informe ao menos um exercício.');
      if (new Set(chaves).size !== chaves.length) return setErro('Há exercícios repetidos.');
      if (lista.some((n) => n.length > 60)) return setErro('Nome com até 60 letras.');
    }
    if (salvando) return;
    setSalvando(true);
    try {
      await executar((r) => r.salvarExerciciosForca(lista));
      aoFechar();
    } catch (e) {
      // Uma mensagem só, no formulário (executar já tinha posto a mesma no aviso do topo)
      limparErro();
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const lista = nomes.map((n) => n.trim()).filter(Boolean);
    // Igual ao padrão: guarda null (segue o padrão do app)
    const padrao = lista.length === EXERCICIOS_PADRAO.length && lista.every((n, i) => n === EXERCICIOS_PADRAO[i]);
    void salvar(padrao ? null : lista);
  }

  return (
    <Folha titulo="Exercícios-âncora" aoFechar={aoFechar}>
      <form className="pilha" onSubmit={enviar}>
        <p className="mudo">
          Padrão: {EXERCICIOS_PADRAO.join(', ')}. Use 3 ou 4 exercícios multiarticulares que você faz toda semana. Trocar de exercício ou de máquina: mude o nome, e a referência daquele exercício
          recomeça. O histórico continua salvo.
        </p>
        {nomes.map((n, i) => (
          <Campo key={i} rotulo={`Exercício ${i + 1}${i >= 4 ? ' (opcional)' : ''}`}>
            <input value={n} maxLength={60} onChange={(e) => (setNomes(nomes.map((x, j) => (j === i ? e.target.value : x))), setErro(null))} />
          </Campo>
        ))}
        {erro && <div className="alerta erro">{erro}</div>}
        <button className="botao primario" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="botao pequeno" onClick={() => void salvar(null)} disabled={salvando}>
          Voltar ao padrão
        </button>
      </form>
    </Folha>
  );
}
