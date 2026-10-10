import { ritmoPercentual, tendenciaMedidas } from './conferencia';
import { diferencaDias, formatarData, somarDias } from './datas';
import { num } from './formato';
import type { Composicao } from './gordura';
import type { Aplicacao, RegistroDiario } from './tipos';

// Alertas de segurança calculados com o que já está no Diário e nas Medidas.
// São critérios do próprio app para chamar atenção, não diagnóstico: o app
// nunca muda a dose, só mostra os dados. A dose é decidida com o médico.

/** atencao = cartão amarelo · info = cartão cinza (dica) */
export type NivelSeguranca = 'atencao' | 'info';

export type RegraSeguranca = 'hidratacao' | 'vomito_dose' | 'nausea_forte' | 'ritmo_rapido' | 'intestino_preso';

export interface AlertaSeguranca {
  nivel: NivelSeguranca;
  regra: RegraSeguranca;
  /** Dia do evento mais recente que disparou a regra */
  data: string;
  texto: string;
}

/** Frase fixa ao lado dos alertas (tela e PDF). */
export const AVISO_SEGURANCA = 'Critérios do app para chamar atenção, não diagnóstico. A dose é decidida com o seu médico.';

/** Perda acima disso (% do peso por semana, na tendência das medidas) gera alerta */
export const RITMO_MAXIMO_PCT = 1.5;

/** A tendência só vale se a última medição tiver no máximo esse número de dias */
const MEDICAO_RECENTE_DIAS = 14;

export interface EntradaSeguranca {
  diario: RegistroDiario[];
  /** Histórico de composição (historicoComposicao), em ordem de data */
  composicoes: Composicao[];
  aplicacoes: Aplicacao[];
  hoje: string;
}

const curta = (d: string) => formatarData(d).slice(0, 5);
const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** Maior sequência de dias seguidos (no calendário) entre as datas; devolve tamanho e último dia. */
function maiorSequencia(datas: string[]): { n: number; ate: string } | null {
  const ordenadas = [...new Set(datas)].sort();
  let melhor: { n: number; ate: string } | null = null;
  let n = 0;
  ordenadas.forEach((d, i) => {
    n = i > 0 && diferencaDias(ordenadas[i - 1], d) === 1 ? n + 1 : 1;
    // Empate: vale a sequência mais recente
    if (!melhor || n >= melhor.n) melhor = { n, ate: d };
  });
  return melhor;
}

/**
 * Regras (todas sobre dias registrados; dia sem registro não conta como "sem sintoma"):
 * - vômito ou diarreia em 2+ dias desde a última dose (até 7 dias) → hidratação;
 * - vômito no dia da dose ou no seguinte;
 * - náusea forte (3) em 2+ dias seguidos nos últimos 7 dias;
 * - perda acima de 1,5% do peso por semana na tendência das medidas;
 * - intestino preso 3+ dias seguidos nos últimos 7 dias → dica de fibra e água.
 */
export function alertasSeguranca({ diario, composicoes, aplicacoes, hoje }: EntradaSeguranca): AlertaSeguranca[] {
  const alertas: AlertaSeguranca[] = [];
  const semana = somarDias(hoje, -6);
  const ultimaDose = [...aplicacoes]
    .filter((a) => a.data <= hoje)
    .sort((a, b) => a.data.localeCompare(b.data))
    .at(-1)?.data;
  // Janela desde a última dose, limitada aos últimos 7 dias (dose atrasada não alonga a janela)
  const inicioJanela = ultimaDose && ultimaDose > semana ? ultimaDose : semana;
  const regs = diario.filter((r) => r.data <= hoje);
  const naJanela = regs.filter((r) => r.data >= inicioJanela);
  const naSemana = regs.filter((r) => r.data >= semana);

  // Vômito no dia da dose ou no seguinte
  if (ultimaDose && diferencaDias(ultimaDose, hoje) <= 7) {
    const v = regs.filter((r) => r.vomito === true && (r.data === ultimaDose || r.data === somarDias(ultimaDose, 1))).at(-1);
    if (v) {
      alertas.push({
        nivel: 'atencao',
        regra: 'vomito_dose',
        data: v.data,
        texto: `Vômito ${v.data === ultimaDose ? 'no dia da dose' : 'no dia seguinte à dose'} (${curta(v.data)}). Anote como foi o dia e mostre ao médico na próxima conversa.`,
      });
    }
  }

  // Vômito ou diarreia em 2 ou mais dias desde a dose
  const perdas = naJanela.filter((r) => r.vomito === true || r.diarreia === true);
  if (perdas.length >= 2) {
    alertas.push({
      nivel: 'atencao',
      regra: 'hidratacao',
      data: perdas[perdas.length - 1].data,
      texto: `Vômito ou diarreia em ${dias(perdas.length)} desde ${ultimaDose && ultimaDose === inicioJanela ? `a dose de ${curta(ultimaDose)}` : curta(inicioJanela)}: atenção à hidratação. Beba líquidos ao longo do dia; com treino e suor, reponha mais.`,
    });
  }

  // Náusea forte em dias seguidos
  const forte = maiorSequencia(naSemana.filter((r) => r.nausea === 3).map((r) => r.data));
  if (forte && forte.n >= 2) {
    alertas.push({
      nivel: 'atencao',
      regra: 'nausea_forte',
      data: forte.ate,
      texto: `Náusea forte em ${forte.n} dias seguidos (até ${curta(forte.ate)}). Anote como foi o dia e mostre ao médico; as regras do seu Plano para o fim da fase estão na aba Ciclo.`,
    });
  }

  // Ritmo de perda pela tendência das medidas (não pelo peso de um dia)
  const tend = tendenciaMedidas(composicoes);
  const ultimaMedida = composicoes.at(-1);
  if (tend && ultimaMedida && diferencaDias(tend.ate, hoje) <= MEDICAO_RECENTE_DIAS) {
    const r = ritmoPercentual(tend.peso_semana, ultimaMedida.peso_kg);
    if (r.pct > RITMO_MAXIMO_PCT) {
      alertas.push({
        nivel: 'atencao',
        regra: 'ritmo_rapido',
        data: tend.ate,
        texto: `Perda de ${num(r.pct, 1)}% do peso por semana na tendência das medidas (${curta(tend.de)} a ${curta(tend.ate)}), acima de ${num(RITMO_MAXIMO_PCT, 1)}%. Perda rápida pede atenção à massa magra e é um ponto para mostrar ao médico.`,
      });
    }
  }

  // Intestino preso em dias seguidos
  const preso = maiorSequencia(naSemana.filter((r) => r.intestino_preso === true).map((r) => r.data));
  if (preso && preso.n >= 3) {
    alertas.push({
      nivel: 'info',
      regra: 'intestino_preso',
      data: preso.ate,
      texto: `Intestino preso em ${preso.n} dias seguidos (até ${curta(preso.ate)}). Capriche na fibra (verduras, frutas, aveia, feijão) e na água ao longo do dia.`,
    });
  }

  return alertas;
}

/** Alerta que já aconteceu (seção "Eventos" do PDF): o último estado de cada episódio. */
export interface EventoSeguranca extends AlertaSeguranca {
  /** Primeiro dia em que a regra disparou neste episódio */
  desde: string;
}

/**
 * Histórico dos alertas no período: avalia as regras dia a dia, como se cada
 * dia fosse "hoje". Uma regra que dispara em dias seguidos é um episódio só;
 * o texto só é trocado por um fato mais novo (quando a janela de 7 dias anda,
 * a contagem cai, mas o que aconteceu continua valendo).
 */
export function historicoAlertas(entrada: Omit<EntradaSeguranca, 'hoje'>, de: string, ate: string): EventoSeguranca[] {
  const eventos: EventoSeguranca[] = [];
  const abertos = new Map<RegraSeguranca, number>();
  for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) {
    const ativos = alertasSeguranca({ ...entrada, hoje: dia });
    const regrasHoje = new Set(ativos.map((a) => a.regra));
    for (const regra of [...abertos.keys()]) if (!regrasHoje.has(regra)) abertos.delete(regra);
    for (const a of ativos) {
      const i = abertos.get(a.regra);
      if (i === undefined) {
        abertos.set(a.regra, eventos.length);
        eventos.push({ ...a, desde: dia });
      } else if (a.data > eventos[i].data) eventos[i] = { ...a, desde: eventos[i].desde };
    }
  }
  return eventos.sort((a, b) => a.data.localeCompare(b.data));
}

/** Só a constatação do alerta, sem a orientação (para tabela de relatório). */
export function resumoAlerta(texto: string): string {
  const i = texto.search(/\.\s/);
  return i > 0 ? texto.slice(0, i) : texto.replace(/\.$/, '');
}
