import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BotaoExcluir, Campo, CampoNumero, Escolhas, Icone } from '../componentes/ui';
import { CALENDARIO_URL } from '../config';
import { textoAjuste } from '../componentes/composicao';
import { useDados } from '../dados/contexto';
import { lerBackup, montarBackup, planejarImportacao, type Backup, type PlanoImportacao } from '../lib/backup';
import { diferencaDias, formatarData, hojeLocal } from '../lib/datas';
import { num, paraNumero, paraTexto, pp } from '../lib/formato';
import { AJUSTE_PADRAO, percentualGorduraBruto } from '../lib/gordura';
import {
  ativarNotificacoes,
  desativarNotificacoes,
  ehIOS,
  estadoNotificacao,
  notificacaoTeste,
  type EstadoNotificacao,
} from '../lib/notificacoes';
import type { Medida, Perfil as TipoPerfil, Sexo } from '../lib/tipos';

const TEXTO_ESTADO: Record<EstadoNotificacao, string> = {
  'sem-suporte': 'Este navegador não suporta notificações.',
  'ios-instalar': 'No iPhone, as notificações só funcionam com o app instalado: toque em Compartilhar → "Adicionar à Tela de Início", abra pelo ícone e volte aqui.',
  negado: 'As notificações foram bloqueadas. Libere nas configurações do navegador/celular para este site.',
  pendente: 'Lembretes ainda não ativados neste aparelho.',
  ativo: 'Lembretes ativos neste aparelho.',
  'ativo-sem-servidor': 'Permissão concedida, mas o envio automático exige a nuvem configurada (Supabase + chaves VAPID).',
};


/** US Navy bruta (sem ajuste) de uma medição, com a altura do perfil. */
function brutaDaMedida(m: Medida, perfil: TipoPerfil): number | null {
  return percentualGorduraBruto(perfil.sexo, perfil.altura_cm ?? m.altura_cm, m.pescoco_cm, m.cintura_cm, m.quadril_cm);
}

/**
 * Ajuste de calibração do % de gordura: padrão +2 no masculino (o da planilha)
 * e 0 no feminino; pode ser digitado ou calculado por um exame (DXA,
 * bioimpedância de qualidade): ajuste = % do exame − US Navy bruta do mesmo dia.
 */
function CartaoCalibracao({ perfil }: { perfil: TipoPerfil }) {
  const { medidas, executar, limparErro } = useDados();
  const sexo = perfil.sexo ?? 'Masculino';
  const [ajuste, setAjuste] = useState(paraTexto(perfil.ajuste_gordura));
  const [exameData, setExameData] = useState(perfil.exame_gordura_data ?? '');
  const [exameBf, setExameBf] = useState(paraTexto(perfil.exame_gordura_bf));
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setAjuste(paraTexto(perfil.ajuste_gordura));
    setExameData(perfil.exame_gordura_data ?? '');
    setExameBf(paraTexto(perfil.exame_gordura_bf));
  }, [perfil]);

  const ordenadas = [...medidas].sort((a, b) => a.data.localeCompare(b.data));
  const ultima = ordenadas[ordenadas.length - 1];
  const ajusteN = ajuste.trim() ? paraNumero(ajuste) : null;
  const vigente = ajusteN ?? AJUSTE_PADRAO[sexo];
  const bruta = ultima ? brutaDaMedida(ultima, perfil) : null;

  function calibrar() {
    setMsg(null);
    const bf = paraNumero(exameBf);
    if (!exameData) return setMsg({ tipo: 'erro', texto: 'Informe a data do exame.' });
    if (bf === null || bf < 2 || bf > 75) return setMsg({ tipo: 'erro', texto: 'Informe o % de gordura do exame (entre 2 e 75).' });
    // Medição do mesmo dia; sem ela, a mais próxima até 3 dias de distância
    const perto = ordenadas
      .map((m) => ({ m, d: Math.abs(diferencaDias(m.data, exameData)) }))
      .filter((x) => x.d <= 3)
      .sort((a, b) => a.d - b.d)[0];
    if (!perto) return setMsg({ tipo: 'erro', texto: 'Registre uma medição de fita no dia do exame (ou até 3 dias de distância) para calibrar.' });
    const b = brutaDaMedida(perto.m, perfil);
    if (b === null) return setMsg({ tipo: 'erro', texto: 'A medição desse dia não permite calcular a US Navy.' });
    const novo = Math.round((bf - b) * 10) / 10;
    setAjuste(paraTexto(novo));
    setMsg({
      tipo: 'info',
      texto: `Medição de ${formatarData(perto.m.data)}: US Navy bruta ${pp(b)}. Ajuste = ${pp(bf)} − ${pp(b)} = ${num(novo, 1)} p.p. Toque em Salvar para usar.`,
    });
  }

  async function salvar() {
    setMsg(null);
    if (ajuste.trim() && (ajusteN === null || ajusteN < -15 || ajusteN > 15)) return setMsg({ tipo: 'erro', texto: 'Ajuste entre −15 e 15 p.p. (ex.: 2 ou −1,5).' });
    const bf = exameBf.trim() ? paraNumero(exameBf) : null;
    if (exameBf.trim() && (bf === null || bf < 2 || bf > 75)) return setMsg({ tipo: 'erro', texto: 'O % de gordura do exame fica entre 2 e 75.' });
    if (!!exameData !== (bf !== null)) return setMsg({ tipo: 'erro', texto: 'Para guardar o exame, informe a data e o % de gordura.' });
    setSalvando(true);
    try {
      await executar((r) =>
        r.salvarPerfil({ ...perfil, ajuste_gordura: ajusteN === null ? null : Math.round(ajusteN * 10) / 10, exame_gordura_data: exameData || null, exame_gordura_bf: bf }),
      );
      setMsg({ tipo: 'info', texto: 'Calibração salva. Todo o histórico foi recalculado.' });
    } catch (e) {
      limparErro();
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="cartao pilha">
      <h2>Calibração do % de gordura</h2>
      <p className="mudo">
        O % de gordura sai da fórmula da Marinha dos EUA (US Navy) somada a um ajuste. Padrão: {num(AJUSTE_PADRAO.Masculino, 1)} p.p. no masculino (o
        da planilha) e 0 no feminino. Com um exame confiável (DXA ou bioimpedância de qualidade), o ajuste pode ser calibrado: % do exame − US Navy
        do mesmo dia.
      </p>
      {bruta !== null && (
        <div className="alerta info">
          {textoAjuste(bruta, vigente)} (última medição, {formatarData(ultima!.data)})
        </div>
      )}
      <CampoNumero
        rotulo="Ajuste"
        sufixo="p.p."
        valor={ajuste}
        permitirNegativo
        aoMudar={(v) => {
          setAjuste(v);
          // Ajuste digitado à mão deixa de ser "calibrado por exame"
          setExameData('');
          setExameBf('');
        }}
        dica={`Vazio = padrão (${num(AJUSTE_PADRAO[sexo], 1)} p.p. no ${sexo.toLowerCase()}).`}
      />
      <details className="ajuda">
        <summary>Calibrar por exame</summary>
        <div className="pilha">
          <div className="grade">
            <Campo rotulo="Data do exame">
              <input type="date" value={exameData} max={hojeLocal()} onChange={(e) => setExameData(e.target.value)} />
            </Campo>
            <CampoNumero rotulo="% do exame" sufixo="%" valor={exameBf} aoMudar={setExameBf} />
          </div>
          <button type="button" className="botao" onClick={calibrar}>
            Calcular ajuste
          </button>
          <p className="mudo">Use a medição de fita do mesmo dia do exame (ou até 3 dias de distância), em jejum e nas mesmas condições.</p>
        </div>
      </details>
      {perfil.exame_gordura_data && perfil.exame_gordura_bf != null && (
        <p className="mudo">
          Calibrado por exame em {formatarData(perfil.exame_gordura_data)}, a {pp(perfil.exame_gordura_bf)}.
        </p>
      )}
      {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
      <div className="linha">
        <button type="button" className="botao primario" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          className="botao"
          onClick={() => {
            setAjuste('');
            setExameData('');
            setExameBf('');
            setMsg({ tipo: 'info', texto: `Ajuste padrão: ${num(AJUSTE_PADRAO[sexo], 1)} p.p. Toque em Salvar para usar.` });
          }}
        >
          Voltar ao padrão
        </button>
      </div>
    </section>
  );
}

/** Data do backup no fuso do aparelho (o arquivo guarda em UTC). */
function dataDoBackup(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? formatarData(iso.slice(0, 10)) : formatarData(hojeLocal(d));
}

export function Perfil() {
  const { perfil, ciclo, aplicacoes, diario, medidas, treinos, forca, dieta, usuario, repo, executar, sair, limparErro } = useDados();
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [sexo, setSexo] = useState<Sexo>(perfil?.sexo ?? 'Masculino');
  const [altura, setAltura] = useState(paraTexto(perfil?.altura_cm));
  const [nascimento, setNascimento] = useState(perfil?.data_nascimento ?? '');
  const [ativos, setAtivos] = useState(perfil?.lembretes_ativos ?? true);
  const [hora, setHora] = useState(perfil?.hora_lembrete ?? '08:00');
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  // Perfil mudou por fora (importação de backup): o formulário mostra o que está salvo
  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.nome ?? '');
    setSexo(perfil.sexo ?? 'Masculino');
    setAltura(paraTexto(perfil.altura_cm));
    setNascimento(perfil.data_nascimento ?? '');
    setAtivos(perfil.lembretes_ativos ?? true);
    setHora(perfil.hora_lembrete ?? '08:00');
  }, [perfil]);
  const [estado, setEstado] = useState<EstadoNotificacao | null>(null);
  const [msgCal, setMsgCal] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const [importacao, setImportacao] = useState<{ backup: Backup; plano: PlanoImportacao } | null>(null);
  const [msgBackup, setMsgBackup] = useState<{ tipo: string; texto: string } | null>(null);

  useEffect(() => {
    estadoNotificacao().then(setEstado).catch(() => setEstado('sem-suporte'));
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const alt = paraNumero(altura);
    if (!nome.trim()) return setMsg({ tipo: 'erro', texto: 'Informe o nome.' });
    if (alt === null || alt < 100 || alt > 250) return setMsg({ tipo: 'erro', texto: 'Altura em centímetros, entre 100 e 250 (ex.: 181).' });
    if (nascimento && (nascimento > hojeLocal() || nascimento < '1900-01-01')) return setMsg({ tipo: 'erro', texto: 'Data de nascimento inválida.' });
    if (ativos && !/^\d{2}:\d{2}/.test(hora)) return setMsg({ tipo: 'erro', texto: 'Informe o horário do lembrete.' });
    try {
      await executar((r) =>
        r.salvarPerfil({
          nome: nome.trim(),
          sexo,
          altura_cm: paraNumero(altura),
          data_nascimento: nascimento || null,
          lembretes_ativos: ativos,
          hora_lembrete: hora,
          fuso_horario: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
          // A calibração tem cartão próprio: aqui fica como está
          ajuste_gordura: perfil?.ajuste_gordura ?? null,
          exame_gordura_data: perfil?.exame_gordura_data ?? null,
          exame_gordura_bf: perfil?.exame_gordura_bf ?? null,
        }),
      );
      setMsg({ tipo: 'info', texto: 'Dados salvos.' });
    } catch (e) {
      // A mensagem fica só aqui, perto do botão (sem repetir no topo)
      limparErro();
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  async function ativar() {
    try {
      setEstado(await ativarNotificacoes(repo));
    } catch (e) {
      setMsg({ tipo: 'erro', texto: `Não foi possível ativar: ${(e as Error).message}` });
    }
  }

  async function desativar() {
    await desativarNotificacoes(repo);
    setEstado(await estadoNotificacao());
  }

  async function exportar() {
    const backup = montarBackup({ perfil, ciclo, aplicacoes, diario, medidas, dieta, treinos, forca }, new Date().toISOString());
    const nomeArquivo = `ciclo-backup-${hojeLocal()}.json`;
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    // No iPhone, o menu Compartilhar permite "Salvar em Arquivos"
    const file = new File([blob], nomeArquivo, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Backup do Ciclo' });
        setMsgBackup({ tipo: 'info', texto: 'Backup gerado.' });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    setMsgBackup({ tipo: 'info', texto: 'Backup gerado.' });
  }

  async function prepararImportacao(f: File) {
    try {
      const b = lerBackup(await f.text());
      setImportacao({ backup: b, plano: planejarImportacao(b, { aplicacoes, medidas, diario, treinos, forca }) });
      setMsgBackup(null);
    } catch (e) {
      setMsgBackup({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  async function importar() {
    if (!importacao) return;
    const { backup: b, plano } = importacao;
    try {
      await executar(async (r) => {
        if (b.perfil) {
          await r.salvarPerfil(b.perfil);
          if (b.perfil.metas_projeto) await r.salvarMetas(b.perfil.metas_projeto);
          if (b.perfil.exercicios_forca?.length && (perfil?.modulo_treino || b.perfil.modulo_treino)) await r.salvarExerciciosForca(b.perfil.exercicios_forca);
        }
        let cicloId = ciclo?.id;
        if (b.ciclo) {
          const { id: _ignorado, ...resto } = b.ciclo;
          cicloId = (await r.salvarCiclo({ ...resto, id: ciclo?.id })).id;
        }
        for (const a of plano.aplicacoes) {
          const { id: _id, ...resto } = a;
          await r.salvarAplicacao({ ...resto, ciclo_id: cicloId! });
        }
        for (const d of plano.diario) {
          const { id: _id, ...resto } = d;
          await r.salvarDiario(resto);
        }
        for (const m of plano.medidas) {
          const { id: _id, ...resto } = m;
          await r.salvarMedida(resto);
        }
        if (perfil?.modulo_treino || b.perfil?.modulo_treino) {
          for (const t of plano.treinos) {
            const { id: _id, ...resto } = t;
            await r.salvarTreino(resto);
          }
          // Id novo: o do arquivo pode ser de outra conta
          for (const f of plano.forca) await r.salvarForca({ ...f, id: crypto.randomUUID() });
        }
        if (b.dieta) await r.salvarDieta(b.dieta);
      });
      setImportacao(null);
      setMsgBackup({ tipo: 'info', texto: 'Backup importado.' });
    } catch (e) {
      setMsgBackup({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  return (
    <div className="pilha">
      <form className="cartao pilha" onSubmit={salvar}>
        <h2>Dados pessoais</h2>
        <p className="mudo">{usuario?.email}</p>
        <Campo rotulo="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="Sexo" dica="Define a fórmula de % de gordura." grupo>
          <Escolhas opcoes={[{ valor: 'Masculino' as Sexo, rotulo: 'Masculino' }, { valor: 'Feminino' as Sexo, rotulo: 'Feminino' }]} valor={sexo} aoMudar={(v) => v && setSexo(v)} />
        </Campo>
        <CampoNumero rotulo="Altura" sufixo="cm" valor={altura} aoMudar={setAltura} dica="Vale para todas as medições: corrigir aqui corrige o histórico." />
        <Campo rotulo="Data de nascimento" dica="Usada na conferência da taxa basal da aba Dieta.">
          <input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
        </Campo>

        <h2 style={{ marginTop: 8 }}>Lembretes de aplicação</h2>
        <div className="linha entre">
          <span>Avisar no dia da aplicação</span>
          <Escolhas opcoes={[{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }]} valor={ativos ? 'sim' : 'nao'} aoMudar={(v) => setAtivos(v === 'sim')} />
        </div>
        <Campo rotulo="Horário do lembrete" dica="O aviso chega em até 15 minutos depois desse horário. Se a dose atrasar, você recebe um lembrete por dia até registrar a aplicação.">
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Campo>
        {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
        <button className="botao primario">Salvar</button>
      </form>

      {perfil && <CartaoCalibracao perfil={perfil} />}

      <section className="cartao pilha">
        <div className="linha">
          <Icone nome="sino" />
          <h2>Notificações neste aparelho</h2>
        </div>
        {estado && <div className={`alerta ${estado === 'ativo' ? 'info' : ''}`}>{TEXTO_ESTADO[estado]}</div>}
        <div className="linha">
          {(estado === 'pendente' || estado === 'ativo-sem-servidor') && (
            <button className="botao primario" onClick={ativar}>Ativar notificações</button>
          )}
          {(estado === 'ativo' || estado === 'ativo-sem-servidor') && (
            <button className="botao" onClick={() => notificacaoTeste().catch((e) => setMsg({ tipo: 'erro', texto: String(e) }))}>
              Enviar teste
            </button>
          )}
          {estado === 'ativo' && <button className="botao perigo" onClick={desativar}>Desativar</button>}
        </div>
        {!ehIOS() && <p className="mudo">Ative em cada celular que você usar. Funciona melhor com o app instalado (menu do navegador → "Instalar app" / "Adicionar à tela inicial").</p>}
      </section>

      <section className="cartao pilha">
        <h2>Calendário do iPhone</h2>
        <p className="mudo">
          Coloca todas as doses até o fim do ciclo no seu calendário, com dose em mg e UI e alerta no horário do lembrete. Quando uma dose
          atrasa ou o plano muda, as datas se ajustam sozinhas.
        </p>
        {repo.modo === 'local' ? (
          <div className="alerta info">Disponível quando a nuvem estiver configurada.</div>
        ) : !perfil?.token_calendario ? (
          <div className="alerta">O calendário ainda não foi ativado no banco (script supabase/migrations/20261009000000_calendario.sql).</div>
        ) : (
          <>
            <a className="botao primario" href={CALENDARIO_URL.replace(/^https?:/, 'webcal:') + perfil.token_calendario}>
              Adicionar ao Calendário
            </a>
            <button
              className="botao"
              onClick={() => {
                const endereco = CALENDARIO_URL + perfil.token_calendario;
                navigator.clipboard
                  .writeText(endereco)
                  .then(() => setMsgCal('Endereço copiado. No Google Agenda: Outras agendas → Do URL.'))
                  .catch(() => setMsgCal(endereco));
              }}
            >
              Copiar endereço
            </button>
            {msgCal && <div className="alerta info" style={{ wordBreak: 'break-all' }}>{msgCal}</div>}
            <p className="mudo">
              No iPhone, toque em <b>Adicionar ao Calendário</b> e confirme em <b>Assinar</b>. O endereço é secreto e só mostra as suas doses.
            </p>
            <BotaoExcluir
              rotulo="Gerar novo endereço"
              aviso="O endereço atual vai parar de funcionar."
              aoConfirmar={() =>
                executar((r) => r.novoTokenCalendario())
                  .then(() => setMsgCal('Novo endereço criado. Apague a assinatura antiga no iPhone e adicione de novo.'))
                  .catch(() => undefined)
              }
            />
          </>
        )}
      </section>

      <section className="cartao pilha">
        <h2>Backup</h2>
        <p className="mudo">
          Exporta todos os seus dados (perfil e metas, ciclo, aplicações, diário, medidas, treinos, força e dieta) em um arquivo. Ao importar, nada é
          duplicado: aplicações e medidas de datas que já existem são puladas, e diário e treino substituem o mesmo dia.
        </p>
        <div className="linha">
          <button className="botao" onClick={() => void exportar()}>Exportar</button>
          <button className="botao" onClick={() => arquivo.current?.click()}>Importar</button>
          <input
            ref={arquivo}
            type="file"
            accept="application/json,.json"
            className="oculto"
            onChange={(e) => e.target.files?.[0] && prepararImportacao(e.target.files[0])}
          />
        </div>
        {importacao && (
          <div className="alerta info pilha" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <b>Backup de {dataDoBackup(importacao.backup.exportado_em)}.</b> Vai importar:{' '}
              {importacao.plano.aplicacoes.length} aplicação(ões), {importacao.plano.medidas.length} medição(ões),{' '}
              {importacao.plano.diario.length} dia(s) do diário, {importacao.plano.treinos.length} dia(s) de treino
              {importacao.plano.forca.length ? `, ${importacao.plano.forca.length} série(s) de força` : ''}
              {importacao.backup.dieta ? ' e o plano da dieta (substitui o atual)' : ''}.
              {(importacao.backup.perfil || importacao.backup.ciclo) && (
                <>
                  {' '}
                  <b>
                    Também substitui
                    {importacao.backup.perfil ? ' seus dados pessoais e metas' : ''}
                    {importacao.backup.perfil && importacao.backup.ciclo ? ' e' : ''}
                    {importacao.backup.ciclo ? ` o ciclo e o plano de doses (início em ${formatarData(importacao.backup.ciclo.data_inicio)})` : ''}.
                  </b>
                </>
              )}
              {importacao.plano.ignoradas.aplicacoes + importacao.plano.ignoradas.medidas > 0 &&
                ` ${importacao.plano.ignoradas.aplicacoes + importacao.plano.ignoradas.medidas} registro(s) já existentes serão pulados.`}
            </div>
            <div className="linha">
              <button className="botao primario pequeno" onClick={() => void importar()}>Importar agora</button>
              <button className="botao pequeno" onClick={() => setImportacao(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {msgBackup && <div className={`alerta ${msgBackup.tipo}`}>{msgBackup.texto}</div>}
      </section>

      {repo.modo === 'local' && (
        <div className="alerta info">Modo demonstração: dados salvos só neste navegador. Configure o Supabase para login real e sincronização.</div>
      )}

      <button className="botao perigo" onClick={() => void sair()}>Sair da conta</button>
      <p className="mudo" style={{ textAlign: 'center' }}>
        Este app registra e calcula; decisões de dose devem ser tomadas com acompanhamento médico.
      </p>
      <p className="mudo" style={{ textAlign: 'center' }}>Versão {__VERSAO_APP__}</p>
    </div>
  );
}
