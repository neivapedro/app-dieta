import type { PlanoDieta } from '../lib/dieta';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BotaoExcluir, Campo, CampoNumero, Escolhas, Icone } from '../componentes/ui';
import { CALENDARIO_URL } from '../config';
import { useDados } from '../dados/contexto';
import { hojeLocal } from '../lib/datas';
import { paraNumero, paraTexto } from '../lib/formato';
import {
  ativarNotificacoes,
  desativarNotificacoes,
  ehIOS,
  estadoNotificacao,
  notificacaoTeste,
  type EstadoNotificacao,
} from '../lib/notificacoes';
import type { Aplicacao, Ciclo, Medida, Perfil as TPerfil, RegistroDiario, Sexo } from '../lib/tipos';

const TEXTO_ESTADO: Record<EstadoNotificacao, string> = {
  'sem-suporte': 'Este navegador não suporta notificações.',
  'ios-instalar': 'No iPhone, as notificações só funcionam com o app instalado: toque em Compartilhar → "Adicionar à Tela de Início", abra pelo ícone e volte aqui.',
  negado: 'As notificações foram bloqueadas. Libere nas configurações do navegador/celular para este site.',
  pendente: 'Lembretes ainda não ativados neste aparelho.',
  ativo: 'Lembretes ativos neste aparelho.',
  'ativo-sem-servidor': 'Permissão concedida, mas o envio automático exige a nuvem configurada (Supabase + chaves VAPID).',
};

interface Backup {
  versao: 1;
  exportado_em: string;
  perfil: TPerfil | null;
  ciclo: Ciclo | null;
  aplicacoes: Aplicacao[];
  diario: RegistroDiario[];
  medidas: Medida[];
  dieta?: PlanoDieta | null;
}

export function Perfil() {
  const { perfil, ciclo, aplicacoes, diario, medidas, dieta, usuario, repo, executar } = useDados();
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [sexo, setSexo] = useState<Sexo>(perfil?.sexo ?? 'Masculino');
  const [altura, setAltura] = useState(paraTexto(perfil?.altura_cm));
  const [nascimento, setNascimento] = useState(perfil?.data_nascimento ?? '');
  const [ativos, setAtivos] = useState(perfil?.lembretes_ativos ?? true);
  const [hora, setHora] = useState(perfil?.hora_lembrete ?? '08:00');
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const [estado, setEstado] = useState<EstadoNotificacao | null>(null);
  const [msgCal, setMsgCal] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    estadoNotificacao().then(setEstado).catch(() => setEstado('sem-suporte'));
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
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

  function exportar() {
    const backup: Backup = { versao: 1, exportado_em: new Date().toISOString(), perfil, ciclo, aplicacoes, diario, medidas, dieta };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ciclo-backup-${hojeLocal()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importar(f: File) {
    try {
      const b = JSON.parse(await f.text()) as Backup;
      if (b.versao !== 1) throw new Error('Arquivo de backup não reconhecido.');
      await executar(async (r) => {
        if (b.perfil) await r.salvarPerfil(b.perfil);
        let cicloId = ciclo?.id;
        if (b.ciclo) {
          const { id: _ignorado, ...resto } = b.ciclo;
          cicloId = (await r.salvarCiclo({ ...resto, id: ciclo?.id })).id;
        }
        for (const a of b.aplicacoes) {
          const { id: _id, ...resto } = a;
          await r.salvarAplicacao({ ...resto, ciclo_id: cicloId! });
        }
        for (const d of b.diario) {
          const { id: _id, ...resto } = d;
          await r.salvarDiario(resto);
        }
        for (const m of b.medidas) {
          const { id: _id, ...resto } = m;
          await r.salvarMedida(resto);
        }
        if (b.dieta) await r.salvarDieta(b.dieta);
      });
      setMsg({ tipo: 'info', texto: 'Backup importado.' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
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
        <Campo rotulo="Horário do lembrete" dica="Se a dose atrasar, você recebe um lembrete por dia até registrar a aplicação.">
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
        <p className="mudo">Exporta todos os seus dados (ciclo, aplicações, diário e medidas) em um arquivo. Ao importar, registros do diário com a mesma data são substituídos e aplicações e medidas são adicionadas, então importe cada arquivo uma vez só.</p>
        <div className="linha">
          <button className="botao" onClick={exportar}>Exportar</button>
          <button className="botao" onClick={() => arquivo.current?.click()}>Importar</button>
          <input ref={arquivo} type="file" accept="application/json" className="oculto" onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
        </div>
      </section>

      {repo.modo === 'local' && (
        <div className="alerta info">Modo demonstração: dados salvos só neste navegador. Configure o Supabase para login real e sincronização.</div>
      )}

      <button className="botao perigo" onClick={() => repo.sair()}>Sair da conta</button>
      <p className="mudo" style={{ textAlign: 'center' }}>
        Este app registra e calcula; decisões de dose devem ser tomadas com acompanhamento médico.
      </p>
    </div>
  );
}
