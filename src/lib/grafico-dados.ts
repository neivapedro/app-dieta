// Preparo dos dados do gráfico de tempo (sem DOM): datas unidas, valor perto de uma data,
// tolerância de sincronia e o resumo em texto para leitores de tela.
import { dataCurta, formatarNumero, paraDiaNum, type Janela } from './grafico-escalas';

export interface PontoBruto {
  data: string;
  valor: number | null;
  atipico?: boolean;
}

export interface SerieDias {
  /** números de dia, crescentes, sem repetição (o último valor do dia vale) */
  dias: number[];
  valores: (number | null)[];
  atipicos: boolean[];
  /** até quantos dias de distância um ponto ainda "vale" para uma data sem medida (metade do intervalo típico) */
  tolerancia: number;
}

/** Ordena por data, junta repetidos e mede o intervalo típico entre medidas. */
export function prepararPontos(pontos: PontoBruto[]): SerieDias {
  const porDia = new Map<number, PontoBruto>();
  for (const p of pontos) {
    if (!p || typeof p.data !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(p.data)) continue;
    porDia.set(paraDiaNum(p.data), p);
  }
  const dias = [...porDia.keys()].sort((a, b) => a - b);
  const valores = dias.map((d) => {
    const v = porDia.get(d)!.valor;
    return v === null || v === undefined || !Number.isFinite(v) ? null : v;
  });
  const atipicos = dias.map((d) => !!porDia.get(d)!.atipico);
  const comValor = dias.filter((_, i) => valores[i] !== null);
  const gaps: number[] = [];
  for (let i = 1; i < comValor.length; i++) gaps.push(comValor[i] - comValor[i - 1]);
  gaps.sort((a, b) => a - b);
  const mediana = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1;
  return { dias, valores, atipicos, tolerancia: Math.max(0, Math.floor(mediana / 2)) };
}

/** Todas as datas (números de dia) das listas, crescentes e sem repetição. */
export function unirDias(listas: number[][]): number[] {
  const s = new Set<number>();
  for (const l of listas) for (const d of l) s.add(d);
  return [...s].sort((a, b) => a - b);
}

/** Extensão (primeiro e último dia) das listas; null se vazias. */
export function extensaoDias(listas: number[][]): Janela | null {
  let de = Infinity;
  let ate = -Infinity;
  for (const l of listas) {
    if (!l.length) continue;
    de = Math.min(de, l[0]);
    ate = Math.max(ate, l[l.length - 1]);
  }
  return Number.isFinite(de) ? { de, ate } : null;
}

/**
 * Valor da série no dia: o ponto do próprio dia ou, sem ele, o mais perto dentro da tolerância
 * (ex.: peso semanal num dia sem pesagem). Nulos não contam.
 */
export function valorNoDia(s: SerieDias, dia: number, tolerancia = s.tolerancia): { dia: number; valor: number; indice: number; atipico: boolean } | null {
  const n = s.dias.length;
  if (!n) return null;
  // Primeiro índice depois do dia (busca binária)
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (s.dias[m] <= dia) lo = m + 1;
    else hi = m;
  }
  // O mais perto com valor de cada lado, dentro da tolerância
  let esq = -1;
  for (let j = lo - 1; j >= 0 && dia - s.dias[j] <= tolerancia; j--) {
    if (s.valores[j] !== null) {
      esq = j;
      break;
    }
  }
  let dir = -1;
  for (let j = lo; j < n && s.dias[j] - dia <= tolerancia; j++) {
    if (s.valores[j] !== null) {
      dir = j;
      break;
    }
  }
  if (esq < 0 && dir < 0) return null;
  const j = esq < 0 ? dir : dir < 0 ? esq : dia - s.dias[esq] <= s.dias[dir] - dia ? esq : dir;
  return { dia: s.dias[j], valor: s.valores[j]!, indice: j, atipico: s.atipicos[j] };
}

/**
 * Valor em vigor no dia para séries em degrau (ex.: dose): o último ponto com valor até o dia,
 * se ainda dentro de `limite` dias (depois disso o degrau acabou).
 */
export function valorVigente(s: SerieDias, dia: number, limite = Math.max(1, s.tolerancia * 2)): { dia: number; valor: number; indice: number; atipico: boolean } | null {
  for (let j = s.dias.length - 1; j >= 0; j--) {
    if (s.dias[j] > dia) continue;
    if (s.valores[j] === null) return null;
    const ultimo = j === s.dias.length - 1;
    // No meio da série o degrau vale até o próximo ponto; depois do último, por `limite` dias
    if (ultimo && dia - s.dias[j] > limite) return null;
    return { dia: s.dias[j], valor: s.valores[j]!, indice: j, atipico: s.atipicos[j] };
  }
  return null;
}

/** Índices dos pontos dentro da janela, mais um vizinho de cada lado (a linha chega até a borda). */
export function indicesVisiveis(dias: number[], j: Janela): [number, number] {
  if (!dias.length) return [0, -1];
  let a = 0;
  while (a < dias.length && dias[a] < j.de) a++;
  let b = dias.length - 1;
  while (b >= 0 && dias[b] > j.ate) b--;
  return [Math.max(0, a - 1), Math.min(dias.length - 1, b + 1)];
}

/** "Peso: de 92,1 kg (01/09) a 86,4 kg (26/10); mín. 86,4, máx. 92,1" */
export function resumoSerie(nome: string, pontos: PontoBruto[], casas = 1, unidade = ''): string {
  const v = pontos.filter((p) => p.valor !== null && Number.isFinite(p.valor) && !p.atipico).sort((a, b) => (a.data < b.data ? -1 : 1));
  if (!v.length) return `${nome}: sem dados`;
  const u = unidade ? ` ${unidade}` : '';
  const f = (n: number) => formatarNumero(n, casas) + u;
  const prim = v[0];
  const ult = v[v.length - 1];
  if (v.length === 1) return `${nome}: ${f(prim.valor!)} em ${dataCurta(prim.data)}`;
  const nums = v.map((p) => p.valor!);
  return `${nome}: de ${f(prim.valor!)} (${dataCurta(prim.data)}) a ${f(ult.valor!)} (${dataCurta(ult.data)}); mín. ${f(Math.min(...nums))}, máx. ${f(Math.max(...nums))}`;
}
