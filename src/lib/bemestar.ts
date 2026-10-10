import type { AnaliseFase } from './analise';
import { somarDias } from './datas';
import type { CorUrina, RegistroDiario } from './tipos';

// Sono e hidratação, registrados no Diário (campos opcionais).
// Sono: média de 7 dias, só com 4 noites ou mais registradas; abaixo de 7 h, alerta
// (consenso AASM/SRS: 7 h ou mais para adultos). Água: meta de partida de 2,0 L de
// bebidas por dia + 0,7 L por hora de treino ou cardio (faixa usual de 0,4 a 0,8 L/h).

export const SONO_MINIMO_H = 7;
export const NOITES_MINIMAS = 4;
export const AGUA_BASE_L = 2;
export const AGUA_POR_HORA_L = 0.7;

export const TEXTO_SONO_BAIXO = 'Média de sono abaixo de 7 h. Em dieta, dormir pouco está associado a perder mais massa magra.';
export const TEXTO_SINTOMA_AGUA = 'Com vômito ou diarreia, beba mais (soro de reidratação se persistir).';

export const CORES_URINA: { valor: CorUrina; rotulo: string }[] = [
  { valor: 'clara', rotulo: 'Clara' },
  { valor: 'amarela', rotulo: 'Amarela' },
  { valor: 'escura', rotulo: 'Escura' },
];

const media = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const temNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Meta de bebidas do dia, em litros (horas = treino + cardio do dia; conta sem Treino = 0). */
export function metaAgua(horasExercicio: number): number {
  return AGUA_BASE_L + AGUA_POR_HORA_L * Math.max(horasExercicio, 0);
}

export interface MediaSono {
  /** Média dos últimos 7 dias (hoje incluído); null com menos de 4 noites */
  media: number | null;
  noites: number;
  baixo: boolean;
}

export function mediaSono7(diario: RegistroDiario[], hoje: string): MediaSono {
  const de = somarDias(hoje, -6);
  const horas = diario.filter((r) => r.data >= de && r.data <= hoje && temNumero(r.sono_h)).map((r) => r.sono_h as number);
  const m = horas.length >= NOITES_MINIMAS ? media(horas) : null;
  return { media: m, noites: horas.length, baixo: m !== null && m < SONO_MINIMO_H };
}

export interface AguaSemana {
  /** Média de água nos dias com registro dos últimos 7 dias; null sem registro */
  media: number | null;
  dias: number;
  /** Média da meta nos mesmos dias */
  meta_media: number | null;
  urina: Record<CorUrina, number>;
}

/** Água e cor da urina dos últimos 7 dias (hoje incluído). metaDoDia dá a meta de cada data. */
export function aguaSemana(diario: RegistroDiario[], hoje: string, metaDoDia: (data: string) => number): AguaSemana {
  const de = somarDias(hoje, -6);
  const semana = diario.filter((r) => r.data >= de && r.data <= hoje);
  const comAgua = semana.filter((r) => temNumero(r.agua_l));
  const urina: Record<CorUrina, number> = { clara: 0, amarela: 0, escura: 0 };
  for (const r of semana) if (r.cor_urina && r.cor_urina in urina) urina[r.cor_urina]++;
  return {
    media: media(comAgua.map((r) => r.agua_l as number)),
    dias: comAgua.length,
    meta_media: media(comAgua.map((r) => metaDoDia(r.data))),
    urina,
  };
}

/** Vômito ou diarreia marcados no dia: perde líquido. */
/** Registro do Diário sem nenhum campo preenchido (um dia assim é excluído, não gravado vazio). */
export function diaVazio(r: Partial<Omit<RegistroDiario, 'id' | 'data'>>): boolean {
  return (
    (r.peso_kg ?? null) === null &&
    (r.nausea ?? null) === null &&
    !r.observacoes &&
    r.vomito == null &&
    r.diarreia == null &&
    r.intestino_preso == null &&
    !r.dieta_seguida &&
    r.sono_h == null &&
    r.agua_l == null &&
    r.cor_urina == null
  );
}

type Sintomas = Pick<RegistroDiario, 'vomito' | 'diarreia' | 'intestino_preso'>;

/** Sintomas respondidos, com os "não" também (ex.: ["vômito", "sem diarreia"]). */
export function textosSintomas(r: Sintomas | null | undefined): string[] {
  if (!r) return [];
  const t: string[] = [];
  if (r.vomito === true) t.push('vômito');
  else if (r.vomito === false) t.push('sem vômito');
  if (r.diarreia === true) t.push('diarreia');
  else if (r.diarreia === false) t.push('sem diarreia');
  if (r.intestino_preso === true) t.push('intestino preso');
  else if (r.intestino_preso === false) t.push('intestino ok');
  return t;
}

/** Resumo curto para um cartão: os sintomas "sim"; só respostas "não" → "nenhum"; nada respondido → "–". */
export function resumoSintomas(r: Sintomas | null | undefined): string {
  if (!r) return '–';
  const sim = [r.vomito === true && 'vômito', r.diarreia === true && 'diarreia', r.intestino_preso === true && 'intestino preso'].filter(Boolean);
  if (sim.length) return sim.join(', ');
  return r.vomito === false || r.diarreia === false || r.intestino_preso === false ? 'nenhum' : '–';
}

export function diaDeSintoma(r: Pick<RegistroDiario, 'vomito' | 'diarreia'> | null | undefined): boolean {
  return r?.vomito === true || r?.diarreia === true;
}

/** Média de sono por fase (4 noites ou mais registradas); null sem dados suficientes. */
export function sonoPorFase(fases: AnaliseFase[], diario: RegistroDiario[], hoje: string): (number | null)[] {
  return fases.map((f, i) => {
    const prox = fases[i + 1]?.inicio ?? null;
    const horas = diario
      .filter((r) => r.data >= f.inicio && (prox ? r.data < prox : r.data <= hoje) && temNumero(r.sono_h))
      .map((r) => r.sono_h as number);
    return horas.length >= NOITES_MINIMAS ? media(horas) : null;
  });
}
