import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { planoPadrao, type PlanoDieta } from '../lib/dieta';
import { hojeLocal } from '../lib/datas';
import { ehErroDeRede, ehSessaoExpirada, traduzirErro } from '../lib/erros';
import { esquecerAparelho, sincronizarInscricao } from '../lib/notificacoes';
import { alteracoesDasDecisoesFase, compararDieta, mesclarAlteracoes, type Alteracao } from '../lib/registroDecisoes';
import type { Aplicacao, Ciclo, Medida, Perfil, RegistroDecisao, RegistroDiario, RegistroForca, TreinoDia } from '../lib/tipos';
import { SUPABASE_KEY, SUPABASE_URL } from '../config';
import { apagarDadosLocais, aplicarFila, enfileirar, executarOperacao, gravarCache, gravarFila, lerCache, lerFila, type ItemFila, type Operacao } from './fila';
import { RepositorioLocal } from './local';
import type { Repositorio, Usuario } from './repositorio';
import { RepositorioSupabase } from './supabase';

export const repositorio: Repositorio =
  SUPABASE_URL && SUPABASE_KEY && !import.meta.env.VITE_DEMO ? new RepositorioSupabase(SUPABASE_URL, SUPABASE_KEY) : new RepositorioLocal();

export interface Dados {
  perfil: Perfil | null;
  ciclo: Ciclo | null;
  aplicacoes: Aplicacao[];
  diario: RegistroDiario[];
  medidas: Medida[];
  treinos: TreinoDia[];
  /** Força nos exercícios-âncora (só para quem tem a aba Treino) */
  forca: RegistroForca[];
  dieta: PlanoDieta | null;
  /** Mensagem quando a tabela da Dieta ainda não existe no banco */
  dietaIndisponivel: string | null;
  /** Registro de decisões (mudanças de déficit, fator, fases, metas, dose) */
  registroDecisoes: RegistroDecisao[];
  /** A tabela do registro ainda não existe no banco (falta o SQL de evolução) */
  registroIndisponivel?: boolean;
}

const VAZIO: Dados = {
  perfil: null,
  ciclo: null,
  aplicacoes: [],
  diario: [],
  medidas: [],
  treinos: [],
  forca: [],
  dieta: null,
  dietaIndisponivel: null,
  registroDecisoes: [],
};

/** salvo · salvando · pendente (sem internet, na fila) · erro */
export type EstadoGravacao = 'salvo' | 'salvando' | 'pendente' | 'erro';

interface Contexto extends Dados {
  repo: Repositorio;
  usuario: Usuario | null;
  carregando: boolean;
  erro: string | null;
  limparErro: () => void;
  /** Sem conexão: mostrando a última cópia guardada no aparelho (data/hora ISO) */
  offlineDesde: string | null;
  /** Abriu sem internet e sem cópia guardada */
  semConexao: boolean;
  /** A última carga falhou (não confundir com conta nova sem perfil) */
  falhouCarregar: boolean;
  /** Gravações guardadas no aparelho esperando internet */
  pendentes: number;
  /** Link de recuperação de senha aberto: mostrar a tela de nova senha */
  recuperandoSenha: boolean;
  encerrarRecuperacao: () => void;
  recarregar: () => Promise<void>;
  /** Sai da conta: o aparelho para de receber os lembretes dela e a cópia local é apagada */
  sair: () => Promise<void>;
  /** Executa uma gravação e recarrega os dados */
  executar: (fn: (repo: Repositorio) => Promise<unknown>) => Promise<void>;
  /** Grava pela fila: a tela muda na hora e o envio funciona mesmo sem internet */
  gravar: (op: Operacao) => void;
  /** Atualiza o plano na hora e grava em seguida (agrupando digitações rápidas) */
  salvarDieta: (p: PlanoDieta) => void;
  estadoDieta: EstadoGravacao;
  /** Guarda mudanças no registro de decisões (Plano e metas, que não passam pela fila) */
  registrarAlteracoes: (alteracoes: Alteracao[]) => void;
  /** Data de hoje (vira à meia-noite mesmo com o app aberto ou em segundo plano) */
  hoje: string;
  /** Muda a cada minuto e ao voltar ao app: para o que depende da hora (próxima refeição) */
  tique: number;
}

const Ctx = createContext<Contexto | null>(null);

export function ProvedorDados({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [dados, setDados] = useState<Dados>(VAZIO);
  // Cópia síncrona do estado: o registro de decisões compara com o valor de
  // antes mesmo com várias gravações seguidas antes de a tela redesenhar
  const dadosRef = useRef<Dados>(VAZIO);
  const mudarDados = useCallback((fn: (d: Dados) => Dados) => {
    dadosRef.current = fn(dadosRef.current);
    setDados(dadosRef.current);
  }, []);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErroBruto] = useState<string | null>(null);
  const [offlineDesde, setOfflineDesde] = useState<string | null>(null);
  const [semConexao, setSemConexao] = useState(false);
  const [recuperandoSenha, setRecuperandoSenha] = useState(false);
  const [hoje, setHoje] = useState(hojeLocal);
  const [tique, setTique] = useState(0);
  const carregouNaSessao = useRef(false);
  const [falhouCarregar, setFalhouCarregar] = useState(false);

  const uid = useRef<string | null>(null);
  const fila = useRef<ItemFila[]>([]);
  const versao = useRef(0);
  const [pendentes, setPendentes] = useState(0);
  const [falhaRede, setFalhaRede] = useState(false);
  const [erroDieta, setErroDieta] = useState(false);
  const enviando = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timerErro = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Mensagens de erro somem sozinhas depois de alguns segundos
  const setErro = useCallback((msg: string | null) => {
    setErroBruto(msg);
    clearTimeout(timerErro.current);
    if (msg) timerErro.current = setTimeout(() => setErroBruto(null), 8000);
  }, []);

  const atualizarFila = useCallback((nova: ItemFila[]) => {
    fila.current = nova;
    if (uid.current) gravarFila(uid.current, nova);
    setPendentes(nova.length);
  }, []);

  const carregar = useCallback(async () => {
    const u = await repositorio.usuarioAtual();
    setUsuario(u);
    if (!u) {
      uid.current = null;
      mudarDados(() => VAZIO);
      return;
    }
    if (uid.current !== u.id) {
      uid.current = u.id;
      fila.current = lerFila(u.id);
      // O contador continua de onde a fila guardada parou (senão uma edição nova
      // ganharia a mesma versão de um item antigo e sairia da fila sem ser enviada)
      versao.current = Math.max(versao.current, 0, ...fila.current.map((i) => i.versao));
      setPendentes(fila.current.length);
    }
    let base: Dados;
    try {
      const [perfil, ciclo, aplicacoes, diario, medidas] = await Promise.all([
        repositorio.obterPerfil(),
        repositorio.obterCiclo(),
        repositorio.listarAplicacoes(),
        repositorio.listarDiario(),
        repositorio.listarMedidas(),
      ]);
      // A aba Treino é opcional: só busca (e só exige a tabela) para quem a tem liberada
      const treinos = perfil?.modulo_treino ? await repositorio.listarTreinos() : [];
      // Força: tabela do SQL de evolução (sem ela, lista vazia)
      const forca = perfil?.modulo_treino ? await repositorio.listarForca() : [];
      // A Dieta não derruba o app se a migração ainda não rodou
      let dieta: PlanoDieta | null = null;
      let dietaIndisponivel: string | null = null;
      try {
        dieta = (await repositorio.obterDieta()) ?? planoPadrao(!!perfil?.modulo_treino);
      } catch (e) {
        if (ehErroDeRede(e)) throw e;
        dietaIndisponivel = e instanceof Error ? e.message : String(e);
      }
      // O registro de decisões também é opcional (tabela da evolução)
      const registro = await repositorio.listarRegistroDecisoes().catch((e) => {
        if (ehErroDeRede(e)) throw e;
        return null;
      });
      base = {
        perfil,
        ciclo,
        aplicacoes,
        diario,
        medidas,
        treinos,
        forca,
        dieta,
        dietaIndisponivel,
        registroDecisoes: registro ?? [],
        registroIndisponivel: registro === null,
      };
      setFalhouCarregar(false);
      if (repositorio.modo === 'nuvem') gravarCache(u.id, base);
      carregouNaSessao.current = true;
      setOfflineDesde(null);
      setSemConexao(false);
    } catch (e) {
      if (!ehErroDeRede(e)) throw e;
      // Já carregou nesta sessão: a tela tem dados mais novos que a cópia guardada
      if (carregouNaSessao.current) {
        setOfflineDesde((d) => d ?? new Date().toISOString());
        return;
      }
      // Sem internet (ou servidor pausado): abre com a última cópia guardada
      const cache = lerCache<Dados>(u.id);
      if (!cache) {
        setSemConexao(true);
        return;
      }
      // Cópia guardada por uma versão anterior pode não ter a força nem o registro de decisões: começam vazios
      base = { ...cache.dados, forca: cache.dados.forca ?? [], registroDecisoes: cache.dados.registroDecisoes ?? [] };
      setOfflineDesde(cache.em);
    }
    mudarDados(() => aplicarFila(base, fila.current));
  }, [mudarDados]);

  // Envia a fila, uma operação de cada vez
  const processarFila = useCallback(async () => {
    clearTimeout(timer.current);
    if (enviando.current || !fila.current.length) return;
    enviando.current = true;
    let enviou = false;
    let esperar = false;
    try {
      while (fila.current.length) {
        const item = fila.current[0];
        try {
          await executarOperacao(repositorio, item);
          enviou = true;
          if (item.tipo === 'dieta') setErroDieta(false);
          // A cópia offline já leva o que foi enviado (mesmo que a recarga falhe depois)
          if (uid.current && repositorio.modo === 'nuvem') {
            const c = lerCache<Dados>(uid.current);
            if (c) gravarCache(uid.current, aplicarFila(c.dados, [item]), c.em);
          }
          // Só sai da fila se não foi substituída por uma edição mais nova durante o envio
          atualizarFila(fila.current.filter((i) => !(i.chave === item.chave && i.versao === item.versao)));
        } catch (e) {
          if (ehErroDeRede(e)) {
            esperar = true;
            setFalhaRede(true);
            timer.current = setTimeout(() => void processarFila(), 15000);
            return;
          }
          // Acesso vencido: guarda tudo e espera o novo login (que reenvia a fila)
          if (ehSessaoExpirada(e)) {
            esperar = true;
            setErro('Sessão expirada. Entre novamente: o que você marcou continua guardado no aparelho.');
            return;
          }
          // Erro de dados: descarta a operação e mostra o motivo
          atualizarFila(fila.current.filter((i) => i !== item));
          if (item.tipo === 'dieta') setErroDieta(true);
          setErro(traduzirErro(e));
          await carregar().catch(() => undefined);
        }
      }
      setFalhaRede(false);
      // Ao esvaziar a fila, sincroniza com o servidor (ids definitivos)
      if (enviou) await carregar().catch(() => undefined);
    } finally {
      enviando.current = false;
      // Algo gravado durante a recarga final: envia também
      if (!esperar && fila.current.length) void processarFila();
    }
  }, [atualizarFila, carregar, setErro]);

  /** Operações do registro de decisões para as mudanças (mesmo dia e campo: uma linha só). */
  const opsDoRegistro = useCallback((alteracoes: Alteracao[], refsRemovidas: string[] = []): Operacao[] => {
    if (!alteracoes.length && !refsRemovidas.length) return [];
    const m = mesclarAlteracoes(dadosRef.current.registroDecisoes ?? [], alteracoes, hojeLocal(), () => crypto.randomUUID(), refsRemovidas);
    return [
      ...m.excluir.map((r): Operacao => ({ tipo: 'excluir', dado: { alvo: 'registro_decisao', id: r.id, data: r.data } })),
      ...m.salvar.map((r): Operacao => ({ tipo: 'registro_decisao', dado: r })),
    ];
  }, []);

  /** Mudanças que a operação provoca no registro de decisões (Dieta e decisões do fim de fase). */
  const registroDaOperacao = useCallback(
    (op: Operacao): Operacao[] => {
      const atual = dadosRef.current;
      if (op.tipo === 'dieta' && atual.dieta) return opsDoRegistro(compararDieta(atual.dieta.config, op.dado.config));
      if (op.tipo === 'decisoes' && atual.ciclo && atual.ciclo.id === op.dado.ciclo_id) {
        const { novas, removidas } = alteracoesDasDecisoesFase(atual.ciclo.decisoes ?? [], op.dado.decisoes, op.dado.fases);
        return opsDoRegistro(novas, removidas);
      }
      return [];
    },
    [opsDoRegistro],
  );

  const enfileirarVarias = useCallback(
    (ops: Operacao[], atraso = 0) => {
      let nova = fila.current;
      for (const op of ops) nova = enfileirar(nova, op, ++versao.current);
      atualizarFila(nova);
      mudarDados((d) => aplicarFila(d, ops.map((op) => ({ ...op, chave: '', versao: 0 }))));
      clearTimeout(timer.current);
      if (atraso) timer.current = setTimeout(() => void processarFila(), atraso);
      else void processarFila();
    },
    [atualizarFila, mudarDados, processarFila],
  );

  const gravar = useCallback(
    (op: Operacao, atraso = 0) => enfileirarVarias([op, ...registroDaOperacao(op)], atraso),
    [enfileirarVarias, registroDaOperacao],
  );

  const registrarAlteracoes = useCallback(
    (alteracoes: Alteracao[]) => {
      const ops = opsDoRegistro(alteracoes);
      if (ops.length) enfileirarVarias(ops);
    },
    [enfileirarVarias, opsDoRegistro],
  );

  const salvarDieta = useCallback((p: PlanoDieta) => gravar({ tipo: 'dieta', dado: p }, 700), [gravar]);

  useEffect(() => {
    let vivo = true;
    const parar = repositorio.aoMudarUsuario((u) => {
      setUsuario((anterior) => {
        if (anterior?.id !== u?.id) {
          setCarregando(true);
          carregar()
            .then(() => processarFila())
            .catch((e) => {
              setFalhouCarregar(true);
              setErro(traduzirErro(e));
            })
            .finally(() => setCarregando(false));
        }
        return u;
      });
    });
    const pararRecuperacao = repositorio.aoRecuperarSenha(() => setRecuperandoSenha(true));
    carregar()
      .then(() => processarFila())
      .catch((e) => {
        if (!vivo) return;
        setFalhouCarregar(true);
        setErro(traduzirErro(e));
      })
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
      parar();
      pararRecuperacao();
    };
  }, [carregar, processarFila, setErro]);

  // A data vira à meia-noite mesmo com o app aberto, e ao voltar do segundo plano
  useEffect(() => {
    const conferir = () => {
      setHoje((h) => (h === hojeLocal() ? h : hojeLocal()));
      setTique((t) => t + 1);
    };
    const id = setInterval(conferir, 60000);
    window.addEventListener('focus', conferir);
    window.addEventListener('pageshow', conferir);
    document.addEventListener('visibilitychange', conferir);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', conferir);
      window.removeEventListener('pageshow', conferir);
      document.removeEventListener('visibilitychange', conferir);
    };
  }, []);

  // Internet de volta ou app reaberto: envia a fila e atualiza os dados
  useEffect(() => {
    const voltar = () => {
      if (!uid.current) return;
      void processarFila();
      if (offlineDesde || semConexao) void carregar().catch(() => undefined);
    };
    const visibilidade = () => (document.visibilityState === 'hidden' ? void processarFila() : voltar());
    window.addEventListener('online', voltar);
    document.addEventListener('visibilitychange', visibilidade);
    return () => {
      window.removeEventListener('online', voltar);
      document.removeEventListener('visibilitychange', visibilidade);
    };
  }, [processarFila, carregar, offlineDesde, semConexao]);

  // Confere uma vez por sessão se este aparelho está cadastrado para receber os lembretes desta conta
  useEffect(() => {
    if (usuario && repositorio.modo === 'nuvem' && !offlineDesde) void sincronizarInscricao(repositorio).catch(() => undefined);
  }, [usuario, offlineDesde]);

  const executar = useCallback(
    async (fn: (repo: Repositorio) => Promise<unknown>) => {
      setErro(null);
      try {
        await fn(repositorio);
        await carregar();
      } catch (e) {
        setErro(traduzirErro(e));
        throw new Error(traduzirErro(e));
      }
    },
    [carregar, setErro],
  );

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      await carregar();
      await processarFila();
    } catch (e) {
      setFalhouCarregar(true);
      setErro(traduzirErro(e));
    } finally {
      setCarregando(false);
    }
  }, [carregar, processarFila, setErro]);

  const sair = useCallback(async () => {
    await esquecerAparelho(repositorio).catch(() => undefined);
    try {
      await repositorio.sair();
    } catch (e) {
      setErro(`Não foi possível sair: ${traduzirErro(e)}`);
      return;
    }
    // Só apaga a cópia do aparelho depois de sair de fato
    if (uid.current) apagarDadosLocais(uid.current);
    uid.current = null;
    carregouNaSessao.current = false;
    setUsuario(null);
    mudarDados(() => VAZIO);
  }, [setErro, mudarDados]);

  const temDieta = fila.current.some((i) => i.tipo === 'dieta');
  const estadoDieta: EstadoGravacao = temDieta ? (falhaRede ? 'pendente' : 'salvando') : erroDieta ? 'erro' : 'salvo';

  const valor = useMemo<Contexto>(
    () => ({
      ...dados,
      repo: repositorio,
      usuario,
      carregando,
      erro,
      limparErro: () => setErro(null),
      offlineDesde,
      semConexao,
      falhouCarregar,
      pendentes,
      recuperandoSenha,
      encerrarRecuperacao: () => setRecuperandoSenha(false),
      recarregar,
      sair,
      executar,
      gravar: (op: Operacao) => gravar(op),
      salvarDieta,
      estadoDieta,
      registrarAlteracoes,
      hoje,
      tique,
    }),
    [dados, usuario, carregando, erro, setErro, offlineDesde, semConexao, falhouCarregar, pendentes, recuperandoSenha, recarregar, sair, executar, gravar, salvarDieta, estadoDieta, registrarAlteracoes, hoje, tique],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDados(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDados fora do ProvedorDados');
  return c;
}
