import { lerConfigDieta, type PlanoDieta } from '../lib/dieta';
import type { Aplicacao, Ciclo, Medida, MetasProjeto, Perfil, RegistroDecisao, RegistroDiario, RegistroForca, TreinoDia } from '../lib/tipos';
import type { DecisoesCiclo, Repositorio, Usuario } from './repositorio';

// Modo de demonstração: usado quando o Supabase ainda não foi configurado.
// Guarda tudo no navegador, separado por e-mail. NÃO é seguro nem sincroniza
// entre aparelhos; serve só para testar o app antes de ligar a nuvem.

interface Banco {
  perfil: Perfil | null;
  ciclo: Ciclo | null;
  aplicacoes: Aplicacao[];
  diario: RegistroDiario[];
  medidas: Medida[];
  treinos?: TreinoDia[];
  forca?: RegistroForca[];
  dieta?: PlanoDieta | null;
  registro_decisoes?: RegistroDecisao[];
}

const CHAVE_SESSAO = 'app-dieta:sessao';

function novoId(): string {
  return crypto.randomUUID();
}

function ler<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* armazenamento indisponível */
  }
}

export class RepositorioLocal implements Repositorio {
  readonly modo = 'local' as const;
  private ouvintes = new Set<(u: Usuario | null) => void>();

  private get usuario(): Usuario | null {
    return ler<Usuario | null>(CHAVE_SESSAO, null);
  }

  private chaveBanco(): string {
    const u = this.usuario;
    if (!u) throw new Error('Sessão expirada. Entre novamente.');
    return `app-dieta:banco:${u.email.toLowerCase()}`;
  }

  private banco(): Banco {
    return ler<Banco>(this.chaveBanco(), { perfil: null, ciclo: null, aplicacoes: [], diario: [], medidas: [] });
  }

  private alterar(fn: (b: Banco) => void) {
    const b = this.banco();
    fn(b);
    gravar(this.chaveBanco(), b);
  }

  private avisar() {
    for (const cb of this.ouvintes) cb(this.usuario);
  }

  async usuarioAtual() {
    return this.usuario;
  }

  aoMudarUsuario(cb: (u: Usuario | null) => void) {
    this.ouvintes.add(cb);
    return () => this.ouvintes.delete(cb);
  }

  async entrar(email: string, senha: string) {
    if (!email.includes('@') || senha.length < 6) throw new Error('Informe um e-mail válido e senha com 6+ caracteres.');
    gravar(CHAVE_SESSAO, { id: email.toLowerCase(), email });
    this.avisar();
  }

  async cadastrar(email: string, senha: string) {
    await this.entrar(email, senha);
    return { confirmarEmail: false };
  }

  async recuperarSenha() {
    throw new Error('Recuperação de senha só funciona com a nuvem configurada.');
  }

  aoRecuperarSenha() {
    return () => undefined;
  }

  async definirSenha() {
    throw new Error('Troca de senha só funciona com a nuvem configurada.');
  }

  async sair() {
    localStorage.removeItem(CHAVE_SESSAO);
    this.avisar();
  }

  async obterPerfil() {
    return this.banco().perfil;
  }
  async salvarPerfil(p: Perfil) {
    // Preserva a liberação da aba Treino e as metas, como no banco; campos
    // ausentes (backup antigo) não apagam a calibração do % de gordura
    this.alterar((b) => {
      const manter = <K extends keyof Perfil>(k: K) => (p[k] === undefined ? (b.perfil?.[k] ?? null) : p[k]);
      b.perfil = {
        ...p,
        modulo_treino: b.perfil?.modulo_treino,
        metas_projeto: b.perfil?.metas_projeto,
        exercicios_forca: b.perfil?.exercicios_forca,
        data_nascimento: manter('data_nascimento') as string | null,
        ajuste_gordura: manter('ajuste_gordura') as number | null,
        exame_gordura_data: manter('exame_gordura_data') as string | null,
        exame_gordura_bf: manter('exame_gordura_bf') as number | null,
      };
    });
  }

  async obterCiclo() {
    return this.banco().ciclo;
  }
  async salvarCiclo(c: Omit<Ciclo, 'id'> & { id?: string }) {
    let ciclo = { ...c, id: c.id ?? novoId() } as Ciclo;
    this.alterar((b) => {
      // Como o upsert do Supabase: campo ausente (backup antigo) não apaga o que já está salvo no mesmo ciclo
      if (b.ciclo && b.ciclo.id === ciclo.id) {
        const definidos = Object.fromEntries(Object.entries(ciclo).filter(([, v]) => v !== undefined));
        ciclo = { ...b.ciclo, ...definidos } as Ciclo;
      }
      b.ciclo = ciclo;
    });
    return ciclo;
  }
  async salvarDecisoes(d: DecisoesCiclo) {
    this.alterar((b) => {
      if (b.ciclo && b.ciclo.id === d.ciclo_id) b.ciclo = { ...b.ciclo, decisoes: d.decisoes, fases: d.fases };
    });
  }

  async listarAplicacoes() {
    return this.banco().aplicacoes;
  }
  async salvarAplicacao(a: Omit<Aplicacao, 'id'> & { id?: string }) {
    this.alterar((b) => upsert(b.aplicacoes, { ...a, id: a.id ?? novoId() }));
  }
  async excluirAplicacao(id: string) {
    this.alterar((b) => (b.aplicacoes = b.aplicacoes.filter((x) => x.id !== id)));
  }

  async listarDiario() {
    return this.banco().diario;
  }
  async salvarDiario(r: Omit<RegistroDiario, 'id'>) {
    this.alterar((b) => {
      const existente = b.diario.find((x) => x.data === r.data);
      upsert(b.diario, { ...r, id: existente?.id ?? novoId() });
    });
  }
  async excluirDiario(id: string) {
    this.alterar((b) => (b.diario = b.diario.filter((x) => x.id !== id && `pendente:${x.data}` !== id)));
  }

  async listarMedidas() {
    return this.banco().medidas;
  }
  async salvarMedida(m: Omit<Medida, 'id'> & { id?: string }) {
    this.alterar((b) => upsert(b.medidas, { ...m, id: m.id ?? novoId() }));
  }
  async excluirMedida(id: string) {
    this.alterar((b) => (b.medidas = b.medidas.filter((x) => x.id !== id)));
  }

  async salvarInscricaoPush() {
    /* sem servidor, não há envio de push agendado */
  }
  async removerInscricaoPush() {}

  async salvarMetas(m: MetasProjeto) {
    this.alterar((b) => b.perfil && (b.perfil.metas_projeto = m));
  }

  async listarTreinos() {
    return this.banco().treinos ?? [];
  }

  async salvarTreino(t: Omit<TreinoDia, 'id'>) {
    this.alterar((b) => {
      b.treinos ??= [];
      const existente = b.treinos.find((x) => x.data === t.data);
      upsert(b.treinos, { ...t, id: existente?.id ?? novoId() });
    });
  }

  async listarForca() {
    return this.banco().forca ?? [];
  }

  async salvarForca(r: RegistroForca) {
    this.alterar((b) => {
      b.forca ??= [];
      upsert(b.forca, r);
    });
  }

  async excluirForca(id: string) {
    this.alterar((b) => (b.forca = (b.forca ?? []).filter((x) => x.id !== id)));
  }

  async salvarExerciciosForca(lista: string[] | null) {
    this.alterar((b) => b.perfil && (b.perfil.exercicios_forca = lista));
  }

  async obterDieta() {
    const d = this.banco().dieta;
    return d ? { ...d, config: lerConfigDieta(d.config) } : null;
  }

  async salvarDieta(p: PlanoDieta) {
    // Sem campos antigos (ex.: backup de versão anterior)
    this.alterar((b) => (b.dieta = { ...p, config: lerConfigDieta(p.config) }));
  }

  async listarRegistroDecisoes() {
    return [...(this.banco().registro_decisoes ?? [])].sort((a, b) => a.data.localeCompare(b.data));
  }

  async salvarRegistroDecisao(r: RegistroDecisao) {
    this.alterar((b) => {
      b.registro_decisoes ??= [];
      upsert(b.registro_decisoes, r);
    });
  }

  async excluirRegistroDecisao(id: string) {
    this.alterar((b) => (b.registro_decisoes = (b.registro_decisoes ?? []).filter((x) => x.id !== id)));
  }

  async novoTokenCalendario(): Promise<string> {
    throw new Error('O calendário só funciona com a nuvem configurada.');
  }
}

function upsert<T extends { id: string }>(lista: T[], item: T) {
  const i = lista.findIndex((x) => x.id === item.id);
  if (i >= 0) lista[i] = item;
  else lista.push(item);
}
