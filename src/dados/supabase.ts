import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { lerConfigDieta, type PlanoDieta } from '../lib/dieta';
import { tipoCardioEfetivo } from '../lib/treino';
import type { Aplicacao, Ciclo, Medida, MetasProjeto, Perfil, RegistroDecisao, RegistroDiario, RegistroForca, TreinoDia } from '../lib/tipos';
import { ehErroDeRede } from '../lib/erros';
import { CicloSalvoEmParte, SalvoEmParte, type DecisoesCiclo, type Repositorio, type Usuario } from './repositorio';

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

/**
 * Coluna ou tabela que ainda não existe no banco (SQL de evolução não rodou).
 * Com `coluna`, só vale quando a mensagem cita uma das colunas/tabelas esperadas.
 */
export function faltaNoBanco(e: { message?: string; code?: string } | null | undefined, coluna?: RegExp): boolean {
  if (!e) return false;
  const codigo = ['PGRST204', 'PGRST205', '42703', '42P01'].includes(e.code ?? '');
  return (codigo || /does not exist|Could not find/i.test(e.message ?? '')) && (!coluna || coluna.test(e.message ?? ''));
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
// Colunas novas do ciclo (frente de dose e frasco): o app funciona sem elas
const COLUNAS_NOVAS_CICLO = ['seringa_capacidade_ui', 'seringa_marca_ui', 'frasco_aberto_em', 'decisoes'] as const;

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
    if (semCalibracao && calibrou) throw new SalvoEmParte(`Ajuste de calibração do % de gordura não foi salvo: ${AVISO_EVOLUCAO}`);
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
      // Colunas da evolução: ausentes se o SQL ainda não rodou
      seringa_capacidade_ui: numOuNulo(d.seringa_capacidade_ui),
      seringa_marca_ui: numOuNulo(d.seringa_marca_ui),
      frasco_aberto_em: d.frasco_aberto_em ?? null,
      decisoes: Array.isArray(d.decisoes) ? d.decisoes : [],
    };
  }

  async salvarCiclo(c: Omit<Ciclo, 'id'> & { id?: string }): Promise<Ciclo> {
    const linha = { ...c, user_id: await this.uid(), ativo: true };
    const r = await this.sb.from('ciclos').upsert(linha).select('id').single();
    if (r.error && faltaNoBanco(r.error)) {
      // Banco sem as colunas novas: grava o resto e avisa o que ficou de fora
      const basica: Record<string, unknown> = { ...linha };
      for (const k of COLUNAS_NOVAS_CICLO) delete basica[k];
      // Sem a migração, passo_ui só guarda 2 casas: 0,125 (marcas de 0,5) volta ao padrão 0,25
      if (Math.abs(c.passo_ui * 100 - Math.round(c.passo_ui * 100)) > 1e-9) basica.passo_ui = 0.25;
      const d = erro(await this.sb.from('ciclos').upsert(basica).select('id').single());
      const faltou = [
        (c.seringa_capacidade_ui ?? null) !== null || (c.seringa_marca_ui ?? null) !== null ? 'a seringa (capacidade e marcas)' : null,
        c.frasco_aberto_em ? '"frasco aberto em"' : null,
        // Descreve pelo tipo: a troca do intervalo é gravada como decisão (para não reavaliar as doses antigas)
        (c.decisoes ?? []).some((x) => x.escolha === 'intervalo')
          ? 'o registro da troca do intervalo (até rodar o SQL, o intervalo novo vale também para conferir as doses antigas, que podem aparecer com atraso)'
          : null,
        (c.decisoes ?? []).some((x) => x.escolha !== 'intervalo') ? 'as decisões do fim de fase (subir, repetir e anotações para o médico)' : null,
      ].filter(Boolean);
      const salvo = { ...c, id: d!.id } as Ciclo;
      if (faltou.length) throw new CicloSalvoEmParte(`Itens não salvos no servidor: ${faltou.join('; ')}. Motivo: ${AVISO_EVOLUCAO}`, salvo);
      return salvo;
    }
    const d = erro(r);
    return { ...c, id: d!.id } as Ciclo;
  }

  async salvarDecisoes({ ciclo_id, decisoes, fases }: DecisoesCiclo) {
    // Fases só quando a decisão mudou o Plano: senão, uma decisão antiga da fila desfaria um Plano salvo depois
    const r = await this.sb.from('ciclos').update(fases ? { decisoes, fases } : { decisoes }).eq('id', ciclo_id);
    if (r.error && faltaNoBanco(r.error)) {
      // O plano (Repetir fase) é gravado; a decisão em si precisa da coluna nova
      if (fases) {
        erro(await this.sb.from('ciclos').update({ fases }).eq('id', ciclo_id));
        throw new SalvoEmParte(`O Plano foi estendido, mas o registro da decisão não foi salvo: ${AVISO_EVOLUCAO}`);
      }
      throw new SalvoEmParte(`A decisão da fase não foi salva: ${AVISO_EVOLUCAO}`);
    }
    erro(r);
  }

  async listarAplicacoes(): Promise<Aplicacao[]> {
    const d = lista(await this.sb.from('aplicacoes').select('*').order('data'));
    return d.map((a) => ({
      id: a.id,
      ciclo_id: a.ciclo_id,
      data: a.data,
      dose_mg: num(a.dose_mg),
      local: a.local,
      observacoes: a.observacoes,
      concentracao_mg_ml: numOuNulo(a.concentracao_mg_ml),
    }));
  }

  async salvarAplicacao(a: Omit<Aplicacao, 'id'> & { id?: string }) {
    const linha = { ...a, user_id: await this.uid() };
    const r = await this.sb.from('aplicacoes').upsert(linha);
    // Banco sem a coluna da concentração: grava sem ela (as contas usam a do ciclo)
    if (r.error && faltaNoBanco(r.error)) {
      const { concentracao_mg_ml: _c, ...basica } = linha;
      erro(await this.sb.from('aplicacoes').upsert(basica));
      // "Frasco novo": a aplicação guarda uma concentração diferente da do ciclo, que se perderia sem aviso
      if (a.concentracao_mg_ml != null) {
        const c = await this.sb.from('ciclos').select('concentracao_mg_ml').eq('id', a.ciclo_id).maybeSingle();
        const doCiclo = c.data ? num(c.data.concentracao_mg_ml) : null;
        if (doCiclo !== null && Math.abs(doCiclo - a.concentracao_mg_ml) > 1e-9) {
          throw new SalvoEmParte(`Concentração do frasco anterior nesta aplicação não foi salva: ${AVISO_EVOLUCAO}`);
        }
      }
    } else erro(r);
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
    if (semEvolucao && [r.sono_h, r.agua_l, r.cor_urina].some(preenchido)) throw new SalvoEmParte(`Sono, água e cor da urina não foram salvos: ${AVISO_EVOLUCAO}`);
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
      if (m.atipica) throw new SalvoEmParte(`"Medição atípica" não foi salvo: ${AVISO_EVOLUCAO}`);
    } else erro(r);
  }

  async excluirMedida(id: string) {
    erro(await this.sb.from('medidas').delete().eq('id', id));
  }

  async salvarInscricaoPush(i: { endpoint: string; p256dh: string; auth: string }) {
    // A função do servidor passa o endereço para esta conta mesmo se ele ainda for de outra (conta anterior neste aparelho)
    const r = await this.sb.rpc('assumir_inscricao_push', { p_endpoint: i.endpoint, p_p256dh: i.p256dh, p_auth: i.auth });
    if (!r.error) return;
    // Banco sem a função (SQL ainda não rodou): grava direto
    if (faltaNoBanco(r.error) || r.error.code === 'PGRST202') {
      erro(await this.sb.from('inscricoes_push').upsert({ ...i, user_id: await this.uid() }, { onConflict: 'endpoint' }));
    } else erro(r);
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
        throw new SalvoEmParte(`${tipoPerdido ? 'Tipo do cardio' : 'Esforço da sessão'} não foi salvo: ${AVISO_EVOLUCAO}`);
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
    if (faltaNoBanco(r.error, /treino_forca/)) throw new SalvoEmParte(`Registro de força não foi salvo: ${AVISO_EVOLUCAO}`);
    erro(r);
  }

  async excluirForca(id: string) {
    const r = await this.sb.from('treino_forca').delete().eq('id', id);
    if (!faltaNoBanco(r.error, /treino_forca/)) erro(r);
  }

  async salvarExerciciosForca(lista: string[] | null) {
    const r = await this.sb.from('perfis').update({ exercicios_forca: lista }).eq('user_id', await this.uid());
    if (faltaNoBanco(r.error, /exercicios_forca/)) throw new SalvoEmParte(`Lista de exercícios da força não foi salva: ${AVISO_EVOLUCAO}`);
    erro(r);
  }

  async obterDieta(): Promise<PlanoDieta | null> {
    const d = erro(await this.sb.from('dieta_planos').select('config, refeicoes').maybeSingle());
    return d ? { config: lerConfigDieta(d.config), refeicoes: d.refeicoes ?? [] } : null;
  }

  async salvarDieta(p: PlanoDieta) {
    erro(
      await this.sb
        .from('dieta_planos')
        .upsert({ user_id: await this.uid(), config: lerConfigDieta(p.config), refeicoes: p.refeicoes, atualizado_em: new Date().toISOString() }),
    );
  }

  async listarRegistroDecisoes(): Promise<RegistroDecisao[] | null> {
    const r = await this.sb.from('registro_decisoes').select('*').order('data');
    // Tabela da evolução ainda não criada: o app segue sem o registro
    if (r.error && faltaNoBanco(r.error)) return null;
    return lista(r).map((d) => ({
      id: d.id,
      data: d.data,
      tipo: d.tipo,
      campo: d.campo,
      de: d.de ?? null,
      para: d.para ?? null,
      motivo: d.motivo ?? null,
      ref: d.ref ?? null,
    }));
  }

  async salvarRegistroDecisao(d: RegistroDecisao) {
    const r = await this.sb.from('registro_decisoes').upsert({ ...d, user_id: await this.uid() });
    if (r.error && faltaNoBanco(r.error)) {
      // Registro automático sem a tabela: não interrompe quem só mudou a Dieta ou o Plano
      // (a Análise avisa que falta o SQL). O que o usuário escreveu, sim, precisa do aviso.
      if (d.tipo === 'nota') throw new SalvoEmParte(`A decisão anotada não foi salva: ${AVISO_EVOLUCAO}`);
      if (d.motivo) throw new SalvoEmParte(`O motivo da decisão não foi salvo: ${AVISO_EVOLUCAO}`);
      return;
    }
    erro(r);
  }

  async excluirRegistroDecisao(id: string) {
    const r = await this.sb.from('registro_decisoes').delete().eq('id', id);
    if (r.error && faltaNoBanco(r.error)) return;
    erro(r);
  }
}
