export function num(n: number | null | undefined, casas = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function kg(n: number | null | undefined, casas = 1): string {
  return n === null || n === undefined ? '–' : `${num(n, casas)} kg`;
}

export function cm(n: number | null | undefined): string {
  return n === null || n === undefined ? '–' : `${num(n, 1)} cm`;
}

export function mg(n: number | null | undefined): string {
  return n === null || n === undefined ? '–' : `${num(n, 2)} mg`;
}

/** Fração (0,25) → "25,0%" */
export function pct(fracao: number | null | undefined, casas = 1): string {
  return fracao === null || fracao === undefined ? '–' : `${num(fracao * 100, casas)}%`;
}

/** Pontos percentuais (24,9) → "24,9%" */
export function pp(n: number | null | undefined, casas = 1): string {
  return n === null || n === undefined ? '–' : `${num(n, casas)}%`;
}

export function sinal(n: number | null | undefined, casas = 1, sufixo = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  // Sem sinal quando o valor arredondado é zero (nada de "− 0,00")
  const zero = Number(Math.abs(n).toFixed(casas)) === 0;
  const s = zero ? '' : n > 0 ? '+ ' : '− ';
  return `${s}${num(Math.abs(n), casas)}${sufixo}`;
}

/**
 * Classe de cor para uma variação. "menorMelhor" = queda é boa (peso, % gordura,
 * massa gorda, cintura); caso contrário, subida é boa (massa magra). Abaixo do
 * `limiar` (mínima mudança detectável, ver MDC em gordura.ts) fica neutra.
 */
export function corVariacao(n: number | null | undefined, menorMelhor: boolean, limiar = 0): string {
  if (n === null || n === undefined || Math.abs(n) < Math.max(limiar, 0.00001)) return '';
  return (n < 0) === menorMelhor ? 'bom' : 'ruim';
}

export function paraNumero(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * kcal (inteiro): o ponto seguido de 3 dígitos é separador de milhar
 * ("1.000" = 1000, "1.200" = 1200); a vírgula continua decimal.
 */
export function paraKcal(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d*)?$/.test(t)) return paraNumero(t.replace(/\./g, ''));
  return paraNumero(t);
}

export function paraTexto(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n).replace('.', ',');
}

/** Unidades da seringa: até 2 casas, sem zeros sobrando (6,25 · 7,5 · 10) */
export function ui(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} UI`;
}

/**
 * Peso digitado num campo opcional: vazio vale null; texto inválido ou fora de
 * 30 a 300 kg vira erro (nunca apaga em silêncio o peso que já existia).
 */
export function lerPeso(texto: string): { valor: number | null; erro?: string } {
  if (!texto.trim()) return { valor: null };
  const v = paraNumero(texto);
  if (v === null) return { valor: null, erro: 'Peso inválido. Use só um separador decimal, ex.: 93,2.' };
  if (v < 30 || v > 300) return { valor: null, erro: 'Peso fora da faixa (30 a 300 kg). Confira o número.' };
  return { valor: v };
}

/**
 * Número opcional com faixa: vazio vale null; texto inválido ou fora da faixa vira
 * erro com o nome do campo (ex.: sono de 0 a 24 h).
 */
export function lerFaixa(texto: string, min: number, max: number, nome: string, unidade: string): { valor: number | null; erro?: string } {
  if (!texto.trim()) return { valor: null };
  const v = paraNumero(texto);
  if (v === null || v < min || v > max) return { valor: null, erro: `${nome} fora da faixa (${num(min, 0)} a ${num(max, 0)} ${unidade}). Confira o número.` };
  return { valor: v };
}
