// Edge Function (Deno) chamada a cada 15 minutos pelo pg_cron. Faz dois
// lembretes independentes: o da dose (lembretes_ativos, abaixo) e o das
// refeições (lembrete_refeicoes, em lembrarRefeicoes()).
//
// Lembrete da dose:
// Para cada usuário com lembretes ativos, calcula a próxima aplicação com a
// mesma regra do app (última aplicação real + intervalo; a 1ª é a data de
// início) e envia um push quando:
//   - hoje (no fuso do usuário) é o dia previsto, ou a dose está atrasada
//     (lembra uma vez por dia, por até 14 dias), e
//   - já passou do horário escolhido, e
//   - ainda não foi enviado lembrete hoje para esse ciclo.
// A dose segue a regra do app (../_shared/dose.ts, cópia de src/lib/ciclo.ts):
// pela dose realmente aplicada, e só sobe com a decisão registrada no app.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { emFasePosRemedio, limiarPausaLonga, planoDeDoses, type Decisao, type Fase } from '../_shared/dose.ts';
import { ALIMENTOS } from '../_shared/alimentos.ts';
import { avisosDaJanela, corpoDoAviso, JANELA_MIN, tituloDoAviso } from '../_shared/refeicoes.ts';

const MAX_DIAS_ATRASO = 14;

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Segredo compartilhado só com o pg_cron (guardado no Vault como 'cron_secret')
const cronSecret = Deno.env.get('CRON_SECRET')!;
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

function dataNoFuso(agora: Date, fuso: string): { dia: string; minutos: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  );
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function diferencaDias(a: string, b: string): number {
  const ms = (s: string) => {
    const [x, y, z] = s.split('-').map(Number);
    return Date.UTC(x, y - 1, z);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

function fmt(n: number, casas = 2): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** UI como no app: até 2 casas, sem zeros sobrando (35 UI · 12,5 UI) */
function fmtUi(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

Deno.serve(async (req) => {
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Não autorizado', { status: 401 });
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const agora = new Date();
  const resultado = { avaliados: 0, enviados: 0, inscricoes_removidas: 0 };

  const { data: perfis, error } = await db.from('perfis').select('user_id, hora_lembrete, fuso_horario').eq('lembretes_ativos', true);
  if (error) return new Response(error.message, { status: 500 });

  for (const perfil of perfis ?? []) {
    resultado.avaliados++;
    const { data: ciclo } = await db
      .from('ciclos')
      // '*': as colunas novas (decisoes) podem ainda não existir no banco
      .select('*')
      .eq('user_id', perfil.user_id)
      .eq('ativo', true)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ciclo || !Array.isArray(ciclo.fases) || ciclo.fases.length === 0) continue;

    const { data: aplicacoes } = await db.from('aplicacoes').select('data, dose_mg').eq('ciclo_id', ciclo.id).order('data');
    const lista = aplicacoes ?? [];
    const usado = lista.reduce((s, a) => s + Number(a.dose_mg), 0);
    if (Number(ciclo.quantidade_total_mg) - usado <= 1e-9) continue; // ciclo concluído
    const decisoes = (Array.isArray(ciclo.decisoes) ? ciclo.decisoes : []) as Decisao[];
    // Fase pós-remédio iniciada no app: não há próxima dose para lembrar
    if (emFasePosRemedio(decisoes, lista as { data: string }[])) continue;

    const ultima = lista[lista.length - 1]?.data as string | undefined;
    const prevista = ultima ? somarDias(ultima, ciclo.intervalo_dias) : (ciclo.data_inicio as string);

    const { dia, minutos } = dataNoFuso(agora, perfil.fuso_horario || 'America/Sao_Paulo');
    const atraso = diferencaDias(prevista, dia);
    if (atraso < 0 || atraso > MAX_DIAS_ATRASO) continue;
    const [h, m] = String(perfil.hora_lembrete).split(':').map(Number);
    if (minutos < h * 60 + m) continue;

    const { data: jaEnviado } = await db.from('lembretes_enviados').select('dia').eq('ciclo_id', ciclo.id).eq('dia', dia).maybeSingle();
    if (jaEnviado) continue;

    const numero = lista.length + 1;
    const fases = ciclo.fases as Fase[];
    const { estado, proxima } = planoDeDoses(fases, lista as { data: string; dose_mg: number }[], decisoes);
    // Sobra menor que a dose (extra ou a última do plano): o lembrete indica a sobra, como o app
    const sobra = Math.round((Number(ciclo.quantidade_total_mg) - usado) * 100) / 100;
    const dose = estado === 'fim_plano' || (sobra > 0.005 && sobra < proxima.dose_mg) ? Math.min(proxima.dose_mg, sobra) : proxima.dose_mg;
    // Arredonda à marcação da seringa, como o app (marcacao() em src/lib/ciclo.ts)
    const passo = Number(ciclo.passo_ui) > 0 ? Number(ciclo.passo_ui) : 0.5;
    const ui = Math.floor(((dose / Number(ciclo.concentracao_mg_ml)) * 100) / passo + 0.5 + 1e-9) * passo;
    const semAplicar = ultima ? diferencaDias(ultima, dia) : 0;
    // Mesmos avisos do app: seringa menor que a dose e saldo do frasco que não cobre a dose
    const capacidade = Number(ciclo.seringa_capacidade_ui) > 0 ? Number(ciclo.seringa_capacidade_ui) : 100;
    const saldo = Number(ciclo.quantidade_total_mg) - usado;
    const avisoSeringa = ui > capacidade + 1e-9 ? ` ${fmtUi(ui)} UI passa da capacidade da sua seringa de ${fmtUi(capacidade)} UI: confira a seringa ou a dose no app.` : '';
    const avisoSaldo =
      estado !== 'fim_plano' && dose + 1e-9 < proxima.dose_mg ? ` Última do frasco: só restam ${fmt(saldo)} mg (o plano previa ${fmt(proxima.dose_mg)} mg).` : '';
    const titulo = atraso === 0 ? '💉 Hoje é dia de aplicação' : `⚠️ Aplicação atrasada há ${atraso} dia(s)`;
    const fase =
      estado === 'fim_plano' ? 'dose extra (sobra do frasco)' : proxima.fase_indice !== null ? `fase ${fases[proxima.fase_indice].nome}` : 'dose fora do plano';
    const nota =
      semAplicar >= limiarPausaLonga(Number(ciclo.intervalo_dias))
        ? ` Pausa de ${Math.floor(semAplicar / 7)} semanas: confirme a dose com o médico antes de aplicar.`
        : estado === 'pendente'
          ? ' Fim da fase: decida no app se sobe de dose.'
          : estado === 'fora_do_plano'
            ? ' Confirme no app qual fase seguir.'
            : '';
    const corpo = `${numero}ª dose · ${fmt(dose)} mg (${fmtUi(ui)} UI) · ${fase}.${avisoSaldo}${avisoSeringa}${nota} Toque para registrar.`;

    const { data: inscricoes } = await db.from('inscricoes_push').select('id, endpoint, p256dh, auth').eq('user_id', perfil.user_id);
    let entregue = false;
    for (const i of inscricoes ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          JSON.stringify({ titulo, corpo, url: './?registrar=1', tag: `dose-${ciclo.id}` }),
          { TTL: 60 * 60 * 12 },
        );
        entregue = true;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from('inscricoes_push').delete().eq('id', i.id);
          resultado.inscricoes_removidas++;
        } else {
          console.error('Falha ao enviar push', status, e);
        }
      }
    }
    if (entregue) {
      await db.from('lembretes_enviados').insert({ ciclo_id: ciclo.id, dia });
      resultado.enviados++;
    }
  }

  // Falha no lembrete das refeições (ex.: migração ainda não aplicada) não derruba o da dose
  const refeicoes = await lembrarRefeicoes(db, agora.getTime()).catch((e) => {
    console.error('Lembrete das refeições', e);
    return { erro: String((e as Error).message ?? e) };
  });
  return Response.json({ ...resultado, refeicoes });
});

type Db = SupabaseClient;
type Inscricao = { id: string; endpoint: string; p256dh: string; auth: string };

/** Envia a todas as inscrições do usuário; remove as que o serviço de push diz que não existem mais. */
async function enviarPush(db: Db, inscricoes: Inscricao[], payload: unknown, ttl: number): Promise<{ entregue: boolean; removidas: number }> {
  let entregue = false;
  let removidas = 0;
  for (const i of [...inscricoes]) {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify(payload), { TTL: ttl });
      entregue = true;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.from('inscricoes_push').delete().eq('id', i.id);
        inscricoes.splice(inscricoes.indexOf(i), 1);
        removidas++;
      } else {
        console.error('Falha ao enviar push', status, e);
      }
    }
  }
  return { entregue, removidas };
}

/**
 * Lembrete das refeições. Independente do lembrete da dose: vale para quem ligou
 * lembrete_refeicoes no Perfil, mesmo com o da dose desligado. Para cada
 * refeição do plano com horário e alimentos, avisa em horário − antes (no fuso
 * do perfil), na janela desta execução (regra em ../_shared/refeicoes.ts).
 * Cada (dia, refeição) é reservado em lembretes_refeicao_enviados antes do envio:
 * duas execuções ao mesmo tempo não repetem o aviso; se nenhum aparelho recebeu,
 * a reserva é desfeita e a próxima execução tenta de novo (enquanto estiver na janela).
 */
async function lembrarRefeicoes(db: Db, agora: number) {
  const res = { avaliados: 0, enviados: 0, inscricoes_removidas: 0, controle_limpo: false };
  const { data: perfis, error } = await db.from('perfis').select('user_id, fuso_horario, lembrete_refeicoes_antes').eq('lembrete_refeicoes', true);
  // Sem as colunas (migração 20261025000000 não aplicada): não há quem avisar
  if (error) throw new Error(error.message);
  const ids = (perfis ?? []).map((p) => p.user_id as string);
  const hojeUtc = new Date(agora).toISOString().slice(0, 10);
  const diaUtc = (n: number) => new Date(Date.parse(hojeUtc) + n * 86_400_000).toISOString().slice(0, 10);

  if (ids.length) {
    const { data: planos, error: erroPlanos } = await db.from('dieta_planos').select('user_id, refeicoes').in('user_id', ids);
    if (erroPlanos) throw new Error(erroPlanos.message);
    const planoDe = new Map((planos ?? []).map((p) => [p.user_id as string, p.refeicoes as unknown]));
    // O que já foi avisado nos últimos dias (a janela nunca passa de ontem/amanhã no fuso de ninguém)
    const { data: enviados, error: erroEnviados } = await db
      .from('lembretes_refeicao_enviados')
      .select('user_id, dia, refeicao_id')
      .in('user_id', ids)
      .gte('dia', diaUtc(-2));
    // Sem a tabela de controle não envia: sem ela, o mesmo aviso poderia sair duas vezes
    if (erroEnviados) throw new Error(erroEnviados.message);

    for (const perfil of perfis ?? []) {
      res.avaliados++;
      const jaEnviados = new Set((enviados ?? []).filter((e) => e.user_id === perfil.user_id).map((e) => `${e.dia}|${e.refeicao_id}`));
      const avisos = avisosDaJanela({
        refeicoes: planoDe.get(perfil.user_id),
        agora,
        fuso: perfil.fuso_horario,
        antes: perfil.lembrete_refeicoes_antes,
        jaEnviados,
      });
      if (!avisos.length) continue;
      const { data: inscricoes } = await db.from('inscricoes_push').select('id, endpoint, p256dh, auth').eq('user_id', perfil.user_id);
      const lista = (inscricoes ?? []) as Inscricao[];
      for (const aviso of avisos) {
        if (!lista.length) break;
        const chave = { user_id: perfil.user_id, dia: aviso.dia, refeicao_id: aviso.refeicao_id };
        const { data: reservado, error: erroReserva } = await db
          .from('lembretes_refeicao_enviados')
          .upsert(chave, { onConflict: 'user_id,dia,refeicao_id', ignoreDuplicates: true })
          .select('dia');
        // Outra execução já reservou (ou falhou ao reservar): não envia
        if (erroReserva || !reservado?.length) continue;
        const { entregue, removidas } = await enviarPush(
          db,
          lista,
          // Tocar abre a aba Dieta; a tag por refeição não junta avisos de refeições diferentes
          { titulo: tituloDoAviso(aviso, agora), corpo: corpoDoAviso(aviso.itens, ALIMENTOS), url: './dieta', tag: `refeicao-${aviso.refeicao_id}` },
          // Aviso de refeição velho não serve: descarta se o aparelho ficar 1 h sem receber
          60 * 60,
        );
        res.inscricoes_removidas += removidas;
        if (entregue) res.enviados++;
        else await db.from('lembretes_refeicao_enviados').delete().match(chave);
      }
    }
  }

  // Limpeza: uma vez por hora (na 1ª execução da hora), apaga o controle com mais de 7 dias
  if (new Date(agora).getUTCMinutes() < JANELA_MIN) {
    const { error: erroLimpeza } = await db.from('lembretes_refeicao_enviados').delete().lt('dia', diaUtc(-7));
    res.controle_limpo = !erroLimpeza;
  }
  return res;
}
