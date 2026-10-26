// Relatório final do ciclo: um modelo só de dados (sem React, sem imagem), calculado
// com as mesmas contas do resto do app. A tela "Relatório final" e o PDF final leem
// daqui. Só descreve o que foi registrado: nunca sugere dose, déficit ou meta.
import {
  analisarGeral,
  colunasNausea,
  composicaoPorFase,
  rotuloBloco,
  sintomasPorFase,
  type AnaliseFase,
  type PontoPeso,
} from './analise';
import { fimDoBloco, rotuloFaseCurto } from './analise-periodo';
import { metaAgua as metaAguaPadrao, sonoPorFase, SONO_MINIMO_H } from './bemestar';
import type { ResumoCiclo } from './ciclo';
import { qualidadePerda, ritmoPercentual, textoQualidade } from './conferencia';
import { semanasDoCiclo } from './consulta';
import { dataPorExtenso, diferencaDias, formatarData, somarDias } from './datas';
import { idade } from './dieta';
import { calcularIndiceForca, umRmEpley, chaveExercicio } from './forca';
import { cm, corVariacao, kg, num, pct, pp, sinal } from './formato';
import { medicaoProxima, montarFotosPdf, numerosDaMedicao, type FotoInfo, type FotosPdf, type NumeroFoto, type Pose } from './fotos';
import { MDC, type Composicao } from './gordura';
import { paresComparar, type ChaveComparar } from './medidas-comparar';
import { adesaoPeriodo, destaques, habitosPorSemana, picoNausea, progressoMeta, type AdesaoPeriodo, type Destaque, type HabitosSemana, type ProgressoMeta } from './painel';
import { fasePos, linhasBalanco, SEMANAS_POS, type LinhaBalanco } from './projeto';
import { maiorSequencia } from './recap-semana';
import { descreverRegistro, ROTULO_TIPO } from './registroDecisoes';
import { calcularPlacar, formatarKm, formatarTempo, horasExercicioDia, listarCorridas, periodoProjeto } from './treino';
import type { Ciclo, CorUrina, DecisaoFase, Perfil, RegistroDecisao, RegistroDiario, RegistroForca, Sexo, TipoDecisao, TreinoDia } from './tipos';
import type { PlanoDieta } from './dieta';

/** Versão do formato do modelo (sobe quando um campo muda de sentido). */
export const VERSAO_RELATORIO_FINAL = 1;

/** Linha final, a mesma do PDF da consulta. */
export const RODAPE_RELATORIO_FINAL = 'Este relatório registra e calcula; as decisões de dose são tomadas com acompanhamento médico.';

// ---------- Entrada ----------

/**
 * Dados para montar o relatório. Os campos calculados (`resumo`, `serie`,
 * `composicoes`, `fases`, `fimRemedio`, `posRemedio`) são os de `useCalculos()`:
 * a calibração do % de gordura já está nas composições.
 */
export interface EntradaRelatorioFinal {
  perfil: Perfil | null;
  ciclo: Ciclo;
  /** calcularCiclo(...) */
  resumo: ResumoCiclo;
  diario: RegistroDiario[];
  /** serieDePeso(diario, medidas) */
  serie: PontoPeso[];
  /** historicoComposicao(...) com o ajuste vigente */
  composicoes: Composicao[];
  /** analisarFases(resumo, serie, diario, hoje, fimRemedio) */
  fases: AnaliseFase[];
  hoje: string;
  /** Fim do período do remédio (última dose + intervalo) quando o remédio acabou; senão null */
  fimRemedio: string | null;
  /** Decisão de início da fase pós-remédio (decisaoPosRemedio), se houver */
  posRemedio?: DecisaoFase | null;
  /** null = conta sem a aba Treino */
  treinos: TreinoDia[] | null;
  /** Registros de força (aba Treino); null ou vazio = sem força */
  forca?: RegistroForca[] | null;
  registroDecisoes: RegistroDecisao[];
  dieta?: PlanoDieta | null;
  /** Fotos (só os dados, sem a imagem): ficam no aparelho */
  fotos?: FotoInfo[];
  /** Meta de água de cada data (padrão: 2 L + 0,7 L por hora de exercício marcada) */
  metaAgua?: (data: string) => number;
}

// ---------- Modelo ----------

export type EstadoRelatorio = 'previa' | 'concluido';
export type TomRelatorio = 'bom' | 'ruim' | '';
export type ChaveNumero = 'peso_kg' | 'cintura_cm' | 'bf' | 'massa_magra_kg' | 'massa_gorda_kg' | 'quadril_cm' | 'pescoco_cm';

/** Início × fim de uma medida no período do relatório. */
export interface VariacaoRelatorio {
  chave: ChaveNumero;
  rotulo: string;
  unidade: 'kg' | 'cm' | '%';
  inicio: number | null;
  fim: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  /** fim − início; null sem as duas medições */
  delta: number | null;
  /** delta / início (só no peso) */
  delta_pct: number | null;
  menor_melhor: boolean;
  /** Cor pela mínima mudança detectável (MDC): abaixo do erro da fita/balança fica '' */
  tom: TomRelatorio;
  /** Textos prontos: "− 12,4 kg", "98,0 cm", "86,2 cm" (% de gordura: delta em p.p.) */
  texto_delta: string;
  texto_inicio: string;
  texto_fim: string;
}

/** Ponto de série de tempo (o mesmo formato do motor de gráficos). */
export interface PontoRelatorio {
  data: string;
  valor: number;
  atipico?: boolean;
}

export interface SemanaRelatorio {
  /** Segunda-feira da semana */
  segunda: string;
  dose_mg: number | null;
  peso_kg: number | null;
  cintura_cm: number | null;
  bf: number | null;
  massa_magra_kg: number | null;
  massa_gorda_kg: number | null;
  /** Medição ou peso da semana marcados como atípicos */
  atipica: boolean;
  sono_h: number | null;
  agua_l: number | null;
  agua_meta_l: number | null;
  dieta: { sim: number; parcial: number; nao: number };
  /** Dieta seguida ("em parte" vale meio) entre os dias respondidos */
  dieta_fracao: number | null;
  nausea_media: number | null;
  nausea_max: number | null;
  dias_sintoma: number;
  /** Só com a aba Treino */
  treino: number | null;
  cardio: number | null;
  /** km corridos na semana (só distâncias anotadas) */
  km: number | null;
}

/** Um bloco de doses seguidas iguais (a "fase" da Análise). */
export interface FaseRelatorio {
  indice: number;
  /** "1,25 mg · fase 1" */
  rotulo: string;
  /** "F1 1,25" */
  rotulo_curto: string;
  /** Nome da fase do plano ("Adaptação") ou "Fora do plano" */
  nome: string;
  fase_indice: number | null;
  dose_mg: number;
  doses: number;
  inicio: string;
  /** Último dia do bloco (inclusive) */
  fim: string;
  dias: number;
  peso_inicio: number | null;
  peso_fim: number | null;
  variacao_kg: number | null;
  /** Ritmo pela regressão das pesagens; null com poucos dados */
  kg_por_semana: number | null;
  poucos_dados: boolean;
  cintura_cm: number | null;
  massa_gorda_kg: number | null;
  massa_magra_kg: number | null;
  nausea_media: number | null;
  nausea_max: number | null;
  /** Náusea média por coluna de `nausea.colunas` (D0, D1…) */
  nausea_por_dia: (number | null)[];
  vomito: number | null;
  diarreia: number | null;
  intestino_preso: number | null;
  sono_medio: number | null;
  /** Aderência de treino e cardio no bloco (só com a aba Treino) */
  treino: number | null;
  cardio: number | null;
  em_andamento: boolean;
}

export type TipoEvento = 'inicio' | 'fase' | 'decisao_fase' | 'anotacao' | 'registro' | 'fim';

/** Item da linha do tempo: início, troca de dose, decisões e fim. */
export interface EventoRelatorio {
  data: string;
  tipo: TipoEvento;
  titulo: string;
  detalhe: string | null;
  /** Bloco de dose a que o evento pertence (tipo 'fase') */
  fase?: number;
  /** Área do registro de decisões (tipo 'registro') */
  area?: TipoDecisao;
}

export type CategoriaRecorde = 'corpo' | 'habito' | 'remedio' | 'treino';

/** Recorde ou destaque calculado dos registros (nada estimado). */
export interface RecordeRelatorio {
  id: string;
  categoria: CategoriaRecorde;
  titulo: string;
  /** Número principal pronto: "− 1,8 kg", "23 dias" */
  texto: string;
  /** Valor bruto do número principal */
  valor: number;
  detalhe: string;
  /** Data ou período a que se refere */
  de: string | null;
  ate: string | null;
}

export interface MetaRelatorio {
  chave: 'peso_kg' | 'cintura_cm' | 'bf' | 'massa_gorda_kg' | 'quadril_cm';
  nome: string;
  unidade: 'kg' | 'cm' | '%';
  progresso: ProgressoMeta;
}

export interface CorridaRelatorio {
  data: string;
  km: number;
  segundos: number;
  /** segundos por km */
  pace: number;
}

export interface ForcaRelatorio {
  /** Índice de força por semana (variação média do 1RM estimado contra o início) */
  semanas: { segunda: string; indice: number | null; suavizado: number | null }[];
  exercicios: { nome: string; data_inicio: string; data_fim: string; e1rm_inicio: number; e1rm_fim: number; variacao: number }[];
  /** Última leitura suavizada do índice */
  final: number | null;
}

export interface TreinoRelatorio {
  inicio: string;
  fim: string;
  treino: { feito: number; meta: number; aderencia: number | null };
  cardio: { feito: number; meta: number; aderencia: number | null };
  corridas: { feito: number; km: number; sem_distancia: number };
  bike: { feito: number; minutos: number };
  /** Maior sequência de dias com treino e cardio */
  recorde_sequencia: number;
  /** Corridas com distância e tempo, no período */
  lista_corridas: CorridaRelatorio[];
  melhor_pace: CorridaRelatorio | null;
  maior_corrida: CorridaRelatorio | null;
  semanas: { segunda: string; treino: number; cardio: number; dias: number }[];
  forca: ForcaRelatorio | null;
}

export interface ParFotoRelatorio {
  /** Pose do par, ou 'geral' (sem pose em comum: 1ª do Antes × última do Depois) */
  chave: ChaveComparar;
  rotulo: string;
  id_antes: string;
  id_depois: string;
  data_antes: string;
  data_depois: string;
  /** Medição mais próxima de cada foto (até 7 dias, sem as atípicas) */
  medicao_antes: Composicao | null;
  medicao_depois: Composicao | null;
  numeros_antes: NumeroFoto[];
  /** Com a variação desde o Antes quando as medições são diferentes */
  numeros_depois: NumeroFoto[];
}

export interface FotosRelatorio {
  total: number;
  antes: number;
  depois: number;
  pares: ParFotoRelatorio[];
  /** Par da capa: Frente, se houver; senão o primeiro par */
  capa: ParFotoRelatorio | null;
  /** Mesma seleção do PDF da consulta (pares por pose e as outras em grade) */
  pdf: FotosPdf;
}

/** Linha do cartão para compartilhar (stories). */
export interface MetricaCartaoFinal {
  chave: ChaveNumero;
  rotulo: string;
  texto: string;
  detalhe: string;
  tom: TomRelatorio;
}

export interface RelatorioFinal {
  versao: typeof VERSAO_RELATORIO_FINAL;
  estado: EstadoRelatorio;
  /** "Ciclo concluído" ou "Em andamento — prévia" */
  rotulo_estado: string;
  gerado_em: string;
  pessoa: {
    nome: string;
    primeiro_nome: string;
    sexo: Sexo;
    feminino: boolean;
    com_treino: boolean;
    altura_cm: number | null;
    idade: number | null;
  };
  periodo: {
    /** 1ª aplicação (ou a data de início do ciclo) */
    inicio: string;
    /** Fim do período do remédio (concluído) ou hoje (prévia) */
    fim: string;
    /** Fim previsto do período do remédio (na prévia); no concluído, igual a `fim` */
    fim_previsto: string | null;
    dias: number;
    semanas: number;
    /** Fração do período previsto já cumprida (0 a 1) */
    progresso: number | null;
    /** "07/09/2026 – 05/04/2027" */
    texto: string;
  };
  /** Fase pós-remédio iniciada: fica fora do relatório (só citada) */
  pos_remedio: { inicio: string; semana: number | null; texto: string } | null;
  remedio: {
    nome: string;
    concentracao_mg_ml: number;
    intervalo_dias: number;
    aplicacoes: number;
    total_mg: number;
    dose_inicial: number | null;
    dose_final: number | null;
    dose_maxima: number | null;
    percentual_frasco: number;
    /** Aplicações no dia previsto */
    no_dia: number;
    atrasadas: number;
  };
  /** Início × fim do período (medições de fita, em jejum, às segundas) */
  numeros: {
    peso: VariacaoRelatorio;
    cintura: VariacaoRelatorio;
    bf: VariacaoRelatorio;
    massa_magra: VariacaoRelatorio;
    massa_gorda: VariacaoRelatorio;
    pescoco: VariacaoRelatorio;
    /** Só no perfil feminino (entra na fórmula do % de gordura) */
    quadril: VariacaoRelatorio | null;
  };
  massa_magra: {
    /** Variação dentro do erro da fita ou para cima */
    preservada: boolean | null;
    /** Massa magra no fim ÷ no início */
    fracao_mantida: number | null;
    texto: string;
  };
  /** Ritmo médio do peso no ciclo (início × fim) */
  ritmo_medio: { kg_semana: number; pct: number; faixa: 'lento' | 'ideal' | 'rapido' | 'ganho' } | null;
  /** De onde veio a perda no ciclo inteiro (regressão de todas as medições) */
  qualidade: { gordura: number; magra: number; sem_perda: boolean; medicoes: number; texto: string } | null;
  /** Quanto foi registrado */
  registros: { dias_diario: number; pesagens: number; medicoes: number; atipicas: number; aplicacoes: number; dias_treino: number | null; fotos: number; decisoes: number };
  /** Frase-resumo factual para a capa */
  resumo_texto: string;
  series: {
    peso: PontoRelatorio[];
    /** Degrau da dose: cada aplicação e o fim do período */
    dose: PontoRelatorio[];
    cintura: PontoRelatorio[];
    bf: PontoRelatorio[];
    massa_magra: PontoRelatorio[];
    massa_gorda: PontoRelatorio[];
    quadril: PontoRelatorio[];
    sono: PontoRelatorio[];
    agua: (PontoRelatorio & { meta: number })[];
    nausea: PontoRelatorio[];
  };
  semanas: SemanaRelatorio[];
  fases: FaseRelatorio[];
  nausea: {
    /** D0, D1… (ou faixas, com intervalo maior que 7 dias) */
    colunas: string[];
    pico: { rotulo: string; media: number } | null;
    tem_sintomas: boolean;
  };
  linha_do_tempo: EventoRelatorio[];
  recordes: RecordeRelatorio[];
  habitos: {
    de: string;
    ate: string;
    adesao: AdesaoPeriodo;
    /** Maiores sequências de dias seguidos */
    sequencias: { dieta: number; diario: number; sono: number; agua: number };
    sono_medio: number | null;
    noites: number;
    agua_media: number | null;
    agua_meta_media: number | null;
    dias_agua: number;
    urina: Record<CorUrina, number>;
    nausea_media: number | null;
    dias_com_nausea: number;
    dias_sintoma: number;
    por_semana: HabitosSemana[];
  };
  treino: TreinoRelatorio | null;
  metas: { itens: MetaRelatorio[]; balanco: LinhaBalanco[] };
  destaques: Destaque[];
  fotos: FotosRelatorio;
  dieta: { refeicoes: number } | null;
  /** Dados do cartão de stories (o peso e a dose entram só com a opção ligada) */
  cartao: {
    titulo: string;
    sobretitulo: string;
    periodo: string;
    principal: MetricaCartaoFinal;
    metricas: MetricaCartaoFinal[];
    peso: MetricaCartaoFinal;
    duracao: string;
    doses: string;
    adesao: { rotulo: string; fracao: number }[];
  };
  textos: {
    rodape: string;
    /** Só na prévia */
    aviso_previa: string | null;
    medicao: string;
  };
}

// ---------- Ajudantes ----------

const media = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const temNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const UNIDADE: Record<ChaveNumero, 'kg' | 'cm' | '%'> = {
  peso_kg: 'kg',
  cintura_cm: 'cm',
  bf: '%',
  massa_magra_kg: 'kg',
  massa_gorda_kg: 'kg',
  quadril_cm: 'cm',
  pescoco_cm: 'cm',
};
const ROTULO_NUMERO: Record<ChaveNumero, string> = {
  peso_kg: 'Peso',
  cintura_cm: 'Cintura',
  bf: '% de gordura',
  massa_magra_kg: 'Massa magra',
  massa_gorda_kg: 'Massa gorda',
  quadril_cm: 'Quadril',
  pescoco_cm: 'Pescoço',
};

const fmtValor = (k: ChaveNumero, n: number | null) => (UNIDADE[k] === 'kg' ? kg(n) : UNIDADE[k] === 'cm' ? cm(n) : pp(n));
const sufixoDelta = (k: ChaveNumero) => (UNIDADE[k] === 'kg' ? ' kg' : UNIDADE[k] === 'cm' ? ' cm' : ' p.p.');

function variacao(chave: ChaveNumero, ini: { valor: number | null; data: string } | null, fim: { valor: number | null; data: string } | null): VariacaoRelatorio {
  const a = ini?.valor ?? null;
  const b = fim?.valor ?? null;
  const delta = a !== null && b !== null && fim && ini && fim.data > ini.data ? b - a : null;
  const menor = chave !== 'massa_magra_kg';
  return {
    chave,
    rotulo: ROTULO_NUMERO[chave],
    unidade: UNIDADE[chave],
    inicio: a,
    fim: b,
    data_inicio: ini?.data ?? null,
    data_fim: fim?.data ?? null,
    delta,
    delta_pct: chave === 'peso_kg' && delta !== null && a ? delta / a : null,
    menor_melhor: menor,
    tom: corVariacao(delta, menor, MDC[chave]) as TomRelatorio,
    texto_delta: delta === null ? '–' : sinal(delta, 1, sufixoDelta(chave)),
    texto_inicio: fmtValor(chave, a),
    texto_fim: fmtValor(chave, b),
  };
}

const ESCOLHAS: Record<DecisaoFase['escolha'], string> = {
  subir: 'Subiu de fase',
  repetir: 'Repetiu a fase',
  confirmar_fase: 'Confirmou a fase',
  anotacao: 'Anotação',
  pos_remedio: 'Fase pós-remédio',
  intervalo: 'Intervalo entre doses',
};

/** Texto de uma decisão de fim de fase (o mesmo do PDF da consulta). */
export function detalheDecisaoFase(d: DecisaoFase): string {
  switch (d.escolha) {
    case 'subir':
      return `${num(d.dose_mg)} → ${num(d.dose_nova_mg)} mg`;
    case 'repetir':
      return `+${d.semanas ?? '?'} sem. na fase ${(d.fase_indice ?? 0) + 1} (${num(d.dose_mg)} mg)`;
    case 'confirmar_fase':
      return `${num(d.dose_mg)} mg seguindo a fase ${(d.fase_indice ?? 0) + 1}`;
    case 'pos_remedio':
      return `última dose em ${formatarData(d.bloco_inicio ?? d.data, true)} (${num(d.dose_mg)} mg)`;
    case 'intervalo':
      return `${d.intervalo_anterior ?? '?'} → ${d.intervalo_dias ?? '?'} dias entre doses`;
    default:
      return d.texto ?? '';
  }
}

/** Maior queda entre medições seguidas com 5 a 10 dias de distância (uma "semana"). */
function melhorSemana(comps: Composicao[], k: 'peso_kg' | 'cintura_cm' | 'massa_gorda_kg'): { de: Composicao; ate: Composicao; delta: number } | null {
  let melhor: { de: Composicao; ate: Composicao; delta: number } | null = null;
  for (let i = 1; i < comps.length; i++) {
    const a = comps[i - 1];
    const b = comps[i];
    const dias = diferencaDias(a.data, b.data);
    if (dias < 5 || dias > 10) continue;
    const va = a[k];
    const vb = b[k];
    if (va === null || vb === null) continue;
    const d = vb - va;
    if (d < -1e-9 && (!melhor || d < melhor.delta)) melhor = { de: a, ate: b, delta: d };
  }
  return melhor;
}

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** Sinal e unidade presos ao número ("−\u00a012,4\u00a0kg"): a frase não quebra no meio da variação. */
export function semQuebra(t: string): string {
  return t.replace(/([−+]) (?=\d)/g, '$1\u00a0').replace(/(\d) (kg|cm|mg|p\.p\.)/g, '$1\u00a0$2');
}

/** "30 semanas" (arredondado) ou, com menos de 2 semanas, "9 dias": para títulos. */
export function duracaoCurta(nDias: number): string {
  return nDias >= 14 ? `${Math.round(nDias / 7)} semanas` : dias(nDias);
}
const curta = (d: string) => formatarData(d, true);

// ---------- Montagem ----------

/**
 * Monta o relatório final do ciclo: da 1ª aplicação até o fim do período do
 * remédio (concluído) ou até hoje (prévia, em andamento). A fase pós-remédio
 * fica de fora (só citada). Medições atípicas ficam fora de início, fim,
 * tendências e recordes (aparecem nas séries marcadas como `atipico`).
 */
export function montarRelatorioFinal(e: EntradaRelatorioFinal): RelatorioFinal {
  const { ciclo, resumo, hoje, diario, perfil } = e;
  const sexo: Sexo = perfil?.sexo ?? 'Masculino';
  const feminino = sexo === 'Feminino';
  const comTreino = !!e.treinos && !!perfil?.modulo_treino;
  const treinos = comTreino ? e.treinos! : null;
  const fotos = e.fotos ?? [];
  const porDataTreino = new Map((treinos ?? []).map((t) => [t.data, t]));
  const metaAgua = e.metaAgua ?? ((d: string) => metaAguaPadrao(treinos ? horasExercicioDia(d, porDataTreino.get(d), null) : 0));

  // ----- Período -----
  const linhas = resumo.linhas;
  const datasAplic = linhas.map((l) => l.aplicacao.data);
  const inicio = datasAplic[0] ?? ciclo.data_inicio;
  const concluido = !!e.fimRemedio && e.fimRemedio < hoje;
  const fim = concluido ? e.fimRemedio! : hoje;
  const pos = e.posRemedio?.bloco_inicio ? fasePos(e.posRemedio.bloco_inicio, hoje) : null;
  const projeto = linhas.length ? periodoProjeto(ciclo, resumo, e.posRemedio?.bloco_inicio ?? null, hoje) : null;
  const fimPrevisto = concluido ? fim : (e.fimRemedio ?? projeto?.fim ?? null);
  const nDias = fim >= inicio ? diferencaDias(inicio, fim) + 1 : 0;
  const totalPrevisto = fimPrevisto && fimPrevisto >= inicio ? diferencaDias(inicio, fimPrevisto) + 1 : null;
  const progresso = concluido ? 1 : totalPrevisto ? Math.min(Math.max(nDias / totalPrevisto, 0), 1) : null;

  // ----- Início × fim (as mesmas contas do Resumo da Análise) -----
  const serieP = e.serie.filter((p) => p.data <= fim);
  const compsP = e.composicoes.filter((c) => c.data <= fim);
  const geral = analisarGeral(inicio, serieP, compsP, fim);
  const ini = geral.medida_inicial;
  const fimComp = geral.medida_atual ?? ini;
  const temFim = !!geral.medida_atual;
  const ponto = (c: Composicao | null, k: ChaveNumero) => (c ? { valor: c[k] as number | null, data: c.data } : null);
  const numVar = (k: ChaveNumero) => variacao(k, ponto(ini, k), temFim ? ponto(fimComp, k) : ponto(ini, k));
  const peso = variacao(
    'peso_kg',
    geral.peso_inicial ? { valor: geral.peso_inicial.peso_kg, data: geral.peso_inicial.data } : null,
    geral.peso_atual ? { valor: geral.peso_atual.peso_kg, data: geral.peso_atual.data } : null,
  );
  const numeros = {
    peso,
    cintura: numVar('cintura_cm'),
    bf: numVar('bf'),
    massa_magra: numVar('massa_magra_kg'),
    massa_gorda: numVar('massa_gorda_kg'),
    pescoco: numVar('pescoco_cm'),
    quadril: feminino ? numVar('quadril_cm') : null,
  };
  const dm = numeros.massa_magra.delta;
  const massaMagra = {
    preservada: dm === null ? null : dm > -MDC.massa_magra_kg + 1e-9,
    fracao_mantida: numeros.massa_magra.inicio && numeros.massa_magra.fim !== null && temFim ? numeros.massa_magra.fim / numeros.massa_magra.inicio : null,
    texto:
      dm === null
        ? 'A massa magra aparece com duas medições.'
        : dm > -MDC.massa_magra_kg + 1e-9
          ? dm >= MDC.massa_magra_kg - 1e-9
            ? `Massa magra ${sinal(dm, 1, ' kg')}: subiu além do erro da fita.`
            : 'Massa magra preservada: a variação ficou dentro do erro da fita.'
          : `Massa magra ${sinal(dm, 1, ' kg')}: acima do erro da fita.`,
  };
  const ritmo = geral.kg_por_semana !== null && geral.peso_inicial ? { kg_semana: geral.kg_por_semana, ...ritmoPercentual(geral.kg_por_semana, geral.peso_inicial.peso_kg) } : null;
  const normaisP = compsP.filter((c) => !c.atipica && c.data >= (ini?.data ?? inicio));
  const q = qualidadePerda(normaisP, Number.MAX_SAFE_INTEGER);
  const qualidade = q ? { gordura: q.gordura, magra: q.magra, sem_perda: q.sem_perda, medicoes: q.medicoes, texto: textoQualidade(q) } : null;

  // ----- Séries -----
  const deSeries = [inicio, ini?.data, geral.peso_inicial?.data].filter((d): d is string => !!d).sort()[0];
  const naJanela = (d: string) => d >= deSeries && d <= fim;
  const comp = (k: ChaveNumero): PontoRelatorio[] =>
    e.composicoes.filter((c) => naJanela(c.data) && temNumero(c[k])).map((c) => ({ data: c.data, valor: c[k] as number, ...(c.atipica ? { atipico: true } : {}) }));
  const diarioP = [...diario].filter((r) => r.data >= inicio && r.data <= fim).sort((a, b) => a.data.localeCompare(b.data));
  const series: RelatorioFinal['series'] = {
    peso: e.serie.filter((p) => naJanela(p.data)).map((p) => ({ data: p.data, valor: p.peso_kg, ...(p.atipica ? { atipico: true } : {}) })),
    dose: linhas.length
      ? [...linhas.map((l) => ({ data: l.aplicacao.data, valor: l.aplicacao.dose_mg })), { data: fim, valor: linhas[linhas.length - 1].aplicacao.dose_mg }].filter((p) => p.data <= fim)
      : [],
    cintura: comp('cintura_cm'),
    bf: comp('bf'),
    massa_magra: comp('massa_magra_kg'),
    massa_gorda: comp('massa_gorda_kg'),
    quadril: feminino ? comp('quadril_cm') : [],
    sono: diarioP.filter((r) => temNumero(r.sono_h)).map((r) => ({ data: r.data, valor: r.sono_h as number })),
    agua: diarioP.filter((r) => temNumero(r.agua_l)).map((r) => ({ data: r.data, valor: r.agua_l as number, meta: metaAgua(r.data) })),
    nausea: diarioP.filter((r) => r.nausea !== null && r.nausea !== undefined).map((r) => ({ data: r.data, valor: r.nausea as number })),
  };

  // ----- Semanas -----
  const periodosTreino = projeto && treinos ? [{ inicio: projeto.inicio, fim: projeto.fim }] : undefined;
  const linhasSemana = linhas.length
    ? semanasDoCiclo({ inicio, hoje: fim, aplicacoes: linhas.map((l) => l.aplicacao), serie: e.serie, composicoes: e.composicoes, diario, treinos, periodosTreino })
    : [];
  const habSemana = habitosPorSemana(
    diario.filter((r) => r.data >= inicio),
    linhasSemana.map((l) => l.segunda),
    fim,
    metaAgua,
  );
  const semanas: SemanaRelatorio[] = linhasSemana.map((l, i) => {
    const h = habSemana[i];
    const respondidos = l.dieta.sim + l.dieta.parcial + l.dieta.nao;
    const c = l.composicao;
    const domingo = somarDias(l.segunda, 6);
    const km = treinos
      ? treinos.filter((t) => t.data >= l.segunda && t.data <= domingo && t.data >= inicio && t.data <= fim && t.cardio && (t.corrida_km ?? 0) > 0).reduce((s, t) => s + (t.corrida_km ?? 0), 0)
      : null;
    return {
      segunda: l.segunda,
      dose_mg: l.dose_mg,
      peso_kg: l.peso_kg,
      cintura_cm: c?.cintura_cm ?? null,
      bf: c?.bf ?? null,
      massa_magra_kg: c?.massa_magra_kg ?? null,
      massa_gorda_kg: c?.massa_gorda_kg ?? null,
      atipica: l.atipica,
      sono_h: h?.sono_h ?? null,
      agua_l: h?.agua_l ?? null,
      agua_meta_l: h?.agua_meta_l ?? null,
      dieta: l.dieta,
      dieta_fracao: respondidos ? (l.dieta.sim + 0.5 * l.dieta.parcial) / respondidos : null,
      nausea_media: h?.nausea_media ?? null,
      nausea_max: l.nausea_max,
      dias_sintoma: l.dias_sintoma,
      treino: l.treino,
      cardio: l.cardio,
      km,
    };
  });

  // ----- Fases (blocos de dose) -----
  const fimFases = concluido ? fim : hoje;
  const compFases = composicaoPorFase(e.fases, e.composicoes, treinos, fimFases, hoje);
  const sintomas = sintomasPorFase(e.fases, datasAplic, diario, fimFases, ciclo.intervalo_dias);
  const sonoFases = sonoPorFase(e.fases, diario, fimFases);
  const colunas = colunasNausea(ciclo.intervalo_dias);
  const fases: FaseRelatorio[] = e.fases.map((f, i) => {
    const c = compFases[i];
    const s = sintomas[i];
    const ultimo = fimDoBloco(e.fases, i);
    return {
      indice: f.indice,
      rotulo: rotuloBloco(f),
      rotulo_curto: rotuloFaseCurto(e.fases, i),
      nome: f.nome,
      fase_indice: f.fase_indice,
      dose_mg: f.dose_mg,
      doses: f.doses,
      inicio: f.inicio,
      fim: ultimo,
      dias: Math.max(diferencaDias(f.inicio, ultimo) + 1, 1),
      peso_inicio: f.peso_inicio,
      peso_fim: f.peso_fim,
      variacao_kg: f.variacao_kg,
      kg_por_semana: f.kg_por_semana,
      poucos_dados: f.poucos_dados,
      cintura_cm: c?.cintura ?? null,
      massa_gorda_kg: c?.gorda ?? null,
      massa_magra_kg: c?.magra ?? null,
      nausea_media: f.nausea_media,
      nausea_max: f.nausea_max,
      nausea_por_dia: s?.nausea_por_dia ?? [],
      vomito: s?.vomito ?? null,
      diarreia: s?.diarreia ?? null,
      intestino_preso: s?.intestino_preso ?? null,
      sono_medio: sonoFases[i] ?? null,
      treino: c?.treino ?? null,
      cardio: c?.cardio ?? null,
      em_andamento: f.em_andamento,
    };
  });
  const pico = picoNausea(sintomas, colunas);
  const temSintomas = sintomas.some((s) => s.vomito !== null || s.diarreia !== null || s.intestino_preso !== null);

  // ----- Linha do tempo -----
  const eventos: EventoRelatorio[] = [];
  if (linhas.length) eventos.push({ data: inicio, tipo: 'inicio', titulo: 'Início do ciclo', detalhe: `1ª aplicação · ${num(linhas[0].aplicacao.dose_mg)} mg` });
  fases.forEach((f, i) => {
    if (i === 0) return;
    eventos.push({ data: f.inicio, tipo: 'fase', titulo: `Dose ${num(f.dose_mg)} mg`, detalhe: `${f.nome} · ${f.doses} ${f.doses === 1 ? 'dose' : 'doses'}`, fase: i });
  });
  for (const d of ciclo.decisoes ?? []) {
    if (d.data > fim) continue;
    eventos.push({ data: d.data, tipo: d.escolha === 'anotacao' ? 'anotacao' : 'decisao_fase', titulo: ESCOLHAS[d.escolha], detalhe: detalheDecisaoFase(d) || null });
  }
  for (const r of e.registroDecisoes) {
    if (r.data > fim) continue;
    eventos.push({ data: r.data, tipo: 'registro', titulo: ROTULO_TIPO[r.tipo], detalhe: `${descreverRegistro(r)}${r.motivo ? ` · motivo: ${r.motivo}` : ''}`, area: r.tipo });
  }
  if (linhas.length)
    eventos.push(
      concluido
        ? { data: fim, tipo: 'fim', titulo: 'Fim do ciclo', detalhe: `última dose em ${curta(datasAplic[datasAplic.length - 1])} · ${linhas.length} aplicações` }
        : { data: fim, tipo: 'fim', titulo: 'Hoje (prévia)', detalhe: fimPrevisto ? `fim previsto em ${curta(fimPrevisto)}` : null },
    );
  const ordemTipo: Record<TipoEvento, number> = { inicio: 0, fase: 1, decisao_fase: 2, registro: 3, anotacao: 4, fim: 5 };
  eventos.sort((a, b) => a.data.localeCompare(b.data) || ordemTipo[a.tipo] - ordemTipo[b.tipo]);

  // ----- Hábitos -----
  const ontem = somarDias(hoje, -1);
  const deHab = inicio;
  // Na prévia, hoje ainda está em aberto (como na Análise): os hábitos vão até ontem
  const ateHab = concluido ? fim : ontem;
  const adesao = adesaoPeriodo({ diario, treinos, de: deHab, ate: ateHab, metaAgua });
  const porData = new Map(diario.map((r) => [r.data, r]));
  const seq = (ok: (r: RegistroDiario) => boolean) => (ateHab >= deHab ? maiorSequencia(deHab, ateHab, (d) => {
    const r = porData.get(d);
    return !!r && ok(r);
  }) : 0);
  const regsHab = diario.filter((r) => r.data >= deHab && r.data <= ateHab);
  const sonos = regsHab.filter((r) => temNumero(r.sono_h)).map((r) => r.sono_h as number);
  const comAgua = regsHab.filter((r) => temNumero(r.agua_l));
  const urina: Record<CorUrina, number> = { clara: 0, amarela: 0, escura: 0 };
  for (const r of regsHab) if (r.cor_urina && r.cor_urina in urina) urina[r.cor_urina]++;
  const nauseas = regsHab.filter((r) => r.nausea !== null && r.nausea !== undefined).map((r) => r.nausea as number);
  const habitos: RelatorioFinal['habitos'] = {
    de: deHab,
    ate: ateHab,
    adesao,
    sequencias: {
      dieta: seq((r) => r.dieta_seguida === 'sim'),
      diario: seq(() => true),
      sono: seq((r) => temNumero(r.sono_h) && r.sono_h >= SONO_MINIMO_H),
      agua: seq((r) => temNumero(r.agua_l) && r.agua_l >= metaAgua(r.data) - 0.05),
    },
    sono_medio: media(sonos),
    noites: sonos.length,
    agua_media: media(comAgua.map((r) => r.agua_l as number)),
    agua_meta_media: media(comAgua.map((r) => metaAgua(r.data))),
    dias_agua: comAgua.length,
    urina,
    nausea_media: media(nauseas),
    dias_com_nausea: nauseas.filter((n) => n >= 1).length,
    dias_sintoma: regsHab.filter((r) => r.vomito === true || r.diarreia === true || r.intestino_preso === true).length,
    por_semana: habSemana,
  };

  // ----- Treino -----
  let treino: TreinoRelatorio | null = null;
  if (treinos && projeto) {
    const placar = calcularPlacar(treinos, projeto.inicio, projeto.fim, hoje);
    const corridas = listarCorridas(treinos)
      .filter((c) => c.data >= projeto.inicio && c.data <= fim)
      .map((c) => ({ data: c.data, km: c.km, segundos: c.segundos, pace: c.pace }));
    const melhor = corridas.length ? corridas.reduce((a, b) => (b.pace < a.pace ? b : a)) : null;
    const maior = corridas.length ? corridas.reduce((a, b) => (b.km > a.km ? b : a)) : null;
    const forcaP = (e.forca ?? []).filter((r) => r.data >= somarDias(inicio, -7) && r.data <= fim);
    let forca: ForcaRelatorio | null = null;
    if (forcaP.length) {
      const ind = calcularIndiceForca(forcaP);
      const porEx = new Map<string, RegistroForca[]>();
      for (const r of [...forcaP].sort((a, b) => a.data.localeCompare(b.data))) {
        const k = chaveExercicio(r.exercicio);
        porEx.set(k, [...(porEx.get(k) ?? []), r]);
      }
      const exercicios: ForcaRelatorio['exercicios'] = [];
      for (const lista of porEx.values()) {
        const comRm = lista.map((r) => ({ r, e: umRmEpley(r.carga_kg, r.reps) })).filter((x): x is { r: RegistroForca; e: number } => x.e !== null);
        if (comRm.length < 2) continue;
        const a = comRm[0];
        const b = comRm[comRm.length - 1];
        exercicios.push({ nome: b.r.exercicio, data_inicio: a.r.data, data_fim: b.r.data, e1rm_inicio: a.e, e1rm_fim: b.e, variacao: b.e / a.e - 1 });
      }
      const leituras = ind.semanas.map((s) => s.suavizado).filter((v): v is number => v !== null);
      forca = {
        semanas: ind.semanas.map((s) => ({ segunda: s.segunda, indice: s.indice, suavizado: s.suavizado })),
        exercicios,
        final: leituras.length ? leituras[leituras.length - 1] : null,
      };
    }
    treino = {
      inicio: projeto.inicio,
      fim: concluido ? fim : projeto.fim,
      treino: { feito: placar.treino.feito, meta: placar.treino.meta, aderencia: placar.treino.aderencia },
      cardio: { feito: placar.cardio.feito, meta: placar.cardio.meta, aderencia: placar.cardio.aderencia },
      corridas: { feito: placar.corrida.feito, km: placar.corrida.km, sem_distancia: placar.corrida.semDistancia },
      bike: { feito: placar.bike.feito, minutos: placar.bike.minutos },
      recorde_sequencia: placar.recorde,
      lista_corridas: corridas,
      melhor_pace: melhor,
      maior_corrida: maior,
      semanas: linhasSemana.filter((l) => l.treino !== null && l.dias > 0).map((l) => ({ segunda: l.segunda, treino: l.treino!, cardio: l.cardio ?? 0, dias: l.dias })),
      forca,
    };
  }

  // ----- Metas -----
  const metas = perfil?.metas_projeto ?? null;
  const metaGorda = metas?.peso_kg && metas?.bf ? (metas.peso_kg * metas.bf) / 100 : null;
  const itensMeta: MetaRelatorio[] = (
    [
      { chave: 'peso_kg', nome: 'Peso', unidade: 'kg', p: progressoMeta(peso.inicio, peso.fim, metas?.peso_kg) },
      { chave: 'cintura_cm', nome: 'Cintura', unidade: 'cm', p: progressoMeta(ini?.cintura_cm, fimComp?.cintura_cm, metas?.cintura_cm) },
      { chave: 'bf', nome: '% de gordura', unidade: '%', p: progressoMeta(ini?.bf, fimComp?.bf, metas?.bf) },
      { chave: 'massa_gorda_kg', nome: 'Massa gorda', unidade: 'kg', p: progressoMeta(ini?.massa_gorda_kg, fimComp?.massa_gorda_kg, metaGorda) },
      ...(feminino ? [{ chave: 'quadril_cm', nome: 'Quadril', unidade: 'cm', p: progressoMeta(ini?.quadril_cm, fimComp?.quadril_cm, metas?.quadril_cm) }] : []),
    ] as { chave: MetaRelatorio['chave']; nome: string; unidade: MetaRelatorio['unidade']; p: ProgressoMeta | null }[]
  )
    .filter((x) => x.p !== null)
    .map((x) => ({ chave: x.chave, nome: x.nome, unidade: x.unidade, progresso: x.p! }));
  const balanco = metas ? linhasBalanco(ini, temFim ? fimComp : null, metas, sexo) : [];

  // ----- Recordes -----
  const recordes: RecordeRelatorio[] = [];
  const normais = e.composicoes.filter((c) => !c.atipica && naJanela(c.data));
  const sp = melhorSemana(normais, 'peso_kg');
  if (sp)
    recordes.push({ id: 'semana_peso', categoria: 'corpo', titulo: 'Melhor semana no peso', texto: sinal(sp.delta, 1, ' kg'), valor: sp.delta, detalhe: `Medições de ${curta(sp.de.data)} e ${curta(sp.ate.data)}`, de: sp.de.data, ate: sp.ate.data });
  const sc = melhorSemana(normais, 'cintura_cm');
  if (sc)
    recordes.push({ id: 'semana_cintura', categoria: 'corpo', titulo: 'Maior queda de cintura numa semana', texto: sinal(sc.delta, 1, ' cm'), valor: sc.delta, detalhe: `Medições de ${curta(sc.de.data)} e ${curta(sc.ate.data)}`, de: sc.de.data, ate: sc.ate.data });
  const faseCintura = fases.filter((f) => f.cintura_cm !== null && f.cintura_cm < -1e-9).sort((a, b) => a.cintura_cm! - b.cintura_cm!)[0];
  if (faseCintura && fases.length > 1)
    recordes.push({ id: 'fase_cintura', categoria: 'corpo', titulo: 'Bloco com mais cintura perdida', texto: sinal(faseCintura.cintura_cm, 1, ' cm'), valor: faseCintura.cintura_cm!, detalhe: `${faseCintura.rotulo} · ${curta(faseCintura.inicio)} a ${curta(faseCintura.fim)}`, de: faseCintura.inicio, ate: faseCintura.fim });
  const pesosNormais = e.serie.filter((p) => !p.atipica && p.data >= inicio && p.data <= fim);
  if (pesosNormais.length >= 2) {
    const menor = pesosNormais.reduce((a, b) => (b.peso_kg < a.peso_kg ? b : a));
    if (menor.data !== pesosNormais[0].data)
      recordes.push({ id: 'menor_peso', categoria: 'corpo', titulo: 'Menor peso registrado', texto: kg(menor.peso_kg), valor: menor.peso_kg, detalhe: `${menor.origem === 'medida' ? 'Medição' : 'Pesagem'} de ${curta(menor.data)}`, de: menor.data, ate: menor.data });
  }
  const seqRec = (id: string, titulo: string, n: number, detalhe: string) => {
    if (n >= 2) recordes.push({ id, categoria: 'habito', titulo, texto: dias(n), valor: n, detalhe, de: null, ate: null });
  };
  seqRec('seq_dieta', 'Maior sequência no plano alimentar', habitos.sequencias.dieta, 'Dias seguidos com “Segui o plano?” = sim');
  seqRec('seq_diario', 'Maior sequência de Diário', habitos.sequencias.diario, 'Dias seguidos com algum registro');
  seqRec('seq_sono', 'Maior sequência de sono 7 h+', habitos.sequencias.sono, 'Noites seguidas com 7 h ou mais');
  seqRec('seq_agua', 'Maior sequência de água na meta', habitos.sequencias.agua, 'Dias seguidos com a meta de água');
  const noDia = linhas.filter((l) => l.atraso_dias === 0).length;
  if (linhas.length >= 2)
    recordes.push({ id: 'doses_no_dia', categoria: 'remedio', titulo: 'Aplicações no dia previsto', texto: `${noDia} de ${linhas.length}`, valor: noDia / linhas.length, detalhe: `${pct(noDia / linhas.length, 0)} das aplicações sem atraso nem adiantamento`, de: null, ate: null });
  if (treino) {
    if (treino.maior_corrida)
      recordes.push({ id: 'maior_corrida', categoria: 'treino', titulo: 'Corrida mais longa', texto: formatarKm(treino.maior_corrida.km), valor: treino.maior_corrida.km, detalhe: `${curta(treino.maior_corrida.data)} · ${formatarTempo(treino.maior_corrida.segundos)}`, de: treino.maior_corrida.data, ate: treino.maior_corrida.data });
    if (treino.melhor_pace)
      recordes.push({ id: 'melhor_pace', categoria: 'treino', titulo: 'Melhor pace', texto: `${formatarTempo(treino.melhor_pace.pace)} /km`, valor: treino.melhor_pace.pace, detalhe: `${curta(treino.melhor_pace.data)} · ${formatarKm(treino.melhor_pace.km)}`, de: treino.melhor_pace.data, ate: treino.melhor_pace.data });
    if (treino.recorde_sequencia >= 2)
      recordes.push({ id: 'seq_treino', categoria: 'treino', titulo: 'Maior sequência de treino + cardio', texto: dias(treino.recorde_sequencia), valor: treino.recorde_sequencia, detalhe: 'Dias seguidos com os dois marcados', de: null, ate: null });
    const melhorEx = treino.forca?.exercicios.filter((x) => x.variacao > 1e-9).sort((a, b) => b.variacao - a.variacao)[0];
    if (melhorEx)
      recordes.push({ id: 'forca', categoria: 'treino', titulo: `Força: ${melhorEx.nome}`, texto: sinal(melhorEx.variacao * 100, 0, '%'), valor: melhorEx.variacao, detalhe: `1RM estimado ${num(melhorEx.e1rm_inicio, 1)} → ${num(melhorEx.e1rm_fim, 1)} kg`, de: melhorEx.data_inicio, ate: melhorEx.data_fim });
  }

  // ----- Destaques (as mesmas regras da Análise, no ciclo inteiro) -----
  const maisAdiantada = [...itensMeta].sort((a, b) => b.progresso.fracao - a.progresso.fracao)[0];
  const listaDestaques = destaques({
    cintura: numeros.cintura.delta,
    gorda: numeros.massa_gorda.delta,
    magra: numeros.massa_magra.delta,
    peso: peso.delta,
    pesoPct: peso.delta_pct,
    ritmo: null,
    gorduraDaPerda: q && !q.sem_perda ? q.gordura : null,
    nausea: pico,
    adesao: ateHab >= deHab ? adesao : null,
    periodoAdesao: 'no ciclo',
    meta: maisAdiantada ? { nome: maisAdiantada.nome.toLowerCase(), fracao: maisAdiantada.progresso.fracao, alcancada: maisAdiantada.progresso.alcancada } : null,
    desde: 'no ciclo',
  });

  // ----- Fotos -----
  const pares: ParFotoRelatorio[] = paresComparar(fotos).map((p) => {
    const cA = medicaoProxima(e.composicoes, p.antes.data);
    const cD = medicaoProxima(e.composicoes, p.depois.data);
    return {
      chave: p.chave,
      rotulo: p.rotulo,
      id_antes: p.antes.id,
      id_depois: p.depois.id,
      data_antes: p.antes.data,
      data_depois: p.depois.data,
      medicao_antes: cA,
      medicao_depois: cD,
      numeros_antes: numerosDaMedicao(cA, feminino),
      numeros_depois: numerosDaMedicao(cD, feminino, cA && cD && cA.data !== cD.data ? cA : null),
    };
  });
  const fotosRel: FotosRelatorio = {
    total: fotos.length,
    antes: fotos.filter((f) => f.sessao === 'antes').length,
    depois: fotos.filter((f) => f.sessao === 'depois').length,
    pares,
    capa: pares.find((p) => p.chave === ('frente' as Pose)) ?? pares[0] ?? null,
    pdf: montarFotosPdf(fotos, e.composicoes, feminino),
  };

  // ----- Registros, textos e cartão -----
  const nomeCompleto = perfil?.nome?.trim() ?? '';
  const primeiro = nomeCompleto.split(/\s+/)[0] ?? '';
  const semanasTxt = `${num(nDias / 7, nDias % 7 === 0 ? 0 : 1)} semanas`;
  const partesResumo = [
    peso.delta !== null && `peso ${sinal(peso.delta, 1, ' kg')}`,
    numeros.cintura.delta !== null && `cintura ${sinal(numeros.cintura.delta, 1, ' cm')}`,
    numeros.bf.delta !== null && `% de gordura ${sinal(numeros.bf.delta, 1, ' p.p.')}`,
  ].filter(Boolean) as string[];
  const base = `${concluido ? 'Em' : 'Até agora, em'} ${nDias ? `${dias(nDias)} (${semanasTxt})` : '0 dias'} e ${linhas.length} ${linhas.length === 1 ? 'aplicação' : 'aplicações'}`;
  const resumoTexto = semQuebra(
    partesResumo.length ? `${base}: ${partesResumo.join(', ')}${partesResumo.at(-1)!.endsWith('.') ? '' : '.'}` : `${base}. As variações aparecem com duas medições.`,
  );
  const metricaCartao = (v: VariacaoRelatorio): MetricaCartaoFinal => ({
    chave: v.chave,
    rotulo: v.rotulo,
    texto: v.delta !== null ? v.texto_delta : v.texto_fim,
    detalhe: v.delta !== null ? `${v.texto_inicio} → ${v.texto_fim}` : v.inicio !== null ? 'sem nova medição' : 'sem medição',
    tom: v.tom,
  });
  const adesaoCartao = [
    ...(adesao.treino ? [{ rotulo: 'Treino', t: adesao.treino }] : []),
    { rotulo: 'Dieta', t: adesao.dieta },
    { rotulo: 'Água', t: adesao.agua },
    { rotulo: 'Sono 7 h+', t: adesao.sono },
  ]
    .filter((x) => x.t.fracao !== null && x.t.total >= 3)
    .map((x) => ({ rotulo: x.rotulo, fracao: x.t.fracao as number }));

  return {
    versao: VERSAO_RELATORIO_FINAL,
    estado: concluido ? 'concluido' : 'previa',
    rotulo_estado: concluido ? 'Ciclo concluído' : 'Em andamento — prévia',
    gerado_em: hoje,
    pessoa: {
      nome: nomeCompleto,
      primeiro_nome: primeiro,
      sexo,
      feminino,
      com_treino: comTreino,
      altura_cm: perfil?.altura_cm ?? null,
      idade: idade(perfil?.data_nascimento, hoje),
    },
    periodo: {
      inicio,
      fim,
      fim_previsto: fimPrevisto,
      dias: nDias,
      semanas: nDias / 7,
      progresso,
      texto: `${formatarData(inicio)} – ${formatarData(fim)}`,
    },
    pos_remedio: pos
      ? {
          inicio: pos.inicio,
          semana: pos.semana,
          texto: `Fase pós-remédio desde ${formatarData(pos.inicio)}${pos.semana !== null ? ` (semana ${pos.semana + 1} de ${SEMANAS_POS})` : ''}: fica fora deste relatório.`,
        }
      : null,
    remedio: {
      nome: ciclo.nome,
      concentracao_mg_ml: ciclo.concentracao_mg_ml,
      intervalo_dias: ciclo.intervalo_dias,
      aplicacoes: linhas.length,
      total_mg: resumo.total_aplicado_mg,
      dose_inicial: linhas[0]?.aplicacao.dose_mg ?? null,
      dose_final: linhas.at(-1)?.aplicacao.dose_mg ?? null,
      dose_maxima: linhas.length ? Math.max(...linhas.map((l) => l.aplicacao.dose_mg)) : null,
      percentual_frasco: resumo.percentual_usado,
      no_dia: noDia,
      atrasadas: linhas.filter((l) => l.atraso_dias > 0).length,
    },
    numeros,
    massa_magra: { ...massaMagra, texto: semQuebra(massaMagra.texto) },
    ritmo_medio: ritmo,
    qualidade,
    registros: {
      dias_diario: diarioP.length,
      pesagens: e.serie.filter((p) => p.data >= inicio && p.data <= fim).length,
      medicoes: e.composicoes.filter((c) => c.data >= inicio && c.data <= fim).length,
      atipicas: e.composicoes.filter((c) => c.atipica && c.data >= inicio && c.data <= fim).length,
      aplicacoes: linhas.length,
      dias_treino: treinos ? treinos.filter((t) => t.data >= inicio && t.data <= fim && (t.treino || t.cardio)).length : null,
      fotos: fotos.length,
      decisoes: (ciclo.decisoes ?? []).filter((d) => d.data <= fim).length + e.registroDecisoes.filter((r) => r.data <= fim).length,
    },
    resumo_texto: resumoTexto,
    series,
    semanas,
    fases,
    nausea: { colunas: colunas.map((c) => c.rotulo), pico, tem_sintomas: temSintomas },
    linha_do_tempo: eventos,
    recordes,
    habitos,
    treino,
    metas: { itens: itensMeta, balanco },
    destaques: listaDestaques,
    fotos: fotosRel,
    dieta: e.dieta ? { refeicoes: e.dieta.refeicoes.filter((r) => r.itens.length).length } : null,
    cartao: {
      titulo: nDias ? `${duracaoCurta(nDias)} de ciclo` : 'Ciclo',
      sobretitulo: concluido ? 'Relatório final' : 'Relatório final · prévia',
      periodo: `${curta(inicio)} – ${curta(fim)}`,
      principal: metricaCartao(numeros.cintura),
      metricas: [numeros.massa_gorda, numeros.bf, numeros.massa_magra].map(metricaCartao),
      peso: metricaCartao(peso),
      duracao: dias(nDias),
      doses: `${linhas.length} ${linhas.length === 1 ? 'aplicação' : 'aplicações'}`,
      adesao: adesaoCartao,
    },
    textos: {
      rodape: RODAPE_RELATORIO_FINAL,
      aviso_previa: concluido
        ? null
        : `Em andamento — prévia: os números mudam até o fim do ciclo${fimPrevisto && fimPrevisto > hoje ? ` (previsto para ${dataPorExtenso(fimPrevisto)})` : ''}.`,
      medicao: 'Medidas com fita em jejum, às segundas; % de gordura pela Marinha dos EUA com a calibração do perfil. Medições atípicas ficam fora das comparações.',
    },
  };
}
