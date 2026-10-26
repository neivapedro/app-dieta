// Previsão em leque (peso e cintura até a meta): a reta das últimas semanas, com a faixa
// de 95% da reta que abre com o tempo — a mesma conta da projeção "No ritmo" (conferencia.ts).
// Descreve a tendência; não é promessa e não fala de dose.
import { reta, tStudent95 } from './conferencia';
import { diferencaDias, formatarData, somarDias } from './datas';

/** Janela da tendência (dias antes da última medição) e mínimos para prever */
export const PREVISAO = { janela: 42, pontos: 3, dias: 14, semSemFim: 182 } as const;

export interface Previsao {
  meta: number;
  /** A última medição já está na meta (ou além) */
  alcancada: boolean;
  /** Dia em que a reta chega à meta (null: não chega até o fim) */
  data: string | null;
  /** Faixa provável: quando a borda otimista e a pessimista chegam à meta (null: depois do fim) */
  cedo: string | null;
  tarde: string | null;
  /** Último dia considerado (fim do projeto) */
  fim: string;
  /** Ritmo da reta por semana (negativo = caindo) */
  ritmo_semana: number;
  /** Medições usadas e a janela delas */
  n: number;
  de: string;
  ate: string;
  /** Para o gráfico: a reta e a faixa, da última medição até o horizonte (de 7 em 7 dias) */
  centro: { data: string; valor: number }[];
  faixa: { data: string; min: number; max: number }[];
}

/**
 * Projeta a tendência das últimas 6 semanas (3 medições normais cobrindo 14 dias, no
 * mínimo) até a meta ou até o fim do projeto. A faixa é a de 95% da reta (t de Student,
 * n − 2 graus de liberdade), com um piso no desvio dos resíduos (com poucas medições a
 * reta parece mais certa do que é). Parte do valor da reta, não do último ponto.
 */
export function preverMeta(
  pontos: { data: string; valor: number }[],
  o: { meta: number; hoje: string; fim?: string | null; menorMelhor?: boolean; piso?: number; janela?: number },
): Previsao | null {
  const menor = o.menorMelhor ?? true;
  const validos = pontos.filter((p) => Number.isFinite(p.valor) && p.data <= o.hoje).sort((a, b) => a.data.localeCompare(b.data));
  if (!validos.length || !Number.isFinite(o.meta)) return null;
  const ultima = validos[validos.length - 1];
  const janela = validos.filter((p) => diferencaDias(p.data, ultima.data) <= (o.janela ?? PREVISAO.janela));
  if (janela.length < PREVISAO.pontos || diferencaDias(janela[0].data, ultima.data) < PREVISAO.dias) return null;
  const fim = o.fim && o.fim > ultima.data ? o.fim : somarDias(ultima.data, PREVISAO.semSemFim);
  const base = { meta: o.meta, fim, n: janela.length, de: janela[0].data, ate: ultima.data };
  const passou = (v: number) => (menor ? v <= o.meta + 1e-9 : v >= o.meta - 1e-9);
  const xs = janela.map((p) => diferencaDias(janela[0].data, p.data));
  const r = reta(xs, janela.map((p) => p.valor));
  const ritmo_semana = r.inclinacao * 7;
  if (passou(ultima.valor)) return { ...base, alcancada: true, data: null, cedo: null, tarde: null, ritmo_semana, centro: [], faixa: [] };

  const s = Math.max(r.s, o.piso ?? 0);
  const t = tStudent95(janela.length - 2);
  const x0 = diferencaDias(janela[0].data, ultima.data);
  const valor = (k: number) => r.my + r.inclinacao * (x0 + k - r.mx);
  const meia = (k: number) => t * s * Math.sqrt(1 / r.n + (x0 + k - r.mx) ** 2 / r.sxx);
  // Borda otimista (chega antes) e pessimista (chega depois)
  const otimista = (k: number) => (menor ? valor(k) - meia(k) : valor(k) + meia(k));
  const pessimista = (k: number) => (menor ? valor(k) + meia(k) : valor(k) - meia(k));
  const dias = diferencaDias(ultima.data, fim);
  let kData: number | null = null;
  let kCedo: number | null = null;
  let kTarde: number | null = null;
  for (let k = 0; k <= dias; k++) {
    if (kCedo === null && passou(otimista(k))) kCedo = k;
    if (kData === null && passou(valor(k))) kData = k;
    if (kTarde === null && passou(pessimista(k))) {
      kTarde = k;
      break;
    }
  }
  const dia = (k: number | null) => (k === null ? null : somarDias(ultima.data, k));
  // Desenho: até a faixa inteira passar da meta (mais uma semana); sem isso, 4 semanas depois
  // da data central (o leque não cresce sem fim), ou até o fim
  const ateK = kTarde !== null ? Math.min(dias, kTarde + 7) : kData !== null ? Math.min(dias, kData + 28) : dias;
  const ks: number[] = [];
  for (let k = 0; k < ateK; k += 7) ks.push(k);
  ks.push(ateK);
  const arred = (v: number) => Math.round(v * 100) / 100;
  return {
    ...base,
    alcancada: false,
    data: dia(kData),
    cedo: dia(kCedo),
    tarde: dia(kTarde),
    ritmo_semana,
    centro: ks.map((k) => ({ data: somarDias(ultima.data, k), valor: arred(valor(k)) })),
    faixa: ks.map((k) => ({ data: somarDias(ultima.data, k), min: arred(valor(k) - meia(k)), max: arred(valor(k) + meia(k)) })),
  };
}

const dm = (d: string) => formatarData(d).slice(0, 5);

/** "No ritmo atual, a meta de cintura chega por volta de 12/01 (faixa provável 20/12–08/02)." */
export function textoPrevisao(nome: string, p: Previsao): string {
  if (p.alcancada) return `Meta de ${nome} alcançada.`;
  if (!p.data) return `No ritmo atual, a meta de ${nome} não é alcançada até o fim do ciclo (${dm(p.fim)}).`;
  const faixa = p.cedo ? ` (faixa provável ${dm(p.cedo)}–${p.tarde ? dm(p.tarde) : `depois de ${dm(p.fim)}`})` : '';
  return `No ritmo atual, a meta de ${nome} chega por volta de ${dm(p.data)}${faixa}.`;
}
