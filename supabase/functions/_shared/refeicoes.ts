// Lembrete das refeições (Edge Function "enviar-lembretes"): qual refeição
// avisar em cada execução e o texto da notificação. Código puro, sem Deno nem
// imports, para os testes do app (vitest) usarem o mesmo arquivo.
//
// Regra: para cada refeição COM horário e com alimentos, o aviso é
// horário − antes (0, 10, 15 ou 30 min), no fuso do perfil. A função roda a
// cada 15 min e avisa o que caiu de (agora − 15 min − folga) até agora: a folga
// cobre um atraso do agendador; o mesmo aviso nunca sai duas vezes porque cada
// (dia, refeição) é reservado na tabela lembretes_refeicao_enviados antes do envio.

/** Intervalo entre as execuções do agendador (pg_cron) */
export const JANELA_MIN = 15;
/** Margem extra para trás: uma execução atrasada ainda pega o aviso da anterior */
export const FOLGA_MIN = 5;
/** Antecedências aceitas (minutos antes do horário da refeição) */
export const ANTES_PERMITIDOS = [0, 10, 15, 30] as const;
/** Tamanho máximo do corpo da notificação */
export const LIMITE_CORPO = 180;

export interface ItemPlano {
  alimento_id: string;
  quantidade: number;
  unidade: string;
}

export interface RefeicaoPlano {
  id: string;
  nome: string;
  horario: string | null;
  itens: ItemPlano[];
}

/** Banco enxuto da função: id → [nome, porções [nome, gramas]] (gerado em alimentos.ts) */
export type MapaAlimentos = Record<string, readonly [string, readonly (readonly [string, number])[]]>;

export interface AvisoRefeicao {
  refeicao_id: string;
  /** Dia (no fuso do perfil) da refeição, não do aviso: o de 00:10 com 30 min antes é do dia seguinte */
  dia: string;
  nome: string;
  /** HH:MM */
  horario: string;
  itens: ItemPlano[];
  instante_refeicao: number;
  instante_aviso: number;
}

/** Antecedência válida (o que não for 0, 10, 15 ou 30 vira "no horário"). */
export function lerAntes(v: unknown): number {
  const n = Number(v);
  return (ANTES_PERMITIDOS as readonly number[]).includes(n) ? n : 0;
}

/** "7:05", "07:05" ou "07:05:00" → minutos do dia; inválido → null. */
export function minutosDoHorario(h: unknown): number | null {
  const m = typeof h === 'string' ? /^(\d{1,2}):(\d{2})/.exec(h.trim()) : null;
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  return hora < 24 && minuto < 60 ? hora * 60 + minuto : null;
}

function hhmm(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/** Fuso do perfil; vazio ou inválido vira o de São Paulo. */
export function fusoValido(fuso: unknown): string {
  if (typeof fuso === 'string' && fuso) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: fuso });
      return fuso;
    } catch {
      // segue para o padrão
    }
  }
  return 'America/Sao_Paulo';
}

function partesNoFuso(instante: number, fuso: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instante)
      .map((x) => [x.type, x.value]),
  );
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour), minuto: Number(p.minute), segundo: Number(p.second) };
}

/** Dia (YYYY-MM-DD) e minutos do dia de um instante, no fuso. */
export function diaNoFuso(instante: number, fuso: string): { dia: string; minutos: number } {
  const p = partesNoFuso(instante, fuso);
  return { dia: `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`, minutos: p.hora * 60 + p.minuto };
}

/** Diferença entre o relógio do fuso e o UTC naquele instante (ms). */
function deslocamento(instante: number, fuso: string): number {
  const base = Math.floor(instante / 1000) * 1000;
  const p = partesNoFuso(base, fuso);
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - base;
}

/** Instante (ms UTC) de um horário local num dia, no fuso (com horário de verão). */
export function instanteNoFuso(dia: string, minutos: number, fuso: string): number {
  const [a, m, d] = dia.split('-').map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, 0, minutos);
  const primeiro = ingenuo - deslocamento(ingenuo, fuso);
  // Segunda passada: perto da troca de horário, o deslocamento certo é o do próprio instante
  return ingenuo - deslocamento(primeiro, fuso);
}

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Refeições do plano (jsonb de dieta_planos.refeicoes), descartando o que não tiver o formato esperado. */
export function lerRefeicoes(bruto: unknown): RefeicaoPlano[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      id: String(r.id ?? r.nome ?? ''),
      nome: typeof r.nome === 'string' && r.nome.trim() ? r.nome.trim() : 'Refeição',
      horario: typeof r.horario === 'string' ? r.horario : null,
      itens: (Array.isArray(r.itens) ? r.itens : [])
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
        .map((i) => ({ alimento_id: String(i.alimento_id ?? ''), quantidade: Number(i.quantidade), unidade: String(i.unidade ?? 'g') }))
        .filter((i) => Number.isFinite(i.quantidade) && i.quantidade > 0),
    }))
    .filter((r) => r.id);
}

/**
 * Refeições cujo aviso cai na janela desta execução: de (agora − janela − folga)
 * exclusivo até agora inclusivo. Sem horário ou sem alimentos: sem aviso.
 * `jaEnviados` traz as chaves "dia|refeicao_id" já avisadas (a reserva no banco
 * é a garantia final contra duas execuções ao mesmo tempo).
 */
export function avisosDaJanela(opcoes: {
  refeicoes: unknown;
  agora: number;
  fuso: unknown;
  antes: unknown;
  janelaMin?: number;
  folgaMin?: number;
  /** Quanto antes do momento escolhido o aviso pode sair (padrão: meia janela) */
  adiantamentoMin?: number;
  jaEnviados?: ReadonlySet<string>;
}): AvisoRefeicao[] {
  const fuso = fusoValido(opcoes.fuso);
  const antes = lerAntes(opcoes.antes);
  const de = opcoes.agora - ((opcoes.janelaMin ?? JANELA_MIN) + (opcoes.folgaMin ?? FOLGA_MIN)) * 60_000;
  // O servidor confere a cada 15 min: o aviso sai na conferência mais próxima do
  // momento escolhido (até meia janela antes), e não na seguinte. Assim "10 min
  // antes" de 10:30 sai às 10:15, e não às 10:30. A folga para trás continua
  // cobrindo conferências atrasadas ou perdidas; o controle de enviados evita repetir.
  const ate = opcoes.agora + (opcoes.adiantamentoMin ?? (opcoes.janelaMin ?? JANELA_MIN) / 2) * 60_000;
  const hoje = diaNoFuso(opcoes.agora, fuso).dia;
  const avisos: AvisoRefeicao[] = [];
  const vistos = new Set(opcoes.jaEnviados ?? []);
  const refeicoes = lerRefeicoes(opcoes.refeicoes);
  // Ontem, hoje e amanhã: a janela pode atravessar a meia-noite, e o aviso de uma refeição logo depois dela cai no dia anterior
  for (const dia of [somarDias(hoje, -1), hoje, somarDias(hoje, 1)]) {
    for (const r of refeicoes) {
      const minutos = minutosDoHorario(r.horario);
      if (minutos === null || !r.itens.length) continue;
      const instanteRefeicao = instanteNoFuso(dia, minutos, fuso);
      const instanteAviso = instanteRefeicao - antes * 60_000;
      if (instanteAviso <= de || instanteAviso > ate) continue;
      const chave = `${dia}|${r.id}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      avisos.push({ refeicao_id: r.id, dia, nome: r.nome, horario: hhmm(minutos), itens: r.itens, instante_refeicao: instanteRefeicao, instante_aviso: instanteAviso });
    }
  }
  return avisos.sort((a, b) => a.instante_refeicao - b.instante_refeicao);
}

// ---------------------------------------------------------------------------
// Texto da notificação
// ---------------------------------------------------------------------------

/**
 * Plural da porção (mesma regra que o app usava no Início): o nome e os
 * adjetivos vão para o plural; o complemento depois de "de" e o que está entre
 * parênteses, não. colher de sopa cheia → colheres de sopa cheias.
 */
export function pluralPorcao(nome: string): string {
  const palavras = nome.split(' ');
  if (!palavras[0] || /^\d/.test(palavras[0])) return nome;
  const plural = (w: string) => (w.endsWith('ão') ? `${w.slice(0, -2)}ões` : /[rz]$/.test(w) ? `${w}es` : /[aeiouáéíóúâêô]$/.test(w) ? `${w}s` : w);
  let parenteses = false;
  return palavras
    .map((w, i) => {
      if (w.startsWith('(')) parenteses = true;
      if (parenteses || w === 'de' || palavras[i - 1] === 'de') return w;
      return plural(w);
    })
    .join(' ');
}

function qtd(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * "Uva, Rubi 100 g" · "Banana, prata 2 un" · "Pão de forma 2 fatias": na unidade do
 * plano. Porção que não existe mais no banco vira gramas (como no app).
 */
export function textoItem(item: ItemPlano, alimentos: MapaAlimentos): string {
  const a = alimentos[item.alimento_id];
  const nome = a?.[0] ?? 'Alimento';
  const porcao = item.unidade === 'g' ? undefined : a?.[1].find(([p]) => p === item.unidade);
  if (!porcao) return `${nome} ${qtd(Math.round(item.quantidade))} g`;
  // "unidade", "unidade média", "unidade (150 g)": "un" (curto, cabe mais itens na notificação)
  const unidade = /^unidade\b/.test(item.unidade) ? 'un' : item.quantidade > 1 ? pluralPorcao(item.unidade) : item.unidade;
  return `${nome} ${qtd(item.quantidade)} ${unidade}`;
}

/** Corta no fim de uma palavra, com reticências, sem passar do limite. */
function cortar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite - 1);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > limite * 0.5 ? corte.slice(0, espaco) : corte).replace(/[\s,·]+$/, '')}…`;
}

/**
 * Itens da refeição separados por " · ". Se não couber tudo, mostra os que
 * cabem inteiros e "+N" no fim; um primeiro item longo demais é cortado.
 */
export function corpoDoAviso(itens: ItemPlano[], alimentos: MapaAlimentos, limite = LIMITE_CORPO): string {
  const textos = itens.map((i) => textoItem(i, alimentos));
  const inteiro = textos.join(' · ');
  if (inteiro.length <= limite) return inteiro;
  for (let n = textos.length - 1; n >= 1; n--) {
    const resto = ` · +${textos.length - n} ${textos.length - n === 1 ? 'item' : 'itens'}`;
    const parte = textos.slice(0, n).join(' · ');
    if (parte.length + resto.length <= limite) return parte + resto;
  }
  const resto = textos.length > 1 ? ` · +${textos.length - 1} ${textos.length - 1 === 1 ? 'item' : 'itens'}` : '';
  return cortar(textos[0], limite - resto.length) + resto;
}

/** "Refeição 2 · 10:30", com "em 15 min" quando o aviso chega antes do horário. */
export function tituloDoAviso(aviso: Pick<AvisoRefeicao, 'nome' | 'horario' | 'instante_refeicao'>, agora: number): string {
  const faltam = Math.round((aviso.instante_refeicao - agora) / 60_000);
  return `${aviso.nome} · ${aviso.horario}${faltam >= 1 ? ` · em ${faltam} min` : ''}`;
}
