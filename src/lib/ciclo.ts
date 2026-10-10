import { diferencaDias, formatarData, maiorData, somarDias } from './datas';
import type { Aplicacao, Ciclo, DecisaoFase, Fase, RegistroDiario } from './tipos';
import { LOCAIS_APLICACAO } from './tipos';

const EPS = 1e-9;

/** Plano de escalonamento da planilha "Controle_Retatrutida" (aba Plano). */
export const PLANO_PADRAO: Fase[] = [
  { nome: 'Adaptação', semanas: 4, dose_mg: 1.25, objetivo: 'Corpo se acostuma ao medicamento; fase em que náusea e plenitude costumam aparecer mais.' },
  { nome: 'Primeira progressão', semanas: 4, dose_mg: 1.5, objetivo: 'Aumento leve, só se a fase 1 foi bem tolerada.' },
  { nome: 'Consolidação', semanas: 4, dose_mg: 1.75, objetivo: 'Apetite tende a estabilizar; atenção à hidratação e à proteína.' },
  { nome: 'Intermediária', semanas: 4, dose_mg: 2, objetivo: "Primeira dose 'redonda', fácil de medir." },
  { nome: 'Pré-manutenção', semanas: 4, dose_mg: 2.25, objetivo: 'Último degrau antes da dose-alvo.' },
  { nome: 'Manutenção', semanas: 10, dose_mg: 2.5, objetivo: 'Dose-alvo mantida até o fim da sua parte do frasco.' },
];

export function cicloPadrao(data_inicio: string): Omit<Ciclo, 'id'> {
  return {
    nome: 'Retatrutida 20 mg/ml',
    data_inicio,
    quantidade_total_mg: 60,
    concentracao_mg_ml: 20,
    intervalo_dias: 7,
    // 0,25 UI: todas as doses do plano (1,25 a 2,5 mg) caem exatas na seringa U-100
    passo_ui: 0.25,
    fases: PLANO_PADRAO.map((f) => ({ ...f })),
  };
}

// ---------- Conversões (seringa U-100: 100 UI = 1 ml) ----------

export function mgParaMl(mg: number, concentracao: number): number {
  return concentracao > 0 ? mg / concentracao : 0;
}

export function mgParaUI(mg: number, concentracao: number): number {
  return mgParaMl(mg, concentracao) * 100;
}

export interface Marcacao {
  ui: number;
  /** UI arredondada para a menor marcação da seringa */
  ui_pratica: number;
  /** mg efetivamente entregues ao puxar ui_pratica */
  mg_pratica: number;
}

export function marcacao(mg: number, ciclo: Pick<Ciclo, 'concentracao_mg_ml' | 'passo_ui'>): Marcacao {
  const ui = mgParaUI(mg, ciclo.concentracao_mg_ml);
  const passo = ciclo.passo_ui > 0 ? ciclo.passo_ui : 0.5;
  // Arredonda ao múltiplo mais próximo (empate sobe), com tolerância a ruído de ponto flutuante.
  const ui_pratica = Math.floor(ui / passo + 0.5 + EPS) * passo;
  return { ui, ui_pratica, mg_pratica: (ui_pratica / 100) * ciclo.concentracao_mg_ml };
}

// ---------- Seringa configurável ----------

export const CAPACIDADES_SERINGA = [30, 50, 100] as const;
export const MARCAS_SERINGA = [1, 0.5] as const;
/** Sem capacidade informada, o limite é o da maior seringa U-100 (1 ml) */
export const CAPACIDADE_PADRAO_UI = 100;

/** Passo de leitura: um quarto do intervalo entre as marcas impressas. */
export function passoDaMarca(marca: number): number {
  return (marca > 0 ? marca : 1) / 4;
}

export interface Seringa {
  /** null = não informada (vale o limite de 100 UI) */
  capacidade: number | null;
  marca: number;
}

export function seringaDo(c: Pick<Ciclo, 'seringa_capacidade_ui' | 'seringa_marca_ui'>): Seringa {
  return { capacidade: c.seringa_capacidade_ui ?? null, marca: c.seringa_marca_ui && c.seringa_marca_ui > 0 ? c.seringa_marca_ui : 1 };
}

export function capacidadeSeringa(c: Pick<Ciclo, 'seringa_capacidade_ui'>): number {
  return c.seringa_capacidade_ui && c.seringa_capacidade_ui > 0 ? c.seringa_capacidade_ui : CAPACIDADE_PADRAO_UI;
}

function fmtUI(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** "seringa U-100 de 50 UI, marcas de 1 em 1 UI" (a capacidade só aparece se foi informada) */
export function textoSeringa(c: Pick<Ciclo, 'seringa_capacidade_ui' | 'seringa_marca_ui'>): string {
  const s = seringaDo(c);
  return `seringa U-100${s.capacidade ? ` de ${s.capacidade} UI` : ''}, marcas de ${fmtUI(s.marca)} em ${fmtUI(s.marca)} UI`;
}

/** As duas marcas impressas em volta da dose, com os mg de cada uma; null se a dose cai numa marca. */
export function marcasVizinhas(ui: number, marca: number, concentracao: number): { ui: number; mg: number }[] | null {
  const m = marca > 0 ? marca : 1;
  const abaixo = Math.floor(ui / m + EPS) * m;
  if (Math.abs(ui - abaixo) < 1e-6) return null;
  return [abaixo, abaixo + m].map((u) => ({ ui: u, mg: (u / 100) * concentracao }));
}

// ---------- Plano ----------

export function totalDosesPlano(fases: Fase[]): number {
  return fases.reduce((s, f) => s + f.semanas, 0);
}

export function consumoPlano(fases: Fase[]): number {
  return fases.reduce((s, f) => s + f.semanas * f.dose_mg, 0);
}

export interface FaseLocalizada {
  indice: number;
  fase: Fase;
  /** Nº da 1ª e da última aplicação da fase */
  inicio: number;
  fim: number;
}

/** Fases com a numeração das aplicações que cobrem (equivale a "Semana início/fim"). */
export function fasesNumeradas(fases: Fase[]): FaseLocalizada[] {
  let inicio = 1;
  return fases.map((fase, indice) => {
    const item = { indice, fase, inicio, fim: inicio + fase.semanas - 1 };
    inicio += fase.semanas;
    return item;
  });
}

/** Fase da N-ésima aplicação. Depois do fim do plano, permanece na última fase. */
export function faseDaDose(fases: Fase[], numero: number): FaseLocalizada {
  const numeradas = fasesNumeradas(fases);
  return numeradas.find((f) => numero >= f.inicio && numero <= f.fim) ?? numeradas[numeradas.length - 1];
}

/** sem_margem = consome tudo ou sobra menos que 1 dose da última fase */
export type SituacaoPlano = 'sem_margem' | 'sobra' | 'excesso';

/** Volume que costuma ficar no fundo do frasco e na agulha (só sugestão, não entra na conta) */
export const RESERVA_ML = 0.1;

export interface VerificacaoPlano {
  consumo: number;
  situacao: SituacaoPlano;
  mensagem: string;
  /** Reserva sugerida para perdas, mostrada ao lado (não entra no cálculo) */
  reserva_ml: number;
  reserva_mg: number;
}

export function verificarPlano(ciclo: Pick<Ciclo, 'fases' | 'quantidade_total_mg' | 'concentracao_mg_ml'>): VerificacaoPlano {
  const consumo = consumoPlano(ciclo.fases);
  const diferenca = ciclo.quantidade_total_mg - consumo;
  const ultimaDose = ciclo.fases[ciclo.fases.length - 1]?.dose_mg ?? 0;
  const reserva = { reserva_ml: RESERVA_ML, reserva_mg: RESERVA_ML * ciclo.concentracao_mg_ml };
  if (diferenca < -0.001) {
    return { consumo, situacao: 'excesso', mensagem: `Atenção: o plano consome MAIS do que você tem (${fmt(-diferenca)} mg a mais).`, ...reserva };
  }
  // Consumo igual ao frasco não é acerto: sempre sobra líquido no fundo e na agulha
  if (diferenca < 0.001) {
    return { consumo, situacao: 'sem_margem', mensagem: 'Sem margem: o plano consome toda a sua parte do frasco e a última dose pode não sair completa.', ...reserva };
  }
  if (diferenca + EPS < ultimaDose) {
    return {
      consumo,
      situacao: 'sem_margem',
      mensagem: `Sem margem: sobram só ${fmt(diferenca)} mg, menos que 1 dose da última fase (${fmt(ultimaDose)} mg). A última dose pode não sair completa.`,
      ...reserva,
    };
  }
  return { consumo, situacao: 'sobra', mensagem: `Sobram ${fmt(diferenca)} mg ao final do plano.`, ...reserva };
}

/** Regras do Plano para o fim de cada fase (mostradas no Plano e no bloco "Fim da fase"). */
export const REGRAS_FASE: [string, string][] = [
  ['Tolerou bem (sem náusea relevante, comendo e se hidratando normalmente)', 'Sobe para a próxima fase.'],
  ['Efeitos leves, mas incômodos', 'Repete a fase por mais algumas semanas (botão "Repetir fase").'],
  ['Vômitos frequentes, não consegue se hidratar, dor abdominal forte, palpitação persistente', 'Suspende e procura atendimento médico.'],
  ['Já satisfeito com o resultado numa dose menor', 'Pode permanecer nela; não é obrigatório chegar à dose final.'],
];

// ---------- Degraus de dose (pela dose realmente aplicada) ----------

/** Diferença até 0,01 mg conta como a mesma dose */
export const TOLERANCIA_DOSE_MG = 0.01;

export function mesmaDose(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCIA_DOSE_MG + EPS;
}

/** Aplicações seguidas com a mesma dose. */
export interface BlocoDose {
  indice: number;
  /** Posição (0 = 1ª aplicação do ciclo) da 1ª aplicação do bloco */
  primeira: number;
  aplicacoes: number;
  dose_mg: number;
  data_inicio: string;
}

export function blocosDeDose(ordenadas: Aplicacao[]): BlocoDose[] {
  const blocos: BlocoDose[] = [];
  ordenadas.forEach((a, i) => {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && mesmaDose(ultimo.dose_mg, a.dose_mg)) ultimo.aplicacoes++;
    else blocos.push({ indice: blocos.length, primeira: i, aplicacoes: 1, dose_mg: a.dose_mg, data_inicio: a.data });
  });
  return blocos;
}

export interface DegrauBloco {
  bloco: BlocoDose;
  /** 1ª fase do plano com esta dose; null = dose fora do plano (sem confirmação) */
  primeira_fase: number | null;
  /** Última fase seguida com a mesma dose: é dela que se sobe */
  ultima_fase: number | null;
  /** Aplicações previstas no degrau (fases seguidas com a mesma dose somam) */
  semanas: number | null;
  /** Dose fora do plano com a fase escolhida pelo usuário */
  confirmada: boolean;
}

function acharFase(fases: Fase[], dose: number, de: number, ate = fases.length): number | null {
  for (let i = Math.max(de, 0); i < ate; i++) if (mesmaDose(fases[i].dose_mg, dose)) return i;
  return null;
}

function ultimaDecisao(decisoes: DecisaoFase[], filtro: (d: DecisaoFase) => boolean): DecisaoFase | null {
  for (let i = decisoes.length - 1; i >= 0; i--) if (filtro(decisoes[i])) return decisoes[i];
  return null;
}

/**
 * Encaixa cada bloco numa fase: a 1ª fase, a partir da fase do bloco anterior,
 * cuja dose bate com a aplicada. Sem nenhuma à frente, procura nas anteriores
 * (voltou a uma dose menor). Sem nenhuma, vale a fase que o usuário confirmou.
 */
export function localizarDegraus(fases: Fase[], blocos: BlocoDose[], decisoes: DecisaoFase[] = []): DegrauBloco[] {
  let busca = 0;
  return blocos.map((bloco) => {
    let i = acharFase(fases, bloco.dose_mg, busca) ?? acharFase(fases, bloco.dose_mg, 0, busca);
    let confirmada = false;
    if (i === null) {
      const c = ultimaDecisao(
        decisoes,
        (d) => d.escolha === 'confirmar_fase' && d.bloco_inicio === bloco.data_inicio && mesmaDose(d.dose_mg, bloco.dose_mg),
      );
      if (c && c.fase_indice !== null && c.fase_indice >= 0 && c.fase_indice < fases.length) {
        i = c.fase_indice;
        confirmada = true;
      }
    }
    if (i === null) return { bloco, primeira_fase: null, ultima_fase: null, semanas: null, confirmada };
    let j = i;
    let semanas = fases[i].semanas;
    // Fases seguidas com a mesma dose formam um degrau só (ex.: manutenção dividida em duas)
    if (!confirmada) {
      while (j + 1 < fases.length && mesmaDose(fases[j + 1].dose_mg, fases[i].dose_mg)) semanas += fases[++j].semanas;
    }
    busca = j;
    return { bloco, primeira_fase: i, ultima_fase: j, semanas, confirmada };
  });
}

/** Última fase do degrau que começa na fase f (fases seguidas com a mesma dose somam). */
export function fimDoDegrau(fases: Fase[], f: number): number {
  let j = f;
  while (j + 1 < fases.length && mesmaDose(fases[j + 1].dose_mg, fases[f].dose_mg)) j++;
  return j;
}

/** Aplicações previstas no degrau que começa na fase f ("dose 1 de N"). */
export function semanasDoDegrau(fases: Fase[], f: number): number {
  let s = 0;
  for (let i = f; i <= fimDoDegrau(fases, f); i++) s += fases[i].semanas;
  return s;
}

/** Fase da p-ésima aplicação (1 = primeira) dentro do degrau; além do previsto, fica na última. */
function faseNoDegrau(fases: Fase[], numeradas: FaseLocalizada[], d: DegrauBloco, posicao: number): FaseLocalizada | null {
  if (d.primeira_fase === null || d.ultima_fase === null) return null;
  let acumulado = 0;
  for (let f = d.primeira_fase; f <= d.ultima_fase; f++) {
    acumulado += fases[f].semanas;
    if (posicao <= acumulado) return numeradas[f];
  }
  return numeradas[d.ultima_fase];
}

/**
 * inicio: nenhuma aplicação · em_curso: degrau ainda não completou (mesma dose)
 * · pendente: degrau completo, esperando a decisão (mantém a dose) · subir:
 * decidido subir · fim_plano: completou a última fase · fora_do_plano: dose que
 * não bate com nenhuma fase, esperando confirmação.
 */
export type EstadoDegrau = 'inicio' | 'em_curso' | 'pendente' | 'subir' | 'fim_plano' | 'fora_do_plano';

export interface SituacaoDegrau {
  estado: EstadoDegrau;
  /** Dose da próxima aplicação: nunca sobe sem uma decisão registrada */
  dose_mg: number;
  /** Fase da próxima aplicação (null = fora do plano) */
  fase: FaseLocalizada | null;
  /** Bloco atual de doses iguais e o degrau em que ele se encaixa */
  degrau: DegrauBloco | null;
  /** Aplicações já feitas no degrau e quantas ele prevê */
  feitas: number;
  previstas: number | null;
  /** Fase seguinte do plano (a dose nova, se subir) */
  fase_seguinte: FaseLocalizada | null;
  /** Decisão de subir que vale para a próxima dose */
  decisao: DecisaoFase | null;
  /** Fase mais recente encaixada, para projetar o resto do plano */
  ultima_fase_conhecida: number | null;
}

export function situacaoDoDegrau(fases: Fase[], ordenadas: Aplicacao[], decisoes: DecisaoFase[] = []): SituacaoDegrau {
  const numeradas = fasesNumeradas(fases);
  const vazio = { degrau: null, feitas: 0, previstas: null, fase_seguinte: null, decisao: null, ultima_fase_conhecida: null };
  if (!fases.length) return { estado: 'inicio', dose_mg: 0, fase: null, ...vazio };
  if (!ordenadas.length) return { estado: 'inicio', dose_mg: fases[0].dose_mg, fase: numeradas[0], ...vazio, previstas: fases[0].semanas };
  const degraus = localizarDegraus(fases, blocosDeDose(ordenadas), decisoes);
  const d = degraus[degraus.length - 1];
  const feitas = d.bloco.aplicacoes;
  const conhecida = [...degraus].reverse().find((x) => x.ultima_fase !== null)?.ultima_fase ?? null;
  const base = { degrau: d, feitas, previstas: d.semanas, decisao: null, ultima_fase_conhecida: conhecida };
  if (d.ultima_fase === null || d.semanas === null) {
    return { estado: 'fora_do_plano', dose_mg: d.bloco.dose_mg, fase: null, ...base, fase_seguinte: null };
  }
  const doseDe = (f: FaseLocalizada) => (d.confirmada ? d.bloco.dose_mg : f.fase.dose_mg);
  if (feitas < d.semanas) {
    const fase = faseNoDegrau(fases, numeradas, d, feitas + 1)!;
    return { estado: 'em_curso', dose_mg: doseDe(fase), fase, ...base, fase_seguinte: numeradas[d.ultima_fase + 1] ?? null };
  }
  const atual = numeradas[d.ultima_fase];
  const seguinte = numeradas[d.ultima_fase + 1] ?? null;
  if (!seguinte) return { estado: 'fim_plano', dose_mg: doseDe(atual), fase: atual, ...base, fase_seguinte: null };
  const n = ordenadas.length;
  const decisao = ultimaDecisao(decisoes, (x) => x.escolha === 'subir' && x.apos_aplicacao === n && mesmaDose(x.dose_mg, d.bloco.dose_mg));
  if (decisao) return { estado: 'subir', dose_mg: seguinte.fase.dose_mg, fase: seguinte, ...base, decisao, fase_seguinte: seguinte };
  return { estado: 'pendente', dose_mg: doseDe(atual), fase: atual, ...base, fase_seguinte: seguinte };
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Execução do ciclo ----------

export interface LinhaAplicacao {
  numero: number;
  aplicacao: Aplicacao;
  /** Bloco de doses iguais seguidas a que a aplicação pertence */
  bloco: number;
  /** Fase do plano (null = dose fora do plano) */
  fase: FaseLocalizada | null;
  /** O que o app indicava para esta aplicação, pelas anteriores */
  dose_prevista: number;
  /** Data prevista: 1ª = data de início; demais = aplicação anterior + intervalo */
  data_prevista: string;
  /** Dias de diferença em relação ao previsto (positivo = atraso) */
  atraso_dias: number;
  diferenca_mg: number;
  /** Concentração usada nesta aplicação (a gravada nela ou, nas antigas, a do ciclo) */
  concentracao: number;
  ui_aplicada: number;
  acumulado_mg: number;
  saldo_mg: number;
  saldo_ml: number;
  /** Dias até a aplicação seguinte (ou até hoje, se for a última) */
  intervalo_seguinte: number | null;
  peso_medio: number | null;
  nausea_max: number | null;
}

export type SituacaoDose = 'futura' | 'hoje' | 'atrasada';

export interface ProximaDose extends Marcacao {
  numero: number;
  data: string;
  dose_mg: number;
  /** null = dose fora do plano */
  fase: FaseLocalizada | null;
  estado: EstadoDegrau;
  situacao: SituacaoDose;
  /** Dias até a data (futura) ou dias de atraso (atrasada) */
  dias: number;
  saldo_suficiente: boolean;
  /** Dose além do plano, usando a sobra do frasco */
  extra: boolean;
}

export interface DoseProjetada {
  numero: number;
  data: string;
  fase: FaseLocalizada;
  dose_mg: number;
  ui: number;
  saldo_apos_mg: number;
  /** Depende de subir de fase (decisão ainda não tomada) */
  hipotese: boolean;
}

export interface ResumoCiclo {
  linhas: LinhaAplicacao[];
  proxima: ProximaDose | null;
  /** Degrau atual: quantas doses da fase, decisão pendente, fora do plano */
  degrau: SituacaoDegrau;
  projecao: DoseProjetada[];
  aplicacoes_realizadas: number;
  total_aplicado_mg: number;
  saldo_mg: number;
  saldo_ml: number;
  saldo_ui: number;
  percentual_usado: number;
  /** Quantas doses da última fase (manutenção) o saldo ainda cobre */
  doses_manutencao_restantes: number;
  /** Doses da última fase que sobram no frasco depois de cumprir o plano */
  sobra_doses: number;
  sobra_mg: number;
  /** Doses que o plano ainda tem (mesmo que o frasco não cubra todas) */
  doses_plano_restantes: number;
  data_fim_prevista: string | null;
  /** A data de fim conta com subidas de fase ainda não decididas */
  fim_hipotese: boolean;
  /** Dias sem aplicar quando passam de 14 (pausa longa); senão null */
  pausa_dias: number | null;
  sugestao_local: string;
  alertas: string[];
}

/** A partir de 14 dias sem aplicar, o app pede para confirmar a dose com o médico. */
export const DIAS_PAUSA_LONGA = 14;

export function ordenarAplicacoes(aplicacoes: Aplicacao[]): Aplicacao[] {
  return [...aplicacoes].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}

function janela(diario: RegistroDiario[], de: string, ate: string | null) {
  const regs = diario.filter((r) => r.data >= de && (ate === null || r.data < ate));
  const pesos = regs.map((r) => r.peso_kg).filter((p): p is number => p !== null);
  const nauseas = regs.map((r) => r.nausea).filter((n): n is number => n !== null);
  return {
    peso_medio: pesos.length ? pesos.reduce((s, p) => s + p, 0) / pesos.length : null,
    nausea_max: nauseas.length ? Math.max(...nauseas) : null,
  };
}

export function sugerirLocal(ultimo: string | null | undefined): string {
  const i = LOCAIS_APLICACAO.indexOf((ultimo ?? '') as (typeof LOCAIS_APLICACAO)[number]);
  return LOCAIS_APLICACAO[(i + 1) % LOCAIS_APLICACAO.length];
}

/** Concentração de uma aplicação: a gravada no registro ou, nas antigas, a do ciclo. */
export function concentracaoDe(a: Pick<Aplicacao, 'concentracao_mg_ml'>, ciclo: Pick<Ciclo, 'concentracao_mg_ml'>): number {
  return a.concentracao_mg_ml && a.concentracao_mg_ml > 0 ? a.concentracao_mg_ml : ciclo.concentracao_mg_ml;
}

/**
 * Motor do ciclo. A agenda é sempre recalculada a partir da última aplicação
 * real: se a dose era quinta e foi tomada na sexta, a próxima passa a ser na
 * sexta seguinte. A dose segue a dose REALMENTE aplicada: enquanto o degrau
 * (semanas da fase com essa dose) não completa, a próxima é a mesma; ao
 * completar, só sobe com uma decisão registrada no fim da fase.
 */
export function calcularCiclo(
  ciclo: Ciclo,
  aplicacoes: Aplicacao[],
  diario: RegistroDiario[],
  hoje: string,
): ResumoCiclo {
  const conc = ciclo.concentracao_mg_ml;
  const intervalo = ciclo.intervalo_dias > 0 ? ciclo.intervalo_dias : 7;
  const ordenadas = ordenarAplicacoes(aplicacoes.filter((a) => a.ciclo_id === ciclo.id));
  const decisoes = ciclo.decisoes ?? [];
  const numeradas = fasesNumeradas(ciclo.fases);
  const degraus = localizarDegraus(ciclo.fases, blocosDeDose(ordenadas), decisoes);
  const alertas: string[] = [];

  // Bloco e posição no bloco de cada aplicação
  const posicoes: { degrau: DegrauBloco; posicao: number }[] = [];
  for (const d of degraus) for (let p = 1; p <= d.bloco.aplicacoes; p++) posicoes.push({ degrau: d, posicao: p });

  let acumulado = 0;
  const linhas: LinhaAplicacao[] = ordenadas.map((ap, i) => {
    const numero = i + 1;
    const { degrau, posicao } = posicoes[i];
    const fase = faseNoDegrau(ciclo.fases, numeradas, degrau, posicao);
    // O que o app indicava com as aplicações anteriores (mesma regra da próxima dose)
    const prevista = ciclo.fases.length ? situacaoDoDegrau(ciclo.fases, ordenadas.slice(0, i), decisoes).dose_mg : ap.dose_mg;
    const data_prevista = i === 0 ? ciclo.data_inicio : somarDias(ordenadas[i - 1].data, intervalo);
    const seguinte = ordenadas[i + 1]?.data ?? null;
    const concAp = concentracaoDe(ap, ciclo);
    acumulado += ap.dose_mg;
    const saldo = ciclo.quantidade_total_mg - acumulado;
    if (i > 0) {
      const dias = diferencaDias(ordenadas[i - 1].data, ap.data);
      // Mesmo dia é sempre suspeito, qualquer que seja o intervalo
      if (dias === 0 || dias < intervalo - 2) {
        alertas.push(`Aplicações nº ${numero - 1} e nº ${numero} com apenas ${dias} dia(s) de intervalo. Confira se não houve registro duplicado.`);
      }
    }
    return {
      numero,
      aplicacao: ap,
      bloco: degrau.bloco.indice,
      fase,
      dose_prevista: prevista,
      data_prevista,
      atraso_dias: diferencaDias(data_prevista, ap.data),
      diferenca_mg: ap.dose_mg - prevista,
      concentracao: concAp,
      ui_aplicada: mgParaUI(ap.dose_mg, concAp),
      acumulado_mg: acumulado,
      saldo_mg: saldo,
      saldo_ml: mgParaMl(saldo, concAp),
      intervalo_seguinte: diferencaDias(ap.data, seguinte ?? hoje),
      ...janela(diario, ap.data, seguinte),
    };
  });

  const saldo = ciclo.quantidade_total_mg - acumulado;
  const ultima = ordenadas[ordenadas.length - 1];
  const situacao = situacaoDoDegrau(ciclo.fases, ordenadas, decisoes);

  let proxima: ProximaDose | null = null;
  const projecao: DoseProjetada[] = [];
  let dosesPlano = 0;

  if (saldo > EPS && ciclo.fases.length > 0) {
    const numero = ordenadas.length + 1;
    const data = ultima ? somarDias(ultima.data, intervalo) : ciclo.data_inicio;
    const dias = diferencaDias(hoje, data);
    const extra = situacao.estado === 'fim_plano';
    // Dose extra (depois do plano) é a sobra: nunca mais do que o frasco tem
    const dose = extra ? Math.min(situacao.dose_mg, Math.round(saldo * 100) / 100) : situacao.dose_mg;
    proxima = {
      numero,
      data,
      dose_mg: dose,
      fase: situacao.fase,
      estado: situacao.estado,
      situacao: dias > 0 ? 'futura' : dias === 0 ? 'hoje' : 'atrasada',
      dias: Math.abs(dias),
      saldo_suficiente: saldo + EPS >= dose,
      extra,
      ...marcacao(dose, ciclo),
    };
    if (!proxima.saldo_suficiente && !proxima.extra) {
      alertas.push(`O saldo (${fmt(saldo)} mg) não cobre a próxima dose prevista de ${fmt(dose)} mg.`);
    }

    // Doses que faltam no plano: o resto do degrau atual e, depois, as fases
    // seguintes inteiras, que são hipótese enquanto a subida não for decidida.
    const resto: { fase: FaseLocalizada; dose: number; hipotese: boolean }[] = [];
    const faseInteira = (f: number, hipotese: boolean) => {
      for (let p = 0; p < ciclo.fases[f].semanas; p++) resto.push({ fase: numeradas[f], dose: ciclo.fases[f].dose_mg, hipotese });
    };
    const fasesDepois = (de: number) => {
      for (let f = de; f < ciclo.fases.length; f++) faseInteira(f, true);
    };
    // Degrau decidido inteiro: as fases seguidas com a mesma dose não dependem de subir
    const degrauInteiro = (f: number) => {
      const j = fimDoDegrau(ciclo.fases, f);
      for (let k = f; k <= j; k++) faseInteira(k, false);
      fasesDepois(j + 1);
    };
    const d = situacao.degrau;
    if (situacao.estado === 'inicio') {
      degrauInteiro(0);
    } else if (situacao.estado === 'em_curso' && d && d.ultima_fase !== null) {
      for (let p = situacao.feitas + 1; p <= situacao.previstas!; p++) {
        const f = faseNoDegrau(ciclo.fases, numeradas, d, p)!;
        resto.push({ fase: f, dose: d.confirmada ? d.bloco.dose_mg : f.fase.dose_mg, hipotese: false });
      }
      fasesDepois(d.ultima_fase + 1);
    } else if (situacao.estado === 'pendente' && d?.ultima_fase != null) {
      fasesDepois(d.ultima_fase + 1);
    } else if (situacao.estado === 'subir' && d?.ultima_fase != null) {
      degrauInteiro(d.ultima_fase + 1);
    } else if (situacao.estado === 'fora_do_plano') {
      fasesDepois((situacao.ultima_fase_conhecida ?? -1) + 1);
    }
    dosesPlano = resto.length;

    // Projeção: se a dose está atrasada, assume que será tomada hoje.
    let dataProj = maiorData(data, hoje);
    let saldoProj = saldo;
    // A agenda vai só até o fim do plano; depois disso, o que sobra no frasco aparece como "sobra"
    for (let k = 0; k < resto.length && projecao.length < 200; k++) {
      const r = resto[k];
      if (saldoProj + EPS < r.dose) break;
      saldoProj -= r.dose;
      projecao.push({ numero: numero + k, data: dataProj, fase: r.fase, dose_mg: r.dose, ui: mgParaUI(r.dose, conc), saldo_apos_mg: saldoProj, hipotese: r.hipotese });
      dataProj = somarDias(dataProj, intervalo);
    }
  }

  const plano = verificarPlano(ciclo);
  if (plano.situacao === 'excesso') alertas.push(plano.mensagem);

  const doseManutencao = ciclo.fases[ciclo.fases.length - 1]?.dose_mg ?? 0;
  const sobraMg = Math.max(projecao.length ? projecao[projecao.length - 1].saldo_apos_mg : saldo, 0);
  const diasSemAplicar = ultima ? diferencaDias(ultima.data, hoje) : null;

  return {
    linhas,
    proxima,
    degrau: situacao,
    projecao,
    aplicacoes_realizadas: ordenadas.length,
    total_aplicado_mg: acumulado,
    saldo_mg: saldo,
    saldo_ml: mgParaMl(saldo, conc),
    saldo_ui: mgParaUI(saldo, conc),
    percentual_usado: ciclo.quantidade_total_mg > 0 ? acumulado / ciclo.quantidade_total_mg : 0,
    doses_manutencao_restantes: saldo <= 0 || doseManutencao <= 0 ? 0 : Math.floor(saldo / doseManutencao + EPS),
    sobra_doses: doseManutencao > 0 ? Math.floor(sobraMg / doseManutencao + EPS) : 0,
    sobra_mg: sobraMg,
    data_fim_prevista: projecao.length ? projecao[projecao.length - 1].data : ultima?.data ?? null,
    fim_hipotese: projecao.some((p) => p.hipotese),
    doses_plano_restantes: dosesPlano,
    pausa_dias: proxima && diasSemAplicar !== null && diasSemAplicar >= DIAS_PAUSA_LONGA ? diasSemAplicar : null,
    sugestao_local: sugerirLocal(ultima?.local),
    alertas,
  };
}

/** "Fase atual" da Análise e do PDF: a troca de fase só aparece como fato depois da decisão. */
export function descreverFaseAtual(r: Pick<ResumoCiclo, 'proxima' | 'degrau'>): string {
  const p = r.proxima;
  const s = r.degrau;
  if (!p) return 'Concluído';
  const concluida = s.degrau?.ultima_fase != null ? `Fase ${s.degrau.ultima_fase + 1} concluída` : 'Fase concluída';
  switch (s.estado) {
    case 'inicio':
      return p.fase ? `${p.fase.indice + 1} · ${p.fase.fase.nome} · ${fmt(p.dose_mg)} mg (não iniciada)` : 'Não iniciada';
    case 'em_curso':
      return `${s.fase!.indice + 1} · ${s.fase!.fase.nome} · ${fmt(s.degrau!.bloco.dose_mg)} mg (${s.feitas} de ${s.previstas} doses feitas)`;
    case 'pendente':
      return `${concluida} · próxima seria ${fmt(s.fase_seguinte!.fase.dose_mg)} mg em ${formatarData(p.data)}`;
    case 'subir':
      return `${concluida} · decidido subir: ${fmt(p.dose_mg)} mg em ${formatarData(p.data)}`;
    case 'fim_plano':
      return 'Plano concluído · dose extra com a sobra do frasco';
    case 'fora_do_plano':
      return `Dose fora do plano (${fmt(s.degrau!.bloco.dose_mg)} mg)`;
  }
}

/**
 * Onde parar o êmbolo numa seringa U-100, pelo intervalo entre as marcas
 * impressas (1 UI ou 0,5 UI). 6,25 com marcas de 1 → "um quarto depois da marca 6".
 */
export function guiaSeringa(ui: number, marca = 1): string {
  const m = marca > 0 ? marca : 1;
  const base = Math.floor(ui / m + EPS) * m;
  const resto = Math.round(((ui - base) / m) * 100) / 100;
  const a = fmtUI(base);
  const b = fmtUI(base + m);
  if (resto === 0) return `exatamente na marca ${a}`;
  if (resto === 0.5) return `no meio entre as marcas ${a} e ${b}`;
  if (resto === 0.25) return `um quarto depois da marca ${a} (entre ${a} e ${b})`;
  if (resto === 0.75) return `três quartos depois da marca ${a} (quase no ${b})`;
  return `entre as marcas ${a} e ${b}`;
}
