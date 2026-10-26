// Contas dos gráficos em SVG (escalas, marcas dos eixos, caminhos, zoom), sem DOM.
// Datas são 'AAAA-MM-DD' (dia civil) e viram números de dia (dias desde 1970-01-01, UTC).

const DIA_MS = 86_400_000;

/** 'AAAA-MM-DD' → número do dia (dias desde 01/01/1970) */
export function paraDiaNum(data: string): number {
  const [a, m, d] = data.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / DIA_MS);
}

/** número do dia → 'AAAA-MM-DD' */
export function deDiaNum(n: number): string {
  return new Date(Math.round(n) * DIA_MS).toISOString().slice(0, 10);
}

/** 'AAAA-MM-DD' → 'dd/mm' */
export function dataCurta(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** 'AAAA-MM-DD' → 'dd/mm/aa' */
export function dataMedia(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(2, 4)}`;
}

// ---------- Números ----------

const formatos = new Map<number, Intl.NumberFormat>();
/** Número em pt-BR com `casas` decimais fixas ("1.234,5"); "–" para ausente */
export function formatarNumero(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  let f = formatos.get(casas);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    formatos.set(casas, f);
  }
  // Sem "-0,0"
  const r = Number(v.toFixed(casas));
  return f.format(r === 0 ? 0 : r).replace('-', '−');
}

/** Casas decimais suficientes para mostrar um passo de marca do eixo (0,5 → 1; 0,25 → 2; 10 → 0) */
export function casasDoPasso(passo: number): number {
  if (!(passo > 0) || !Number.isFinite(passo)) return 0;
  for (let c = 0; c <= 6; c++) {
    const k = passo * 10 ** c;
    if (Math.abs(k - Math.round(k)) < 1e-6 * Math.max(1, k)) return c;
  }
  return 6;
}

/** Passo "bonito" (1, 2, 2,5, 5 × 10^n) perto de `bruto` */
export function passoBonito(bruto: number): number {
  if (!(bruto > 0) || !Number.isFinite(bruto)) return 1;
  const exp = Math.floor(Math.log10(bruto));
  const base = 10 ** exp;
  const f = bruto / base;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * base;
}

export interface Ticks {
  min: number;
  max: number;
  passo: number;
  valores: number[];
}

/**
 * Marcas "bonitas" cobrindo [min, max] com cerca de `alvo` intervalos.
 * O domínio volta arredondado para os múltiplos do passo (min ≤ dados ≤ max).
 */
export function ticksBonitos(min: number, max: number, alvo = 4, inteiro = false): Ticks {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, passo: 0.5, valores: [0, 0.5, 1] };
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    // Um valor só: abre uma faixa em volta
    const d = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 1;
    min -= d;
    max += d;
  }
  let passo = passoBonito((max - min) / Math.max(1, alvo));
  // Contagens e notas inteiras: passo inteiro (nada de 2,5)
  if (inteiro) passo = passo < 1 ? 1 : passo === 2.5 ? 2 : passo;
  const lo = Math.floor(min / passo + 1e-9) * passo;
  const hi = Math.ceil(max / passo - 1e-9) * passo;
  const valores: number[] = [];
  const casas = casasDoPasso(passo);
  for (let v = lo, i = 0; v <= hi + passo * 1e-6 && i < 100; v = lo + ++i * passo) {
    valores.push(Number(v.toFixed(casas + 2)));
  }
  return { min: valores[0], max: valores[valores.length - 1], passo, valores };
}

/**
 * Domínio do eixo Y para os valores, com uma folga proporcional e marcas bonitas.
 * `comZero` força o zero dentro (barras).
 */
export function dominioY(valores: number[], opcoes: { comZero?: boolean; folga?: number; alvo?: number; inteiro?: boolean } = {}): Ticks {
  const vs = valores.filter((v) => Number.isFinite(v));
  if (!vs.length) return ticksBonitos(0, 1, opcoes.alvo ?? 4);
  let min = Math.min(...vs);
  let max = Math.max(...vs);
  if (opcoes.comZero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  const positivos = min >= 0;
  const folga = (max - min) * (opcoes.folga ?? 0.06);
  if (!opcoes.comZero || min < 0) min -= folga;
  if (!opcoes.comZero || max > 0) max += folga;
  // Dados sem negativos (contagens, notas, horas) não ganham eixo abaixo de zero
  if (positivos && min < 0) min = 0;
  const t = ticksBonitos(min, max, opcoes.alvo ?? 4, opcoes.inteiro);
  if (positivos && t.min < 0) return ticksBonitos(0, max, opcoes.alvo ?? 4, opcoes.inteiro);
  return t;
}

/**
 * Marcas com exatamente `intervalos` passos cobrindo [min, max] — para o eixo da direita
 * cair nas mesmas linhas de grade do eixo da esquerda.
 */
export function ticksAlinhados(min: number, max: number, intervalos: number): Ticks {
  const n = Math.max(1, Math.round(intervalos));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return ticksBonitos(0, 1, n);
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    const d = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 1;
    min -= d;
    max += d;
  }
  let passo = passoBonito((max - min) / n);
  for (let k = 0; k < 30; k++) {
    const lo = Math.floor(min / passo + 1e-9) * passo;
    if (lo + passo * n >= max - passo * 1e-9) {
      const casas = casasDoPasso(passo);
      const valores = Array.from({ length: n + 1 }, (_, i) => Number((lo + i * passo).toFixed(casas + 2)));
      return { min: valores[0], max: valores[n], passo, valores };
    }
    passo = passoBonito(passo * 1.001);
  }
  return ticksBonitos(min, max, n);
}

// ---------- Escalas ----------

export interface Escala {
  (v: number): number;
  inverter: (px: number) => number;
  dominio: [number, number];
  faixa: [number, number];
}

/** Escala linear de [d0, d1] para [r0, r1] (com inversa). Domínio vazio → meio da faixa. */
export function escalaLinear(dominio: [number, number], faixa: [number, number]): Escala {
  const [d0, d1] = dominio;
  const [r0, r1] = faixa;
  const dd = d1 - d0;
  const f = ((v: number) => (dd === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / dd) * (r1 - r0))) as Escala;
  f.inverter = (px: number) => (r1 === r0 ? d0 : d0 + ((px - r0) / (r1 - r0)) * dd);
  f.dominio = [d0, d1];
  f.faixa = [r0, r1];
  return f;
}

/** Índice do valor mais perto de `x` numa lista crescente (busca binária). −1 se vazia. */
export function indiceMaisProximo(ordenados: number[], x: number): number {
  const n = ordenados.length;
  if (!n) return -1;
  if (x <= ordenados[0]) return 0;
  if (x >= ordenados[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const meio = (lo + hi) >> 1;
    if (ordenados[meio] <= x) lo = meio;
    else hi = meio;
  }
  return x - ordenados[lo] <= ordenados[hi] - x ? lo : hi;
}

// ---------- Datas no eixo X ----------

/** Passos possíveis das marcas de data, em dias (28+ viram "início de mês") */
const PASSOS_DIA = [1, 2, 7, 14];
const PASSOS_MES = [1, 2, 3, 6, 12];

/**
 * Marcas de data (números de dia) entre `de` e `ate` (inclusive), cabendo em `largura` px
 * com pelo menos `espaco` px entre elas. Passos semanais caem nas segundas-feiras;
 * acima de 2 semanas, no dia 1º dos meses.
 */
export function ticksDatas(de: number, ate: number, largura: number, espaco = 52): number[] {
  if (!(ate >= de) || !(largura > 0)) return [];
  const cabem = Math.max(1, Math.floor(largura / espaco));
  const dias = ate - de;
  if (dias === 0) return [de];
  for (const p of PASSOS_DIA) {
    if (dias / p <= cabem) {
      // Semanal: alinha nas segundas (1970-01-05 foi segunda → dia 4)
      const ancora = p >= 7 ? 4 : 0;
      const primeiro = Math.ceil((de - ancora) / p) * p + ancora;
      const out: number[] = [];
      for (let d = primeiro; d <= ate; d += p) out.push(d);
      if (out.length) return out;
    }
  }
  for (const pm of PASSOS_MES) {
    if (dias / (30.44 * pm) <= cabem) {
      const out: number[] = [];
      const ini = new Date(de * DIA_MS);
      let a = ini.getUTCFullYear();
      let m = ini.getUTCMonth();
      // primeiro mês múltiplo do passo a partir do mês seguinte (ou o próprio se começa no dia 1º)
      if (ini.getUTCDate() !== 1) m += 1;
      while (m % pm !== 0) m += 1;
      for (let i = 0; i < 200; i++) {
        const d = Math.round(Date.UTC(a, m, 1) / DIA_MS);
        if (d > ate) break;
        if (d >= de) out.push(d);
        m += pm;
        if (m >= 12) {
          a += Math.floor(m / 12);
          m %= 12;
        }
      }
      if (out.length) return out;
    }
  }
  return [de, ate];
}

// ---------- Caminhos SVG ----------

export interface PontoXY {
  x: number;
  y: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Linha que quebra nos nulos (cada trecho começa com M). */
export function caminhoLinha(pts: PontoXY[]): string {
  let d = '';
  let aberto = false;
  for (const p of pts) {
    if (p.y === null || !Number.isFinite(p.y)) {
      aberto = false;
      continue;
    }
    d += `${aberto ? 'L' : 'M'}${r2(p.x)},${r2(p.y)}`;
    aberto = true;
  }
  return d;
}

/** Degrau (o valor vale até o próximo ponto); `xFim` estende o último degrau. */
export function caminhoDegrau(pts: PontoXY[], xFim?: number): string {
  let d = '';
  let ant: { x: number; y: number } | null = null;
  for (const p of pts) {
    if (p.y === null || !Number.isFinite(p.y)) {
      ant = null;
      continue;
    }
    if (!ant) d += `M${r2(p.x)},${r2(p.y)}`;
    else d += `H${r2(p.x)}V${r2(p.y)}`;
    ant = { x: p.x, y: p.y };
  }
  if (ant && xFim !== undefined && xFim > ant.x) d += `H${r2(xFim)}`;
  return d;
}

/** Área de cada trecho contínuo da linha até a base `y0`. */
export function caminhoArea(pts: PontoXY[], y0: number): string {
  let d = '';
  let trecho: { x: number; y: number }[] = [];
  const fechar = () => {
    if (trecho.length > 1) {
      d += `M${r2(trecho[0].x)},${r2(y0)}` + trecho.map((p) => `L${r2(p.x)},${r2(p.y)}`).join('') + `L${r2(trecho[trecho.length - 1].x)},${r2(y0)}Z`;
    }
    trecho = [];
  };
  for (const p of pts) {
    if (p.y === null || !Number.isFinite(p.y)) fechar();
    else trecho.push({ x: p.x, y: p.y });
  }
  fechar();
  return d;
}

/** Faixa (leque): contorno do máximo e volta pelo mínimo */
export function caminhoFaixa(pts: { x: number; y0: number; y1: number }[]): string {
  if (pts.length < 2) return '';
  const ida = pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p.x)},${r2(p.y1)}`).join('');
  const volta = [...pts].reverse().map((p) => `L${r2(p.x)},${r2(p.y0)}`).join('');
  return ida + volta + 'Z';
}

/** Barra com o topo arredondado (raio limitado pela largura e altura); negativa arredonda embaixo. */
export function caminhoBarra(x: number, largura: number, yBase: number, yValor: number, raio = 4): string {
  const h = Math.abs(yBase - yValor);
  const r = Math.max(0, Math.min(raio, largura / 2, h));
  const x0 = r2(x);
  const x1 = r2(x + largura);
  if (h < 0.5) return `M${x0},${r2(yBase)}H${x1}V${r2(yBase - 0.5)}H${x0}Z`;
  if (yValor <= yBase) {
    // para cima
    return `M${x0},${r2(yBase)}V${r2(yValor + r)}Q${x0},${r2(yValor)} ${r2(x + r)},${r2(yValor)}H${r2(x + largura - r)}Q${x1},${r2(yValor)} ${x1},${r2(yValor + r)}V${r2(yBase)}Z`;
  }
  return `M${x0},${r2(yBase)}V${r2(yValor - r)}Q${x0},${r2(yValor)} ${r2(x + r)},${r2(yValor)}H${r2(x + largura - r)}Q${x1},${r2(yValor)} ${x1},${r2(yValor - r)}V${r2(yBase)}Z`;
}

// ---------- Estatística ----------

export interface Tendencia {
  /** y = a + b·x */
  a: number;
  b: number;
  /** correlação de Pearson */
  r: number;
  n: number;
}

/** Mínimos quadrados e r de Pearson. null com menos de 3 pontos ou x/y constantes. */
export function minimosQuadrados(pts: { x: number; y: number }[]): Tendencia | null {
  const v = pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = v.length;
  if (n < 3) return null;
  const mx = v.reduce((s, p) => s + p.x, 0) / n;
  const my = v.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of v) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0 || syy === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, r: sxy / Math.sqrt(sxx * syy), n };
}

// ---------- Zoom (janela visível em números de dia) ----------

export interface Janela {
  de: number;
  ate: number;
}

/** Mantém a janela dentro de [total.de, total.ate] e com pelo menos `minimo` dias. */
export function limitarJanela(j: Janela, total: Janela, minimo = 6): Janela {
  const spanTotal = total.ate - total.de;
  let span = Math.max(Math.min(j.ate - j.de, spanTotal), Math.min(minimo, spanTotal));
  if (!(span >= 0)) span = spanTotal;
  let de = j.de;
  if (de < total.de) de = total.de;
  if (de + span > total.ate) de = total.ate - span;
  return { de, ate: de + span };
}

/** Zoom com fator (>1 aproxima) mantendo o dia `ancora` parado. */
export function zoomJanela(j: Janela, fator: number, ancora: number, total: Janela, minimo = 6): Janela {
  const k = 1 / Math.max(fator, 1e-6);
  const de = ancora - (ancora - j.de) * k;
  const ate = ancora + (j.ate - ancora) * k;
  return limitarJanela({ de, ate }, total, minimo);
}

/** Arrasta a janela por `dias` (sem mudar o tamanho). */
export function moverJanela(j: Janela, dias: number, total: Janela): Janela {
  return limitarJanela({ de: j.de + dias, ate: j.ate + dias }, total, j.ate - j.de);
}

/** A janela é a série inteira? (com folga de meio dia) */
export function janelaInteira(j: Janela, total: Janela): boolean {
  return j.de <= total.de + 0.5 && j.ate >= total.ate - 0.5;
}

/** Janela em dias → período em datas (dias inteiros, arredondando para fora) */
export function janelaParaPeriodo(j: Janela): { de: string; ate: string } {
  return { de: deDiaNum(Math.floor(j.de + 1e-6)), ate: deDiaNum(Math.ceil(j.ate - 1e-6)) };
}

// ---------- Dica flutuante ----------

/**
 * Posição (canto esquerdo) da caixa de dica de largura `w` ao lado de `x`,
 * dentro de [0, largura]: prefere a direita do cursor; vira para a esquerda se não couber.
 */
export function posicaoDica(x: number, w: number, largura: number, distancia = 12): number {
  if (w >= largura) return 0;
  let esq = x + distancia;
  if (esq + w > largura) esq = x - distancia - w;
  return Math.max(0, Math.min(esq, largura - w));
}
