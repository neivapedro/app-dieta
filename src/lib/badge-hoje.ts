// Ícone do app (iPhone, app instalado): número de pendências importantes (dose, medição
// de segunda, dia de ontem sem registro). Só lê registros, nunca grava.
import { somarDias } from './datas';
import { segundaDaSemana } from './treino';
import type { Medida, RegistroDiario, TreinoDia } from './tipos';

export interface EntradaBadge {
  hoje: string;
  diario: RegistroDiario[];
  medidas: Pick<Medida, 'data' | 'peso_kg'>[];
  /** Plano de dieta com algum alimento: "Segui o plano" entra no checklist */
  comDieta: boolean;
  /** Próxima dose (null sem próxima aplicação) */
  proxima: { situacao: string } | null;
  /** Data da última aplicação registrada */
  ultimaDose: string | null;
  /** Fase pós-remédio iniciada: a dose sai do checklist */
  posRemedio: boolean;
  /** Conta com Treino e placar em andamento */
  comTreino: boolean;
  treinoDia?: TreinoDia | null;
  /** O ciclo já tem o resumo calculado (sem ele a dose fica fora, como no Início) */
  temResumo: boolean;
}

/** O dia tem algo anotado no Diário (ou a pesagem da medição). */
function diaComRegistro(e: Pick<EntradaBadge, 'diario' | 'medidas'>, data: string): boolean {
  const r = e.diario.find((x) => x.data === data);
  const algum =
    !!r &&
    [r.peso_kg, r.nausea, r.agua_l, r.sono_h, r.dieta_seguida, r.vomito, r.diarreia, r.intestino_preso, r.cor_urina].some((v) => v !== null && v !== undefined);
  return algum || e.medidas.some((m) => m.data === data && m.peso_kg > 0);
}

/**
 * Só o que pede ação de verdade (os hábitos do dia, que se anotam ao longo do dia,
 * ficam no checklist do Início e não contam):
 * - aplicação do dia ou atrasada ainda não registrada;
 * - medição de segunda ainda não feita (para quem já mede);
 * - ontem ficou sem nenhum registro no Diário (para quem já usa o Diário).
 */
export function pendentesHoje(e: EntradaBadge): number {
  let n = 0;
  const p = e.proxima;
  if (e.temResumo && !e.posRemedio && p && (p.situacao === 'hoje' || p.situacao === 'atrasada') && e.ultimaDose !== e.hoje) n++;
  const segunda = segundaDaSemana(e.hoje);
  if (e.hoje === segunda && e.medidas.length && !e.medidas.some((m) => m.data >= segunda)) n++;
  const ontem = somarDias(e.hoje, -1);
  if (e.diario.some((r) => r.data < ontem) && !diaComRegistro(e, ontem)) n++;
  return n;
}

type NavegadorBadge = {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

const nav0 = (): unknown => (typeof navigator === 'undefined' ? undefined : navigator);

export function temBadge(nav: unknown = nav0()): boolean {
  return !!nav && typeof (nav as NavegadorBadge).setAppBadge === 'function';
}

/**
 * Põe o número no ícone (0 limpa). Sem suporte, sem permissão de notificação ou
 * fora do app instalado, não faz nada e não reclama.
 */
export async function aplicarBadge(n: number, nav: unknown = nav0()): Promise<boolean> {
  if (!temBadge(nav)) return false;
  const b = nav as NavegadorBadge;
  try {
    if (n > 0) await b.setAppBadge!.call(nav, Math.round(n));
    else if (typeof b.clearAppBadge === 'function') await b.clearAppBadge.call(nav);
    else await b.setAppBadge!.call(nav, 0);
    return true;
  } catch {
    return false;
  }
}
