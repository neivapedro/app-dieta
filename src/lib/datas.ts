// Datas são trafegadas como texto 'YYYY-MM-DD' (dia civil, sem fuso).
// As contas usam UTC internamente para não sofrer com horário de verão.

const DIA_MS = 86_400_000;

function paraUTC(data: string): number {
  const [a, m, d] = data.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

function deUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function somarDias(data: string, dias: number): string {
  return deUTC(paraUTC(data) + dias * DIA_MS);
}

/** b − a, em dias */
export function diferencaDias(a: string, b: string): number {
  return Math.round((paraUTC(b) - paraUTC(a)) / DIA_MS);
}

export function hojeLocal(agora: Date = new Date()): string {
  const a = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function diaDaSemana(data: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(data)) return '';
  return DIAS_SEMANA[new Date(paraUTC(data)).getUTCDay()];
}

export function formatarData(data: string, anoCurto = false): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(data)) return '';
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${anoCurto ? a.slice(2) : a}`;
}

export function maiorData(a: string, b: string): string {
  return a >= b ? a : b;
}
