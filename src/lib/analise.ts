import type { ResumoCiclo } from './ciclo';
import { reta } from './conferencia';
import { diferencaDias, somarDias } from './datas';
import type { Composicao } from './gordura';
import type { Medida, RegistroDiario, TreinoDia } from './tipos';

export interface PontoPeso {
  data: string;
  peso_kg: number;
  origem: 'diario' | 'medida';
  /** Medição atípica: aparece no gráfico, fica fora de tendências */
  atipica?: boolean;
}

/** Une os pesos do diário e das medições. No mesmo dia, vale a medição. */
export function serieDePeso(diario: RegistroDiario[], medidas: Medida[]): PontoPeso[] {
  const porData = new Map<string, PontoPeso>();
  for (const r of diario) {
    if (r.peso_kg !== null) porData.set(r.data, { data: r.data, peso_kg: r.peso_kg, origem: 'diario' });
  }
  for (const m of medidas) porData.set(m.data, { data: m.data, peso_kg: m.peso_kg, origem: 'medida', ...(m.atipica ? { atipica: true } : {}) });
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

/**
 * Resultado de um bloco de aplicações seguidas com a mesma dose aplicada.
 * Blocos separados com a mesma dose não se juntam (ex.: voltou a 1,25 mg).
 */
export interface AnaliseFase {
  /** Índice do bloco (não da fase do plano) */
  indice: number;
  /** Fase do plano em que o bloco se encaixa; null = dose fora do plano */
  fase_indice: number | null;
  nome: string;
  /** Dose realmente aplicada no bloco */
  dose_mg: number;
  doses: number;
  inicio: string;
  fim: string;
  dias: number;
  peso_inicio: number | null;
  peso_fim: number | null;
  /** Variação total entre a referência e a última pesagem da fase */
  variacao_kg: number | null;
  /** Inclinação da regressão (kg/semana); null com poucos dados */
  kg_por_semana: number | null;
  /** Erro padrão do kg/semana (resíduos com piso de 0,5 kg) */
  erro_semana: number | null;
  /** Menos de 3 pesagens ou menos de 14 dias: sem ritmo confiável (sem "/sem" e sem cor) */
  poucos_dados: boolean;
  /** Comparação com a fase anterior, pela diferença mínima detectável */
  vs_anterior: ComparacaoFase | null;
  nausea_media: number | null;
  nausea_max: number | null;
  em_andamento: boolean;
}

export interface ComparacaoFase {
  /** kg/sem desta fase − kg/sem da anterior (negativo = perdendo mais rápido) */
  diferenca: number;
  /** Diferença mínima detectável: 1,96·√(EP² + EP_anterior²) */
  dmd: number;
  estado: 'parecida' | 'mais_rapida' | 'mais_lenta';
}

/** Piso do desvio dos resíduos do peso: com poucas pesagens a reta parece mais certa do que é. */
const PISO_RESIDUO_PESO = 0.5;

/** Ritmo da fase precisa de 3 pontos cobrindo 14 dias. */
export const MINIMO_RITMO = { pontos: 3, dias: 14 } as const;

/** Compara o kg/sem de cada fase com o da anterior: abaixo da DMD, "parecida". */
export function compararFases(a: { kg_por_semana: number | null; erro_semana: number | null }, b: { kg_por_semana: number | null; erro_semana: number | null }): ComparacaoFase | null {
  if (a.kg_por_semana === null || b.kg_por_semana === null || a.erro_semana === null || b.erro_semana === null) return null;
  const diferenca = b.kg_por_semana - a.kg_por_semana;
  const dmd = 1.96 * Math.sqrt(a.erro_semana ** 2 + b.erro_semana ** 2);
  return { diferenca, dmd, estado: Math.abs(diferenca) < dmd ? 'parecida' : diferenca < 0 ? 'mais_rapida' : 'mais_lenta' };
}

export function analisarFases(
  resumo: ResumoCiclo,
  serie: PontoPeso[],
  diario: RegistroDiario[],
  hoje: string,
): AnaliseFase[] {
  // O último bloco só está "em andamento" se o degrau ainda não completou
  const degrauAberto = !!resumo.proxima && (resumo.degrau.estado === 'em_curso' || resumo.degrau.estado === 'fora_do_plano');
  const grupos = new Map<number, typeof resumo.linhas>();
  for (const l of resumo.linhas) {
    const g = grupos.get(l.bloco) ?? [];
    g.push(l);
    grupos.set(l.bloco, g);
  }
  const indices = [...grupos.keys()].sort((a, b) => a - b);
  return indices.map((indice, pos) => {
    const linhas = grupos.get(indice)!;
    const inicio = linhas[0].aplicacao.data;
    const proximoInicio = indices[pos + 1] !== undefined ? grupos.get(indices[pos + 1])![0].aplicacao.data : null;
    const em_andamento = proximoInicio === null && degrauAberto;
    const fase = linhas[linhas.length - 1].fase;
    const fim = proximoInicio ?? hoje;
    const dias = Math.max(diferencaDias(inicio, fim), 0);
    // Pesagens da fase: a de referência (até 7 dias antes do início) e todas até a
    // véspera da fase seguinte; medições atípicas ficam de fora
    const ultimoDia = proximoInicio ? somarDias(proximoInicio, -1) : hoje;
    const naFase = serie.filter((p) => !p.atipica && p.data >= somarDias(inicio, -7) && p.data <= ultimoDia);
    const antesDoInicio = naFase.filter((p) => p.data <= inicio);
    const pIni = antesDoInicio.length ? antesDoInicio[antesDoInicio.length - 1] : (naFase[0] ?? null);
    const pontos = pIni ? naFase.filter((p) => p.data >= pIni.data) : [];
    const pFim = pontos.length ? pontos[pontos.length - 1] : null;
    const temVariacao = !!(pIni && pFim && pFim.data > pIni.data);
    const variacao = temVariacao ? pFim!.peso_kg - pIni!.peso_kg : null;
    // kg/semana pela regressão de todas as pesagens (3+ pontos cobrindo 14+ dias)
    const diasPesagens = temVariacao ? diferencaDias(pIni!.data, pFim!.data) : 0;
    const temRitmo = pontos.length >= MINIMO_RITMO.pontos && diasPesagens >= MINIMO_RITMO.dias;
    const r = temRitmo ? reta(pontos.map((p) => diferencaDias(pIni!.data, p.data)), pontos.map((p) => p.peso_kg)) : null;
    const nauseas = diario
      .filter((r) => r.data >= inicio && (proximoInicio === null ? r.data <= hoje : r.data < fim) && r.nausea !== null)
      .map((r) => r.nausea as number);
    return {
      indice,
      fase_indice: fase?.indice ?? null,
      nome: fase?.fase.nome ?? 'Fora do plano',
      dose_mg: linhas[0].aplicacao.dose_mg,
      doses: linhas.length,
      inicio,
      fim,
      dias,
      peso_inicio: pIni?.peso_kg ?? null,
      peso_fim: pFim?.peso_kg ?? null,
      variacao_kg: variacao,
      kg_por_semana: r ? r.inclinacao * 7 : null,
      erro_semana: r ? (Math.max(r.s, PISO_RESIDUO_PESO) / Math.sqrt(r.sxx)) * 7 : null,
      poucos_dados: !temRitmo,
      vs_anterior: null as ComparacaoFase | null,
      nausea_media: nauseas.length ? nauseas.reduce((s, n) => s + n, 0) / nauseas.length : null,
      nausea_max: nauseas.length ? Math.max(...nauseas) : null,
      em_andamento,
    };
  }).map((f, i, todas) => (i > 0 ? { ...f, vs_anterior: compararFases(todas[i - 1], f) } : f));
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
 * Medida inicial = última medição até a 1ª aplicação; se não houver, a primeira registrada
 * (medições atípicas ficam de fora).
 * Peso: com 2+ medições, vem só das medições (em jejum, às segundas), a mesma
 * fonte de Medidas e da Análise; sem isso, das pesagens do Diário.
 */
export function analisarGeral(inicio_ciclo: string, serie: PontoPeso[], todas: Composicao[], hoje: string): AnaliseGeral {
  // Medição atípica (doente, inchado, viagem) não vira "início" nem "agora"
  const normais = todas.filter((c) => !c.atipica);
  const composicoes = normais.length ? normais : todas;
  const antes = composicoes.filter((c) => c.data <= inicio_ciclo);
  const mIni = antes.length ? antes[antes.length - 1] : (composicoes[0] ?? null);
  const mAtual = composicoes.length ? composicoes[composicoes.length - 1] : null;
  const pelaMedida = composicoes.length >= 2;
  const ponto = (c: Composicao): PontoPeso => ({ data: c.data, peso_kg: c.peso_kg, origem: 'medida' });
  const peso_inicial = pelaMedida ? ponto(mIni!) : pesoReferencia(serie, inicio_ciclo);
  const peso_atual = pelaMedida ? ponto(mAtual!) : serie.length ? serie[serie.length - 1] : null;
  const temVariacao = peso_inicial && peso_atual && peso_atual.data > peso_inicial.data;
  const variacao = temVariacao ? peso_atual.peso_kg - peso_inicial.peso_kg : null;
  const diasCiclo = Math.max(diferencaDias(inicio_ciclo, hoje), 0);
  const diasPeso = temVariacao ? diferencaDias(peso_inicial.data, peso_atual.data) : 0;

  return {
    inicio_ciclo,
    semanas_ciclo: diasCiclo / 7,
    peso_inicial,
    peso_atual,
    variacao_kg: variacao,
    variacao_percentual: variacao !== null && peso_inicial ? variacao / peso_inicial.peso_kg : null,
    kg_por_semana: variacao !== null && diasPeso > 0 ? (variacao / diasPeso) * 7 : null,
    medida_inicial: mIni,
    medida_atual: mAtual && mAtual !== mIni ? mAtual : null,
  };
}

// ---------- Composição e treino por fase ----------

export interface ComposicaoFase {
  indice: number;
  de: Composicao | null;
  ate: Composicao | null;
  cintura: number | null;
  gorda: number | null;
  magra: number | null;
  /** Massa gorda por semana, pela regressão das medições da fase (3+ cobrindo 14+ dias) */
  gorda_semana: number | null;
  /** Fração da perda de peso da fase que saiu de massa magra (pela regressão); null sem perda ou com poucos dados */
  magra_pct: number | null;
  /** Menos de 3 medições ou de 14 dias na fase */
  poucos_dados: boolean;
  /** Aderência (0 a 1) de treino e cardio na fase, só para quem tem a aba Treino */
  treino: number | null;
  cardio: number | null;
}

/**
 * Para cada fase: última medição até o início × última medição antes da fase seguinte
 * (o dia da troca de fase fica com a fase nova).
 */
export function composicaoPorFase(fases: AnaliseFase[], todas: Composicao[], treinos: TreinoDia[] | null, hoje: string): ComposicaoFase[] {
  // Medições atípicas (doente, inchado, viagem) ficam fora da comparação entre fases
  const composicoes = todas.filter((c) => !c.atipica);
  return fases.map((f, i) => {
    const prox = fases[i + 1]?.inicio ?? null;
    const ultimoDia = prox ? somarDias(prox, -1) : hoje;
    const ate = [...composicoes].reverse().find((c) => c.data <= ultimoDia && c.data >= f.inicio) ?? null;
    // Sem medição antes da fase (1ª medição depois da 1ª dose), vale a primeira dentro dela
    const de = [...composicoes].reverse().find((c) => c.data <= f.inicio) ?? composicoes.find((c) => c.data >= f.inicio && c.data <= ultimoDia) ?? null;
    const ok = de && ate && ate.data > de.data;
    const dif = (k: 'cintura_cm' | 'massa_gorda_kg' | 'massa_magra_kg') =>
      ok && de![k] !== null && ate![k] !== null ? (ate![k] as number) - (de![k] as number) : null;
    const gorda = dif('massa_gorda_kg');
    // Ritmo por regressão com todas as medições da fase mais a de referência
    const pontos = ok ? composicoes.filter((c) => c.data >= de!.data && c.data <= ate!.data && c.massa_gorda_kg !== null && c.massa_magra_kg !== null) : [];
    const temRitmo = pontos.length >= MINIMO_RITMO.pontos && ok && diferencaDias(de!.data, ate!.data) >= MINIMO_RITMO.dias;
    const xs = pontos.map((c) => diferencaDias(pontos[0].data, c.data));
    const gSem = temRitmo ? reta(xs, pontos.map((c) => c.massa_gorda_kg!)).inclinacao * 7 : null;
    const mSem = temRitmo ? reta(xs, pontos.map((c) => c.massa_magra_kg!)).inclinacao * 7 : null;
    const pesoSem = gSem !== null && mSem !== null ? gSem + mSem : null;
    let treino: number | null = null;
    let cardio: number | null = null;
    if (treinos) {
      const fimAderencia = prox ? somarDias(prox, -1) : somarDias(hoje, -1);
      const n = Math.max(diferencaDias(f.inicio, fimAderencia) + 1, 0);
      if (n > 0) {
        const doPeriodo = treinos.filter((t) => t.data >= f.inicio && t.data <= fimAderencia);
        treino = doPeriodo.filter((t) => t.treino).length / n;
        cardio = doPeriodo.filter((t) => t.cardio).length / n;
      }
    }
    return {
      indice: f.indice,
      de: ok ? de : null,
      ate: ok ? ate : null,
      cintura: dif('cintura_cm'),
      gorda,
      magra: dif('massa_magra_kg'),
      gorda_semana: gSem,
      // Menos de 0,1 kg/sem de perda: não há perda para dividir
      magra_pct: pesoSem !== null && pesoSem < -0.1 ? mSem! / pesoSem : null,
      poucos_dados: !temRitmo,
      treino,
      cardio,
    };
  });
}

// ---------- Náusea e sintomas por dia depois da dose ----------

export interface SintomasFase {
  indice: number;
  /** Náusea média em D0 (dia da dose) até D6; null sem registro */
  nausea_por_dia: (number | null)[];
  dias_com_registro: number;
  vomito: number | null;
  diarreia: number | null;
  intestino_preso: number | null;
}

/** Dias desde a última aplicação até a data (D0 = dia da dose); null antes da 1ª. */
export function diaAposDose(data: string, datasAplicacoes: string[]): number | null {
  let ultima: string | null = null;
  for (const d of datasAplicacoes) if (d <= data) ultima = d;
  return ultima ? diferencaDias(ultima, data) : null;
}

export function sintomasPorFase(fases: AnaliseFase[], datasAplicacoes: string[], diario: RegistroDiario[], hoje: string): SintomasFase[] {
  const ordenadas = [...datasAplicacoes].sort();
  return fases.map((f, i) => {
    const prox = fases[i + 1]?.inicio ?? null;
    const regs = diario.filter((r) => r.data >= f.inicio && (prox ? r.data < prox : r.data <= hoje));
    const soma = Array(7).fill(0);
    const qtd = Array(7).fill(0);
    for (const r of regs) {
      if (r.nausea === null) continue;
      const d = diaAposDose(r.data, ordenadas);
      if (d === null || d > 6) continue;
      soma[d] += r.nausea;
      qtd[d]++;
    }
    // Dia registrado sem o sintoma marcado conta como "não teve": só marcar
    // quando acontece não pode virar 100%.
    const algumMarcado = (k: 'vomito' | 'diarreia' | 'intestino_preso') => regs.some((r) => r[k] !== undefined && r[k] !== null);
    const taxa = (k: 'vomito' | 'diarreia' | 'intestino_preso') =>
      regs.length && algumMarcado(k) ? regs.filter((r) => r[k]).length / regs.length : null;
    return {
      indice: f.indice,
      nausea_por_dia: soma.map((s, d) => (qtd[d] ? s / qtd[d] : null)),
      dias_com_registro: regs.length,
      vomito: taxa('vomito'),
      diarreia: taxa('diarreia'),
      intestino_preso: taxa('intestino_preso'),
    };
  });
}

/** "1,25 mg · fase 1" — rótulo de um bloco pela dose aplicada. */
export function rotuloBloco(f: Pick<AnaliseFase, 'dose_mg' | 'fase_indice'>): string {
  const dose = f.dose_mg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${dose} mg · ${f.fase_indice === null ? 'fora do plano' : `fase ${f.fase_indice + 1}`}`;
}

// ---------- Números do fim da fase ----------

export interface NumerosFase {
  /** Dias com registro no Diário no período */
  dias_registrados: number;
  nausea_media: number | null;
  nausea_max: number | null;
  vomito: number;
  diarreia: number;
  intestino_preso: number;
  /** Dias com "segui o plano?" = não */
  dieta_nao: number;
}

/** Contagens do Diário de `de` até `ate` (inclusive), para o bloco "Fim da fase". */
export function numerosDaFase(diario: RegistroDiario[], de: string, ate: string): NumerosFase {
  const regs = diario.filter((r) => r.data >= de && r.data <= ate);
  const nauseas = regs.map((r) => r.nausea).filter((n): n is number => n !== null);
  const conta = (k: 'vomito' | 'diarreia' | 'intestino_preso') => regs.filter((r) => r[k] === true).length;
  return {
    dias_registrados: regs.length,
    nausea_media: nauseas.length ? nauseas.reduce((s, n) => s + n, 0) / nauseas.length : null,
    nausea_max: nauseas.length ? Math.max(...nauseas) : null,
    vomito: conta('vomito'),
    diarreia: conta('diarreia'),
    intestino_preso: conta('intestino_preso'),
    dieta_nao: regs.filter((r) => r.dieta_seguida === 'nao').length,
  };
}
