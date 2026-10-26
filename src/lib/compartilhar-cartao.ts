// Cartão de progresso para compartilhar (imagem PNG): só as contas, sem desenho.
// Usa as mesmas contas da Análise (analisarGeral, MDC, adesaoPeriodo) e nunca sugere dose.
import { analisarGeral, type PontoPeso } from './analise';
import { diferencaDias, formatarData, segundaDaSemana, somarDias } from './datas';
import { cm, corVariacao, kg, num, pp, sinal } from './formato';
import { MDC, type Composicao } from './gordura';
import { adesaoPeriodo } from './painel';
import type { RegistroDiario, TreinoDia } from './tipos';

export interface Periodo {
  de: string;
  ate: string;
}

export type TomCartao = 'bom' | 'ruim' | '';

export interface MetricaCartao {
  chave: 'cintura_cm' | 'massa_gorda_kg' | 'bf' | 'peso_kg';
  rotulo: string;
  delta: number | null;
  /** "− 3,8 cm" */
  texto: string;
  /** Cor pela regra do MDC: abaixo do erro da fita/balança fica sem cor */
  tom: TomCartao;
  /** "98,0 → 94,2 cm" */
  detalhe: string;
}

export interface ItemAdesao {
  rotulo: string;
  fracao: number;
  /** "6 de 7 dias" */
  texto: string;
}

export interface EntradaCartao {
  composicoes: Composicao[];
  serie: PontoPeso[];
  /** Dia da 1ª dose (ou início do ciclo) */
  inicioCiclo: string;
  hoje: string;
  /** Fim padrão sem período: hoje ou, com o remédio concluído, o fim do período do remédio */
  fimPadrao?: string;
  periodo?: Periodo | null;
  aplicacoes: { data: string; dose_mg: number }[];
  diario: RegistroDiario[];
  /** null para quem não tem a aba Treino */
  treinos: TreinoDia[] | null;
  metaAgua: (data: string) => number;
  incluirDose: boolean;
  incluirPeso: boolean;
}

export interface DadosCartao {
  de: string;
  ate: string;
  sobretitulo: string;
  titulo: string;
  /** "7 set – 2 nov 2026" */
  periodoTexto: string;
  /** A medida principal (cintura), em destaque */
  principal: MetricaCartao;
  /** Massa gorda, % de gordura e (se incluído) peso */
  metricas: MetricaCartao[];
  serieCintura: { data: string; valor: number }[];
  /** null sem o peso (opção desligada) ou com menos de 2 pontos */
  seriePeso: { data: string; valor: number }[] | null;
  /** O que as linhas mostram: "desde 07/09" ou, numa semana, "últimas 8 medições" */
  legendaLinhas: string;
  adesao: ItemAdesao[];
  /** "Dose 1,25 → 1,50 mg · 8 aplicações" (só com a opção ligada) */
  dose: string | null;
  /** Há início e agora para comparar */
  temVariacao: boolean;
  /** Há alguma medição no período */
  temDados: boolean;
  /** Texto alternativo da imagem */
  descricao: string;
  nomeArquivo: string;
}

/** Numa semana, as linhas mostram as últimas medições (contexto da tendência). */
export const ULTIMAS_MEDICOES = 8;

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "7 set – 2 nov 2026"; anos diferentes: "28 dez 2025 – 4 jan 2026"; mesmo dia: "2 nov 2026". */
export function textoPeriodo(de: string, ate: string): string {
  const parte = (d: string, ano: boolean) => {
    const [a, m, dia] = d.split('-').map(Number);
    return `${dia} ${MESES_CURTOS[m - 1]}${ano ? ` ${a}` : ''}`;
  };
  if (de === ate) return parte(ate, true);
  return `${parte(de, de.slice(0, 4) !== ate.slice(0, 4))} – ${parte(ate, true)}`;
}

/** Título do cartão: ciclo inteiro em semanas; período de uma semana pelo número da semana do ciclo. */
export function tituloCartao(inicioCiclo: string, de: string, ate: string, comPeriodo: boolean): { sobretitulo: string; titulo: string } {
  const dias = Math.max(diferencaDias(de, ate), 0);
  if (comPeriodo && dias <= 8) {
    // Mesma numeração do Resumo da semana: a medição de segunda fecha a semana anterior
    const n = Math.max(Math.floor(diferencaDias(segundaDaSemana(inicioCiclo), ate) / 7), 1);
    return { sobretitulo: 'Resumo da semana', titulo: `Meu ciclo · semana ${n}` };
  }
  const semanas = comPeriodo ? Math.round(dias / 7) : Math.floor(dias / 7);
  return {
    sobretitulo: comPeriodo ? 'Meu progresso no período' : 'Meu progresso',
    titulo: semanas >= 1 ? `Meu ciclo · ${semanas} ${semanas === 1 ? 'semana' : 'semanas'}` : 'Meu ciclo · 1ª semana',
  };
}

/** Texto da dose no período (descritivo): a primeira e a última aplicadas. */
export function textoDose(aplicacoes: { data: string; dose_mg: number }[], de: string, ate: string): string | null {
  const ordenadas = [...aplicacoes].sort((a, b) => a.data.localeCompare(b.data));
  const no = ordenadas.filter((a) => a.data >= de && a.data <= ate);
  const lista = no.length ? no : ordenadas.filter((a) => a.data <= ate).slice(-1);
  if (!lista.length) return null;
  const mg = (n: number) => num(n, 2);
  const a = lista[0].dose_mg;
  const b = lista[lista.length - 1].dose_mg;
  const doses = a === b ? `Dose ${mg(a)} mg` : `Dose ${mg(a)} → ${mg(b)} mg`;
  return no.length ? `${doses} · ${no.length} ${no.length === 1 ? 'aplicação' : 'aplicações'}` : doses;
}

function metrica(
  chave: MetricaCartao['chave'],
  rotulo: string,
  a: number | null | undefined,
  b: number | null | undefined,
  fmt: (n: number | null | undefined) => string,
  sufixo: string,
): MetricaCartao {
  const delta = a != null && b != null ? b - a : null;
  return {
    chave,
    rotulo,
    delta,
    texto: delta === null ? '–' : sinal(delta, 1, sufixo),
    tom: corVariacao(delta, true, MDC[chave]) as TomCartao,
    detalhe: a != null && b != null ? `${fmt(a).replace(/ (cm|kg)$/, '')} → ${fmt(b)}` : b != null ? `${fmt(b)} agora` : a != null ? `${fmt(a)} no início` : '',
  };
}

export function montarCartao(e: EntradaCartao): DadosCartao {
  const comPeriodo = !!e.periodo;
  const de = e.periodo?.de ?? e.inicioCiclo;
  const ateBruto = e.periodo?.ate ?? e.fimPadrao ?? e.hoje;
  const ate = ateBruto < de ? de : ateBruto;
  const comps = e.composicoes.filter((c) => c.data <= ate);
  const serie = e.serie.filter((p) => p.data <= ate);
  // Mesmas regras da Análise: início = última medição normal até o começo; agora = última normal
  const g = analisarGeral(de, serie, comps, ate);
  const ini = g.medida_inicial;
  // Medição do início que fica depois do fim do período não conta
  const atu = g.medida_atual && ini && g.medida_atual.data > ini.data ? g.medida_atual : null;
  const temDados = !!ini && ini.data <= ate;

  const principal = metrica('cintura_cm', 'Cintura', atu ? ini?.cintura_cm : null, (atu ?? ini)?.cintura_cm, cm, ' cm');
  const gorda = metrica('massa_gorda_kg', 'Massa gorda', atu ? ini?.massa_gorda_kg : null, (atu ?? ini)?.massa_gorda_kg, kg, ' kg');
  const bf = metrica('bf', '% de gordura', atu ? ini?.bf : null, (atu ?? ini)?.bf, pp, ' p.p.');
  if (bf.delta !== null) bf.texto = sinal(bf.delta, 1, ' p.p.');
  const metricas = [gorda, bf];
  if (e.incluirPeso) {
    const pIni = g.peso_inicial;
    const pAtu = g.peso_atual;
    const variacao = g.variacao_kg;
    const p = metrica('peso_kg', 'Peso', variacao !== null ? pIni?.peso_kg : null, pAtu?.peso_kg ?? pIni?.peso_kg, kg, ' kg');
    if (variacao !== null && g.variacao_percentual !== null) p.detalhe = `${kg(pAtu?.peso_kg)} · ${sinal(g.variacao_percentual * 100, 1, '%')}`;
    metricas.push(p);
  }

  // Linhas: medições normais desde a do início até o fim do período; numa semana (só 2 medições),
  // as últimas medições até o fim, para dar o contexto da tendência
  const curto = comPeriodo && diferencaDias(de, ate) <= 8;
  const ateFim = comps.filter((c) => !c.atipica);
  const normais = curto ? ateFim.slice(-ULTIMAS_MEDICOES) : ateFim.filter((c) => !ini || c.data >= ini.data);
  const serieCintura = normais.map((c) => ({ data: c.data, valor: c.cintura_cm }));
  const pelaMedida = ateFim.length >= 2;
  const pesos = pelaMedida
    ? normais.map((c) => ({ data: c.data, valor: c.peso_kg }))
    : serie.filter((p) => !p.atipica && p.data >= de).map((p) => ({ data: p.data, valor: p.peso_kg }));
  const seriePeso = e.incluirPeso && pesos.length >= 2 ? pesos : null;
  const legendaLinhas = curto ? `últimas ${normais.length} medições` : normais.length ? `desde ${dataCurta(normais[0].data)}` : '';

  // Hábitos: da 1ª dose (ou do começo do período) até ontem; a medição do último dia fecha a semana
  const ontem = somarDias(e.hoje, -1);
  const deA = de > e.inicioCiclo ? de : e.inicioCiclo;
  const fechaComMedicao = comPeriodo && comps.some((c) => c.data === ate && !c.atipica) && diferencaDias(de, ate) <= 8;
  const ateLimite = fechaComMedicao ? somarDias(ate, -1) : ate;
  const ateA = ateLimite < ontem ? ateLimite : ontem;
  const adesao: ItemAdesao[] = [];
  if (ateA >= deA) {
    const a = adesaoPeriodo({ diario: e.diario, treinos: e.treinos, de: deA, ate: ateA, metaAgua: e.metaAgua });
    const item = (rotulo: string, t: { feito: number; total: number; fracao: number | null } | null, unidade: string) => {
      if (t && t.total > 0 && t.fracao !== null) adesao.push({ rotulo, fracao: t.fracao, texto: `${num(t.feito, t.feito % 1 ? 1 : 0)} de ${t.total} ${unidade}` });
    };
    item('Treino', a.treino, 'dias');
    item('Cardio', a.cardio, 'dias');
    item('Dieta', a.dieta, 'dias');
    item('Água', a.agua, 'dias');
    item('Sono 7 h+', a.sono, 'noites');
  }

  const { sobretitulo, titulo } = tituloCartao(e.inicioCiclo, de, ate, comPeriodo);
  // Num período, os dias antes do início do ciclo não entram no texto
  const deTexto = comPeriodo ? (de < e.inicioCiclo && e.inicioCiclo <= ate ? e.inicioCiclo : de) : ini && ini.data < de ? ini.data : de;
  const periodoTexto = textoPeriodo(deTexto, atu?.data && !comPeriodo ? atu.data : ate);
  const dose = e.incluirDose ? textoDose(e.aplicacoes, de, ate) : null;
  const partes = [principal, ...metricas].filter((m) => m.delta !== null).map((m) => `${m.rotulo} ${m.texto}`);
  const descricao = `${titulo}, ${periodoTexto}. ${partes.length ? partes.join(', ') : 'Sem variação para comparar ainda'}.`;
  return {
    de,
    ate,
    sobretitulo,
    titulo,
    periodoTexto,
    principal,
    metricas,
    serieCintura,
    seriePeso,
    legendaLinhas,
    adesao,
    dose,
    temVariacao: !!atu,
    temDados,
    descricao,
    nomeArquivo: `ciclo-progresso-${ate}.png`,
  };
}

/** Data curta do cartão ("02/11"). */
export function dataCurta(d: string): string {
  return formatarData(d).slice(0, 5);
}
