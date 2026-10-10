import type { ResumoCiclo } from './ciclo';
import { diferencaDias, somarDias } from './datas';
import type { Composicao } from './gordura';
import type { Ciclo, TreinoDia } from './tipos';

// Regras do projeto de treino (planilha do Pedro):
// - 1 treino por dia, todos os dias (sem folga: dia sem check conta como não feito);
// - 1 cardio por dia: corrida de 5 km na quarta e no domingo; bike 30 min nos demais.
// - O dia de hoje só entra na meta quando é marcado (ainda está em aberto).

export const KM_CORRIDA_PADRAO = 5;
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

export function rotuloTipoCardio(tipo: TipoCardio): string {
  return tipo === 'corrida' ? `Corrida ${KM_CORRIDA_PADRAO} km` : `Bike ${MIN_BIKE} min`;
}

export function rotuloCardio(data: string, reg?: Pick<TreinoDia, 'cardio_tipo' | 'corrida_km'> | null): string {
  return rotuloTipoCardio(tipoCardioEfetivo(data, reg));
}

/** Do dia da 1ª aplicação até 7 dias depois da última (real ou prevista). */
export function periodoProjeto(ciclo: Ciclo, resumo: ResumoCiclo): { inicio: string; fim: string } {
  const inicio = resumo.linhas[0]?.aplicacao.data ?? ciclo.data_inicio;
  const ultima = resumo.data_fim_prevista ?? inicio;
  return { inicio, fim: somarDias(ultima, 7) };
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
  diasRestantes: number;
  iniciado: boolean;
  encerrado: boolean;
  treino: Contagem;
  cardio: Contagem;
  corrida: Contagem & { km: number };
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
  const km = ateHoje
    .filter((d) => ok(d, 'cardio') && tipoCardioEfetivo(d, porData.get(d)) === 'corrida')
    .reduce((s, d) => {
      const k = porData.get(d)?.corrida_km;
      return s + (k && k > 0 ? k : KM_CORRIDA_PADRAO);
    }, 0);

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

  return {
    inicio,
    fim,
    totalDias: todas.length,
    diasDecorridos: ateHoje.filter((d) => d < hoje).length,
    diasRestantes: futuras.length + (hoje >= inicio && hoje <= fim ? 1 : 0),
    iniciado: hoje >= inicio,
    encerrado: hoje > fim,
    treino,
    cardio,
    corrida: { ...corrida, km },
    bike: { ...bike, minutos: bike.feito * MIN_BIKE },
    sequenciaAtual: corrente,
    recorde,
  };
}

// ---------- Corridas ----------

export interface Corrida {
  data: string;
  km: number;
  segundos: number;
  /** segundos por km */
  pace: number;
  /** diferença de pace para a corrida anterior com tempo (negativo = mais rápido) */
  delta: number | null;
}

export function listarCorridas(dias: TreinoDia[]): Corrida[] {
  const lista = dias
    .filter((d) => d.cardio && d.corrida_seg && tipoCardioEfetivo(d.data, d) === 'corrida')
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((d) => {
      const km = d.corrida_km && d.corrida_km > 0 ? d.corrida_km : KM_CORRIDA_PADRAO;
      return { data: d.data, km, segundos: d.corrida_seg!, pace: d.corrida_seg! / km, delta: null as number | null };
    });
  lista.forEach((c, i) => (c.delta = i > 0 ? c.pace - lista[i - 1].pace : null));
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
    const daSemana = composicoes.filter((c) => c.data >= proxSeg && c.data <= somarDias(proxSeg, 6));
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
 * Null com menos de 7 dias de histórico ou depois do fim do projeto (os dias
 * não podem mais ser marcados e virariam falta).
 */
export function aderenciaRecente(dias: TreinoDia[], inicio: string, hoje: string, janela = 28, fim?: string): { treino: number; cardio: number; dias: number } | null {
  if (fim && hoje > fim) return null;
  const de = diferencaDias(inicio, somarDias(hoje, -janela)) > 0 ? somarDias(hoje, -janela) : inicio;
  const porData = new Map(dias.map((d) => [d.data, d]));
  const datas = datasEntre(de, somarDias(hoje, -1));
  if (porData.has(hoje)) datas.push(hoje);
  if (datas.length < 7) return null;
  const n = datas.length;
  return {
    treino: datas.filter((d) => porData.get(d)?.treino).length / n,
    cardio: datas.filter((d) => porData.get(d)?.cardio).length / n,
    dias: n,
  };
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
  const valores = (de: string, ate: string) =>
    dias.filter((d) => d.data >= de && d.data <= ate && typeof d[campo] === 'number').map((d) => d[campo] as number);
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
/** Corrida sem tempo anotado: 5 km a ~6 min/km */
const MIN_CORRIDA_ESTIMADA = 30;

/**
 * Horas de treino e cardio do dia: o que foi marcado; no dia de hoje, o que ainda
 * não foi marcado conta como previsto (o dia está em aberto). Corrida com tempo
 * anotado usa o tempo real.
 */
export function horasExercicioDia(data: string, reg: TreinoDia | undefined | null, hoje: string): number {
  const aberto = data === hoje;
  const treino = reg?.treino || aberto ? MIN_MUSCULACAO : 0;
  let cardio = 0;
  if (reg?.cardio || aberto) {
    const tipo = tipoCardioEfetivo(data, reg);
    cardio = tipo === 'bike' ? MIN_BIKE : reg?.cardio && reg.corrida_seg ? reg.corrida_seg / 60 : MIN_CORRIDA_ESTIMADA;
  }
  return (treino + cardio) / 60;
}
