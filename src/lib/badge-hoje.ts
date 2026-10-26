// Ícone do app (iPhone, app instalado): número de tarefas do checklist de hoje que ainda faltam.
// Mesma conta do cartão "Hoje" do Início (tarefasDoDia); só lê registros, nunca grava.
import { tarefasDoDia, type EntradaTarefas } from './inicio-hoje';
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

/** Monta a mesma entrada que o Início usa no checklist. */
export function entradaDoBadge(e: EntradaBadge): EntradaTarefas {
  const reg = e.diario.find((r) => r.data === e.hoje) ?? null;
  const medicaoHoje = e.medidas.find((m) => m.data === e.hoje && m.peso_kg > 0) ?? null;
  const segunda = segundaDaSemana(e.hoje);
  const medicao = e.medidas.length && e.hoje === segunda ? { feita: e.medidas.some((m) => m.data >= segunda) } : null;
  const p = e.proxima;
  const dose =
    e.temResumo && !e.posRemedio
      ? { devida: !!p && (p.situacao === 'hoje' || p.situacao === 'atrasada'), feitaHoje: e.ultimaDose === e.hoje, texto: '' }
      : null;
  return {
    reg,
    pesoMedicao: medicaoHoje?.peso_kg ?? null,
    dose,
    medicao,
    comTreino: e.comTreino,
    treinoDia: e.treinoDia ?? null,
    comDieta: e.comDieta,
    // A meta só muda o texto da água; o "feito" não depende dela
    metaAgua: 2,
  };
}

/** Quantas tarefas de hoje ainda faltam. */
export function pendentesHoje(e: EntradaBadge): number {
  return tarefasDoDia(entradaDoBadge(e)).filter((t) => !t.feito).length;
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
