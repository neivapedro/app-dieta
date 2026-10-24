import type { ResumoCiclo } from './ciclo';
import { diferencaDias, somarDias } from './datas';
import type { Composicao } from './gordura';
import type { Ciclo, TreinoDia } from './tipos';

// Regras do projeto de treino (planilha do Pedro):
// - 1 treino por dia, todos os dias (sem folga: dia sem check conta como não feito);
// - 1 cardio por dia: corrida na quarta e no domingo; bike 30 min nos demais.
// - A corrida não tem distância padrão: distância e tempo são anotados depois de feita.
// - O dia de hoje só entra na meta quando é marcado (ainda está em aberto).

export const MIN_BIKE = 30;

export type TipoCardio = 'corrida' | 'bike';

function diaSemana(data: string): number {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
}

/** Cardio previsto pela regra do projeto: quarta e domingo = corrida; demais = bike. */
export function tipoCardio(data: string): TipoCardio {
  const d = diaSemana(data);
  return d === 3 || d === 0 ? 'corrida' : 'bike';
}

/**
 * Cardio de fato do dia (a corrida pode mudar de dia): o tipo salvo no registro;
 * sem ele (registro antigo ou banco sem a coluna), distância preenchida = corrida;
 * senão, a regra do dia.
 */
export function tipoCardioEfetivo(data: string, reg?: Pick<TreinoDia, 'cardio_tipo' | 'corrida_km'> | null): TipoCardio {
  if (reg?.cardio_tipo === 'corrida' || reg?.cardio_tipo === 'bike') return reg.cardio_tipo;
  if (reg?.corrida_km != null && reg.corrida_km > 0) return 'corrida';
  return tipoCardio(data);
}

/** Distância de uma corrida: 6.2 → "6,2 km"; 21.08 → "21,08 km". */
export function formatarKm(km: number): string {
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`;
}

/** "Corrida 6,2 km" (com a distância anotada), "Corrida" (sem ela) ou "Bike 30 min". */
export function rotuloTipoCardio(tipo: TipoCardio, km?: number | null): string {
  if (tipo === 'bike') return `Bike ${MIN_BIKE} min`;
  return km != null && km > 0 ? `Corrida ${formatarKm(km)}` : 'Corrida';
}

/** Campos do cardio que mudam ao tocar Bike ou Corrida no cartão do dia. */
export type CamposCardio = Pick<TreinoDia, 'cardio' | 'cardio_tipo' | 'corrida_km' | 'corrida_seg' | 'esforco_cardio'>;

/**
 * Toque em Bike ou Corrida: um cardio por dia.
 * - nada marcado: marca o tipo tocado;
 * - o outro tipo marcado: troca o tipo (o esforço anotado continua);
 * - o mesmo tipo marcado: desmarca (apaga o esforço; distância e tempo ficam guardados
 *   para o caso de marcar a corrida de novo).
 * Bike não tem distância nem tempo: marcar Bike apaga os da corrida.
 */
export function tocarCardio(data: string, atual: TreinoDia | null | undefined, tipo: TipoCardio): CamposCardio {
  const km = atual?.corrida_km ?? null;
  const seg = atual?.corrida_seg ?? null;
  const marcadoAgora = atual?.cardio ? tipoCardioEfetivo(data, atual) : null;
  if (marcadoAgora === tipo) return { cardio: false, cardio_tipo: null, corrida_km: km, corrida_seg: seg, esforco_cardio: null };
  return {
    cardio: true,
    cardio_tipo: tipo,
    // Marcar a corrida não inventa distância: fica a anotada (ou nenhuma, até registrar)
    corrida_km: tipo === 'corrida' ? km : null,
    corrida_seg: tipo === 'corrida' ? seg : null,
    esforco_cardio: marcadoAgora ? (atual?.esforco_cardio ?? null) : null,
  };
}

/** Detalhe do botão: "30 min" (bike); corrida: a distância anotada ou "km e pace" (anotados depois). */
export function detalheTipoCardio(tipo: TipoCardio, km?: number | null): string {
  if (tipo === 'bike') return `${MIN_BIKE} min`;
  return km != null && km > 0 ? formatarKm(km) : 'km e pace';
}

export function rotuloCardio(data: string, reg?: Pick<TreinoDia, 'cardio_tipo' | 'corrida_km'> | null): string {
  return rotuloTipoCardio(tipoCardioEfetivo(data, reg), reg?.corrida_km);
}

/**
 * Período do remédio: do dia da 1ª aplicação até um intervalo depois da última
 * (real ou prevista; a última dose cobre o intervalo do ciclo, ex.: 14 dias).
 * Com a fase pós-remédio iniciada, a última é a da decisão (data da última
 * dose) e o treino segue num placar separado (periodoTreinoPos). Sem nenhuma
 * aplicação registrada o projeto ainda não começou: o início fica na data
 * planejada ou, se ela já passou, amanhã (até a 1ª dose, nada é cobrado nem
 * contado, e nenhum check some do placar quando a dose chega noutra data).
 */
export function periodoProjeto(ciclo: Ciclo, resumo: ResumoCiclo, inicioPos?: string | null, hoje?: string): { inicio: string; fim: string } {
  const primeira = resumo.linhas[0]?.aplicacao.data;
  const amanha = hoje ? somarDias(hoje, 1) : null;
  const inicio = primeira ?? (amanha && ciclo.data_inicio < amanha ? amanha : ciclo.data_inicio);
  // Plano sem projeção mas com uma dose ainda pedida (dose extra, saldo que não cobre a
  // dose): o projeto fica aberto, com o check do dia, até essa dose ou a fase pós-remédio.
  // Assim, registrá-la com atraso não cobra como falta dias em que não havia onde marcar.
  const pendente = !inicioPos && resumo.proxima && !resumo.projecao.length ? maiorData(resumo.proxima.data, hoje ?? resumo.proxima.data) : null;
  const ultima = inicioPos ?? pendente ?? resumo.data_fim_prevista ?? inicio;
  const intervalo = ciclo.intervalo_dias > 0 ? ciclo.intervalo_dias : 7;
  return { inicio, fim: somarDias(maiorData(ultima, inicio), intervalo) };
}

function maiorData(a: string, b: string): string {
  return a > b ? a : b;
}

function datasEntre(de: string, ate: string): string[] {
  const n = diferencaDias(de, ate);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => somarDias(de, i));
}

export interface Contagem {
  meta: number;
  feito: number;
  /** feito / meta (0 a 1); null quando ainda não há meta */
  aderencia: number | null;
  /** Mantendo a aderência atual, quantos terão sido feitos no fim */
  projecao: number;
  total: number;
}

export interface Placar {
  inicio: string;
  fim: string;
  totalDias: number;
  /** Dias completos já passados (até ontem) dentro do projeto */
  diasDecorridos: number;
  /** Dia do projeto em que hoje cai (1 no primeiro dia; 0 antes de começar; o total depois do fim) */
  diaAtual: number;
  /** Dias depois de hoje até o fim (diaAtual + diasRestantes = totalDias) */
  diasRestantes: number;
  iniciado: boolean;
  encerrado: boolean;
  treino: Contagem;
  cardio: Contagem;
  /** km = só as distâncias anotadas; semDistancia = corridas feitas sem distância */
  corrida: Contagem & { km: number; semDistancia: number };
  bike: Contagem & { minutos: number };
  sequenciaAtual: number;
  recorde: number;
}

function contar(datas: string[], hoje: string, feito: (d: string) => boolean, totalPeriodo: number, restantesFuturos: number): Contagem {
  const passados = datas.filter((d) => d < hoje);
  const hojeFeito = datas.includes(hoje) && feito(hoje);
  const meta = passados.length + (hojeFeito ? 1 : 0);
  const feitos = passados.filter(feito).length + (hojeFeito ? 1 : 0);
  const aderencia = meta > 0 ? feitos / meta : null;
  // Hoje em aberto entra como "a fazer" na projeção
  const aFazer = restantesFuturos + (datas.includes(hoje) && !hojeFeito ? 1 : 0);
  return { meta, feito: feitos, aderencia, projecao: Math.round(feitos + (aderencia ?? 1) * aFazer), total: totalPeriodo };
}

/**
 * Corrida e bike: a meta segue a regra (2 corridas e 5 bikes por semana) e o "feito"
 * conta o cardio real de cada dia, com a aderência limitada a 100%. Hoje entra na meta
 * do tipo previsto só depois que o cardio é marcado (de qualquer tipo).
 */
function contarTipo(
  todas: string[],
  hoje: string,
  tipo: TipoCardio,
  porData: Map<string, TreinoDia>,
): Contagem {
  const doTipo = (d: string) => tipoCardio(d) === tipo;
  const fez = (d: string) => porData.get(d)?.cardio === true;
  const fezTipo = (d: string) => fez(d) && tipoCardioEfetivo(d, porData.get(d)) === tipo;
  const passados = todas.filter((d) => d < hoje);
  const temHoje = todas.includes(hoje);
  const meta = passados.filter(doTipo).length + (temHoje && doTipo(hoje) && fez(hoje) ? 1 : 0);
  const feito = passados.filter(fezTipo).length + (temHoje && fezTipo(hoje) ? 1 : 0);
  const aderencia = meta > 0 ? Math.min(feito / meta, 1) : null;
  const aFazer = todas.filter((d) => d > hoje && doTipo(d)).length + (temHoje && doTipo(hoje) && !fez(hoje) ? 1 : 0);
  const total = todas.filter(doTipo).length;
  // Com tipos trocados de dia, o feito pode passar do total da regra: a projeção não passa dos dois
  const projecao = Math.min(Math.round(feito + (aderencia ?? 1) * aFazer), Math.max(total, feito));
  return { meta, feito, aderencia, projecao, total };
}

export function calcularPlacar(dias: TreinoDia[], inicio: string, fim: string, hoje: string): Placar {
  const porData = new Map(dias.map((d) => [d.data, d]));
  const todas = datasEntre(inicio, fim);
  const ateHoje = todas.filter((d) => d <= hoje);
  const futuras = todas.filter((d) => d > hoje);
  const ok = (d: string, campo: 'treino' | 'cardio') => porData.get(d)?.[campo] === true;

  const treino = contar(ateHoje, hoje, (d) => ok(d, 'treino'), todas.length, futuras.length);
  const cardio = contar(ateHoje, hoje, (d) => ok(d, 'cardio'), todas.length, futuras.length);
  const corrida = contarTipo(todas, hoje, 'corrida', porData);
  const bike = contarTipo(todas, hoje, 'bike', porData);
  const kmCorridas = ateHoje
    .filter((d) => ok(d, 'cardio') && tipoCardioEfetivo(d, porData.get(d)) === 'corrida')
    .map((d) => porData.get(d)?.corrida_km ?? null);
  const km = kmCorridas.reduce<number>((s, k) => s + (k && k > 0 ? k : 0), 0);
  const semDistancia = kmCorridas.filter((k) => !(k && k > 0)).length;

  // Sequência: dias seguidos com treino E cardio. Hoje incompleto não quebra a sequência.
  const completo = (d: string) => ok(d, 'treino') && ok(d, 'cardio');
  let recorde = 0;
  let corrente = 0;
  for (const d of ateHoje) {
    if (completo(d)) {
      corrente++;
      recorde = Math.max(recorde, corrente);
    } else if (d !== hoje) corrente = 0;
  }

  const diasDecorridos = ateHoje.filter((d) => d < hoje).length;
  const diaAtual = hoje > fim ? todas.length : hoje >= inicio ? diasDecorridos + 1 : 0;
  return {
    inicio,
    fim,
    totalDias: todas.length,
    diasDecorridos,
    diaAtual,
    diasRestantes: todas.length - diaAtual,
    iniciado: hoje >= inicio,
    encerrado: hoje > fim,
    treino,
    cardio,
    corrida: { ...corrida, km, semDistancia },
    bike: { ...bike, minutos: bike.feito * MIN_BIKE },
    sequenciaAtual: corrente,
    recorde,
  };
}

/**
 * Linha do placar: "12,4 km corridos", mais " · 1 sem distância" quando há corrida sem distância anotada.
 * Nenhuma distância anotada: só "1 sem distância" (e não "0 km corridos", que parece nada corrido).
 */
export function textoKmCorridos(c: { km: number; semDistancia: number }): string {
  if (c.km <= 0 && c.semDistancia > 0) return `${c.semDistancia} sem distância`;
  const km = `${formatarKm(c.km)} corridos`;
  return c.semDistancia > 0 ? `${km} · ${c.semDistancia} sem distância` : km;
}

/** Corridas de um período (Análise): "2 · 6,2 km · 1 sem distância", "1 · sem distância" ou só "0". */
export function textoCorridasPeriodo(c: { feito: number; km: number; semDistancia: number }): string {
  if (c.km > 0) return `${c.feito} · ${formatarKm(c.km)}${c.semDistancia > 0 ? ` · ${c.semDistancia} sem distância` : ''}`;
  return c.semDistancia > 0 ? `${c.feito} · sem distância` : String(c.feito);
}

// ---------- Corridas ----------

export interface Corrida {
  data: string;
  km: number;
  segundos: number;
  /** segundos por km */
  pace: number;
  /** diferença de pace para a corrida anterior (negativo = mais rápido) */
  delta: number | null;
}

/** Corridas com distância E tempo anotados (só elas têm pace), em ordem de data. */
export function listarCorridas(dias: TreinoDia[]): Corrida[] {
  const lista = dias
    .filter((d) => d.cardio && d.corrida_km && d.corrida_km > 0 && d.corrida_seg && tipoCardioEfetivo(d.data, d) === 'corrida')
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((d) => ({ data: d.data, km: d.corrida_km!, segundos: d.corrida_seg!, pace: d.corrida_seg! / d.corrida_km!, delta: null as number | null }));
  // Diferença entre os paces como aparecem na tela (arredondados ao segundo): 5:13 e 5:13 = igual
  lista.forEach((c, i) => (c.delta = i > 0 ? Math.round(c.pace) - Math.round(lista[i - 1].pace) : null));
  return lista;
}

/** 330 → "5:30"; 3725 → "1:02:05" */
export function formatarTempo(seg: number): string {
  const s = Math.round(seg);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** "28:30" ou "1:02:05" → segundos; null se inválido */
export function lerTempo(texto: string): number | null {
  const partes = texto.trim().split(':').map((p) => p.trim());
  if (!partes.length || partes.length > 3 || partes.some((p) => !/^\d+$/.test(p))) return null;
  const n = partes.map(Number);
  // Minutos e segundos depois da primeira parte vão de 0 a 59 (28:90 não existe)
  if (n.slice(1).some((x) => x >= 60)) return null;
  const seg = n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n.length === 2 ? n[0] * 60 + n[1] : n[0] * 60;
  return seg > 0 ? seg : null;
}

/**
 * O teclado numérico do iPhone não tem ":". Os 2 últimos dígitos são os segundos:
 * 2830 → 28:30 · 13000 → 1:30:00 · 500 → 5:00.
 */
export function digitosParaTempo(digitos: string): string {
  const d = digitos.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 6);
  if (!d) return '';
  const p = d.padStart(3, '0');
  const seg = p.slice(-2);
  const resto = p.slice(0, -2);
  if (resto.length <= 2) return `${Number(resto)}:${seg}`;
  return `${Number(resto.slice(0, -2))}:${resto.slice(-2)}:${seg}`;
}

/** Pace plausível para corrida (2:30 a 15:00 por km); fora disso, o tempo foi digitado errado. */
export function paceValido(segPorKm: number): boolean {
  return segPorKm >= 150 && segPorKm <= 900;
}

/** Pace (s/km) e velocidade média (km/h); null sem distância ou sem tempo. */
export function ritmoCorrida(km: number | null | undefined, seg: number | null | undefined): { pace: number; kmh: number } | null {
  if (!km || km <= 0 || !seg || seg <= 0) return null;
  return { pace: seg / km, kmh: km / (seg / 3600) };
}

/** Resumo da corrida anotada: "6,2 km · 32:10 · 5:11 /km" (só o que existe); null sem distância e sem tempo. */
export function resumoCorrida(km: number | null | undefined, seg: number | null | undefined): string | null {
  const r = ritmoCorrida(km, seg);
  const partes = [km && km > 0 ? formatarKm(km) : null, seg && seg > 0 ? formatarTempo(seg) : null, r ? `${formatarTempo(r.pace)} /km` : null];
  const texto = partes.filter(Boolean).join(' · ');
  return texto || null;
}

// ---------- Semanas (segunda a domingo) ----------

export interface Semana {
  numero: number;
  segunda: string;
  dias: string[];
  /** Aderência da semana (treino + cardio juntos), considerando só dias do projeto já vencidos */
  aderencia: number | null;
  medida: Composicao | null;
}

export function segundaDaSemana(data: string): string {
  const d = diaSemana(data);
  return somarDias(data, d === 0 ? -6 : 1 - d);
}

export function semanasDoProjeto(
  dias: TreinoDia[],
  inicio: string,
  fim: string,
  hoje: string,
  composicoes: Composicao[],
): Semana[] {
  const porData = new Map(dias.map((d) => [d.data, d]));
  const semanas: Semana[] = [];
  for (let seg = segundaDaSemana(inicio), n = 1; seg <= fim; seg = somarDias(seg, 7), n++) {
    const datas = Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
    const validas = datas.filter((d) => d >= inicio && d <= fim && (d < hoje || (d === hoje && (porData.get(d)?.treino || porData.get(d)?.cardio))));
    let meta = 0;
    let feito = 0;
    for (const d of validas) {
      const r = porData.get(d);
      if (d < hoje || r?.treino) {
        meta++;
        if (r?.treino) feito++;
      }
      if (d < hoje || r?.cardio) {
        meta++;
        if (r?.cardio) feito++;
      }
    }
    // A medição de segunda (em jejum) mostra o resultado da semana ANTERIOR: junta com a semana que terminou
    const proxSeg = somarDias(seg, 7);
    // Medição atípica fica só no histórico: não vira o resultado da semana
    const daSemana = composicoes.filter((c) => !c.atipica && c.data >= proxSeg && c.data <= somarDias(proxSeg, 6));
    semanas.push({
      numero: n,
      segunda: seg,
      dias: datas,
      aderencia: meta > 0 ? feito / meta : null,
      medida: daSemana.length ? daSemana[0] : null,
    });
  }
  return semanas;
}

// ---------- Medidas do projeto ----------

/** Medida de referência do início: última até o início; se não houver, a primeira depois. */
export function medidaInicial(composicoes: Composicao[], inicio: string): Composicao | null {
  const antes = composicoes.filter((c) => c.data <= inicio);
  return antes.length ? antes[antes.length - 1] : composicoes.find((c) => c.data > inicio) ?? null;
}

/**
 * Aderência das últimas 4 semanas (só dias do projeto já vencidos; hoje entra se marcado).
 * Null com menos de 7 dias de histórico. Depois do fim do projeto, fica
 * congelada nas 4 últimas semanas do projeto (os dias seguintes não podem ser
 * marcados e virariam falta; a meta "Pelo que fiz" não muda sozinha).
 */
export function aderenciaRecente(dias: TreinoDia[], inicio: string, hoje: string, janela = 28, fim?: string): { treino: number; cardio: number; dias: number } | null {
  const encerrado = !!fim && hoje > fim;
  // Encerrado: conta como se fosse o dia seguinte ao fim (o último dia do projeto entra)
  const ref = encerrado ? somarDias(fim!, 1) : hoje;
  const de = diferencaDias(inicio, somarDias(ref, -janela)) > 0 ? somarDias(ref, -janela) : inicio;
  const porData = new Map(dias.map((d) => [d.data, d]));
  const datas = datasEntre(de, somarDias(ref, -1));
  // Hoje entra por campo, só depois de marcado: marcar o treino não conta o cardio
  // ainda por fazer como falta, e um registro desmarcado (vazio) não conta como dia perdido
  const h = !encerrado && de <= hoje ? porData.get(hoje) : undefined;
  const hTreino = h?.treino ? 1 : 0;
  const hCardio = h?.cardio ? 1 : 0;
  const n = datas.length + (hTreino || hCardio ? 1 : 0);
  if (n < 7) return null;
  return {
    treino: (datas.filter((d) => porData.get(d)?.treino).length + hTreino) / (datas.length + hTreino),
    cardio: (datas.filter((d) => porData.get(d)?.cardio).length + hCardio) / (datas.length + hCardio),
    dias: n,
  };
}

export type AderenciaTreino = { treino: number; cardio: number; dias: number; congelada_ate: string | null };

/**
 * Aderência usada na meta "Pelo que fiz" (Dieta, Início, Análise e PDF). Enquanto o
 * placar da fase pós-remédio tiver menos de 7 dias, segue a do projeto, congelada
 * no fim dele: a meta não muda sozinha na virada de placar. `congelada_ate` = último
 * dia do período usado, quando ele já acabou (o texto diz "do projeto, até dd/mm").
 */
export function aderenciaDoTreino(
  dias: TreinoDia[],
  t: { inicio: string; fim: string; placarPos?: boolean; projeto: { inicio: string; fim: string } },
  hoje: string,
): AderenciaTreino | null {
  const com = (a: ReturnType<typeof aderenciaRecente>, fim: string): AderenciaTreino | null => (a ? { ...a, congelada_ate: hoje > fim ? fim : null } : null);
  const atual = com(aderenciaRecente(dias, t.inicio, hoje, 28, t.fim), t.fim);
  if (atual || !t.placarPos) return atual;
  return com(aderenciaRecente(dias, t.projeto.inicio, hoje, 28, t.projeto.fim), t.projeto.fim);
}

// ---------- Esforço percebido (escala CR-10) ----------

/** Âncoras da escala CR-10 (Foster): o número que resume a sessão inteira. */
export const ESCALA_ESFORCO: Record<number, string> = {
  0: 'repouso',
  1: 'muito leve',
  2: 'leve',
  3: 'moderado',
  4: 'um pouco pesado',
  5: 'pesado',
  7: 'muito pesado',
  10: 'máximo',
};

/** Critério do app (não é limite clínico): média de 7 dias 1,5 ponto acima das 4 semanas anteriores. */
export const SUBIDA_ESFORCO = 1.5;
const MINIMO_ESFORCO = { semana: 3, referencia: 6 };

export interface ComparacaoEsforco {
  /** Média dos últimos 7 dias (hoje incluído); null sem registros */
  media7: number | null;
  n7: number;
  /** Média das 4 semanas anteriores (do 8º ao 35º dia para trás) */
  referencia: number | null;
  nReferencia: number;
  /** media7 − referencia; null com poucos registros (3 na semana, 6 na referência) */
  subida: number | null;
  alerta: boolean;
}

function compararEsforco(dias: TreinoDia[], hoje: string, campo: 'esforco_treino' | 'esforco_cardio'): ComparacaoEsforco {
  // Só vale o esforço de sessão marcada (desmarcar o treino ou o cardio tira o número da conta)
  const marcado = campo === 'esforco_treino' ? 'treino' : 'cardio';
  const valores = (de: string, ate: string) =>
    dias.filter((d) => d.data >= de && d.data <= ate && d[marcado] && typeof d[campo] === 'number').map((d) => d[campo] as number);
  const media = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  const semana = valores(somarDias(hoje, -6), hoje);
  const ref = valores(somarDias(hoje, -34), somarDias(hoje, -7));
  const media7 = media(semana);
  const referencia = media(ref);
  const subida = semana.length >= MINIMO_ESFORCO.semana && ref.length >= MINIMO_ESFORCO.referencia ? media7! - referencia! : null;
  return { media7, n7: semana.length, referencia, nReferencia: ref.length, subida, alerta: subida !== null && subida >= SUBIDA_ESFORCO - 1e-9 };
}

/** Esforço da musculação e do cardio: últimos 7 dias × 4 semanas anteriores. */
export function resumoEsforco(dias: TreinoDia[], hoje: string): { treino: ComparacaoEsforco; cardio: ComparacaoEsforco } {
  return { treino: compararEsforco(dias, hoje, 'esforco_treino'), cardio: compararEsforco(dias, hoje, 'esforco_cardio') };
}

// ---------- Horas de exercício do dia (para a meta de água) ----------

/** Duração estimada da musculação (o app só tem o check) */
export const MIN_MUSCULACAO = 60;
/** Corrida sem tempo anotado: duração estimada */
const MIN_CORRIDA_ESTIMADA = 30;

/**
 * Horas de treino e cardio do dia: o que foi marcado; no dia de hoje, o que ainda
 * não foi marcado conta como previsto (o dia está em aberto). Corrida com tempo
 * anotado usa o tempo real. hoje = null: nada em aberto (fora do período do projeto).
 */
export function horasExercicioDia(data: string, reg: TreinoDia | undefined | null, hoje: string | null): number {
  const aberto = data === hoje;
  const treino = reg?.treino || aberto ? MIN_MUSCULACAO : 0;
  let cardio = 0;
  if (reg?.cardio || aberto) {
    const tipo = tipoCardioEfetivo(data, reg);
    cardio = tipo === 'bike' ? MIN_BIKE : reg?.cardio && reg.corrida_seg ? reg.corrida_seg / 60 : MIN_CORRIDA_ESTIMADA;
  }
  return (treino + cardio) / 60;
}
