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

export function tipoCardio(data: string): TipoCardio {
  const d = diaSemana(data);
  return d === 3 || d === 0 ? 'corrida' : 'bike';
}

export function rotuloCardio(data: string): string {
  return tipoCardio(data) === 'corrida' ? `Corrida ${KM_CORRIDA_PADRAO} km` : `Bike ${MIN_BIKE} min`;
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

export function calcularPlacar(dias: TreinoDia[], inicio: string, fim: string, hoje: string): Placar {
  const porData = new Map(dias.map((d) => [d.data, d]));
  const todas = datasEntre(inicio, fim);
  const ateHoje = todas.filter((d) => d <= hoje);
  const futuras = todas.filter((d) => d > hoje);
  const ok = (d: string, campo: 'treino' | 'cardio') => porData.get(d)?.[campo] === true;

  const corridas = (lista: string[]) => lista.filter((d) => tipoCardio(d) === 'corrida');
  const bikes = (lista: string[]) => lista.filter((d) => tipoCardio(d) === 'bike');

  const treino = contar(ateHoje, hoje, (d) => ok(d, 'treino'), todas.length, futuras.length);
  const cardio = contar(ateHoje, hoje, (d) => ok(d, 'cardio'), todas.length, futuras.length);
  const corrida = contar(corridas(ateHoje), hoje, (d) => ok(d, 'cardio'), corridas(todas).length, corridas(futuras).length);
  const bike = contar(bikes(ateHoje), hoje, (d) => ok(d, 'cardio'), bikes(todas).length, bikes(futuras).length);
  const km = corridas(ateHoje)
    .filter((d) => ok(d, 'cardio'))
    .reduce((s, d) => s + (porData.get(d)?.corrida_km ?? KM_CORRIDA_PADRAO), 0);

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
    .filter((d) => d.cardio && d.corrida_seg && tipoCardio(d.data) === 'corrida')
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
  const seg = n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n.length === 2 ? n[0] * 60 + n[1] : n[0] * 60;
  return seg > 0 ? seg : null;
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
    const daSemana = composicoes.filter((c) => c.data >= seg && c.data <= datas[6]);
    semanas.push({
      numero: n,
      segunda: seg,
      dias: datas,
      aderencia: meta > 0 ? feito / meta : null,
      medida: daSemana.length ? daSemana[daSemana.length - 1] : null,
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
