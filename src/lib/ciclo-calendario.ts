// Calendário do Diário e linha do tempo da Agenda: contas puras (sem React).
import { SONO_MINIMO_H } from './bemestar';
import { diferencaDias, segundaDaSemana, somarDias } from './datas';
import type { RegistroDiario } from './tipos';

/** Mês no formato 'YYYY-MM'. */
export type Mes = string;

export function mesDe(data: string): Mes {
  return data.slice(0, 7);
}

/** Soma (ou subtrai) meses: '2026-01' − 1 = '2025-12'. */
export function somarMeses(mes: Mes, n: number): Mes {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "outubro de 2026" */
export function nomeMes(mes: Mes): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/**
 * Células do mês em semanas de segunda a domingo (como o resto do app).
 * Dias de outros meses entram como null, para a grade ficar alinhada.
 */
export function gradeMes(mes: Mes): (string | null)[] {
  const primeiro = `${mes}-01`;
  const ultimo = somarDias(`${somarMeses(mes, 1)}-01`, -1);
  const inicio = segundaDaSemana(primeiro);
  const fim = somarDias(segundaDaSemana(ultimo), 6);
  const n = diferencaDias(inicio, fim) + 1;
  return Array.from({ length: n }, (_, i) => {
    const d = somarDias(inicio, i);
    return mesDe(d) === mes ? d : null;
  });
}

export type MetricaDia = 'nausea' | 'sono' | 'agua' | 'dieta';
export type TomDia = 'bom' | 'aviso' | 'ruim' | 'forte';

export interface CorDia {
  /** null = sem o dado neste dia */
  tom: TomDia | null;
  /** Texto curto dentro da célula ("2", "7,2", "✓") */
  texto: string;
}

const virgula = (n: number, casas = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const temNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Cor do dia pela métrica escolhida. Verde = bom, âmbar = atenção, vermelho = pior.
 * Náusea: 0 bom · 1 atenção · 2 forte · 3 ruim. Sono: 7 h ou mais bom · 6 a 7 atenção · menos ruim.
 * Água: meta do dia bom · 75% da meta atenção · menos ruim. Dieta: seguida · em parte · não.
 */
export function corDoDia(metrica: MetricaDia, r: Partial<RegistroDiario> | null | undefined, metaAgua = 2): CorDia {
  const vazio: CorDia = { tom: null, texto: '' };
  if (!r) return vazio;
  if (metrica === 'nausea') {
    if (!temNumero(r.nausea)) return vazio;
    const n = Math.round(r.nausea);
    return { tom: n <= 0 ? 'bom' : n === 1 ? 'aviso' : n === 2 ? 'forte' : 'ruim', texto: String(n) };
  }
  if (metrica === 'sono') {
    if (!temNumero(r.sono_h)) return vazio;
    return { tom: r.sono_h >= SONO_MINIMO_H ? 'bom' : r.sono_h >= SONO_MINIMO_H - 1 ? 'aviso' : 'ruim', texto: virgula(r.sono_h) };
  }
  if (metrica === 'agua') {
    if (!temNumero(r.agua_l)) return vazio;
    const f = metaAgua > 0 ? r.agua_l / metaAgua : 1;
    return { tom: f >= 1 - 1e-9 ? 'bom' : f >= 0.75 ? 'aviso' : 'ruim', texto: virgula(r.agua_l) };
  }
  if (!r.dieta_seguida) return vazio;
  return r.dieta_seguida === 'sim' ? { tom: 'bom', texto: '✓' } : r.dieta_seguida === 'parcial' ? { tom: 'aviso', texto: '½' } : { tom: 'ruim', texto: '✕' };
}

/** Dias depois da última dose ("D0" = dia da dose). null antes da 1ª dose. */
export function rotuloDiaDose(data: string, datasAplicacoes: string[]): string | null {
  let ultima: string | null = null;
  for (const d of datasAplicacoes) if (d <= data && (!ultima || d > ultima)) ultima = d;
  return ultima ? `D${diferencaDias(ultima, data)}` : null;
}

export interface ResumoMes {
  /** Dias do mês com o dado da métrica */
  dias: number;
  /** Média (náusea, sono, água) ou fração de dias com a dieta seguida (sim = 1, parcial = 0,5) */
  media: number | null;
}

/** Resumo da métrica nos dias do mês (até hoje). */
export function resumoDoMes(metrica: MetricaDia, registros: RegistroDiario[], mes: Mes, hoje: string): ResumoMes {
  const doMes = registros.filter((r) => mesDe(r.data) === mes && r.data <= hoje);
  const valores = doMes
    .map((r) =>
      metrica === 'nausea'
        ? r.nausea
        : metrica === 'sono'
          ? r.sono_h
          : metrica === 'agua'
            ? r.agua_l
            : r.dieta_seguida === 'sim'
              ? 1
              : r.dieta_seguida === 'parcial'
                ? 0.5
                : r.dieta_seguida === 'nao'
                  ? 0
                  : null,
    )
    .filter(temNumero);
  return { dias: valores.length, media: valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null };
}

/** Meses com o que mostrar: do mais antigo registro (ou dose) até o mês de hoje. */
export function limitesMeses(datas: string[], hoje: string): { min: Mes; max: Mes } {
  const max = mesDe(hoje);
  const antigas = datas.filter((d) => d <= hoje).sort();
  return { min: antigas.length ? mesDe(antigas[0]) : max, max };
}

/** Segmentos da linha do tempo: uma etiqueta de fase cada vez que a fase (ou a hipótese) muda. */
export function segmentosPorFase<T extends { fase: { indice: number }; hipotese: boolean }>(doses: T[]): { fase: number; hipotese: boolean; doses: T[] }[] {
  const seg: { fase: number; hipotese: boolean; doses: T[] }[] = [];
  for (const d of doses) {
    const ult = seg.at(-1);
    if (ult && ult.fase === d.fase.indice && ult.hipotese === d.hipotese) ult.doses.push(d);
    else seg.push({ fase: d.fase.indice, hipotese: d.hipotese, doses: [d] });
  }
  return seg;
}
