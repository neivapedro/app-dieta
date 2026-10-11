import type { ProximaDose, ResumoCiclo } from './ciclo';
import { diaDaSemana, diferencaDias, somarDias } from './datas';
import type { RegistroDiario, TreinoDia } from './tipos';
import { calcularPlacar } from './treino';

// Ordem do Início pelo que fazer agora: pendências de ontem de manhã, a dose
// em destaque só perto do dia, "Fechar o dia" à noite.

/** Faixa com as pendências de ontem: das 05h até antes das 12h */
export const HORA_ONTEM_DE = 5;
export const HORA_ONTEM_ATE = 12;
/** A partir das 18h aparece o cartão "Fechar o dia" */
export const HORA_FECHAR_DIA = 18;
/** Dias depois da dose (D0 a D3) em que o registro do dia sobe para baixo da dose */
export const DIAS_REGISTRO_DOSE = 3;

export function horaDaFaixaOntem(hora: number): boolean {
  return hora >= HORA_ONTEM_DE && hora < HORA_ONTEM_ATE;
}

export function horaDeFecharODia(hora: number): boolean {
  return hora >= HORA_FECHAR_DIA;
}

/** "sáb 24/10" */
export function diaCurto(data: string): string {
  const [, m, d] = data.split('-');
  return `${diaDaSemana(data).slice(0, 3).toLowerCase()} ${d}/${m}`;
}

/**
 * Cartão completo da dose só quando há o que fazer: na véspera, no dia, com a
 * dose atrasada, com decisão de fim de fase (ou dose fora do plano) pendente
 * ou depois de uma pausa longa. Nos outros dias, uma linha compacta.
 */
export function doseEmDestaque(p: Pick<ProximaDose, 'situacao' | 'dias' | 'estado'>, resumo: Pick<ResumoCiclo, 'pausa_dias'>): boolean {
  if (p.situacao !== 'futura') return true;
  if (p.dias <= 1) return true;
  if (p.estado === 'pendente' || p.estado === 'fora_do_plano') return true;
  return resumo.pausa_dias !== null;
}

/** Dias desde a última dose (0 = dia da dose); null sem dose ou com a dose no futuro. */
export function diaDesdeDose(ultimaDose: string | null | undefined, hoje: string): number | null {
  if (!ultimaDose) return null;
  const d = diferencaDias(ultimaDose, hoje);
  return d < 0 ? null : d;
}

export interface PendenciasOntem {
  data: string;
  treino: boolean;
  cardio: boolean;
  /** "Segui o plano?" sem resposta */
  dieta: boolean;
  /** Dias seguidos com treino e cardio até anteontem (o que se perde sem marcar ontem) */
  sequencia: number;
}

/**
 * O que ficou sem marcar ontem. Treino e cardio só valem para conta com Treino
 * e dentro do placar; a dieta só quando há plano montado.
 */
export function pendenciasDeOntem({
  hoje,
  treinos,
  diario,
  periodoTreino,
  comDieta,
  inicioCiclo = null,
}: {
  hoje: string;
  treinos: TreinoDia[];
  diario: RegistroDiario[];
  /** null = conta sem Treino */
  periodoTreino: { inicio: string; fim: string } | null;
  comDieta: boolean;
  /** Início do ciclo (1ª aplicação ou a planejada): antes dele não há "segui o plano?" a cobrar */
  inicioCiclo?: string | null;
}): PendenciasOntem | null {
  const ontem = somarDias(hoje, -1);
  const noPlacar = !!periodoTreino && ontem >= periodoTreino.inicio && ontem <= periodoTreino.fim;
  const t = treinos.find((x) => x.data === ontem);
  const treino = noPlacar && !t?.treino;
  const cardio = noPlacar && !t?.cardio;
  const dieta = comDieta && (!inicioCiclo || ontem >= inicioCiclo) && !diario.find((r) => r.data === ontem)?.dieta_seguida;
  if (!treino && !cardio && !dieta) return null;
  // Com ontem incompleto, a sequência do placar visto de ontem é a que vem até anteontem
  const sequencia = noPlacar && (treino || cardio) ? calcularPlacar(treinos, periodoTreino!.inicio, periodoTreino!.fim, ontem).sequenciaAtual : 0;
  return { data: ontem, treino, cardio, dieta, sequencia };
}

/** "cardio não marcado · dieta sem resposta" */
export function textoPendencias(p: PendenciasOntem): string {
  const partes: string[] = [];
  if (p.treino && p.cardio) partes.push('treino e cardio não marcados');
  else if (p.treino) partes.push('treino não marcado');
  else if (p.cardio) partes.push('cardio não marcado');
  if (p.dieta) partes.push('dieta sem resposta');
  return partes.join(' · ');
}
