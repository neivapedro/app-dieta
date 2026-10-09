import { diferencaDias, maiorData, somarDias } from './datas';
import type { Aplicacao, Ciclo, Fase, RegistroDiario } from './tipos';
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

export type SituacaoPlano = 'exato' | 'sobra' | 'excesso';

export function verificarPlano(ciclo: Ciclo): { consumo: number; situacao: SituacaoPlano; mensagem: string } {
  const consumo = consumoPlano(ciclo.fases);
  const diferenca = ciclo.quantidade_total_mg - consumo;
  if (Math.abs(diferenca) < 0.001) {
    return { consumo, situacao: 'exato', mensagem: 'O plano consome exatamente a sua parte do frasco.' };
  }
  if (diferenca < 0) {
    return { consumo, situacao: 'excesso', mensagem: `Atenção: o plano consome MAIS do que você tem (${fmt(-diferenca)} mg a mais).` };
  }
  return { consumo, situacao: 'sobra', mensagem: `Sobram ${fmt(diferenca)} mg ao final do plano.` };
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Execução do ciclo ----------

export interface LinhaAplicacao {
  numero: number;
  aplicacao: Aplicacao;
  fase: FaseLocalizada;
  dose_prevista: number;
  /** Data prevista: 1ª = data de início; demais = aplicação anterior + intervalo */
  data_prevista: string;
  /** Dias de diferença em relação ao previsto (positivo = atraso) */
  atraso_dias: number;
  diferenca_mg: number;
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
  fase: FaseLocalizada;
  situacao: SituacaoDose;
  /** Dias até a data (futura) ou dias de atraso (atrasada) */
  dias: number;
  saldo_suficiente: boolean;
}

export interface DoseProjetada {
  numero: number;
  data: string;
  fase: FaseLocalizada;
  dose_mg: number;
  ui: number;
  saldo_apos_mg: number;
}

export interface ResumoCiclo {
  linhas: LinhaAplicacao[];
  proxima: ProximaDose | null;
  projecao: DoseProjetada[];
  aplicacoes_realizadas: number;
  total_aplicado_mg: number;
  saldo_mg: number;
  saldo_ml: number;
  saldo_ui: number;
  percentual_usado: number;
  /** Quantas doses da última fase (manutenção) o saldo ainda cobre */
  doses_manutencao_restantes: number;
  data_fim_prevista: string | null;
  sugestao_local: string;
  alertas: string[];
}

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

/**
 * Motor do ciclo. A agenda é sempre recalculada a partir da última aplicação
 * real: se a dose era quinta e foi tomada na sexta, a próxima passa a ser na
 * sexta seguinte. A fase é definida pelo número da aplicação (1ª a 4ª =
 * fase 1, etc.), então um atraso não "pula" degraus de dose.
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
  const alertas: string[] = [];

  let acumulado = 0;
  const linhas: LinhaAplicacao[] = ordenadas.map((ap, i) => {
    const numero = i + 1;
    const fase = faseDaDose(ciclo.fases, numero);
    const data_prevista = i === 0 ? ciclo.data_inicio : somarDias(ordenadas[i - 1].data, intervalo);
    const seguinte = ordenadas[i + 1]?.data ?? null;
    acumulado += ap.dose_mg;
    const saldo = ciclo.quantidade_total_mg - acumulado;
    if (i > 0) {
      const dias = diferencaDias(ordenadas[i - 1].data, ap.data);
      if (dias < intervalo - 2) {
        alertas.push(`Aplicações nº ${numero - 1} e nº ${numero} com apenas ${dias} dia(s) de intervalo. Confira se não houve registro duplicado.`);
      }
    }
    return {
      numero,
      aplicacao: ap,
      fase,
      dose_prevista: fase.fase.dose_mg,
      data_prevista,
      atraso_dias: diferencaDias(data_prevista, ap.data),
      diferenca_mg: ap.dose_mg - fase.fase.dose_mg,
      ui_aplicada: mgParaUI(ap.dose_mg, conc),
      acumulado_mg: acumulado,
      saldo_mg: saldo,
      saldo_ml: mgParaMl(saldo, conc),
      intervalo_seguinte: diferencaDias(ap.data, seguinte ?? hoje),
      ...janela(diario, ap.data, seguinte),
    };
  });

  const saldo = ciclo.quantidade_total_mg - acumulado;
  const ultima = ordenadas[ordenadas.length - 1];
  const totalPlano = totalDosesPlano(ciclo.fases);

  let proxima: ProximaDose | null = null;
  const projecao: DoseProjetada[] = [];

  if (saldo > EPS && ciclo.fases.length > 0) {
    const numero = ordenadas.length + 1;
    const fase = faseDaDose(ciclo.fases, numero);
    const data = ultima ? somarDias(ultima.data, intervalo) : ciclo.data_inicio;
    const dias = diferencaDias(hoje, data);
    const dose = fase.fase.dose_mg;
    proxima = {
      numero,
      data,
      dose_mg: dose,
      fase,
      situacao: dias > 0 ? 'futura' : dias === 0 ? 'hoje' : 'atrasada',
      dias: Math.abs(dias),
      saldo_suficiente: saldo + EPS >= dose,
      ...marcacao(dose, ciclo),
    };
    if (!proxima.saldo_suficiente) {
      alertas.push(`O saldo (${fmt(saldo)} mg) não cobre a próxima dose prevista de ${fmt(dose)} mg.`);
    }

    // Projeção: se a dose está atrasada, assume que será tomada hoje.
    let dataProj = maiorData(data, hoje);
    let saldoProj = saldo;
    for (let n = numero; n <= Math.max(totalPlano, numero) && projecao.length < 200; n++) {
      const f = faseDaDose(ciclo.fases, n);
      if (saldoProj + EPS < f.fase.dose_mg) break;
      saldoProj -= f.fase.dose_mg;
      projecao.push({ numero: n, data: dataProj, fase: f, dose_mg: f.fase.dose_mg, ui: mgParaUI(f.fase.dose_mg, conc), saldo_apos_mg: saldoProj });
      dataProj = somarDias(dataProj, intervalo);
    }
  }

  const plano = verificarPlano(ciclo);
  if (plano.situacao === 'excesso') alertas.push(plano.mensagem);

  const doseManutencao = ciclo.fases[ciclo.fases.length - 1]?.dose_mg ?? 0;

  return {
    linhas,
    proxima,
    projecao,
    aplicacoes_realizadas: ordenadas.length,
    total_aplicado_mg: acumulado,
    saldo_mg: saldo,
    saldo_ml: mgParaMl(saldo, conc),
    saldo_ui: mgParaUI(saldo, conc),
    percentual_usado: ciclo.quantidade_total_mg > 0 ? acumulado / ciclo.quantidade_total_mg : 0,
    doses_manutencao_restantes: saldo <= 0 || doseManutencao <= 0 ? 0 : Math.floor(saldo / doseManutencao + EPS),
    data_fim_prevista: projecao.length ? projecao[projecao.length - 1].data : ultima?.data ?? null,
    sugestao_local: sugerirLocal(ultima?.local),
    alertas,
  };
}
