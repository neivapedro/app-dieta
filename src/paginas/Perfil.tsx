import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BotaoExcluir, Campo, CampoNumero, Escolhas, Icone } from '../componentes/ui';
import { CALENDARIO_URL } from '../config';
import { useDados } from '../dados/contexto';
import { CicloSalvoEmParte } from '../dados/repositorio';
import { lerBackup, montarBackup, planejarImportacao, type Backup, type PlanoImportacao } from '../lib/backup';
import { formatarData, hojeLocal } from '../lib/datas';
import { paraNumero, paraTexto } from '../lib/formato';
import {
  ativarNotificacoes,
  desativarNotificacoes,
  ehIOS,
  estadoNotificacao,
  notificacaoTeste,
  type EstadoNotificacao,
} from '../lib/notificacoes';
import type { Sexo } from '../lib/tipos';

const TEXTO_ESTADO: Record<EstadoNotificacao, string> = {
  'sem-suporte': 'Este navegador não suporta notificações.',
  'ios-instalar': 'No iPhone, as notificações só funcionam com o app instalado: toque em Compartilhar → "Adicionar à Tela de Início", abra pelo ícone e volte aqui.',
  negado: 'As notificações foram bloqueadas. Libere nas configurações do navegador/celular para este site.',
  pendente: 'Lembretes ainda não ativados neste aparelho.',
  ativo: 'Lembretes ativos neste aparelho.',
  'ativo-sem-servidor': 'Permissão concedida, mas o envio automático exige a nuvem configurada (Supabase + chaves VAPID).',
};


/** Data do backup no fuso do aparelho (o arquivo guarda em UTC). */
function dataDoBackup(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? formatarData(iso.slice(0, 10)) : formatarData(hojeLocal(d));
}

export function Perfil() {
  const { perfil, ciclo, aplicacoes, diario, medidas, treinos, dieta, usuario, repo, executar, sair, limparErro } = useDados();
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
    const backup = montarBackup({ perfil, ciclo, aplicacoes, diario, medidas, dieta, treinos }, new Date().toISOString());
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
      setImportacao({ backup: b, plano: planejarImportacao(b, { aplicacoes, medidas, diario, treinos }) });
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
    let emParte: string | null = null;
    try {
      await executar(async (r) => {
        if (b.perfil) {
          await r.salvarPerfil(b.perfil);
          if (b.perfil.metas_projeto) await r.salvarMetas(b.perfil.metas_projeto);
        }
        let cicloId = ciclo?.id;
        if (b.ciclo) {
          const { id: _ignorado, ...resto } = b.ciclo;
          try {
            cicloId = (await r.salvarCiclo({ ...resto, id: ciclo?.id })).id;
          } catch (e) {
            // Banco sem o SQL de evolução: o ciclo foi gravado sem os campos novos; segue a importação
            if (!(e instanceof CicloSalvoEmParte)) throw e;
            cicloId = e.ciclo.id;
            emParte = e.message;
          }
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
        }
        if (b.dieta) await r.salvarDieta(b.dieta);
      });
      setImportacao(null);
      setMsgBackup(emParte ? { tipo: 'erro', texto: `Backup importado, com uma ressalva: ${emParte}` } : { tipo: 'info', texto: 'Backup importado.' });
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
        <CampoNumero rotulo="Altura" sufixo="cm" valor={altura} aoMudar={setAltura} />
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
          Exporta todos os seus dados (perfil e metas, ciclo, aplicações, diário, medidas, treinos e dieta) em um arquivo. Ao importar, nada é
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
