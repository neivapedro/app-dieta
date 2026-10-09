import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { planoPadrao, type PlanoDieta } from '../lib/dieta';
import type { Aplicacao, Ciclo, Medida, Perfil, RegistroDiario, TreinoDia } from '../lib/tipos';
import { SUPABASE_KEY, SUPABASE_URL } from '../config';
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
  dieta: PlanoDieta | null;
  /** Mensagem quando a tabela da Dieta ainda não existe no banco */
  dietaIndisponivel: string | null;
}

const VAZIO: Dados = { perfil: null, ciclo: null, aplicacoes: [], diario: [], medidas: [], treinos: [], dieta: null, dietaIndisponivel: null };

export type EstadoGravacao = 'salvo' | 'salvando' | 'erro';

interface Contexto extends Dados {
  repo: Repositorio;
  usuario: Usuario | null;
  carregando: boolean;
  erro: string | null;
  /** Executa uma gravação e recarrega os dados */
  executar: (fn: (repo: Repositorio) => Promise<unknown>) => Promise<void>;
  /** Atualiza o plano na hora e grava em seguida (agrupando digitações rápidas) */
  salvarDieta: (p: PlanoDieta) => void;
  estadoDieta: EstadoGravacao;
}

const Ctx = createContext<Contexto | null>(null);

export function ProvedorDados({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [dados, setDados] = useState<Dados>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Plano da Dieta editado e ainda não gravado (não pode ser atropelado por uma recarga)
  const pendente = useRef<PlanoDieta | null>(null);

  const carregar = useCallback(async () => {
    const u = await repositorio.usuarioAtual();
    setUsuario(u);
    if (!u) {
      setDados(VAZIO);
      return;
    }
    const [perfil, ciclo, aplicacoes, diario, medidas] = await Promise.all([
      repositorio.obterPerfil(),
      repositorio.obterCiclo(),
      repositorio.listarAplicacoes(),
      repositorio.listarDiario(),
      repositorio.listarMedidas(),
    ]);
    // A aba Treino é opcional: só busca (e só exige a tabela) para quem a tem liberada
    const treinos = perfil?.modulo_treino ? await repositorio.listarTreinos() : [];
    // A Dieta não derruba o app se a migração ainda não rodou
    let dieta: PlanoDieta | null = null;
    let dietaIndisponivel: string | null = null;
    try {
      dieta = pendente.current ?? (await repositorio.obterDieta()) ?? planoPadrao();
    } catch (e) {
      dietaIndisponivel = e instanceof Error ? e.message : String(e);
    }
    setDados({ perfil, ciclo, aplicacoes, diario, medidas, treinos, dieta, dietaIndisponivel });
  }, []);

  useEffect(() => {
    let vivo = true;
    carregar()
      .catch((e) => vivo && setErro(String(e.message ?? e)))
      .finally(() => vivo && setCarregando(false));
    const parar = repositorio.aoMudarUsuario((u) => {
      setUsuario((anterior) => {
        if (anterior?.id !== u?.id) {
          setCarregando(true);
          carregar()
            .catch((e) => setErro(String(e.message ?? e)))
            .finally(() => setCarregando(false));
        }
        return u;
      });
    });
    return () => {
      vivo = false;
      parar();
    };
  }, [carregar]);

  const executar = useCallback(
    async (fn: (repo: Repositorio) => Promise<unknown>) => {
      setErro(null);
      try {
        await fn(repositorio);
        await carregar();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErro(msg);
        throw e;
      }
    },
    [carregar],
  );

  const [estadoDieta, setEstadoDieta] = useState<EstadoGravacao>('salvo');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const gravarDieta = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pendente.current;
    if (!p) return;
    pendente.current = null;
    try {
      await repositorio.salvarDieta(p);
      if (!pendente.current) setEstadoDieta('salvo');
    } catch {
      setEstadoDieta('erro');
    }
  }, []);

  const salvarDieta = useCallback(
    (p: PlanoDieta) => {
      setDados((d) => ({ ...d, dieta: p }));
      pendente.current = p;
      setEstadoDieta('salvando');
      clearTimeout(timer.current);
      timer.current = setTimeout(gravarDieta, 700);
    },
    [gravarDieta],
  );

  // Fechar o app logo depois de editar: grava o que estiver pendente
  useEffect(() => {
    const aoOcultar = () => document.visibilityState === 'hidden' && gravarDieta();
    document.addEventListener('visibilitychange', aoOcultar);
    return () => document.removeEventListener('visibilitychange', aoOcultar);
  }, [gravarDieta]);

  const valor = useMemo<Contexto>(
    () => ({ ...dados, repo: repositorio, usuario, carregando, erro, executar, salvarDieta, estadoDieta }),
    [dados, usuario, carregando, erro, executar, salvarDieta, estadoDieta],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDados(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDados fora do ProvedorDados');
  return c;
}
