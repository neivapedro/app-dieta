import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Aplicacao, Ciclo, Medida, Perfil, RegistroDiario } from '../lib/tipos';
import type { Repositorio, Usuario } from './repositorio';

// O isolamento entre contas é garantido no banco (Row Level Security, ver
// supabase/migrations): mesmo que o app pedisse dados de outra pessoa, o
// Postgres só devolve linhas com user_id = usuário autenticado.

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}
function numOuNulo(v: unknown): number | null {
  return v === null || v === undefined ? null : num(v);
}

function erro<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

function lista<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  return erro(r) ?? [];
}

export class RepositorioSupabase implements Repositorio {
  readonly modo = 'nuvem' as const;
  private sb: SupabaseClient;

  constructor(url: string, chave: string) {
    this.sb = createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  private async uid(): Promise<string> {
    const u = await this.usuarioAtual();
    if (!u) throw new Error('Sessão expirada. Entre novamente.');
    return u.id;
  }

  async usuarioAtual(): Promise<Usuario | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }

  aoMudarUsuario(cb: (u: Usuario | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, s) => cb(s?.user ? { id: s.user.id, email: s.user.email ?? '' } : null));
    return () => data.subscription.unsubscribe();
  }

  async entrar(email: string, senha: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  }

  async cadastrar(email: string, senha: string) {
    const { data, error } = await this.sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL } });
    if (error) throw new Error(error.message);
    return { confirmarEmail: !data.session };
  }

  async recuperarSenha(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + import.meta.env.BASE_URL });
    if (error) throw new Error(error.message);
  }

  async sair() {
    await this.sb.auth.signOut();
  }

  async obterPerfil(): Promise<Perfil | null> {
    const d = erro(await this.sb.from('perfis').select('*').maybeSingle());
    if (!d) return null;
    return {
      nome: d.nome ?? '',
      sexo: d.sexo,
      altura_cm: numOuNulo(d.altura_cm),
      lembretes_ativos: d.lembretes_ativos,
      hora_lembrete: String(d.hora_lembrete).slice(0, 5),
      fuso_horario: d.fuso_horario,
    };
  }

  async salvarPerfil(p: Perfil) {
    erro(await this.sb.from('perfis').upsert({ user_id: await this.uid(), ...p }));
  }

  async obterCiclo(): Promise<Ciclo | null> {
    const d = erro(await this.sb.from('ciclos').select('*').eq('ativo', true).order('criado_em', { ascending: false }).limit(1).maybeSingle());
    if (!d) return null;
    return {
      id: d.id,
      nome: d.nome,
      data_inicio: d.data_inicio,
      quantidade_total_mg: num(d.quantidade_total_mg),
      concentracao_mg_ml: num(d.concentracao_mg_ml),
      intervalo_dias: d.intervalo_dias,
      passo_ui: num(d.passo_ui),
      fases: d.fases,
    };
  }

  async salvarCiclo(c: Omit<Ciclo, 'id'> & { id?: string }): Promise<Ciclo> {
    const d = erro(await this.sb.from('ciclos').upsert({ ...c, user_id: await this.uid(), ativo: true }).select('id').single());
    return { ...c, id: d!.id } as Ciclo;
  }

  async listarAplicacoes(): Promise<Aplicacao[]> {
    const d = lista(await this.sb.from('aplicacoes').select('*').order('data'));
    return d.map((a) => ({ id: a.id, ciclo_id: a.ciclo_id, data: a.data, dose_mg: num(a.dose_mg), local: a.local, observacoes: a.observacoes }));
  }

  async salvarAplicacao(a: Omit<Aplicacao, 'id'> & { id?: string }) {
    erro(await this.sb.from('aplicacoes').upsert({ ...a, user_id: await this.uid() }));
  }

  async excluirAplicacao(id: string) {
    erro(await this.sb.from('aplicacoes').delete().eq('id', id));
  }

  async listarDiario(): Promise<RegistroDiario[]> {
    const d = lista(await this.sb.from('diario').select('*').order('data'));
    return d.map((r) => ({ id: r.id, data: r.data, peso_kg: numOuNulo(r.peso_kg), nausea: r.nausea, observacoes: r.observacoes }));
  }

  async salvarDiario(r: Omit<RegistroDiario, 'id'>) {
    erro(await this.sb.from('diario').upsert({ ...r, user_id: await this.uid() }, { onConflict: 'user_id,data' }));
  }

  async excluirDiario(id: string) {
    erro(await this.sb.from('diario').delete().eq('id', id));
  }

  async listarMedidas(): Promise<Medida[]> {
    const d = lista(await this.sb.from('medidas').select('*').order('data'));
    return d.map((m) => ({
      id: m.id,
      data: m.data,
      altura_cm: num(m.altura_cm),
      pescoco_cm: num(m.pescoco_cm),
      cintura_cm: num(m.cintura_cm),
      quadril_cm: numOuNulo(m.quadril_cm),
      peso_kg: num(m.peso_kg),
    }));
  }

  async salvarMedida(m: Omit<Medida, 'id'> & { id?: string }) {
    erro(await this.sb.from('medidas').upsert({ ...m, user_id: await this.uid() }));
  }

  async excluirMedida(id: string) {
    erro(await this.sb.from('medidas').delete().eq('id', id));
  }

  async salvarInscricaoPush(i: { endpoint: string; p256dh: string; auth: string }) {
    erro(await this.sb.from('inscricoes_push').upsert({ ...i, user_id: await this.uid() }, { onConflict: 'endpoint' }));
  }

  async removerInscricaoPush(endpoint: string) {
    erro(await this.sb.from('inscricoes_push').delete().eq('endpoint', endpoint));
  }
}
