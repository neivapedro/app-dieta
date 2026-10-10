// Edge Function (Deno): calendário das aplicações em formato iCalendar (.ics),
// assinado pelo iPhone via webcal://…/functions/v1/calendario?t=TOKEN.
// O token é secreto e individual (perfis.token_calendario).
// A agenda segue a mesma regra do app (src/lib/ciclo.ts): a próxima dose é a
// última aplicação real + intervalo; se estiver atrasada, a projeção parte de
// hoje. Mantenha em sincronia com src/lib/ciclo.ts.

import { createClient } from 'npm:@supabase/supabase-js@2';

interface Fase {
  nome: string;
  semanas: number;
  dose_mg: number;
}

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

function faseDaDose(fases: Fase[], numero: number): { fase: Fase; indice: number } {
  let fim = 0;
  for (let i = 0; i < fases.length; i++) {
    fim += fases[i].semanas;
    if (numero <= fim) return { fase: fases[i], indice: i };
  }
  return { fase: fases[fases.length - 1], indice: fases.length - 1 };
}

function guiaSeringa(ui: number): string {
  const base = Math.floor(ui + EPS);
  const resto = Math.round((ui - base) * 100) / 100;
  if (resto === 0) return `exatamente na marca ${base}`;
  if (resto === 0.5) return `no meio entre as marcas ${base} e ${base + 1}`;
  if (resto === 0.25) return `um quarto depois da marca ${base}`;
  if (resto === 0.75) return `três quartos depois da marca ${base}`;
  return `entre as marcas ${base} e ${base + 1}`;
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
    .select('id, nome, data_inicio, quantidade_total_mg, concentracao_mg_ml, intervalo_dias, fases, passo_ui')
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

    // Aplicações já feitas: evento de dia inteiro, marcado como feito
    lista.forEach((a, i) => {
      const n = i + 1;
      const { fase, indice } = faseDaDose(fases, n);
      const dose = Number(a.dose_mg);
      eventos.push(
        'BEGIN:VEVENT',
        `UID:aplicada-${a.id}@app-dieta`,
        `DTSTAMP:${carimbo(agora)}`,
        `DTSTART;VALUE=DATE:${soData(a.data)}`,
        `DTEND;VALUE=DATE:${soData(somarDias(a.data, 1))}`,
        `SUMMARY:${escapar(`✓ Retatrutida ${fmtMg(dose)} mg (${n}ª dose)`)}`,
        `DESCRIPTION:${escapar(`Aplicada · Fase ${indice + 1} · ${fase.nome}`)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    });

    // Próximas doses, seguindo a progressão do plano até acabar o saldo
    let saldo = Number(ciclo.quantidade_total_mg) - lista.reduce((s, a) => s + Number(a.dose_mg), 0);
    const totalPlano = fases.reduce((s, f) => s + f.semanas, 0);
    const ultima = lista[lista.length - 1]?.data as string | undefined;
    const prevista = ultima ? somarDias(ultima, intervalo) : (ciclo.data_inicio as string);
    const hoje = hojeNoFuso(fuso);
    let data = prevista > hoje ? prevista : hoje;
    for (let n = lista.length + 1; n <= Math.max(totalPlano, lista.length + 1) && n <= lista.length + 200; n++) {
      const { fase, indice } = faseDaDose(fases, n);
      if (saldo + EPS < fase.dose_mg) break;
      saldo -= fase.dose_mg;
      // Arredonda à marcação da seringa, como o app (marcacao() em src/lib/ciclo.ts)
      const passo = Number(ciclo.passo_ui) > 0 ? Number(ciclo.passo_ui) : 0.5;
      const ui = Math.floor(((fase.dose_mg / conc) * 100) / passo + 0.5 + EPS) * passo;
      const inicio = localParaUtc(data, hora, fuso);
      const atrasada = n === lista.length + 1 && prevista < hoje;
      eventos.push(
        'BEGIN:VEVENT',
        `UID:dose-${n}-${ciclo.id}@app-dieta`,
        `DTSTAMP:${carimbo(agora)}`,
        `DTSTART:${carimbo(inicio)}`,
        `DTEND:${carimbo(new Date(inicio.getTime() + 15 * 60_000))}`,
        `SUMMARY:${escapar(`💉 Retatrutida ${fmtMg(fase.dose_mg)} mg · ${fmt(ui)} UI${atrasada ? ' (atrasada)' : ''}`)}`,
        `DESCRIPTION:${escapar(
          `${n}ª dose · Fase ${indice + 1} · ${fase.nome}\n` +
            `Seringa U-100: ${fmt(ui)} UI (${guiaSeringa(ui)})\n` +
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
