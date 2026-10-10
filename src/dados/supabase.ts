import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { configPadrao, type PlanoDieta } from '../lib/dieta';
import { tipoCardioEfetivo } from '../lib/treino';
import type { Aplicacao, Ciclo, Medida, MetasProjeto, Perfil, RegistroDiario, RegistroForca, TreinoDia } from '../lib/tipos';
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

/** Erro do servidor com o status HTTP e o código do PostgREST (para separar falha temporária de erro de dados). */
export class ErroServidor extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(mensagem);
  }
}

function erro<T>(r: { data: T; error: { message: string; code?: string } | null; status?: number }): T {
  if (r.error) throw new ErroServidor(r.error.message, r.status, r.error.code);
  return r.data;
}

function lista<T>(r: { data: T[] | null; error: { message: string; code?: string } | null; status?: number }): T[] {
  return erro(r) ?? [];
}

/** Coluna ou tabela que ainda não existe no banco (SQL de evolução não rodou). */
function faltaNoBanco(e: { message: string; code?: string } | null, coluna: RegExp): boolean {
  if (!e) return false;
  const codigo = ['PGRST204', 'PGRST205', '42703', '42P01'].includes(e.code ?? '');
  return (codigo || /does not exist|Could not find/i.test(e.message)) && coluna.test(e.message);
}

const AVISO_EVOLUCAO = 'falta rodar o SQL de evolução no Supabase.';

function sem<T extends Record<string, unknown>>(linha: T, chaves: readonly string[]): Partial<T> {
  return Object.fromEntries(Object.entries(linha).filter(([k]) => !chaves.includes(k))) as Partial<T>;
}

const preenchido = (v: unknown) => v !== null && v !== undefined;

// Colunas por migração (o app grava o resto quando elas ainda não existem no banco)
const DIARIO_MELHORIAS = ['vomito', 'diarreia', 'intestino_preso', 'dieta_seguida'] as const;
const DIARIO_EVOLUCAO = ['sono_h', 'agua_l', 'cor_urina'] as const;
const TREINO_EVOLUCAO = ['cardio_tipo', 'esforco_treino', 'esforco_cardio'] as const;

/** Mensagens do login em português. */
function traduzirAuth(msg: string): string {
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered/i.test(msg)) return 'Esse e-mail já tem conta. Use Entrar.';
  if (/rate limit|for security purposes/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (/should be different/i.test(msg)) return 'A senha nova precisa ser diferente da atual.';
  if (/signups not allowed|signup is disabled/i.test(msg)) return 'O cadastro de contas novas está fechado.';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return msg;
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
    // Sem internet, não espera o cliente tentar renovar o acesso (~25 s): usa a sessão guardada
    const guardado = this.usuarioGuardado();
    if (guardado && typeof navigator !== 'undefined' && navigator.onLine === false) return guardado;
    try {
      const sessao = this.sb.auth.getSession();
      const limite = guardado ? new Promise<'tempo'>((r) => setTimeout(() => r('tempo'), 4000)) : null;
      const resposta = limite ? await Promise.race([sessao, limite]) : await sessao;
      // Rede lenta: segue com a sessão guardada; a renovação termina em segundo plano
      if (resposta === 'tempo') return guardado;
      const { data, error } = resposta;
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
    if (error) throw new Error(traduzirAuth(error.message));
    this.abertoParaRecuperar = false;
  }

  aoMudarUsuario(cb: (u: Usuario | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, s) => cb(s?.user ? { id: s.user.id, email: s.user.email ?? '' } : null));
    return () => data.subscription.unsubscribe();
  }

  async entrar(email: string, senha: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : traduzirAuth(error.message));
  }

  async cadastrar(email: string, senha: string) {
    const { data, error } = await this.sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL } });
    if (error) throw new Error(traduzirAuth(error.message));
    return { confirmarEmail: !data.session };
  }

  async recuperarSenha(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + import.meta.env.BASE_URL });
    if (error) throw new Error(traduzirAuth(error.message));
  }

  async sair() {
    // 'local' remove a sessão do aparelho mesmo sem internet (o acesso no servidor expira sozinho)
    const { error } = await this.sb.auth.signOut({ scope: 'local' });
    if (error && !ehErroDeRede(error)) throw new Error(error.message);
    if (error) localStorage.removeItem(this.chaveSessao);
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
      // Colunas do SQL de evolução: ausentes no banco antigo viram "padrão"
      ajuste_gordura: numOuNulo(d.ajuste_gordura),
      exame_gordura_data: d.exame_gordura_data ?? null,
      exame_gordura_bf: numOuNulo(d.exame_gordura_bf),
      exercicios_forca: Array.isArray(d.exercicios_forca) ? d.exercicios_forca : null,
    };
  }

  async salvarPerfil(p: Perfil) {
    // O token do calendário é gerado pelo banco; aqui ele não é sobrescrito
    // Token, liberação da aba Treino, metas e exercícios da força têm gravação própria
    const { token_calendario: _token, modulo_treino: _modulo, metas_projeto: _metas, exercicios_forca: _forca, data_nascimento, ajuste_gordura, exame_gordura_data, exame_gordura_bf, ...dados } = p;
    const base = { user_id: await this.uid(), ...dados };
    // undefined = não mexer (ex.: backup antigo); null = apagar a data
    const nascimento: Record<string, unknown> = data_nascimento === undefined ? {} : { data_nascimento };
    const calibracao: Record<string, unknown> = Object.fromEntries(
      Object.entries({ ajuste_gordura, exame_gordura_data, exame_gordura_bf }).filter(([, v]) => v !== undefined),
    );
    let semNascimento = false;
    let semCalibracao = false;
    for (;;) {
      const r = await this.sb.from('perfis').upsert({ ...base, ...(semNascimento ? {} : nascimento), ...(semCalibracao ? {} : calibracao) });
      // Banco sem a coluna (migração da Dieta ainda não rodou): salva o resto
      if (!semNascimento && r.error && /data_nascimento/.test(r.error.message)) semNascimento = true;
      // Banco sem as colunas de calibração (SQL de evolução ainda não rodou): salva o resto
      else if (!semCalibracao && faltaNoBanco(r.error, /ajuste_gordura|exame_gordura/)) semCalibracao = true;
      else {
        erro(r);
        break;
      }
    }
    const calibrou = [ajuste_gordura, exame_gordura_data, exame_gordura_bf].some((v) => v !== null && v !== undefined);
    if (semCalibracao && calibrou) throw new Error(`Ajuste de calibração do % de gordura não foi salvo: ${AVISO_EVOLUCAO}`);
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
      sono_h: numOuNulo(r.sono_h),
      agua_l: numOuNulo(r.agua_l),
      cor_urina: r.cor_urina ?? null,
    }));
  }

  async salvarDiario(r: Omit<RegistroDiario, 'id'>) {
    const linha = { ...r, user_id: await this.uid() };
    let semMelhorias = false;
    let semEvolucao = false;
    for (;;) {
      const res = await this.sb
        .from('diario')
        .upsert(sem(linha, [...(semMelhorias ? DIARIO_MELHORIAS : []), ...(semEvolucao ? DIARIO_EVOLUCAO : [])]), { onConflict: 'user_id,data' });
      // Banco sem sono/água/urina (SQL de evolução ainda não rodou): grava o resto
      if (!semEvolucao && faltaNoBanco(res.error, /sono_h|agua_l|cor_urina/)) semEvolucao = true;
      // Banco sem as colunas de sintomas (SQL de melhorias ainda não rodou): grava o básico
      else if (!semMelhorias && res.error && /vomito|diarreia|intestino_preso|dieta_seguida/.test(res.error.message)) semMelhorias = true;
      else {
        erro(res);
        break;
      }
    }
    // Avisa: o resto foi salvo, mas os campos novos precisam do SQL
    if (semMelhorias && [r.vomito, r.diarreia, r.intestino_preso, r.dieta_seguida].some(preenchido))
      throw new Error('Sintomas e "segui o plano?" não foram salvos: falta rodar o SQL de melhorias no Supabase.');
    if (semEvolucao && [r.sono_h, r.agua_l, r.cor_urina].some(preenchido)) throw new Error(`Sono, água e cor da urina não foram salvos: ${AVISO_EVOLUCAO}`);
  }

  async excluirDiario(id: string) {
    // Registro criado sem internet ainda não tem id do servidor: exclui pela data
    if (id.startsWith('pendente:')) erro(await this.sb.from('diario').delete().eq('data', id.slice(9)));
    else erro(await this.sb.from('diario').delete().eq('id', id));
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
      atipica: m.atipica === true,
    }));
  }

  async salvarMedida(m: Omit<Medida, 'id'> & { id?: string }) {
    const linha = { ...m, atipica: m.atipica === true, user_id: await this.uid() };
    const r = await this.sb.from('medidas').upsert(linha);
    // Banco sem a coluna "atipica" (SQL de evolução ainda não rodou): grava o resto
    if (faltaNoBanco(r.error, /atipica/)) {
      const { atipica: _a, ...basica } = linha;
      erro(await this.sb.from('medidas').upsert(basica));
      if (m.atipica) throw new Error(`"Medição atípica" não foi salvo: ${AVISO_EVOLUCAO}`);
    } else erro(r);
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
      cardio_tipo: t.cardio_tipo ?? null,
      esforco_treino: t.esforco_treino ?? null,
      esforco_cardio: t.esforco_cardio ?? null,
    }));
  }

  async salvarTreino(t: Omit<TreinoDia, 'id'>) {
    const linha = { ...t, user_id: await this.uid() };
    const r = await this.sb.from('treino_dias').upsert(linha, { onConflict: 'user_id,data' });
    // Banco sem tipo do cardio e esforço (SQL de evolução ainda não rodou): grava o resto
    if (faltaNoBanco(r.error, /cardio_tipo|esforco_treino|esforco_cardio/)) {
      erro(await this.sb.from('treino_dias').upsert(sem(linha, TREINO_EVOLUCAO), { onConflict: 'user_id,data' }));
      // Sem a coluna, o tipo do cardio é inferido pela distância e pela regra do dia: só avisa se a inferência erraria
      const tipoPerdido = !!t.cardio && preenchido(t.cardio_tipo) && tipoCardioEfetivo(t.data, { corrida_km: t.corrida_km, cardio_tipo: null }) !== t.cardio_tipo;
      if (preenchido(t.esforco_treino) || preenchido(t.esforco_cardio) || tipoPerdido)
        throw new Error(`${tipoPerdido ? 'Tipo do cardio' : 'Esforço da sessão'} não foi salvo: ${AVISO_EVOLUCAO}`);
    } else erro(r);
  }

  async listarForca(): Promise<RegistroForca[]> {
    const r = await this.sb.from('treino_forca').select('*').order('data');
    // Tabela ainda não criada (SQL de evolução não rodou): sem registros
    if (faltaNoBanco(r.error, /treino_forca/)) return [];
    return lista(r).map((f) => ({
      id: f.id,
      data: f.data,
      exercicio: f.exercicio,
      carga_kg: num(f.carga_kg),
      reps: num(f.reps),
      rir: numOuNulo(f.rir),
    }));
  }

  async salvarForca(f: RegistroForca) {
    const r = await this.sb.from('treino_forca').upsert({ ...f, user_id: await this.uid() });
    if (faltaNoBanco(r.error, /treino_forca/)) throw new Error(`Registro de força não foi salvo: ${AVISO_EVOLUCAO}`);
    erro(r);
  }

  async excluirForca(id: string) {
    const r = await this.sb.from('treino_forca').delete().eq('id', id);
    if (!faltaNoBanco(r.error, /treino_forca/)) erro(r);
  }

  async salvarExerciciosForca(lista: string[] | null) {
    const r = await this.sb.from('perfis').update({ exercicios_forca: lista }).eq('user_id', await this.uid());
    if (faltaNoBanco(r.error, /exercicios_forca/)) throw new Error(`Lista de exercícios da força não foi salva: ${AVISO_EVOLUCAO}`);
    erro(r);
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
