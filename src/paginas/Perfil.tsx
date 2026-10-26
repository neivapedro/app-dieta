import '../estilos/perfil.css';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BotaoExcluir, Campo, CampoNumero, Escolhas, Icone } from '../componentes/ui';
import { CALENDARIO_URL } from '../config';
import { useFotos } from '../componentes/fotos';
import { fotoParaBackup, importarFotos } from '../dados/fotos';
import { useDados } from '../dados/contexto';
import { CicloSalvoEmParte, SalvoEmParte } from '../dados/repositorio';
import { lerBackup, montarBackup, planejarImportacao, type Backup, type PlanoImportacao } from '../lib/backup';
import { formatarData, hojeLocal } from '../lib/datas';
import { ehErroDeRede, traduzirErro } from '../lib/erros';
import { num, paraNumero, paraTexto, pp, sinal } from '../lib/formato';
import { textoTamanho } from '../lib/fotos';
import { AJUSTE_PADRAO, ajusteVigente, calibracaoAtual, calibrarPorExame, percentualGorduraBruto } from '../lib/gordura';
import {
  ativarNotificacoes,
  desativarNotificacoes,
  ehIOS,
  estadoNotificacao,
  notificacaoTeste,
  type EstadoNotificacao,
} from '../lib/notificacoes';
import { inicial, linhaPerfil, origemCalibracao, resumoLembrete, resumoNotificacao, resumoRefeicoes, type Tom } from '../lib/perfil-resumo';
import type { Medida, Perfil as TipoPerfil, Sexo } from '../lib/tipos';
// Mesma regra da função que envia (quais refeições têm aviso)
import { ANTES_PERMITIDOS, lerAntes, lerRefeicoes, minutosDoHorario } from '../../supabase/functions/_shared/refeicoes';

const TEXTO_ESTADO: Record<EstadoNotificacao, string> = {
  'sem-suporte': 'Este navegador não suporta notificações.',
  'ios-instalar': 'No iPhone, as notificações só funcionam com o app instalado: toque em Compartilhar → "Adicionar à Tela de Início", abra pelo ícone e volte aqui.',
  negado: 'As notificações foram bloqueadas. Libere nas configurações do navegador/celular para este site.',
  pendente: 'Lembretes ainda não ativados neste aparelho.',
  ativo: 'Lembretes ativos neste aparelho.',
  'ativo-sem-servidor': 'Permissão concedida, mas o envio automático exige a nuvem configurada (Supabase + chaves VAPID).',
};

const OPCOES_ANTES = ANTES_PERMITIDOS.map((v) => ({ valor: v as number, rotulo: v === 0 ? 'No horário' : `${v} min antes` }));

/** Cada linha da lista abre uma subtela (?secao=), como os Ajustes do iPhone. */
const SECOES = {
  dados: 'Dados pessoais',
  lembrete: 'Lembrete de aplicação',
  notificacoes: 'Notificações neste aparelho',
  refeicoes: 'Lembrete das refeições',
  calendario: 'Calendário do iPhone',
  calibracao: 'Calibração do % de gordura',
  backup: 'Backup',
} as const;
type Secao = keyof typeof SECOES;
/** Nome curto da subtela no botão de voltar */
const CURTOS: Record<Secao, string> = {
  dados: 'Dados',
  lembrete: 'Lembrete',
  notificacoes: 'Notificações',
  refeicoes: 'Refeições',
  calendario: 'Calendário',
  calibracao: 'Calibração',
  backup: 'Backup',
};
type Abrir = (s: Secao) => void;

function hhmm(minutos: number): string {
  const m = (minutos + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/* ---------- Peças visuais da lista ---------- */

const ICONES_EXTRAS: Record<string, ReactNode> = {
  backup: <path d="M12 3v12m0 0-4-4m4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />,
  importar: <path d="M12 15V3m0 0L8 7m4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />,
  sair: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />,
  gota: <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" />,
};

function Simbolo({ nome }: { nome: string }) {
  if (!ICONES_EXTRAS[nome]) return <Icone nome={nome} />;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONES_EXTRAS[nome]}
    </svg>
  );
}

function Seta({ esquerda }: { esquerda?: boolean }) {
  return (
    <svg className="pf-seta" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={esquerda ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
    </svg>
  );
}

/** Linha da lista agrupada: ícone, rótulo (e subtítulo), valor atual e seta. */
function Linha({
  icone,
  cor,
  rotulo,
  sub,
  valor,
  tom,
  aoTocar,
}: {
  icone: string;
  cor: string;
  rotulo: string;
  sub?: string;
  valor?: string;
  tom?: Tom;
  aoTocar: () => void;
}) {
  return (
    <button type="button" className="pf-linha" onClick={aoTocar}>
      <span className={`pf-icone pf-cor-${cor}`}>
        <Simbolo nome={icone} />
      </span>
      <span className="pf-texto">
        <span className="pf-rotulo">{rotulo}</span>
        {sub && <span className="pf-sub">{sub}</span>}
      </span>
      {valor && (
        <span className="pf-valor">
          {tom && <i className={`pf-ponto pf-tom-${tom}`} aria-hidden="true" />}
          {valor}
        </span>
      )}
      <Seta />
    </button>
  );
}

function Grupo({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <section className="pf-grupo-bloco" aria-label={titulo}>
      {titulo && <h2 className="pf-grupo-titulo">{titulo}</h2>}
      <div className="pf-grupo">{children}</div>
    </section>
  );
}

/** Explicação longa fechada por padrão (como o "Como ler" da Análise). */
function ComoFunciona({ children }: { children: ReactNode }) {
  return (
    <details className="tabela-detalhe pf-como">
      <summary>Como funciona</summary>
      <div className="pf-como-texto">{children}</div>
    </details>
  );
}

/** Atalho para as Notificações dentro das subtelas de lembrete. */
function LinhaNotificacoes({ estado, abrir }: { estado: EstadoNotificacao | null; abrir: Abrir }) {
  const r = resumoNotificacao(estado);
  return (
    <div className="pf-grupo">
      <Linha icone="sino" cor="laranja" rotulo="Notificações" valor={r.texto} tom={r.tom} aoTocar={() => abrir('notificacoes')} />
    </div>
  );
}

/* ---------- Gravação dos dados pessoais e do lembrete de aplicação ---------- */

/**
 * Perfil completo para gravar (o mesmo registro do formulário antigo): os campos
 * da subtela que salva vêm de `c`; os outros ficam como estão no perfil.
 */
function perfilParaSalvar(
  perfil: TipoPerfil,
  medidas: Medida[],
  c: { nome: string; sexo: Sexo; altura_cm: number | null; data_nascimento: string | null; lembretes_ativos: boolean; hora: string },
): TipoPerfil {
  // Calibrado por exame: altura (ou sexo) nova refaz o ajuste pelo exame, para a medição do exame continuar dando o % dele
  const recalibrado = calibracaoAtual({ ...perfil, sexo: c.sexo, altura_cm: c.altura_cm }, medidas);
  return {
    nome: c.nome,
    sexo: c.sexo,
    altura_cm: c.altura_cm,
    data_nascimento: c.data_nascimento,
    lembretes_ativos: c.lembretes_ativos,
    // Horário vazio com o lembrete desligado: guarda o último válido (a coluna é obrigatória)
    hora_lembrete: /^\d{2}:\d{2}/.test(c.hora) ? c.hora : perfil.hora_lembrete || '08:00',
    fuso_horario: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    // A calibração tem subtela própria: aqui fica como está (com exame, refeita com a altura nova)
    ajuste_gordura: recalibrado?.ok ? recalibrado.ajuste : (perfil.ajuste_gordura ?? null),
    exame_gordura_data: perfil.exame_gordura_data ?? null,
    exame_gordura_bf: perfil.exame_gordura_bf ?? null,
  };
}

function SecaoDados({ perfil, email }: { perfil: TipoPerfil; email?: string | null }) {
  const { medidas, executar, limparErro } = useDados();
  const [nome, setNome] = useState(perfil.nome ?? '');
  const [sexo, setSexo] = useState<Sexo>(perfil.sexo ?? 'Masculino');
  const [altura, setAltura] = useState(paraTexto(perfil.altura_cm));
  const [nascimento, setNascimento] = useState(perfil.data_nascimento ?? '');
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  // Perfil mudou por fora (importação de backup): o formulário mostra o que está salvo. Só quando estes
  // campos mudam de fato: salvar a calibração (que recarrega o perfil) não apaga o que foi digitado aqui
  useEffect(() => {
    setNome(perfil.nome ?? '');
    setSexo(perfil.sexo ?? 'Masculino');
    setAltura(paraTexto(perfil.altura_cm));
    setNascimento(perfil.data_nascimento ?? '');
  }, [perfil.nome, perfil.sexo, perfil.altura_cm, perfil.data_nascimento]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const alt = paraNumero(altura);
    if (!nome.trim()) return setMsg({ tipo: 'erro', texto: 'Informe o nome.' });
    if (alt === null || alt < 100 || alt > 250) return setMsg({ tipo: 'erro', texto: 'Altura em centímetros, entre 100 e 250 (ex.: 181).' });
    if (nascimento && (nascimento > hojeLocal() || nascimento < '1900-01-01')) return setMsg({ tipo: 'erro', texto: 'Data de nascimento inválida.' });
    try {
      await executar((r) =>
        r.salvarPerfil(
          perfilParaSalvar(perfil, medidas, {
            nome: nome.trim(),
            sexo,
            altura_cm: alt,
            data_nascimento: nascimento || null,
            lembretes_ativos: perfil.lembretes_ativos ?? true,
            hora: perfil.hora_lembrete ?? '08:00',
          }),
        ),
      );
      setMsg({ tipo: 'info', texto: 'Dados salvos.' });
    } catch (e) {
      // A mensagem fica só aqui, perto do botão (sem repetir no topo)
      limparErro();
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  return (
    <form className="cartao pilha" onSubmit={salvar}>
      {email && <p className="mudo">{email}</p>}
      <Campo rotulo="Nome">
        <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
      </Campo>
      <Campo rotulo="Sexo" dica="Define a fórmula de % de gordura." grupo>
        <Escolhas opcoes={[{ valor: 'Masculino' as Sexo, rotulo: 'Masculino' }, { valor: 'Feminino' as Sexo, rotulo: 'Feminino' }]} valor={sexo} aoMudar={(v) => v && setSexo(v)} />
      </Campo>
      <CampoNumero rotulo="Altura" sufixo="cm" valor={altura} aoMudar={setAltura} dica="Vale para todas as medições: corrigir aqui corrige o histórico." />
      <Campo rotulo="Data de nascimento" dica="Usada na conferência da taxa basal da aba Dieta.">
        <input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
      </Campo>
      {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
      <button className="botao primario">Salvar</button>
    </form>
  );
}

function SecaoLembrete({ perfil, estado, abrir }: { perfil: TipoPerfil; estado: EstadoNotificacao | null; abrir: Abrir }) {
  const { medidas, executar, limparErro } = useDados();
  const [ativos, setAtivos] = useState(perfil.lembretes_ativos ?? true);
  const [hora, setHora] = useState(perfil.hora_lembrete ?? '08:00');
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  useEffect(() => {
    setAtivos(perfil.lembretes_ativos ?? true);
    setHora(perfil.hora_lembrete ?? '08:00');
  }, [perfil.lembretes_ativos, perfil.hora_lembrete]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (ativos && !/^\d{2}:\d{2}/.test(hora)) return setMsg({ tipo: 'erro', texto: 'Informe o horário do lembrete.' });
    try {
      await executar((r) =>
        r.salvarPerfil(
          perfilParaSalvar(perfil, medidas, {
            nome: perfil.nome,
            sexo: perfil.sexo ?? 'Masculino',
            altura_cm: perfil.altura_cm,
            data_nascimento: perfil.data_nascimento || null,
            lembretes_ativos: ativos,
            hora,
          }),
        ),
      );
      setMsg({ tipo: 'info', texto: ativos ? 'Lembrete salvo.' : 'Lembrete desligado.' });
    } catch (e) {
      limparErro();
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  return (
    <>
      <form className="cartao pilha" onSubmit={salvar}>
        <div className="linha entre">
          <span>Avisar no dia da aplicação</span>
          <Escolhas opcoes={[{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }]} valor={ativos ? 'sim' : 'nao'} aoMudar={(v) => setAtivos(v === 'sim')} />
        </div>
        <Campo rotulo="Horário do lembrete">
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Campo>
        <ComoFunciona>
          <p>O aviso chega em até 15 minutos depois desse horário. Se a dose atrasar, você recebe um lembrete por dia até registrar a aplicação.</p>
          <p>O aviso chega pelas notificações: ative-as em cada celular que você usar.</p>
        </ComoFunciona>
        {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
        <button className="botao primario">Salvar</button>
      </form>
      <LinhaNotificacoes estado={estado} abrir={abrir} />
    </>
  );
}

/* ---------- Notificações deste aparelho ---------- */

function SecaoNotificacoes({
  estado,
  setEstado,
  perfil,
  abrir,
}: {
  estado: EstadoNotificacao | null;
  setEstado: (e: EstadoNotificacao) => void;
  perfil: TipoPerfil;
  abrir: Abrir;
}) {
  const { repo } = useDados();
  // Mensagens do cartão de Notificações ficam nele, perto dos botões
  const [msgNotif, setMsgNotif] = useState<{ tipo: string; texto: string } | null>(null);
  const r = resumoNotificacao(estado);

  async function ativar() {
    setMsgNotif(null);
    try {
      setEstado(await ativarNotificacoes(repo));
    } catch (e) {
      setMsgNotif({ tipo: 'erro', texto: ehErroDeRede(e) ? traduzirErro(e) : `Não foi possível ativar: ${traduzirErro(e)}` });
    }
  }

  async function desativar() {
    setMsgNotif(null);
    try {
      const noServidor = await desativarNotificacoes(repo);
      if (!noServidor)
        setMsgNotif({ tipo: 'info', texto: 'Lembretes desativados neste aparelho. Sem conexão com o servidor: o cadastro antigo some sozinho no próximo envio.' });
    } catch (e) {
      setMsgNotif({ tipo: 'erro', texto: ehErroDeRede(e) ? traduzirErro(e) : `Não foi possível desativar: ${traduzirErro(e)}` });
    }
    setEstado(await estadoNotificacao().catch(() => 'sem-suporte' as const));
  }

  const comBotoes = estado === 'pendente' || estado === 'ativo' || estado === 'ativo-sem-servidor';
  return (
    <>
      <section className="cartao pilha">
        <div className="pf-estado">
          <span className={`pf-estado-icone pf-tom-${r.tom}`}>
            <Icone nome="sino" />
          </span>
          <div className="cresce">
            <div className="rotulo">Situação</div>
            <div className={`pf-estado-valor pf-tom-${r.tom}`}>{r.texto}</div>
          </div>
        </div>
        {estado && <div className={`alerta ${estado === 'ativo' ? 'info' : ''}`}>{TEXTO_ESTADO[estado]}</div>}
        {comBotoes && (
          <div className="linha">
            {(estado === 'pendente' || estado === 'ativo-sem-servidor') && (
              <button className="botao primario" onClick={() => void ativar()}>
                Ativar notificações
              </button>
            )}
            {(estado === 'ativo' || estado === 'ativo-sem-servidor') && (
              <button className="botao" onClick={() => notificacaoTeste().catch((e) => setMsgNotif({ tipo: 'erro', texto: traduzirErro(e) }))}>
                Enviar teste
              </button>
            )}
            {estado === 'ativo' && (
              <button className="botao perigo" onClick={() => void desativar()}>
                Desativar
              </button>
            )}
          </div>
        )}
        {msgNotif && <div className={`alerta ${msgNotif.tipo}`}>{msgNotif.texto}</div>}
        {!ehIOS() && (
          <ComoFunciona>
            <p>Ative em cada celular que você usar. Funciona melhor com o app instalado (menu do navegador → "Instalar app" / "Adicionar à tela inicial").</p>
          </ComoFunciona>
        )}
      </section>
      <Grupo titulo="Avisos que usam as notificações">
        <Linha icone="ciclo" cor="ambar" rotulo="Lembrete de aplicação" valor={resumoLembrete(perfil)} aoTocar={() => abrir('lembrete')} />
        <Linha
          icone="dieta"
          cor="verde"
          rotulo="Lembrete das refeições"
          valor={resumoRefeicoes(perfil, lerAntes(perfil.lembrete_refeicoes_antes))}
          aoTocar={() => abrir('refeicoes')}
        />
      </Grupo>
    </>
  );
}

/**
 * Lembrete das refeições: liga/desliga e a antecedência. Grava na hora no
 * perfil; o envio é feito pelo servidor a cada 15 min, para todos os aparelhos
 * com as notificações ativas. Independente do lembrete de aplicação.
 */
function LembreteRefeicoes({ perfil, estado, abrir }: { perfil: TipoPerfil; estado: EstadoNotificacao | null; abrir: Abrir }) {
  const { dieta, executar, limparErro } = useDados();
  const salvoLigado = perfil.lembrete_refeicoes === true;
  const salvoAntes = lerAntes(perfil.lembrete_refeicoes_antes);
  const [ligado, setLigado] = useState(salvoLigado);
  const [antes, setAntes] = useState(salvoAntes);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  useEffect(() => {
    setLigado(salvoLigado);
    setAntes(salvoAntes);
  }, [salvoLigado, salvoAntes]);

  async function salvar(novoLigado: boolean, novoAntes: number) {
    setMsg(null);
    setLigado(novoLigado);
    setAntes(novoAntes);
    setSalvando(true);
    try {
      await executar((r) =>
        r.salvarPerfil({
          ...perfil,
          lembrete_refeicoes: novoLigado,
          lembrete_refeicoes_antes: novoAntes,
          // O horário do aviso é o do relógio deste aparelho
          fuso_horario: Intl.DateTimeFormat().resolvedOptions().timeZone || perfil.fuso_horario || 'America/Sao_Paulo',
        }),
      );
      setMsg({ tipo: 'info', texto: novoLigado ? 'Lembrete das refeições ligado.' : 'Lembrete das refeições desligado.' });
    } catch (e) {
      // Não salvou: volta ao que está no servidor
      limparErro();
      setLigado(salvoLigado);
      setAntes(salvoAntes);
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  // Refeições do plano com alimentos: as com horário recebem aviso
  const refeicoes = lerRefeicoes(dieta?.refeicoes ?? []).filter((r) => r.itens.length);
  const comHorario = refeicoes
    .map((r) => ({ nome: r.nome, min: minutosDoHorario(r.horario) }))
    .filter((r): r is { nome: string; min: number } => r.min !== null)
    // Na ordem dos avisos ao longo do dia (o de uma refeição de 00:05 com 30 min antes sai às 23:35, na véspera)
    .sort((a, b) => ((a.min - antes + 1440) % 1440) - ((b.min - antes + 1440) % 1440));
  const semHorario = refeicoes.filter((r) => minutosDoHorario(r.horario) === null);

  return (
    <>
      <section className="cartao pilha" aria-label="Lembrete das refeições">
        <div className="linha entre">
          <span>Avisar as refeições</span>
          <Escolhas
            opcoes={[
              { valor: 'sim', rotulo: 'Sim' },
              { valor: 'nao', rotulo: 'Não' },
            ]}
            valor={ligado ? 'sim' : 'nao'}
            aoMudar={(v) => v && !salvando && (v === 'sim') !== ligado && void salvar(v === 'sim', antes)}
          />
        </div>
        {ligado && (
          <Campo rotulo="Avisar" grupo>
            <Escolhas opcoes={OPCOES_ANTES} valor={antes} aoMudar={(v) => v !== null && !salvando && v !== antes && void salvar(true, v)} />
          </Campo>
        )}
        {ligado &&
          (!refeicoes.length ? (
            <p className="texto-2">Monte o plano na aba Dieta para receber os avisos.</p>
          ) : !comHorario.length ? (
            <div className="alerta">Nenhuma refeição do plano tem horário: defina os horários na aba Dieta.</div>
          ) : (
            <div className="pilha" style={{ gap: 6 }}>
              <div className="rotulo">Avisos</div>
              <ul className="pf-avisos">
                {comHorario.map((r) => (
                  <li key={r.nome + r.min}>
                    <span className="pf-avisos-hora">{hhmm(r.min - antes)}</span>
                    <span className="pf-avisos-nome">{r.nome}</span>
                  </li>
                ))}
              </ul>
              {semHorario.length > 0 && <p className="texto-2">Sem horário (sem aviso): {semHorario.map((r) => r.nome).join(', ')}.</p>}
            </div>
          ))}
        {estado && estado !== 'ativo' && (
          <div className="alerta">
            {estado === 'ativo-sem-servidor'
              ? 'Os avisos das refeições são enviados pelo servidor: sem a nuvem configurada, eles não chegam.'
              : estado === 'pendente'
                ? 'As notificações deste aparelho estão desligadas: ative-as em Notificações, abaixo, para receber os avisos das refeições aqui.'
                : 'As notificações deste aparelho não estão ativas (veja em Notificações, abaixo): os avisos das refeições não chegam aqui.'}{' '}
            {ligado && estado !== 'ativo-sem-servidor' ? 'Outro celular seu com as notificações ativas continua recebendo.' : ''}
          </div>
        )}
        {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
        <ComoFunciona>
          <p>Avisa no horário de cada refeição do plano da aba Dieta, com o que comer. Refeição sem horário não é avisada. É separado do lembrete de aplicação.</p>
          <p>O servidor confere a cada 15 minutos: o aviso chega na conferência mais próxima, até uns 7 minutos antes ou depois do momento escolhido.</p>
        </ComoFunciona>
      </section>
      <LinhaNotificacoes estado={estado} abrir={abrir} />
    </>
  );
}

/* ---------- Calibração do % de gordura ---------- */

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
  // Com exame salvo, o ajuste é o refeito com a altura e a medição atuais (o mesmo das contas)
  const ajusteSalvo = perfil.exame_gordura_data && perfil.exame_gordura_bf != null ? ajusteVigente(perfil, medidas) : perfil.ajuste_gordura;
  const [ajuste, setAjuste] = useState(paraTexto(ajusteSalvo));
  const [exameData, setExameData] = useState(perfil.exame_gordura_data ?? '');
  const [exameBf, setExameBf] = useState(paraTexto(perfil.exame_gordura_bf));
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Só quando os campos salvos mudam de fato: salvar outro formulário (que recarrega o perfil) não apaga o que foi digitado aqui
  useEffect(() => {
    setAjuste(paraTexto(ajusteSalvo));
    setExameData(perfil.exame_gordura_data ?? '');
    setExameBf(paraTexto(perfil.exame_gordura_bf));
  }, [ajusteSalvo, perfil.exame_gordura_data, perfil.exame_gordura_bf]);

  const ordenadas = [...medidas].sort((a, b) => a.data.localeCompare(b.data));
  // "Agora" = última medição normal (o mesmo critério de Medidas: a atípica fica fora)
  const ultima = ordenadas.filter((m) => !m.atipica).at(-1);
  const ajusteN = ajuste.trim() ? paraNumero(ajuste) : null;
  const vigente = ajusteN ?? AJUSTE_PADRAO[sexo];
  const bruta = ultima ? brutaDaMedida(ultima, perfil) : null;

  function calibrar() {
    setMsg(null);
    const c = calibrarPorExame(medidas, perfil, exameData, paraNumero(exameBf), hojeLocal());
    if (!c.ok) return setMsg({ tipo: 'erro', texto: c.erro });
    setAjuste(paraTexto(c.ajuste));
    setMsg({
      tipo: 'info',
      texto: `Medição de ${formatarData(c.medida.data)}: US Navy bruta ${pp(c.bruta)}. Ajuste = ${pp(paraNumero(exameBf)!)} − ${pp(c.bruta)} = ${num(c.ajuste, 1)} p.p. Toque em Salvar para usar.`,
    });
  }

  async function salvar() {
    setMsg(null);
    if (ajuste.trim() && (ajusteN === null || ajusteN < -15 || ajusteN > 15)) return setMsg({ tipo: 'erro', texto: 'Ajuste entre −15 e 15 p.p. (ex.: 2 ou −1,5).' });
    const bf = exameBf.trim() ? paraNumero(exameBf) : null;
    if (exameBf.trim() && (bf === null || bf < 2 || bf > 75)) return setMsg({ tipo: 'erro', texto: 'O % de gordura do exame fica entre 2 e 75.' });
    if (!!exameData !== (bf !== null)) return setMsg({ tipo: 'erro', texto: 'Para guardar o exame, informe a data e o % de gordura.' });
    // Com exame: o ajuste salvo é sempre o calculado por ele (nunca um "calibrado por exame" que não saiu do exame)
    let ajusteFinal = ajusteN === null ? null : Math.round(ajusteN * 10) / 10;
    if (exameData) {
      const c = calibrarPorExame(medidas, perfil, exameData, bf, hojeLocal());
      if (!c.ok) return setMsg({ tipo: 'erro', texto: c.erro });
      ajusteFinal = c.ajuste;
    }
    setSalvando(true);
    try {
      await executar((r) => r.salvarPerfil({ ...perfil, ajuste_gordura: ajusteFinal, exame_gordura_data: exameData || null, exame_gordura_bf: bf }));
      if (ajusteFinal !== null) setAjuste(paraTexto(ajusteFinal));
      setMsg({
        tipo: 'info',
        texto:
          exameData && ajusteFinal !== ajusteN
            ? `Calibração salva com o ajuste do exame (${sinal(ajusteFinal ?? 0, 1, ' p.p.')}). Todo o histórico foi recalculado.`
            : 'Calibração salva. Todo o histórico foi recalculado.',
      });
    } catch (e) {
      limparErro();
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      {bruta !== null && (
        <section className="cartao">
          <div className="secao-cab">
            <div>
              <h2>% de gordura agora</h2>
              <div className="secao-sub">Última medição, {formatarData(ultima!.data)}</div>
            </div>
          </div>
          <div className="pf-conta" aria-label={`US Navy ${num(bruta, 1)}%, ajuste ${sinal(vigente, 1, ' p.p.')}, resultado ${num(bruta + vigente, 1)}%`}>
            <div className="pf-conta-parte">
              <span className="rotulo">US Navy</span>
              <b>{num(bruta, 1)}%</b>
            </div>
            <span className="pf-conta-op" aria-hidden="true">{vigente < 0 ? '−' : '+'}</span>
            <div className="pf-conta-parte">
              <span className="rotulo">Ajuste</span>
              <b>{num(Math.abs(vigente), 1)} p.p.</b>
            </div>
            <span className="pf-conta-op" aria-hidden="true">=</span>
            <div className="pf-conta-parte pf-conta-total">
              <span className="rotulo">Resultado</span>
              <b>{num(bruta + vigente, 1)}%</b>
            </div>
          </div>
        </section>
      )}
      <section className="cartao pilha">
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
        <details className="tabela-detalhe pf-como">
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
        <div className="pf-botoes">
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
        <ComoFunciona>
          <p>
            O % de gordura sai da fórmula da Marinha dos EUA (US Navy) somada a um ajuste. Padrão: {num(AJUSTE_PADRAO.Masculino, 1)} p.p. no masculino (o da
            planilha) e 0 no feminino. Com um exame confiável (DXA ou bioimpedância de qualidade), o ajuste pode ser calibrado: % do exame − US Navy do mesmo dia.
          </p>
        </ComoFunciona>
      </section>
    </>
  );
}

/* ---------- Calendário do iPhone ---------- */

function SecaoCalendario({ perfil }: { perfil: TipoPerfil }) {
  const { repo, executar } = useDados();
  const [msgCal, setMsgCal] = useState<string | null>(null);
  return (
    <section className="cartao pilha">
      {repo.modo === 'local' ? (
        <div className="alerta info">Disponível quando a nuvem estiver configurada.</div>
      ) : !perfil.token_calendario ? (
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
          {msgCal && (
            <div className="alerta info" style={{ wordBreak: 'break-all' }}>
              {msgCal}
            </div>
          )}
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
      <ComoFunciona>
        <p>
          Coloca todas as doses até o fim do ciclo no seu calendário, com dose em mg e UI e alerta no horário do lembrete. Quando uma dose atrasa ou o plano
          muda, as datas se ajustam sozinhas.
        </p>
      </ComoFunciona>
    </section>
  );
}

/* ---------- Backup ---------- */

/** Data do backup no fuso do aparelho (o arquivo guarda em UTC). */
function dataDoBackup(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? formatarData(iso.slice(0, 10)) : formatarData(hojeLocal(d));
}

function SecaoBackup() {
  const { perfil, ciclo, aplicacoes, diario, medidas, treinos, forca, dieta, registroDecisoes, registroIndisponivel, usuario, executar, limparErro } = useDados();
  // A liberação da aba Treino não vem do backup: uma regra só para a prévia e a gravação
  const comTreino = !!perfil?.modulo_treino;
  const arquivo = useRef<HTMLInputElement>(null);
  const [importacao, setImportacao] = useState<{ backup: Backup; plano: PlanoImportacao } | null>(null);
  // Trava contra dois toques em "Importar agora"
  const [importando, setImportando] = useState(false);
  const [msgBackup, setMsgBackup] = useState<{ tipo: string; texto: string } | null>(null);
  // Fotos de antes e depois: só existem neste aparelho, então vão no backup (opção marcada por padrão)
  const { fotos } = useFotos();
  const [comFotos, setComFotos] = useState(true);
  const tamanhoFotos = fotos.reduce((t, f) => t + Math.ceil(f.dados.byteLength / 3) * 4, 0);

  async function exportar() {
    const backup = montarBackup(
      {
        perfil,
        ciclo,
        aplicacoes,
        diario,
        medidas,
        dieta,
        treinos,
        forca,
        registro_decisoes: registroDecisoes,
        ...(comFotos && fotos.length ? { fotos: fotos.map(fotoParaBackup) } : {}),
      },
      new Date().toISOString(),
    );
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
      const plano = planejarImportacao(b, { aplicacoes, medidas, diario, treinos, forca, registro_decisoes: registroDecisoes, fotos });
      // Conta sem a aba Treino: treinos e força do arquivo não são importados (nem aparecem na prévia)
      setImportacao({ backup: b, plano: comTreino ? plano : { ...plano, treinos: [], forca: [] } });
      setMsgBackup(null);
    } catch (e) {
      setMsgBackup({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  async function importar() {
    if (!importacao || importando) return;
    const { backup: b } = importacao;
    let plano = importacao.plano;
    let emParte: string | null = null;
    // Banco sem o SQL de evolução: o dado foi gravado sem o campo novo. Junta o
    // aviso (uma vez cada) numa ressalva e segue a importação com o resto
    const avisos = new Set<string>();
    const tolerar = async (gravacao: Promise<unknown>) => {
      try {
        await gravacao;
      } catch (e) {
        if (!(e instanceof SalvoEmParte)) throw e;
        avisos.add(e.message);
      }
    };
    setImportando(true);
    try {
      await executar(async (r) => {
        // Refaz o plano com o que já está no servidor: repetir a importação (depois de uma falha no meio) não duplica nada
        const [apl, med, frc, reg] = await Promise.all([
          r.listarAplicacoes(),
          r.listarMedidas(),
          comTreino ? r.listarForca() : Promise.resolve([]),
          registroIndisponivel ? Promise.resolve(null) : r.listarRegistroDecisoes(),
        ]);
        const refeito = planejarImportacao(b, { aplicacoes: apl, medidas: med, diario: [], treinos: [], forca: frc, registro_decisoes: reg ?? registroDecisoes, fotos });
        plano = comTreino ? refeito : { ...refeito, treinos: [], forca: [] };
        if (b.perfil) {
          await tolerar(r.salvarPerfil(b.perfil));
          if (b.perfil.metas_projeto && comTreino) await r.salvarMetas(b.perfil.metas_projeto);
          if (b.perfil.exercicios_forca?.length && comTreino) await tolerar(r.salvarExerciciosForca(b.perfil.exercicios_forca));
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
          await tolerar(r.salvarAplicacao({ ...resto, ciclo_id: cicloId! }));
        }
        for (const d of plano.diario) {
          const { id: _id, ...resto } = d;
          await tolerar(r.salvarDiario(resto));
        }
        for (const m of plano.medidas) {
          const { id: _id, ...resto } = m;
          await tolerar(r.salvarMedida(resto));
        }
        if (comTreino) {
          for (const t of plano.treinos) {
            const { id: _id, ...resto } = t;
            await tolerar(r.salvarTreino(resto));
          }
          // Id novo: o do arquivo pode ser de outra conta
          for (const f of plano.forca) await tolerar(r.salvarForca({ ...f, id: crypto.randomUUID() }));
        }
        // Conta sem a aba Treino não tem "Pelo que fiz" (o backup pode vir de uma conta com Treino)
        if (b.dieta) await r.salvarDieta(comTreino ? b.dieta : { ...b.dieta, config: { ...b.dieta.config, usar_aderencia: false } });
        // Id novo: o banco é compartilhado entre contas e o id do backup pode já existir em outra
        if (plano.registro_decisoes.length && registroIndisponivel) {
          // Banco sem a tabela do registro: o resto já foi importado; avisa o que ficou de fora
          const aviso = 'o registro de decisões não foi importado: falta rodar o SQL de evolução no Supabase.';
          emParte = emParte ? `${emParte} Além disso, ${aviso}` : aviso;
        } else for (const d of plano.registro_decisoes) await tolerar(r.salvarRegistroDecisao({ ...d, id: crypto.randomUUID() }));
        for (const aviso of avisos) emParte = emParte ? `${emParte} ${aviso}` : aviso;
      });
      // Fotos: direto no IndexedDB deste aparelho (não passam pela nuvem)
      if (plano.fotos.length && usuario) {
        try {
          await importarFotos(usuario.id, plano.fotos);
        } catch (e) {
          const aviso = `as fotos não foram restauradas (${(e as Error).message})`;
          emParte = emParte ? `${emParte} Além disso, ${aviso}.` : `${aviso}.`;
        }
      }
      setImportacao(null);
      setMsgBackup(emParte ? { tipo: 'erro', texto: `Backup importado, com uma ressalva: ${emParte}` } : { tipo: 'info', texto: 'Backup importado.' });
    } catch (e) {
      // Uma mensagem só, no cartão (executar já tinha posto a mesma no aviso do topo)
      limparErro();
      setMsgBackup({
        tipo: 'erro',
        texto: `${(e as Error).message} A importação pode ter parado no meio: tocar em Importar agora de novo continua sem duplicar o que já foi gravado.`,
      });
    } finally {
      setImportando(false);
    }
  }

  return (
    <section className="cartao pilha">
      <div className="pf-acoes">
        <button className="pf-acao" onClick={() => void exportar()}>
          <span className="pf-icone pf-cor-azul">
            <Simbolo nome="backup" />
          </span>
          <span className="pf-acao-texto">
            <b>Exportar</b>
            <span>Salvar um arquivo</span>
          </span>
        </button>
        <button className="pf-acao" onClick={() => arquivo.current?.click()}>
          <span className="pf-icone pf-cor-neutro">
            <Simbolo nome="importar" />
          </span>
          <span className="pf-acao-texto">
            <b>Importar</b>
            <span>De um arquivo</span>
          </span>
        </button>
        <input
          ref={arquivo}
          type="file"
          accept="application/json,.json"
          className="oculto"
          onChange={(e) => e.target.files?.[0] && prepararImportacao(e.target.files[0])}
        />
      </div>
      {fotos.length > 0 && (
        <label className="marcar">
          <input type="checkbox" checked={comFotos} onChange={(e) => setComFotos(e.target.checked)} />
          <span>
            Incluir fotos no backup ({fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}, ~{textoTamanho(tamanhoFotos)})
            <small className="texto-2" style={{ display: 'block' }}>
              As fotos de antes e depois ficam só neste aparelho: o backup é a cópia delas para trocar de celular.
            </small>
          </span>
        </label>
      )}
      {importacao && (
        <div className="alerta info pilha" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <b>Backup de {dataDoBackup(importacao.backup.exportado_em)}.</b> Vai importar: {importacao.plano.aplicacoes.length} aplicação(ões),{' '}
            {importacao.plano.medidas.length} medição(ões), {importacao.plano.diario.length} dia(s) do diário
            {comTreino ? `, ${importacao.plano.treinos.length} dia(s) de treino` : ''}
            {importacao.plano.registro_decisoes.length > 0 ? `, ${importacao.plano.registro_decisoes.length} decisão(ões) registrada(s)` : ''}
            {importacao.plano.forca.length ? `, ${importacao.plano.forca.length} série(s) de força` : ''}
            {importacao.plano.fotos.length ? `, ${importacao.plano.fotos.length} foto(s) de antes e depois (ficam só neste aparelho)` : ''}
            {importacao.backup.dieta ? ' e o plano da dieta (substitui o atual)' : ''}.
            {(importacao.backup.perfil || importacao.backup.ciclo) && (
              <>
                {' '}
                <b>
                  Também substitui
                  {importacao.backup.perfil ? ` seus dados pessoais${comTreino && importacao.backup.perfil.metas_projeto ? ' e metas' : ''}` : ''}
                  {importacao.backup.perfil && importacao.backup.ciclo ? ' e' : ''}
                  {importacao.backup.ciclo ? ` o ciclo e o plano de doses (início em ${formatarData(importacao.backup.ciclo.data_inicio)})` : ''}.
                </b>
              </>
            )}
            {importacao.plano.ignoradas.aplicacoes + importacao.plano.ignoradas.medidas > 0 &&
              ` ${importacao.plano.ignoradas.aplicacoes + importacao.plano.ignoradas.medidas} registro(s) já existentes serão pulados.`}
            {importacao.plano.ignoradas.fotos > 0 && ` ${importacao.plano.ignoradas.fotos} foto(s) já existem neste aparelho e ficam como estão.`}
            {importacao.plano.ignoradas.fotos_conflito > 0 &&
              ` ${importacao.plano.ignoradas.fotos_conflito} foto(s) ficam de fora: a data inverteria a ordem com as fotos deste aparelho (Depois anterior ao Antes, ou Antes posterior ao Depois).`}
          </div>
          <div className="linha">
            <button className="botao primario pequeno" disabled={importando} onClick={() => void importar()}>
              {importando ? 'Importando…' : 'Importar agora'}
            </button>
            <button className="botao pequeno" disabled={importando} onClick={() => setImportacao(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {msgBackup && <div className={`alerta ${msgBackup.tipo}`}>{msgBackup.texto}</div>}
      <ComoFunciona>
        <p>
          {comTreino
            ? 'Exporta todos os seus dados (perfil e metas, ciclo, aplicações, diário, medidas, treinos, força, dieta e registro de decisões) em um arquivo. Ao importar, nada é duplicado: aplicações e medidas de datas que já existem são puladas, e diário e treino substituem o mesmo dia.'
            : 'Exporta todos os seus dados (perfil, ciclo, aplicações, diário, medidas, dieta e registro de decisões) em um arquivo. Ao importar, nada é duplicado: aplicações e medidas de datas que já existem são puladas, e o diário substitui o mesmo dia.'}
        </p>
      </ComoFunciona>
    </section>
  );
}

/* ---------- Página ---------- */

const SUBTITULOS: Record<Secao, string> = {
  dados: 'Nome, sexo, altura e nascimento',
  lembrete: 'Aviso no dia de cada dose',
  notificacoes: 'Permissão para receber os avisos',
  refeicoes: 'Aviso no horário de cada refeição do plano',
  calendario: 'As doses do ciclo no seu calendário',
  calibracao: 'Ajuste somado à fórmula US Navy',
  backup: 'Cópia de todos os seus dados em um arquivo',
};

export function Perfil() {
  const { perfil, medidas, usuario, repo, sair } = useDados();
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const local = useLocation();
  const secao = (Object.keys(SECOES) as Secao[]).find((s) => s === params.get('secao')) ?? null;
  // Estado das notificações sempre lido do aparelho (e de novo quando o app volta para a tela)
  const [estado, setEstado] = useState<EstadoNotificacao | null>(null);
  useEffect(() => {
    let vivo = true;
    const ler = () =>
      estadoNotificacao()
        .then((e) => vivo && setEstado(e))
        .catch(() => vivo && setEstado('sem-suporte'));
    void ler();
    const aoVoltar = () => document.visibilityState === 'visible' && void ler();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  // Subtela no endereço (?secao=): o "voltar" do celular também volta para a lista
  const rolagemLista = useRef(0);
  const abrir: Abrir = (s) => {
    if (!secao) rolagemLista.current = window.scrollY;
    navegar({ search: `?secao=${s}` }, { state: { de: secao ? CURTOS[secao] : 'Perfil' } });
  };
  const de = (local.state as { de?: string } | null)?.de;
  const voltar = () => (de ? navegar(-1) : setParams({}, { replace: true }));
  useLayoutEffect(() => {
    window.scrollTo({ top: secao ? 0 : rolagemLista.current });
  }, [secao]);

  if (!perfil) return null;

  if (secao) {
    return (
      <div className="pilha pf-subtela" key={secao}>
        <div className="pf-subcab">
          <button type="button" className="pf-voltar" onClick={voltar}>
            <Seta esquerda />
            {de ?? 'Perfil'}
          </button>
          <h2 className="pf-titulo">{SECOES[secao]}</h2>
          <p className="secao-sub">{SUBTITULOS[secao]}</p>
        </div>
        {secao === 'dados' && <SecaoDados perfil={perfil} email={usuario?.email} />}
        {secao === 'lembrete' && <SecaoLembrete perfil={perfil} estado={estado} abrir={abrir} />}
        {secao === 'notificacoes' && <SecaoNotificacoes estado={estado} setEstado={setEstado} perfil={perfil} abrir={abrir} />}
        {secao === 'refeicoes' && <LembreteRefeicoes perfil={perfil} estado={estado} abrir={abrir} />}
        {secao === 'calendario' && <SecaoCalendario perfil={perfil} />}
        {secao === 'calibracao' && <CartaoCalibracao perfil={perfil} />}
        {secao === 'backup' && <SecaoBackup />}
      </div>
    );
  }

  const notif = resumoNotificacao(estado);
  const linha = linhaPerfil(perfil, hojeLocal());
  const calendario = repo.modo === 'local' ? 'Só na nuvem' : perfil.token_calendario ? 'Assinar' : 'Não ativado';
  return (
    <div className="pilha pf-lista">
      <button type="button" className="cartao pf-cabecalho" onClick={() => abrir('dados')} aria-label={`Dados pessoais de ${perfil.nome}`}>
        <span className="pf-avatar" aria-hidden="true">
          {inicial(perfil.nome)}
        </span>
        <span className="pf-cabecalho-texto">
          <span className="pf-nome">{perfil.nome || 'Sem nome'}</span>
          {usuario?.email && <span className="pf-email">{usuario.email}</span>}
          {linha && <span className="pf-dados">{linha}</span>}
        </span>
        <Seta />
      </button>

      <Grupo titulo="Conta">
        <Linha icone="perfil" cor="neutro" rotulo="Dados pessoais" aoTocar={() => abrir('dados')} />
      </Grupo>

      <Grupo titulo="Avisos">
        <Linha icone="ciclo" cor="ambar" rotulo="Lembrete de aplicação" valor={resumoLembrete(perfil)} aoTocar={() => abrir('lembrete')} />
        <Linha
          icone="dieta"
          cor="verde"
          rotulo="Lembrete das refeições"
          valor={resumoRefeicoes(perfil, lerAntes(perfil.lembrete_refeicoes_antes))}
          aoTocar={() => abrir('refeicoes')}
        />
        <Linha icone="sino" cor="laranja" rotulo="Notificações" valor={notif.texto} tom={notif.tom} aoTocar={() => abrir('notificacoes')} />
        <Linha icone="diario" cor="azul" rotulo="Calendário do iPhone" valor={calendario} aoTocar={() => abrir('calendario')} />
      </Grupo>

      <Grupo titulo="Medidas">
        <Linha
          icone="gota"
          cor="neutro"
          rotulo="Calibração do % de gordura"
          sub={origemCalibracao(perfil)}
          valor={sinal(ajusteVigente(perfil, medidas), 1, ' p.p.')}
          aoTocar={() => abrir('calibracao')}
        />
      </Grupo>

      <Grupo titulo="Dados">
        <Linha icone="backup" cor="azul" rotulo="Backup" sub="Exportar e importar" aoTocar={() => abrir('backup')} />
      </Grupo>

      {repo.modo === 'local' && (
        <div className="alerta info pf-demo">Modo demonstração: dados salvos só neste navegador. Configure o Supabase para login real e sincronização.</div>
      )}

      <div className="pf-grupo">
        <button type="button" className="pf-linha pf-sair" onClick={() => void sair()}>
          Sair da conta
        </button>
      </div>

      <div className="pf-rodape">
        <p>Este app registra e calcula; decisões de dose devem ser tomadas com acompanhamento médico.</p>
        <p className="pf-versao">Versão {__VERSAO_APP__}</p>
      </div>
    </div>
  );
}
