import type { ResumoCiclo } from './ciclo';
import { diferencaDias } from './datas';
import { composicao, type Composicao } from './gordura';
import type { Medida, RegistroDiario, Sexo } from './tipos';

export interface PontoPeso {
  data: string;
  peso_kg: number;
  origem: 'diario' | 'medida';
}

/** Une os pesos do diário e das medições. No mesmo dia, vale a medição. */
export function serieDePeso(diario: RegistroDiario[], medidas: Medida[]): PontoPeso[] {
  const porData = new Map<string, PontoPeso>();
  for (const r of diario) {
    if (r.peso_kg !== null) porData.set(r.data, { data: r.data, peso_kg: r.peso_kg, origem: 'diario' });
  }
  for (const m of medidas) porData.set(m.data, { data: m.data, peso_kg: m.peso_kg, origem: 'medida' });
  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/** Último peso até a data; se não houver, o primeiro depois dela. */
function pesoReferencia(serie: PontoPeso[], data: string): PontoPeso | null {
  let antes: PontoPeso | null = null;
  for (const p of serie) {
    if (p.data <= data) antes = p;
    else return antes ?? p;
  }
  return antes;
}

function ultimoPesoAte(serie: PontoPeso[], data: string): PontoPeso | null {
  let r: PontoPeso | null = null;
  for (const p of serie) if (p.data <= data) r = p;
  return r;
}

export interface AnaliseFase {
  indice: number;
  nome: string;
  dose_mg: number;
  doses: number;
  inicio: string;
  fim: string;
  dias: number;
  peso_inicio: number | null;
  peso_fim: number | null;
  variacao_kg: number | null;
  kg_por_semana: number | null;
  nausea_media: number | null;
  nausea_max: number | null;
  em_andamento: boolean;
}

export function analisarFases(
  resumo: ResumoCiclo,
  serie: PontoPeso[],
  diario: RegistroDiario[],
  hoje: string,
): AnaliseFase[] {
  const faseProxima = resumo.proxima?.fase.indice ?? null;
  const grupos = new Map<number, typeof resumo.linhas>();
  for (const l of resumo.linhas) {
    const g = grupos.get(l.fase.indice) ?? [];
    g.push(l);
    grupos.set(l.fase.indice, g);
  }
  const indices = [...grupos.keys()].sort((a, b) => a - b);
  return indices.map((indice, pos) => {
    const linhas = grupos.get(indice)!;
    const inicio = linhas[0].aplicacao.data;
    const proximoInicio = indices[pos + 1] !== undefined ? grupos.get(indices[pos + 1])![0].aplicacao.data : null;
    // A última fase com aplicações só está "em andamento" se a próxima dose ainda for dela
    const em_andamento = proximoInicio === null && faseProxima === indice;
    const fim = proximoInicio ?? hoje;
    const dias = Math.max(diferencaDias(inicio, fim), 0);
    const pIni = pesoReferencia(serie, inicio);
    const pFim = ultimoPesoAte(serie, fim);
    const variacao = pIni && pFim && pFim.data > pIni.data ? pFim.peso_kg - pIni.peso_kg : null;
    const nauseas = diario
      .filter((r) => r.data >= inicio && (proximoInicio === null ? r.data <= hoje : r.data < fim) && r.nausea !== null)
      .map((r) => r.nausea as number);
    return {
      indice,
      nome: linhas[0].fase.fase.nome,
      dose_mg: linhas[0].fase.fase.dose_mg,
      doses: linhas.length,
      inicio,
      fim,
      dias,
      peso_inicio: pIni?.peso_kg ?? null,
      peso_fim: pFim?.peso_kg ?? null,
      variacao_kg: variacao,
      kg_por_semana: variacao !== null && dias > 0 ? (variacao / dias) * 7 : null,
      nausea_media: nauseas.length ? nauseas.reduce((s, n) => s + n, 0) / nauseas.length : null,
      nausea_max: nauseas.length ? Math.max(...nauseas) : null,
      em_andamento,
    };
  });
}

export interface AnaliseGeral {
  inicio_ciclo: string;
  semanas_ciclo: number;
  peso_inicial: PontoPeso | null;
  peso_atual: PontoPeso | null;
  variacao_kg: number | null;
  variacao_percentual: number | null;
  kg_por_semana: number | null;
  medida_inicial: Composicao | null;
  medida_atual: Composicao | null;
}

/**
 * Compara o "antes" (referência no início do ciclo) com o "agora".
 * Medida inicial = última medição até a 1ª aplicação; se não houver, a primeira registrada.
 */
export function analisarGeral(
  inicio_ciclo: string,
  serie: PontoPeso[],
  medidas: Medida[],
  sexo: Sexo,
  hoje: string,
): AnaliseGeral {
  const peso_inicial = pesoReferencia(serie, inicio_ciclo);
  const peso_atual = serie.length ? serie[serie.length - 1] : null;
  const temVariacao = peso_inicial && peso_atual && peso_atual.data > peso_inicial.data;
  const variacao = temVariacao ? peso_atual.peso_kg - peso_inicial.peso_kg : null;
  const diasCiclo = Math.max(diferencaDias(inicio_ciclo, hoje), 0);
  const diasPeso = temVariacao ? diferencaDias(peso_inicial.data, peso_atual.data) : 0;

  const ordenadas = [...medidas].sort((a, b) => a.data.localeCompare(b.data));
  const antes = ordenadas.filter((m) => m.data <= inicio_ciclo);
  const mIni = antes.length ? antes[antes.length - 1] : ordenadas[0];
  const mAtual = ordenadas[ordenadas.length - 1];

  return {
    inicio_ciclo,
    semanas_ciclo: diasCiclo / 7,
    peso_inicial,
    peso_atual,
    variacao_kg: variacao,
    variacao_percentual: variacao !== null && peso_inicial ? variacao / peso_inicial.peso_kg : null,
    kg_por_semana: variacao !== null && diasPeso > 0 ? (variacao / diasPeso) * 7 : null,
    medida_inicial: mIni ? composicao(mIni, sexo) : null,
    medida_atual: mAtual && mAtual !== mIni ? composicao(mAtual, sexo) : null,
  };
}
