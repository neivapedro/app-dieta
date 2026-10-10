import type { Medida, Perfil, Sexo } from './tipos';

/**
 * Ajuste de calibração somado ao resultado da US Navy, em pontos percentuais.
 * Padrão: +2 no masculino (o da Planilha Gorgonoidiana) e 0 no feminino. Pode
 * ser trocado no Perfil, à mão ou por um exame (DXA, bioimpedância de qualidade).
 */
export const AJUSTE_PADRAO: Record<Sexo, number> = { Masculino: 2, Feminino: 0 };

/** Ajuste vigente do perfil (vazio = padrão do sexo). */
export function ajusteDoPerfil(perfil: Pick<Perfil, 'sexo' | 'ajuste_gordura'> | null | undefined): number {
  const sexo = perfil?.sexo ?? 'Masculino';
  const a = perfil?.ajuste_gordura;
  return a === null || a === undefined || !Number.isFinite(a) ? AJUSTE_PADRAO[sexo] : a;
}

/**
 * % de gordura pela US Navy "bruta" (sem ajuste), medidas em cm:
 *
 *  Masculino: 495 / (1,0324 − 0,19077·log10(cintura − pescoço) + 0,15456·log10(altura)) − 450
 *  Feminino:  495 / (1,29579 − 0,35004·log10(cintura + quadril − pescoço) + 0,221·log10(altura)) − 450
 *
 * Null quando as medidas não permitem o cálculo.
 */
export function percentualGorduraBruto(
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
    bf = 495 / (1.0324 - 0.19077 * Math.log10(base) + 0.15456 * Math.log10(altura_cm)) - 450;
  } else {
    // Sem quadril não há fórmula feminina (tratar como 0 daria % negativa)
    if (quadril_cm == null || !(quadril_cm > 0)) return null;
    const base = cintura_cm + quadril_cm - pescoco_cm;
    if (!(base > 0)) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(base) + 0.221 * Math.log10(altura_cm)) - 450;
  }
  return Number.isFinite(bf) ? bf : null;
}

/**
 * % de gordura oficial do app: US Navy bruta + ajuste de calibração. Com o
 * ajuste padrão (+2 no masculino, 0 no feminino) é idêntico à aba "% de Gordura"
 * da Planilha Gorgonoidiana. Retorna em pontos percentuais (ex.: 24,9) ou null
 * quando as medidas não permitem o cálculo.
 */
export function percentualGordura(
  sexo: Sexo,
  altura_cm: number,
  pescoco_cm: number,
  cintura_cm: number,
  quadril_cm: number | null,
  ajuste: number = AJUSTE_PADRAO[sexo],
): number | null {
  const bruto = percentualGorduraBruto(sexo, altura_cm, pescoco_cm, cintura_cm, quadril_cm);
  if (bruto === null) return null;
  const bf = bruto + ajuste;
  // Fora de 2 a 75% é erro de medida/digitação, não composição corporal
  return bf >= 2 && bf <= 75 ? bf : null;
}

/**
 * Por que a % de gordura não sai: texto para o formulário de medição. Separa
 * medidas sem base para a fórmula (cintura ≤ pescoço; no feminino, cintura +
 * quadril ≤ pescoço) de um resultado fora da faixa possível (2 a 75%).
 */
export function motivoSemGordura(sexo: Sexo, pescoco_cm: number, cintura_cm: number, quadril_cm: number | null): string {
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (sexo === 'Masculino' && !(cintura_cm - pescoco_cm > 0)) return `a cintura precisa ser maior que o pescoço (${fmt(pescoco_cm)} cm). Confira as medidas`;
  if (sexo === 'Feminino' && !(cintura_cm + (quadril_cm ?? 0) - pescoco_cm > 0))
    return `cintura + quadril precisam ser maiores que o pescoço (${fmt(pescoco_cm)} cm). Confira as medidas`;
  return `o resultado sai da faixa possível (2 a 75%). Confira cintura e pescoço${sexo === 'Feminino' ? ' (e o quadril)' : ''}`;
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
  /** Medição atípica (doente, inchado, viagem): fica no histórico, fora de tendências e projeções */
  atipica?: boolean;
}

export interface OpcoesComposicao {
  /** Altura do perfil: fonte única (corrigir no Perfil corrige o histórico). Sem ela, vale a da medição. */
  altura_cm?: number | null;
  /** Ajuste de calibração em p.p. (padrão do sexo quando omitido) */
  ajuste?: number;
}

export function composicao(m: Medida, sexo: Sexo, opcoes: OpcoesComposicao = {}): Composicao {
  const altura = opcoes.altura_cm && opcoes.altura_cm > 0 ? opcoes.altura_cm : m.altura_cm;
  const bf = percentualGordura(sexo, altura, m.pescoco_cm, m.cintura_cm, m.quadril_cm, opcoes.ajuste ?? AJUSTE_PADRAO[sexo]);
  return {
    data: m.data,
    peso_kg: m.peso_kg,
    bf,
    massa_gorda_kg: bf === null ? null : (m.peso_kg * bf) / 100,
    massa_magra_kg: bf === null ? null : m.peso_kg * (1 - bf / 100),
    cintura_cm: m.cintura_cm,
    pescoco_cm: m.pescoco_cm,
    quadril_cm: m.quadril_cm,
    atipica: m.atipica === true,
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

/**
 * Medição que vale para as metas (Katch-McArdle, proteína) e para o "agora":
 * a última normal com massa magra. A atípica fica só no histórico; se todas
 * forem atípicas, vale a última de todas (mesmo critério da aba Medidas).
 */
export function ultimaNormal<T extends Pick<Composicao, 'massa_magra_kg' | 'atipica'>>(composicoes: T[]): T | null {
  const com = composicoes.filter((c) => c.massa_magra_kg !== null);
  const normais = com.filter((c) => !c.atipica);
  return (normais.length ? normais[normais.length - 1] : com[com.length - 1]) ?? null;
}

export function historicoComposicao(medidas: Medida[], sexo: Sexo, opcoes: OpcoesComposicao = {}): Composicao[] {
  return [...medidas].sort((a, b) => a.data.localeCompare(b.data)).map((m) => composicao(m, sexo, opcoes));
}

// ---------- Mínima mudança detectável ----------

/**
 * Variação entre duas medições abaixo destes limites fica em cor neutra: está
 * dentro do erro da fita e da balança, não é sinal. MDC95 = 1,96·√2·EPM (Weir,
 * 2005), com EPM conservador de autoaferição: cintura ~0,8 cm → 2,2 cm; pescoço
 * ~0,45 cm → 1,2 cm; peso de um dia para o outro ~0,4 kg → 1,1 kg. % de gordura,
 * massa gorda e massa magra têm limiar equivalente, pela derivada da US Navy no
 * ponto típico (1 cm de cintura ≈ 0,67 p.p. ≈ 0,64 kg que troca de lado entre
 * gorda e magra), somando o erro da cintura, do pescoço e (para os kg) do peso:
 * ~1,5 p.p., ~1,5 kg de massa gorda e ~2,3 kg de massa magra (a magra soma o
 * erro do peso com o da fita, por isso é a mais larga). O quadril usa o da cintura.
 */
export const MDC = {
  cintura_cm: 2.2,
  pescoco_cm: 1.2,
  quadril_cm: 2.2,
  bf: 1.5,
  massa_gorda_kg: 1.5,
  massa_magra_kg: 2.3,
  peso_kg: 1.1,
} as const;

export type ChaveMdc = keyof typeof MDC;

// ---------- Réguas de conferência ----------

/** Relação cintura/altura (RCA). */
export function rca(cintura_cm: number | null | undefined, altura_cm: number | null | undefined): number | null {
  return cintura_cm && altura_cm && cintura_cm > 0 && altura_cm > 0 ? cintura_cm / altura_cm : null;
}

export type FaixaRca = 'saudavel' | 'aumentada' | 'alta';

/** NICE (cintura abaixo de metade da altura): <0,50 saudável · 0,50–0,59 aumentada · ≥0,60 alta. */
export function faixaRca(r: number): FaixaRca {
  // Sobre o valor exibido (2 casas): 0,4994 aparece "0,50" e fica na faixa de 0,50
  const x = Math.round(r * 100) / 100;
  return x < 0.5 ? 'saudavel' : x < 0.6 ? 'aumentada' : 'alta';
}

export const TEXTO_RCA: Record<FaixaRca, string> = {
  saudavel: 'saudável',
  aumentada: 'adiposidade central aumentada',
  alta: 'adiposidade central alta',
};

export const COR_RCA: Record<FaixaRca, string> = { saudavel: 'bom', aumentada: 'aviso-txt', alta: 'ruim' };

/** Cintura-alvo pela RCA: metade da altura. */
export function cinturaAlvoRca(altura_cm: number | null | undefined): number | null {
  return altura_cm && altura_cm > 0 ? altura_cm / 2 : null;
}

/** RFM (Woolcott & Bergman, 2018): 64 − 20·altura/cintura (homem); 76 − 20·altura/cintura (mulher). */
export function rfm(sexo: Sexo, altura_cm: number, cintura_cm: number): number | null {
  if (!(altura_cm > 0) || !(cintura_cm > 0)) return null;
  return (sexo === 'Masculino' ? 64 : 76) - (20 * altura_cm) / cintura_cm;
}

/**
 * Cintura que dá o % de gordura pedido (US Navy invertida, já com o ajuste),
 * arredondada a 0,5 cm. No feminino usa o quadril informado (o da última medição).
 */
export function cinturaNecessaria(
  sexo: Sexo,
  altura_cm: number,
  pescoco_cm: number,
  bf: number,
  ajuste: number = AJUSTE_PADRAO[sexo],
  quadril_cm: number | null = null,
): number | null {
  if (!(altura_cm > 0) || !(pescoco_cm > 0)) return null;
  const bruto = bf - ajuste;
  if (!(bruto + 450 > 0)) return null;
  const d = 495 / (bruto + 450);
  let c: number;
  if (sexo === 'Masculino') {
    c = pescoco_cm + 10 ** ((1.0324 + 0.15456 * Math.log10(altura_cm) - d) / 0.19077);
  } else {
    if (quadril_cm == null || !(quadril_cm > 0)) return null;
    c = pescoco_cm - quadril_cm + 10 ** ((1.29579 + 0.221 * Math.log10(altura_cm) - d) / 0.35004);
  }
  return Number.isFinite(c) && c > 0 ? Math.round(c * 2) / 2 : null;
}

export interface CenarioPeso {
  /** Fração do peso perdido que sai de massa magra (0, 0,25, 0,40) */
  fracao_magra: number;
  peso_kg: number;
  massa_magra_kg: number;
}

/**
 * Peso em que se chega ao % de gordura da meta, conforme quanto do peso perdido
 * sai de massa magra: peso = (magra_hoje − f·peso_hoje) / (1 − %meta − f).
 */
export function cenariosPesoMeta(magra_kg: number, peso_kg: number, bfMeta: number, fracoes = [0, 0.25, 0.4]): CenarioPeso[] {
  const b = bfMeta / 100;
  return fracoes
    .map((f) => {
      const div = 1 - b - f;
      const peso = div > 0 ? (magra_kg - f * peso_kg) / div : NaN;
      return { fracao_magra: f, peso_kg: peso, massa_magra_kg: peso * (1 - b) };
    })
    .filter((c) => Number.isFinite(c.peso_kg) && c.peso_kg > 0);
}

// ---------- Calibração por exame ----------

export type CalibracaoExame =
  | { ok: true; ajuste: number; bruta: number; medida: Medida }
  | { ok: false; erro: string };

/**
 * Ajuste pelo exame: % do exame − US Navy bruta da medição do mesmo dia (ou a
 * mais próxima até 3 dias). Medições atípicas não servem para calibrar.
 */
export function calibrarPorExame(
  medidas: Medida[],
  perfil: Pick<Perfil, 'sexo' | 'altura_cm'>,
  exameData: string,
  exameBf: number | null,
  hoje: string,
): CalibracaoExame {
  if (!exameData || exameData > hoje) return { ok: false, erro: 'Informe a data do exame (até hoje).' };
  if (exameBf === null || exameBf < 2 || exameBf > 75) return { ok: false, erro: 'Informe o % de gordura do exame (entre 2 e 75).' };
  const perto = medidas
    .map((m) => ({ m, d: Math.abs(Math.round((Date.parse(`${m.data}T12:00:00Z`) - Date.parse(`${exameData}T12:00:00Z`)) / 86400000)) }))
    .filter((x) => x.d <= 3)
    .sort((a, b) => a.d - b.d || a.m.data.localeCompare(b.m.data));
  const normal = perto.find((x) => !x.m.atipica);
  if (!normal) {
    if (perto.length)
      return { ok: false, erro: `A medição de ${perto[0].m.data.split('-').reverse().join('/')} está marcada como atípica: registre uma medição normal perto do exame para calibrar.` };
    return { ok: false, erro: 'Registre uma medição de fita no dia do exame (ou até 3 dias de distância) para calibrar.' };
  }
  const m = normal.m;
  const bruta = percentualGorduraBruto(perfil.sexo ?? 'Masculino', perfil.altura_cm ?? m.altura_cm, m.pescoco_cm, m.cintura_cm, m.quadril_cm);
  if (bruta === null) return { ok: false, erro: 'A medição desse dia não permite calcular a US Navy.' };
  return { ok: true, ajuste: Math.round((exameBf - bruta) * 10) / 10, bruta, medida: m };
}
