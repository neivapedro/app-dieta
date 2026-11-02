// "Medir amanhã": quem esquece a medição de segunda pode adiar o lembrete para o dia seguinte.
// A data adiada fica só neste aparelho (localStorage); a medição em si continua a mesma de sempre.
import { somarDias } from './datas';
import { segundaDaSemana } from './treino';

const CHAVE = 'app-dieta:medicao-adiada';

export interface MedicaoDoDia {
  /** Já existe medição nesta semana (de segunda em diante) */
  feita: boolean;
  /** Adiada de um dia anterior: o cartão mostra "adiada de segunda" */
  adiada: boolean;
}

/**
 * A medição entra no checklist de hoje?
 * - Segunda-feira, para quem já mede, a menos que tenha sido adiada para depois de hoje.
 * - Dia adiado (ou depois dele, ainda na mesma semana) sem medição feita: continua pendente.
 * Retorna null quando não há nada a mostrar hoje.
 */
export function medicaoDoDia(e: { hoje: string; medidas: { data: string }[]; adiadaPara: string | null }): MedicaoDoDia | null {
  if (!e.medidas.length) return null;
  const segunda = segundaDaSemana(e.hoje);
  const feita = e.medidas.some((m) => m.data >= segunda);
  const adiadaPara = e.adiadaPara && segundaDaSemana(e.adiadaPara) === segunda ? e.adiadaPara : null;
  if (adiadaPara && adiadaPara > e.hoje) return null; // adiada para mais adiante: some por hoje
  if (adiadaPara && adiadaPara <= e.hoje) return { feita, adiada: e.hoje > segunda };
  return e.hoje === segunda ? { feita, adiada: false } : null;
}

/** "Medir amanhã" só aparece enquanto o dia seguinte ainda é da mesma semana (até sábado) */
export function podeAdiarMedicao(hoje: string): boolean {
  return segundaDaSemana(somarDias(hoje, 1)) === segundaDaSemana(hoje);
}

export function lerMedicaoAdiada(): string | null {
  try {
    const v = globalThis.localStorage?.getItem(CHAVE) ?? null;
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function gravarMedicaoAdiada(data: string | null): void {
  try {
    if (data) globalThis.localStorage?.setItem(CHAVE, data);
    else globalThis.localStorage?.removeItem(CHAVE);
    globalThis.dispatchEvent?.(new Event('medicao-adiada'));
  } catch {
    /* sem armazenamento: o adiamento vale só até recarregar */
  }
}
