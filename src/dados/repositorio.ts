import type { Aplicacao, Ciclo, Medida, Perfil, RegistroDiario } from '../lib/tipos';

export interface Usuario {
  id: string;
  email: string;
}

export interface InscricaoPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Tudo que o app lê e grava. Cada implementação só enxerga os dados do usuário logado. */
export interface Repositorio {
  readonly modo: 'nuvem' | 'local';

  usuarioAtual(): Promise<Usuario | null>;
  aoMudarUsuario(cb: (u: Usuario | null) => void): () => void;
  entrar(email: string, senha: string): Promise<void>;
  cadastrar(email: string, senha: string): Promise<{ confirmarEmail: boolean }>;
  recuperarSenha(email: string): Promise<void>;
  sair(): Promise<void>;

  obterPerfil(): Promise<Perfil | null>;
  salvarPerfil(p: Perfil): Promise<void>;

  obterCiclo(): Promise<Ciclo | null>;
  salvarCiclo(c: Omit<Ciclo, 'id'> & { id?: string }): Promise<Ciclo>;

  listarAplicacoes(): Promise<Aplicacao[]>;
  salvarAplicacao(a: Omit<Aplicacao, 'id'> & { id?: string }): Promise<void>;
  excluirAplicacao(id: string): Promise<void>;

  listarDiario(): Promise<RegistroDiario[]>;
  /** Um registro por dia: grava por cima se a data já existir */
  salvarDiario(r: Omit<RegistroDiario, 'id'>): Promise<void>;
  excluirDiario(id: string): Promise<void>;

  listarMedidas(): Promise<Medida[]>;
  salvarMedida(m: Omit<Medida, 'id'> & { id?: string }): Promise<void>;
  excluirMedida(id: string): Promise<void>;

  salvarInscricaoPush(i: InscricaoPush): Promise<void>;
  removerInscricaoPush(endpoint: string): Promise<void>;
}
