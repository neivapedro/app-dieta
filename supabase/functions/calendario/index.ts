// Edge Function (Deno): calendário das aplicações em formato iCalendar (.ics),
// assinado pelo iPhone via webcal://…/functions/v1/calendario?t=TOKEN.
// O token é secreto e individual (perfis.token_calendario).
// A agenda segue a mesma regra do app (src/lib/ciclo.ts): a próxima dose é a
// última aplicação real + intervalo; se estiver atrasada, a projeção parte de
// hoje. A dose segue a dose realmente aplicada e só sobe com a decisão
// registrada no app (../_shared/dose.ts). Mantenha em sincronia com src/lib/ciclo.ts.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { degraus, dosesDoCalendario, emFasePosRemedio, faseNoDegrau, planoDeDoses, type Decisao, type Fase } from '../_shared/dose.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE = 'https://neivapedro.github.io/app-dieta/';
const EPS = 1e-9;

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function hojeNoFuso(fuso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Converte data + hora locais de um fuso em instante UTC. */
function localParaUtc(data: string, hora: string, fuso: string): Date {
  const [a, m, d] = data.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const palpite = Date.UTC(a, m - 1, d, hh, mm);
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(palpite)).map((p) => [p.type, p.value]),
  );
  const comoLocal = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute);
  return new Date(palpite - (comoLocal - palpite));
}

/** Onde parar o êmbolo, pelo intervalo entre as marcas impressas (1 ou 0,5 UI). */
function guiaSeringa(ui: number, marca = 1): string {
  const base = Math.floor(ui / marca + EPS) * marca;
  const resto = Math.round(((ui - base) / marca) * 100) / 100;
  const a = fmt(base);
  const b = fmt(base + marca);
  if (resto === 0) return `exatamente na marca ${a}`;
  if (resto === 0.5) return `no meio entre as marcas ${a} e ${b}`;
  if (resto === 0.25) return `um quarto depois da marca ${a}`;
  if (resto === 0.75) return `três quartos depois da marca ${a}`;
  return `entre as marcas ${a} e ${b}`;
}

const fmt = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
const fmtMg = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function escapar(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Dobra linhas em 75 octetos (RFC 5545), sem quebrar caracteres UTF-8. */
function dobrar(linha: string): string {
  const enc = new TextEncoder();
  const partes: string[] = [];
  let atual = '';
  for (const ch of linha) {
    const limite = partes.length === 0 ? 75 : 74;
    if (enc.encode(atual + ch).length > limite) {
      partes.push(atual);
      atual = ch;
    } else atual += ch;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

const carimbo = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const soData = (s: string) => s.replace(/-/g, '');

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[a-f0-9]{32,}$/.test(token)) return new Response('Calendário não encontrado', { status: 404 });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: perfil } = await db.from('perfis').select('user_id, hora_lembrete, fuso_horario').eq('token_calendario', token).maybeSingle();
  if (!perfil) return new Response('Calendário não encontrado', { status: 404 });

  const { data: ciclo } = await db
    .from('ciclos')
    // '*': as colunas novas (decisoes, seringa) podem ainda não existir no banco
    .select('*')
    .eq('user_id', perfil.user_id)
    .eq('ativo', true)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  const fuso = perfil.fuso_horario || 'America/Sao_Paulo';
  const hora = String(perfil.hora_lembrete ?? '08:00').slice(0, 5);
  const agora = new Date();
  const eventos: string[] = [];

  if (ciclo && Array.isArray(ciclo.fases) && ciclo.fases.length) {
    const fases = ciclo.fases as Fase[];
    const conc = Number(ciclo.concentracao_mg_ml);
    const intervalo = ciclo.intervalo_dias || 7;
    const { data: aps } = await db.from('aplicacoes').select('id, data, dose_mg').eq('ciclo_id', ciclo.id).order('data');
    const lista = aps ?? [];
    const decisoes = (Array.isArray(ciclo.decisoes) ? ciclo.decisoes : []) as Decisao[];
    const marca = Number(ciclo.seringa_marca_ui) > 0 ? Number(ciclo.seringa_marca_ui) : 1;
    // Fase de cada aplicação pelo bloco de doses iguais em que ela está
    const fasesAplicadas: (number | null)[] = [];
    for (const d of degraus(fases, lista, decisoes)) for (let p = 1; p <= d.aplicacoes; p++) fasesAplicadas.push(faseNoDegrau(fases, d, p));

    // Aplicações já feitas: evento de dia inteiro, marcado como feito
    lista.forEach((a, i) => {
      const n = i + 1;
      const indice = fasesAplicadas[i];
      const dose = Number(a.dose_mg);
      eventos.push(
        'BEGIN:VEVENT',
        `UID:aplicada-${a.id}@app-dieta`,
        `DTSTAMP:${carimbo(agora)}`,
        `DTSTART;VALUE=DATE:${soData(a.data)}`,
        `DTEND;VALUE=DATE:${soData(somarDias(a.data, 1))}`,
        `SUMMARY:${escapar(`✓ Retatrutida ${fmtMg(dose)} mg (${n}ª dose)`)}`,
        `DESCRIPTION:${escapar(indice === null ? 'Aplicada · dose fora do plano' : `Aplicada · Fase ${indice + 1} · ${fases[indice].nome}`)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    });

    // Próximas doses: as mesmas da agenda do app, com "(se subir)" nas que
    // dependem de uma decisão no fim da fase; a dose oficial até decidir vai na nota
    let saldo = Number(ciclo.quantidade_total_mg) - lista.reduce((s, a) => s + Number(a.dose_mg), 0);
    const plano = planoDeDoses(fases, lista, decisoes);
    const { estado, proxima } = plano;
    // Fase pós-remédio iniciada no app: só as aplicações feitas, sem doses futuras
    const futuras = emFasePosRemedio(decisoes, lista) ? [] : dosesDoCalendario(plano, saldo);
    const ultima = lista[lista.length - 1]?.data as string | undefined;
    const prevista = ultima ? somarDias(ultima, intervalo) : (ciclo.data_inicio as string);
    const hoje = hojeNoFuso(fuso);
    let data = prevista > hoje ? prevista : hoje;
    for (let k = 0; k < futuras.length && k < 200; k++) {
      const n = lista.length + 1 + k;
      const f = futuras[k];
      if (saldo <= EPS || saldo + EPS < f.dose_mg) break;
      saldo -= f.dose_mg;
      const fase = { dose_mg: f.dose_mg, nome: f.fase_indice === null ? 'fora do plano' : fases[f.fase_indice].nome };
      const indice = f.fase_indice ?? -1;
      // Arredonda à marcação da seringa, como o app (marcacao() em src/lib/ciclo.ts)
      const passo = Number(ciclo.passo_ui) > 0 ? Number(ciclo.passo_ui) : 0.5;
      const ui = Math.floor(((fase.dose_mg / conc) * 100) / passo + 0.5 + EPS) * passo;
      const inicio = localParaUtc(data, hora, fuso);
      const atrasada = k === 0 && prevista < hoje;
      const aDecidir = k === 0 && (estado === 'pendente' || estado === 'fora_do_plano');
      const nota = `${f.hipotese ? ' (se subir)' : ''}${aDecidir ? ' · decida no app' : ''}`;
      const aviso = aDecidir ? `\n${estado === 'pendente' ? 'Fim da fase' : 'Dose fora do plano'}: até decidir no app, a dose continua ${fmtMg(proxima.dose_mg)} mg.` : '';
      eventos.push(
        'BEGIN:VEVENT',
        `UID:dose-${n}-${ciclo.id}@app-dieta`,
        `DTSTAMP:${carimbo(agora)}`,
        `DTSTART:${carimbo(inicio)}`,
        `DTEND:${carimbo(new Date(inicio.getTime() + 15 * 60_000))}`,
        `SUMMARY:${escapar(`💉 Retatrutida ${fmtMg(fase.dose_mg)} mg · ${fmt(ui)} UI${atrasada ? ' (atrasada)' : ''}${nota}`)}`,
        `DESCRIPTION:${escapar(
          `${n}ª dose · ${indice >= 0 ? `Fase ${indice + 1} · ${fase.nome}` : 'dose fora do plano'}${nota}${aviso}\n` +
            `Seringa U-100: ${fmt(ui)} UI (${guiaSeringa(ui, marca)})\n` +
            `Saldo após esta dose: ${fmtMg(Math.max(saldo, 0))} mg\n` +
            `Registre no app: ${SITE}`,
        )}`,
        `URL:${SITE}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapar(`Retatrutida ${fmtMg(fase.dose_mg)} mg (${fmt(ui)} UI)`)}`,
        'TRIGGER:PT0M',
        'END:VALARM',
        'END:VEVENT',
      );
      data = somarDias(data, intervalo);
    }
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//app-dieta//Ciclo//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar('Ciclo · Retatrutida')}`,
    `X-WR-TIMEZONE:${fuso}`,
    // Cor sugerida ao assinar: verde-água
    'X-APPLE-CALENDAR-COLOR:#2DD4BF',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...eventos,
    'END:VCALENDAR',
  ]
    .map(dobrar)
    .join('\r\n') + '\r\n';

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="ciclo.ics"',
      'Cache-Control': 'no-cache',
    },
  });
});
