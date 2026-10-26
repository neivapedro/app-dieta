// Filtro de período da Análise (7 dias, 4 e 8 semanas, ciclo, cada bloco de dose) e as
// contas do painel recortadas nele. Só descrevem os registros; nunca sugerem dose.
import type { AnaliseFase, PontoPeso } from './analise';
import { tendenciaPeso } from './conferencia';
import { diferencaDias, formatarData, somarDias } from './datas';
import type { Composicao } from './gordura';

export interface OpcaoPeriodo {
  /** Valor no endereço (?periodo=4s) */
  chave: string;
  /** Rótulo da pílula ("4 sem", "F2 1,5") */
  rotulo: string;
  /** Como dizer o período num texto ("nas últimas 4 semanas", "na fase F2 (1,5 mg)") */
  quando: string;
  de: string;
  ate: string;
  tipo: 'janela' | 'ciclo' | 'fase';
  /** Índice do bloco em `fases` (só no tipo fase) */
  fase?: number;
}

/** Referência de uma medição: até 7 dias antes do início do período (como nas fases). */
export const DIAS_REFERENCIA = 7;

const dose = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Fim do bloco: o que não é o último termina na véspera do seguinte (o dia da troca fica com o novo). */
export function fimDoBloco(fases: Pick<AnaliseFase, 'fim'>[], i: number): string {
  return i === fases.length - 1 ? fases[i].fim : somarDias(fases[i].fim, -1);
}

/** "F2 1,5": a fase do plano quando o bloco se encaixa nela (e só ele), senão o nº do bloco. */
export function rotuloFaseCurto(fases: Pick<AnaliseFase, 'dose_mg' | 'fase_indice'>[], i: number): string {
  const f = fases[i];
  const unica = f.fase_indice !== null && fases.filter((x) => x.fase_indice === f.fase_indice).length === 1;
  return `${unica ? `F${f.fase_indice! + 1}` : `B${i + 1}`} ${dose(f.dose_mg)}`;
}

/** As opções do filtro. 8 semanas só com o ciclo mais longo que 4; fases só com 2 blocos ou mais. */
export function opcoesPeriodo(e: { hoje: string; inicio: string; fases: Pick<AnaliseFase, 'dose_mg' | 'fase_indice' | 'inicio' | 'fim'>[] }): OpcaoPeriodo[] {
  const { hoje, inicio, fases } = e;
  const lista: OpcaoPeriodo[] = [
    { chave: '1s', rotulo: '7 dias', quando: 'nos últimos 7 dias', de: somarDias(hoje, -6), ate: hoje, tipo: 'janela' },
    { chave: '4s', rotulo: '4 sem', quando: 'nas últimas 4 semanas', de: somarDias(hoje, -28), ate: hoje, tipo: 'janela' },
  ];
  if (diferencaDias(inicio, hoje) > 28) lista.push({ chave: '8s', rotulo: '8 sem', quando: 'nas últimas 8 semanas', de: somarDias(hoje, -56), ate: hoje, tipo: 'janela' });
  lista.push({ chave: 'ciclo', rotulo: 'Ciclo', quando: 'desde o início', de: inicio <= hoje ? inicio : hoje, ate: hoje, tipo: 'ciclo' });
  if (fases.length >= 2) {
    fases.forEach((f, i) => {
      const rotulo = rotuloFaseCurto(fases, i);
      lista.push({ chave: `f${i + 1}`, rotulo, quando: `na fase ${rotulo.split(' ')[0]} (${dose(f.dose_mg)} mg)`, de: f.inicio, ate: fimDoBloco(fases, i), tipo: 'fase', fase: i });
    });
  }
  return lista;
}

/** Opção do endereço; sem ela (ou inválida), o ciclo. */
export function lerPeriodo(chave: string | null | undefined, opcoes: OpcaoPeriodo[]): OpcaoPeriodo {
  return opcoes.find((o) => o.chave === chave) ?? opcoes.find((o) => o.chave === 'ciclo')!;
}

/** "05/10 → 02/11" (com o ano quando os dois não são do ano de `hoje`) */
export function textoIntervalo(de: string, ate: string, hoje?: string): string {
  const curta = (d: string) => (hoje && d.slice(0, 4) !== hoje.slice(0, 4) ? formatarData(d, true) : formatarData(d).slice(0, 5));
  return `${curta(de)} → ${curta(ate)}`;
}

export interface ParPeriodo<T> {
  /** Referência: a última até 7 dias antes do início; senão, a primeira dentro do período */
  ini: T | null;
  /** A última dentro do período; sem nenhuma, a última antes do fim (sem variação) */
  fim: T | null;
  /** fim posterior a ini: dá para medir a variação */
  comVariacao: boolean;
}

/** Primeira × última medição válida do período (pontos em ordem de data). */
export function parNoPeriodo<T extends { data: string }>(pontos: T[], de: string, ate: string): ParPeriodo<T> {
  const ref = somarDias(de, -DIAS_REFERENCIA);
  let antes: T | null = null;
  let primeira: T | null = null;
  let ultima: T | null = null;
  let ultimaAteFim: T | null = null;
  for (const p of pontos) {
    if (p.data > ate) break;
    ultimaAteFim = p;
    if (p.data >= ref && p.data <= de) antes = p;
    if (p.data >= de) {
      primeira ??= p;
      ultima = p;
    }
  }
  const ini = antes ?? primeira;
  const fim = ultima ?? ultimaAteFim;
  return { ini, fim, comVariacao: !!(ini && ultima && ultima.data > ini.data) };
}

/** Pontos do período (com a referência até 7 dias antes), para linhas e regressões. */
export function noPeriodo<T extends { data: string }>(pontos: T[], de: string, ate: string, comReferencia = false): T[] {
  const ini = comReferencia ? parNoPeriodo(pontos, de, ate).ini?.data ?? de : de;
  return pontos.filter((p) => p.data >= ini && p.data <= ate);
}

/** Blocos de dose que tocam o período. */
export function fasesNoPeriodo(fases: Pick<AnaliseFase, 'inicio' | 'fim'>[], de: string, ate: string): number[] {
  return fases.map((_, i) => i).filter((i) => fases[i].inicio <= ate && fimDoBloco(fases, i) >= de);
}

export interface ResumoPeriodo {
  comp: ParPeriodo<Composicao>;
  peso: ParPeriodo<{ data: string; peso_kg: number }>;
  variacao_kg: number | null;
  variacao_percentual: number | null;
  /** Tendência do peso dentro do período (3 pesagens cobrindo 14 dias) */
  tendencia: { kg_semana: number; pontos: number } | null;
  /** 'medições' ou 'pesagens' (a fonte da tendência) */
  fonte: 'medições' | 'pesagens';
}

/**
 * Corpo no período: medições normais (atípicas fora) e o peso pela mesma regra do
 * resumo do ciclo (com 2 medições ou mais, só as medições; senão, as pesagens).
 */
export function resumoPeriodo(e: { serie: PontoPeso[]; composicoes: Composicao[]; de: string; ate: string }): ResumoPeriodo {
  const normais = e.composicoes.filter((c) => !c.atipica);
  const comp = parNoPeriodo(normais, e.de, e.ate);
  const pelaMedida = normais.length >= 2;
  const pesos = pelaMedida ? normais.map((c) => ({ data: c.data, peso_kg: c.peso_kg })) : e.serie.filter((p) => !p.atipica);
  const peso = parNoPeriodo(pesos, e.de, e.ate);
  const variacao_kg = peso.comVariacao ? peso.fim!.peso_kg - peso.ini!.peso_kg : null;
  // Ritmo: as medições quando há 3 ou mais no período; senão, todas as pesagens
  const dias = Math.max(diferencaDias(e.de, e.ate), 1);
  const medidasP = e.serie.filter((p) => p.origem === 'medida' && p.data >= e.de && p.data <= e.ate && !p.atipica);
  const fonte = medidasP.length >= 3 ? 'medições' : 'pesagens';
  const base = (fonte === 'medições' ? e.serie.filter((p) => p.origem === 'medida') : e.serie).filter((p) => p.data >= e.de);
  return {
    comp,
    peso,
    variacao_kg,
    variacao_percentual: variacao_kg !== null ? variacao_kg / peso.ini!.peso_kg : null,
    tendencia: tendenciaPeso(base, e.ate, dias),
    fonte,
  };
}
