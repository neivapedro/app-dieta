import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { configPadrao, type PlanoDieta } from '../lib/dieta';
import type { Aplicacao, Ciclo, Medida, MetasProjeto, Perfil, RegistroDiario, TreinoDia } from '../lib/tipos';
import { ehErroDeRede } from '../lib/erros';
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
  private chaveSessao: string;
  // O link de recuperação chega com #...type=recovery; o cliente limpa o endereço logo ao iniciar
  private abertoParaRecuperar = /type=recovery/.test(location.hash + location.search);

  constructor(url: string, chave: string) {
    this.sb = createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true } });
    this.chaveSessao = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  }

  /** Sessão guardada no aparelho: sem internet o token não renova, mas você continua logado. */
  private usuarioGuardado(): Usuario | null {
    try {
      const s = JSON.parse(localStorage.getItem(this.chaveSessao) ?? 'null');
      const u = s?.user ?? s?.currentSession?.user;
      return u?.id ? { id: u.id, email: u.email ?? '' } : null;
    } catch {
      return null;
    }
  }

  private async uid(): Promise<string> {
    const u = await this.usuarioAtual();
    if (!u) throw new Error('Sessão expirada. Entre novamente.');
    return u.id;
  }

  async usuarioAtual(): Promise<Usuario | null> {
    try {
      const { data, error } = await this.sb.auth.getSession();
      const u = data.session?.user;
      if (u) return { id: u.id, email: u.email ?? '' };
      // Falha de rede ao renovar o acesso não é "deslogado"
      if (error && ehErroDeRede(error)) return this.usuarioGuardado();
      return null;
    } catch (e) {
      if (ehErroDeRede(e)) return this.usuarioGuardado();
      throw e;
    }
  }

  aoRecuperarSenha(cb: () => void) {
    if (this.abertoParaRecuperar) setTimeout(cb, 0);
    const { data } = this.sb.auth.onAuthStateChange((e) => e === 'PASSWORD_RECOVERY' && cb());
    return () => data.subscription.unsubscribe();
  }

  async definirSenha(nova: string) {
    const { error } = await this.sb.auth.updateUser({ password: nova });
    if (error) throw new Error(error.message);
    this.abertoParaRecuperar = false;
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
      data_nascimento: d.data_nascimento ?? null,
      lembretes_ativos: d.lembretes_ativos,
      hora_lembrete: String(d.hora_lembrete).slice(0, 5),
      fuso_horario: d.fuso_horario,
      token_calendario: d.token_calendario ?? null,
      modulo_treino: d.modulo_treino === true,
      metas_projeto: d.metas_projeto ?? null,
    };
  }

  async salvarPerfil(p: Perfil) {
    // O token do calendário é gerado pelo banco; aqui ele não é sobrescrito
    // Token, liberação da aba Treino e metas têm gravação própria
    const { token_calendario: _token, modulo_treino: _modulo, metas_projeto: _metas, data_nascimento, ...dados } = p;
    const base = { user_id: await this.uid(), ...dados };
    // undefined = não mexer (ex.: backup antigo); null = apagar a data
    const linha: Record<string, unknown> = data_nascimento === undefined ? base : { ...base, data_nascimento };
    const r = await this.sb.from('perfis').upsert(linha);
    // Banco sem a coluna (migração da Dieta ainda não rodou): salva o resto
    if (r.error && /data_nascimento/.test(r.error.message)) erro(await this.sb.from('perfis').upsert(base));
    else erro(r);
  }

  async novoTokenCalendario(): Promise<string> {
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
    erro(await this.sb.from('perfis').update({ token_calendario: token }).eq('user_id', await this.uid()));
    return token;
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
    return d.map((r) => ({
      id: r.id,
      data: r.data,
      peso_kg: numOuNulo(r.peso_kg),
      nausea: r.nausea,
      observacoes: r.observacoes,
      vomito: r.vomito ?? null,
      diarreia: r.diarreia ?? null,
      intestino_preso: r.intestino_preso ?? null,
      dieta_seguida: r.dieta_seguida ?? null,
    }));
  }

  async salvarDiario(r: Omit<RegistroDiario, 'id'>) {
    const linha = { ...r, user_id: await this.uid() };
    const res = await this.sb.from('diario').upsert(linha, { onConflict: 'user_id,data' });
    // Banco sem as colunas novas (SQL de melhorias ainda não rodou): grava o básico
    if (res.error && /vomito|diarreia|intestino_preso|dieta_seguida/.test(res.error.message)) {
      const { vomito: _v, diarreia: _d, intestino_preso: _i, dieta_seguida: _s, ...basico } = linha;
      erro(await this.sb.from('diario').upsert(basico, { onConflict: 'user_id,data' }));
    } else erro(res);
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

  async salvarMetas(m: MetasProjeto) {
    erro(await this.sb.from('perfis').update({ metas_projeto: m }).eq('user_id', await this.uid()));
  }

  async listarTreinos(): Promise<TreinoDia[]> {
    const d = lista(await this.sb.from('treino_dias').select('*').order('data'));
    return d.map((t) => ({
      id: t.id,
      data: t.data,
      treino: t.treino,
      cardio: t.cardio,
      corrida_km: numOuNulo(t.corrida_km),
      corrida_seg: t.corrida_seg ?? null,
    }));
  }

  async salvarTreino(t: Omit<TreinoDia, 'id'>) {
    erro(await this.sb.from('treino_dias').upsert({ ...t, user_id: await this.uid() }, { onConflict: 'user_id,data' }));
  }

  async obterDieta(): Promise<PlanoDieta | null> {
    const d = erro(await this.sb.from('dieta_planos').select('config, refeicoes').maybeSingle());
    return d ? { config: { ...configPadrao(), ...d.config }, refeicoes: d.refeicoes ?? [] } : null;
  }

  async salvarDieta(p: PlanoDieta) {
    erro(
      await this.sb
        .from('dieta_planos')
        .upsert({ user_id: await this.uid(), config: p.config, refeicoes: p.refeicoes, atualizado_em: new Date().toISOString() }),
    );
  }
}
