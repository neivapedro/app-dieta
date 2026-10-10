// Edge Function (Deno) chamada a cada hora pelo pg_cron.
// Para cada usuário com lembretes ativos, calcula a próxima aplicação com a
// mesma regra do app (última aplicação real + intervalo; a 1ª é a data de
// início) e envia um push quando:
//   - hoje (no fuso do usuário) é o dia previsto, ou a dose está atrasada
//     (lembra uma vez por dia, por até 14 dias), e
//   - já passou do horário escolhido, e
//   - ainda não foi enviado lembrete hoje para esse ciclo.
// A dose segue a regra do app (../_shared/dose.ts, cópia de src/lib/ciclo.ts):
// pela dose realmente aplicada, e só sobe com a decisão registrada no app.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { limiarPausaLonga, planoDeDoses, type Decisao, type Fase } from '../_shared/dose.ts';

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
    const decisoes = (Array.isArray(ciclo.decisoes) ? ciclo.decisoes : []) as Decisao[];
    const { estado, proxima } = planoDeDoses(fases, lista as { data: string; dose_mg: number }[], decisoes);
    const dose = estado === 'fim_plano' ? Math.min(proxima.dose_mg, Math.round((Number(ciclo.quantidade_total_mg) - usado) * 100) / 100) : proxima.dose_mg;
    // Arredonda à marcação da seringa, como o app (marcacao() em src/lib/ciclo.ts)
    const passo = Number(ciclo.passo_ui) > 0 ? Number(ciclo.passo_ui) : 0.5;
    const ui = Math.floor(((dose / Number(ciclo.concentracao_mg_ml)) * 100) / passo + 0.5 + 1e-9) * passo;
    const semAplicar = ultima ? diferencaDias(ultima, dia) : 0;
    const titulo = atraso === 0 ? '💉 Hoje é dia de aplicação' : `⚠️ Aplicação atrasada há ${atraso} dia(s)`;
    const fase = proxima.fase_indice !== null ? `fase ${fases[proxima.fase_indice].nome}` : 'dose fora do plano';
    const nota =
      semAplicar >= limiarPausaLonga(Number(ciclo.intervalo_dias))
        ? ` Pausa de ${Math.floor(semAplicar / 7)} semanas: confirme a dose com o médico antes de aplicar.`
        : estado === 'pendente'
          ? ' Fim da fase: decida no app se sobe de dose.'
          : estado === 'fora_do_plano'
            ? ' Confirme no app qual fase seguir.'
            : '';
    const corpo = `${numero}ª dose · ${fmt(dose)} mg (${fmt(ui)} UI) · ${fase}.${nota} Toque para registrar.`;

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

  return Response.json(resultado);
});
