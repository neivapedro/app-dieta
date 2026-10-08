import type { Medida, Sexo } from './tipos';

/**
 * % de gordura pelo método da Marinha dos EUA (medidas em cm), idêntico à
 * aba "% de Gordura" da Planilha Gorgonoidiana:
 *
 *  Masculino: 495 / (1,0324 − 0,19077·log10(cintura − pescoço) + 0,15456·log10(altura)) − 450 + 2
 *  Feminino:  495 / (1,29579 − 0,35004·log10(cintura + quadril − pescoço) + 0,221·log10(altura)) − 450
 *
 * O "+2" no masculino é um ajuste da própria planilha. Retorna em pontos
 * percentuais (ex.: 24,9) ou null quando as medidas não permitem o cálculo.
 */
export function percentualGordura(
  sexo: Sexo,
  altura_cm: number,
  pescoco_cm: number,
  cintura_cm: number,
  quadril_cm: number | null,
): number | null {
  if (!(altura_cm > 0)) return null;
  let bf: number;
  if (sexo === 'Masculino') {
    const base = cintura_cm - pescoco_cm;
    if (!(base > 0)) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(base) + 0.15456 * Math.log10(altura_cm)) - 450 + 2;
  } else {
    const base = cintura_cm + (quadril_cm ?? 0) - pescoco_cm;
    if (!(base > 0)) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(base) + 0.221 * Math.log10(altura_cm)) - 450;
  }
  return Number.isFinite(bf) ? bf : null;
}

export interface Composicao {
  data: string;
  peso_kg: number;
  bf: number | null;
  massa_magra_kg: number | null;
  massa_gorda_kg: number | null;
  cintura_cm: number;
  pescoco_cm: number;
  quadril_cm: number | null;
}

export function composicao(m: Medida, sexo: Sexo): Composicao {
  const bf = percentualGordura(sexo, m.altura_cm, m.pescoco_cm, m.cintura_cm, m.quadril_cm);
  return {
    data: m.data,
    peso_kg: m.peso_kg,
    bf,
    massa_gorda_kg: bf === null ? null : (m.peso_kg * bf) / 100,
    massa_magra_kg: bf === null ? null : m.peso_kg * (1 - bf / 100),
    cintura_cm: m.cintura_cm,
    pescoco_cm: m.pescoco_cm,
    quadril_cm: m.quadril_cm,
  };
}

export interface Ganhos {
  peso_kg: number;
  bf: number | null;
  massa_magra_kg: number | null;
  massa_gorda_kg: number | null;
  cintura_cm: number;
}

function dif(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : b - a;
}

/** Última medição − primeira (mesma lógica da linha "Ganhos" da planilha). */
export function ganhos(primeira: Composicao, ultima: Composicao): Ganhos {
  return {
    peso_kg: ultima.peso_kg - primeira.peso_kg,
    bf: dif(primeira.bf, ultima.bf),
    massa_magra_kg: dif(primeira.massa_magra_kg, ultima.massa_magra_kg),
    massa_gorda_kg: dif(primeira.massa_gorda_kg, ultima.massa_gorda_kg),
    cintura_cm: ultima.cintura_cm - primeira.cintura_cm,
  };
}

export function historicoComposicao(medidas: Medida[], sexo: Sexo): Composicao[] {
  return [...medidas].sort((a, b) => a.data.localeCompare(b.data)).map((m) => composicao(m, sexo));
}
