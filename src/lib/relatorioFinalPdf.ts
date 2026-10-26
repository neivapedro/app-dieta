// PDF final do ciclo: colorido, com capa, gráficos vetoriais, fases, hábitos,
// treino, antes e depois, recordes e metas. Lê só o modelo pronto
// (montarRelatorioFinal) e as fotos já reduzidas; é gerado no próprio aparelho.
// Só descreve o que foi registrado: nada de conselho de dose.
import { GState, jsPDF } from 'jspdf';
import { autoTable, type CellHookData } from 'jspdf-autotable';
import { diferencaDias, formatarData, somarDias } from './datas';
import { cm, corVariacao, kg, num, pct, pp, sinal } from './formato';
import { MDC } from './gordura';
import type { ImagemPdf } from './relatorioPdf';
import { textoPdf } from './relatorioPdf';
import type { CategoriaRecorde, EventoRelatorio, FaseRelatorio, PontoRelatorio, RelatorioFinal, TomRelatorio, VariacaoRelatorio } from './relatorio-final';
import { formatarKm, formatarTempo } from './treino';

// ---------- Página e cores ----------

const L = 210;
const A = 297;
const M = 14;
const LW = L - M * 2;
/** Topo do conteúdo nas páginas internas (abaixo do cabeçalho) e limite de baixo (acima do rodapé) */
const TOPO = 20;
const FIM = 279;

type Cor = [number, number, number];
const hex = (h: string): Cor => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mistura = (a: Cor, b: Cor, t: number): Cor => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Cor;
const BRANCO: Cor = [255, 255, 255];
const PRETO: Cor = [0, 0, 0];
/** Tom claro da cor (t = quanto de branco) */
const clara = (c: Cor, t = 0.9) => mistura(c, BRANCO, t);
/** Tom escuro da cor, para texto sobre o branco */
const escura = (c: Cor, t = 0.3) => mistura(c, PRETO, t);

const C = {
  tinta: hex('#111827'),
  tinta2: hex('#374151'),
  mudo: hex('#5b6170'),
  linha: hex('#e3e6ec'),
  grade: hex('#eceef3'),
  fundo: hex('#f5f6fa'),
  // Cores de destaque (tons médios, bons na tela e no papel)
  azul: hex('#2563eb'),
  violeta: hex('#7c3aed'),
  rosa: hex('#db2777'),
  ciano: hex('#0891b2'),
  laranja: hex('#ea580c'),
  verde: hex('#16a34a'),
  indigo: hex('#4f46e5'),
  ambar: hex('#d97706'),
  // Variação boa / ruim (contraste no papel)
  bom: hex('#15803d'),
  ruim: hex('#be123c'),
};
/** Cores dos blocos de dose: frias e quentes alternadas (cada bloco também tem rótulo) */
const CORES_FASES: Cor[] = [C.ciano, C.violeta, C.laranja, C.azul, C.rosa, C.verde];
const corFase = (i: number) => CORES_FASES[((i % CORES_FASES.length) + CORES_FASES.length) % CORES_FASES.length];
const corTom = (t: TomRelatorio | string | null | undefined): Cor => (t === 'bom' ? C.bom : t === 'ruim' ? C.ruim : C.tinta);
const COR_CATEGORIA: Record<CategoriaRecorde, Cor> = { corpo: C.azul, habito: C.verde, remedio: C.indigo, treino: C.rosa };
const ROTULO_CATEGORIA: Record<CategoriaRecorde, string> = { corpo: 'Corpo', habito: 'Hábito', remedio: 'Remédio', treino: 'Treino' };

/** Texto pronto para a fonte do PDF: a seta vira » e o sinal de menos vira o traço –, que a Helvetica tem. */
// O sinal e a unidade ficam presos ao número (espaço que não quebra): "– 14,7 kg" não quebra no meio.
const t = (s: string) =>
  textoPdf(s.replace(/\s*→\s*/g, ' » ').replace(/−/g, '–'))
    .replace(/([–+]) (?=\d)/g, '$1 ')
    .replace(/(\d) (kg|cm|mg|p\.p\.|h|L)(?![\p{L}])/gu, '$1 $2');
const curta = (d: string) => formatarData(d, true);
const diaSeguinte = (d: string) => somarDias(d, 1);

// ---------- Contexto ----------

interface Ctx {
  doc: jsPDF;
  r: RelatorioFinal;
  imagens: Map<string, ImagemPdf> | null;
  y: number;
  /** Número da próxima seção */
  n: number;
}

// ---------- Desenho básico ----------

interface OpTexto {
  tam?: number;
  cor?: Cor;
  negrito?: boolean;
  alinhar?: 'left' | 'center' | 'right';
  /** Largura máxima: quebra em linhas */
  largura?: number;
  /** Espaço entre letras (só alinhado à esquerda) */
  esp?: number;
  /** Máximo de linhas (corta o resto com …) */
  maxLinhas?: number;
}

const ALTURA_LINHA = 1.3;
/** Altura de uma linha de texto em mm */
const altLinha = (tam: number) => tam * 0.3528 * ALTURA_LINHA;

function fonte(doc: jsPDF, o: OpTexto) {
  doc.setFont('helvetica', o.negrito ? 'bold' : 'normal');
  doc.setFontSize(o.tam ?? 9);
  doc.setTextColor(...(o.cor ?? C.tinta));
}

/** Quebra o texto nas linhas que cabem (com a fonte de `o`). */
function linhasDe(doc: jsPDF, s: string, o: OpTexto): string[] {
  fonte(doc, o);
  const tx = t(s);
  let linhas: string[] = o.largura ? (doc.splitTextToSize(tx, o.largura) as string[]) : [tx];
  if (o.maxLinhas && linhas.length > o.maxLinhas) {
    linhas = linhas.slice(0, o.maxLinhas);
    let ultima = `${linhas[o.maxLinhas - 1].replace(/\s+\S*$/, '')}…`;
    while (o.largura && ultima.length > 2 && doc.getTextWidth(ultima) > o.largura) ultima = `${ultima.slice(0, -2).trimEnd()}…`;
    linhas[o.maxLinhas - 1] = ultima;
  }
  return linhas;
}

/** Escreve (y = linha de base da 1ª linha) e devolve a altura usada. */
function escrever(doc: jsPDF, s: string, x: number, y: number, o: OpTexto = {}): number {
  const linhas = linhasDe(doc, s, o);
  if (!linhas.length || (linhas.length === 1 && !linhas[0])) return 0;
  fonte(doc, o);
  doc.text(linhas, x, y, { align: o.alinhar ?? 'left', lineHeightFactor: ALTURA_LINHA, ...(o.esp && (o.alinhar ?? 'left') === 'left' ? { charSpace: o.esp } : {}) });
  return linhas.length * altLinha(o.tam ?? 9);
}

function alturaTexto(doc: jsPDF, s: string, o: OpTexto): number {
  return linhasDe(doc, s, o).length * altLinha(o.tam ?? 9);
}

function largura(doc: jsPDF, s: string, o: OpTexto): number {
  fonte(doc, o);
  return doc.getTextWidth(t(s));
}

function comOpacidade(doc: jsPDF, a: number, f: () => void) {
  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity: a, 'stroke-opacity': a }));
  f();
  doc.restoreGraphicsState();
}

function cortar(doc: jsPDF, x: number, y: number, w: number, h: number, raio: number, f: () => void) {
  doc.saveGraphicsState();
  if (raio > 0) doc.roundedRect(x, y, w, h, raio, raio, null);
  else doc.rect(x, y, w, h, null);
  doc.clip();
  doc.discardPath();
  f();
  doc.restoreGraphicsState();
}

function caixa(doc: jsPDF, x: number, y: number, w: number, h: number, cor: Cor, raio = 2.2) {
  doc.setFillColor(...cor);
  if (raio > 0) doc.roundedRect(x, y, w, h, Math.min(raio, w / 2, h / 2), Math.min(raio, w / 2, h / 2), 'F');
  else doc.rect(x, y, w, h, 'F');
}

/** Cor num ponto (0 a 1) de uma escala de várias cores. */
function corNaEscala(cores: Cor[], f: number): Cor {
  const v = Math.min(Math.max(f, 0), 1) * (cores.length - 1);
  const i = Math.min(Math.floor(v), cores.length - 2);
  return mistura(cores[i], cores[i + 1], v - i);
}

/** Gradiente horizontal (faixas finas de cores intermediárias: o jsPDF não tem gradiente). */
function gradienteH(doc: jsPDF, x: number, y: number, w: number, h: number, cores: Cor[], passos = 90) {
  const pw = w / passos;
  for (let i = 0; i < passos; i++) {
    doc.setFillColor(...corNaEscala(cores, i / (passos - 1)));
    doc.rect(x + i * pw, y, pw + 0.12, h, 'F');
  }
}

/** Gradiente diagonal (faixas inclinadas cortadas no retângulo). */
function gradienteDiagonal(doc: jsPDF, x: number, y: number, w: number, h: number, cores: Cor[], passos = 140) {
  const incl = h * 0.45;
  const total = w + incl;
  const pw = total / passos;
  cortar(doc, x, y, w, h, 0, () => {
    for (let i = 0; i < passos; i++) {
      doc.setFillColor(...corNaEscala(cores, i / (passos - 1)));
      const x0 = x + i * pw;
      doc.lines(
        [
          [pw + 0.15, 0],
          [-incl, h],
          [-(pw + 0.15), 0],
        ],
        x0,
        y,
        [1, 1],
        'F',
        true,
      );
    }
  });
}

/** Pílula com texto (devolve a largura). */
function pilula(doc: jsPDF, s: string, x: number, y: number, fundo: Cor, cor: Cor, tam = 7.5, alinhar: 'left' | 'right' = 'left'): number {
  const w = largura(doc, s, { tam, negrito: true }) + 4.4;
  const h = tam * 0.3528 + 2.6;
  const x0 = alinhar === 'right' ? x - w : x;
  caixa(doc, x0, y, w, h, fundo, h / 2);
  escrever(doc, s, x0 + 2.2, y + h / 2 + tam * 0.3528 * 0.36, { tam, negrito: true, cor });
  return w;
}

/** Marca "✓" desenhada (a fonte não tem o símbolo). */
function marcaOk(doc: jsPDF, cx: number, cy: number, s: number, cor: Cor) {
  doc.setDrawColor(...cor);
  doc.setLineWidth(s * 0.22);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  doc.lines(
    [
      [s * 0.32, s * 0.32],
      [s * 0.6, -s * 0.66],
    ],
    cx - s * 0.46,
    cy + s * 0.02,
    [1, 1],
    'S',
    false,
  );
  doc.setLineCap('butt');
}

/** Foto inteira dentro da moldura de cantos arredondados (sem cortar a imagem). */
function desenharFoto(doc: jsPDF, img: ImagemPdf | null | undefined, id: string, x: number, y: number, w: number, h: number, raio = 2.4) {
  cortar(doc, x, y, w, h, raio, () => {
    doc.setFillColor(...hex('#e9ebf2'));
    doc.rect(x, y, w, h, 'F');
    if (img && img.largura > 0 && img.altura > 0) {
      const e = Math.min(w / img.largura, h / img.altura);
      const iw = img.largura * e;
      const ih = img.altura * e;
      doc.addImage(img.dados, 'JPEG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, `foto-${id}`, 'NONE');
    } else {
      escrever(doc, 'Sem foto', x + w / 2, y + h / 2, { tam: 8, cor: C.mudo, alinhar: 'center' });
    }
  });
}

// ---------- Páginas e seções ----------

function cabecalhoPagina(c: Ctx) {
  const { doc, r } = c;
  gradienteH(doc, 0, 0, L, 2.4, [C.indigo, C.violeta, C.rosa], 60);
  escrever(doc, 'RELATÓRIO FINAL DO CICLO', M, 9.5, { tam: 7, negrito: true, cor: escura(C.indigo, 0.15), esp: 0.35 });
  const direita = [r.pessoa.nome, r.periodo.texto, r.estado === 'previa' ? 'prévia' : null].filter(Boolean).join(' · ');
  escrever(doc, direita, L - M, 9.5, { tam: 7, cor: C.mudo, alinhar: 'right' });
}

function novaPagina(c: Ctx) {
  c.doc.addPage();
  cabecalhoPagina(c);
  c.y = TOPO;
}

function espaco(c: Ctx, alt: number) {
  if (c.y + alt > FIM) novaPagina(c);
}

/** Título de seção com o número numa pastilha colorida. */
/** `nova`: começa numa página nova; senão continua na mesma se couber o título e `minimo` mm do conteúdo. */
function secao(c: Ctx, titulo: string, sub: string | null, cor: Cor, nova = true, minimo = 40) {
  const { doc } = c;
  const altSub = sub ? alturaTexto(doc, sub, { tam: 8.5, largura: LW - 13 }) : 0;
  if (nova) novaPagina(c);
  else {
    c.y += 5;
    espaco(c, 16 + altSub + minimo);
  }
  const y = c.y;
  caixa(doc, M, y, 9.5, 9.5, cor, 2.4);
  escrever(doc, String(c.n).padStart(2, '0'), M + 4.75, y + 6.4, { tam: 9.5, negrito: true, cor: BRANCO, alinhar: 'center' });
  c.n++;
  escrever(doc, titulo, M + 13, y + 6.9, { tam: 16, negrito: true });
  let yy = y + 11.5;
  if (sub) yy += escrever(doc, sub, M + 13, y + 12.6, { tam: 8.5, cor: C.mudo, largura: LW - 13 });
  c.y = yy + 4;
}

/** Subtítulo dentro de uma seção (com um traço da cor). */
function subtitulo(c: Ctx, s: string, cor: Cor, alt = 30) {
  espaco(c, 9 + alt);
  const { doc } = c;
  caixa(doc, M, c.y + 0.6, 1.2, 4, cor, 0.6);
  escrever(doc, s, M + 3.2, c.y + 4, { tam: 10, negrito: true });
  c.y += 8;
}

/**
 * Seção que cabe inteira numa página (`alt` mm com o título) começa numa página
 * nova em vez de deixar só o pé dela sozinho na página seguinte.
 */
function inteiraNaPagina(c: Ctx, alt: number): boolean {
  return c.y + 5 + alt > FIM && alt <= FIM - TOPO;
}

function nota(c: Ctx, s: string, tam = 7.5) {
  const h = alturaTexto(c.doc, s, { tam, largura: LW });
  espaco(c, h + 2);
  escrever(c.doc, s, M, c.y + tam * 0.3528, { tam, cor: C.mudo, largura: LW });
  c.y += h + 1.5;
}

/** Caixa sem dados (mantém o espaço do gráfico com a explicação). */
function vazio(doc: jsPDF, x: number, y: number, w: number, h: number, s: string) {
  caixa(doc, x, y, w, h, C.fundo, 2.4);
  escrever(doc, s, x + w / 2, y + h / 2 + 1, { tam: 8, cor: C.mudo, alinhar: 'center', largura: w - 10 });
}

// ---------- Ladrilhos ----------

function ladrilho(doc: jsPDF, x: number, y: number, w: number, h: number, cor: Cor, rotulo: string, valor: string, sub: string | null, corValor: Cor = C.tinta, tamValor = 15) {
  caixa(doc, x, y, w, h, clara(cor, 0.9), 2.6);
  cortar(doc, x, y, w, h, 2.6, () => caixa(doc, x, y, 1.6, h, cor, 0));
  escrever(doc, rotulo.toUpperCase(), x + 5, y + 5.6, { tam: 7, negrito: true, cor: escura(cor, 0.3), esp: 0.3 });
  escrever(doc, valor, x + 5, y + 6.6 + tamValor * 0.3528, { tam: tamValor, negrito: true, cor: corValor, largura: w - 7, maxLinhas: 1 });
  if (sub) escrever(doc, sub, x + 5, y + 9.4 + tamValor * 0.3528 + 3, { tam: 7.5, cor: C.tinta2, largura: w - 7, maxLinhas: 2 });
}

const valorVariacao = (v: VariacaoRelatorio) => (v.delta !== null ? v.texto_delta : v.inicio !== null ? v.texto_fim ?? v.texto_inicio : '–');
const subVariacao = (v: VariacaoRelatorio) => (v.delta !== null ? `${v.texto_inicio} → ${v.texto_fim}` : v.inicio === null ? 'sem medição' : 'sem nova medição');

// ---------- Escalas ----------

/** Marcas "redondas" do eixo (passo 1, 2, 2,5 ou 5 × 10^k). */
export function marcasEixo(min: number, max: number, alvo = 4): { marcas: number[]; passo: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { marcas: [0, 1], passo: 1 };
  if (max - min < 1e-9) {
    const folga = Math.max(Math.abs(max) * 0.02, 0.5);
    min -= folga;
    max += folga;
  }
  const bruto = (max - min) / alvo;
  const p10 = 10 ** Math.floor(Math.log10(bruto));
  const m = bruto / p10;
  const passo = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p10;
  const lo = Math.floor(min / passo + 1e-9) * passo;
  const hi = Math.ceil(max / passo - 1e-9) * passo;
  const marcas: number[] = [];
  for (let v = lo; v <= hi + passo / 2; v += passo) marcas.push(Math.round(v * 1e6) / 1e6);
  return { marcas, passo };
}

/** Casas decimais que o passo do eixo pede (2,5 → 1; 0,25 → 2; 5 → 0). */
export function casasPasso(passo: number): number {
  for (let d = 0; d < 3; d++) if (Math.abs(passo * 10 ** d - Math.round(passo * 10 ** d)) < 1e-6) return d;
  return 3;
}

/** Datas do eixo X a cada N semanas (do início), sem encostar umas nas outras. */
function marcasDatas(de: string, ate: string, larguraMm: number, comAno: boolean): string[] {
  const total = Math.max(diferencaDias(de, ate), 1);
  const max = Math.max(Math.floor(larguraMm / (comAno ? 17 : 13)) + 1, 2);
  const semanas = total / 7;
  const opcoes = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 26, 52, 104];
  const s = opcoes.find((o) => Math.floor(semanas / o) + 1 <= max) ?? 104;
  const lista: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 7 * s)) lista.push(d);
  return lista;
}

// ---------- Gráfico de tempo (linhas) ----------

interface SerieTempo {
  pontos: PontoRelatorio[];
  cor: Cor;
  rotulo: string;
  area?: boolean;
  /** Formato do valor nos rótulos das pontas */
  fmt: (v: number) => string;
}

interface OpTempo {
  titulo: string;
  series: SerieTempo[];
  de: string;
  ate: string;
  fases?: FaseRelatorio[];
  alt: number;
  vazio: string;
  /** Formato das marcas do eixo Y */
  fmtEixo?: (v: number, passo: number) => string;
  /** Linha de referência (ex.: zero) */
  ref?: { valor: number; rotulo: string };
  /** Pontos (bolinhas) mesmo com muitos valores */
  pontos?: boolean;
  /** Eixo invertido (pace: menor é mais rápido, fica em cima) */
  invertido?: boolean;
}

/** Desenha o título, a legenda e devolve a área do gráfico (sem eixos). */
type ItemLegenda = { rotulo: string; cor: Cor; tipo?: 'linha' | 'barra' | 'vazio' | 'tracejada' };

function cabecalhoGrafico(doc: jsPDF, x: number, y: number, w: number, titulo: string, legenda: ItemLegenda[]) {
  escrever(doc, titulo, x, y + 3.6, { tam: 9, negrito: true });
  // Legenda à direita do título (da direita para a esquerda)
  let xl = x + w;
  for (const item of [...legenda].reverse()) {
    const wt = largura(doc, item.rotulo, { tam: 7.5 });
    escrever(doc, item.rotulo, xl, y + 3.5, { tam: 7.5, cor: C.tinta2, alinhar: 'right' });
    xl -= wt + 1.6;
    if (item.tipo === 'barra') caixa(doc, xl - 3, y + 1.2, 3, 2.8, item.cor, 0.6);
    else if (item.tipo === 'vazio') {
      doc.setDrawColor(...item.cor);
      doc.setFillColor(...BRANCO);
      doc.setLineWidth(0.35);
      doc.circle(xl - 1.5, y + 2.6, 0.9, 'FD');
    } else if (item.tipo === 'tracejada') {
      doc.setDrawColor(...item.cor);
      doc.setLineWidth(0.35);
      doc.setLineDashPattern([1.2, 1], 0);
      doc.line(xl - 4.5, y + 2.6, xl, y + 2.6);
      doc.setLineDashPattern([], 0);
    } else {
      doc.setDrawColor(...item.cor);
      doc.setLineWidth(0.7);
      doc.line(xl - 4.5, y + 2.6, xl, y + 2.6);
    }
    xl -= (item.tipo === 'linha' || item.tipo === 'tracejada' || !item.tipo ? 4.5 : 3) + 3.5;
  }
}

function eixoY(doc: jsPDF, px0: number, px1: number, py: (v: number) => number, marcas: number[], passo: number, fmt: (v: number, passo: number) => string) {
  doc.setDrawColor(...C.grade);
  doc.setLineWidth(0.2);
  for (const m of marcas) {
    const yy = py(m);
    doc.line(px0, yy, px1, yy);
    escrever(doc, fmt(m, passo), px0 - 1.5, yy + 1, { tam: 7, cor: C.mudo, alinhar: 'right' });
  }
}

function eixoDatas(doc: jsPDF, px0: number, px1: number, pyBase: number, de: string, ate: string, X: (d: string) => number) {
  const comAno = de.slice(0, 4) !== ate.slice(0, 4);
  for (const d of marcasDatas(de, ate, px1 - px0, comAno)) {
    const x = X(d);
    doc.setDrawColor(...C.linha);
    doc.setLineWidth(0.2);
    doc.line(x, pyBase, x, pyBase + 1.2);
    const rot = comAno ? curta(d) : curta(d).slice(0, 5);
    const w = largura(doc, rot, { tam: 7 });
    const xa = Math.min(Math.max(x, px0 + w / 2 - 2), px1 - w / 2);
    escrever(doc, rot, xa, pyBase + 4.2, { tam: 7, cor: C.mudo, alinhar: 'center' });
  }
}

/** Faixas coloridas dos blocos de dose atrás do gráfico. */
function faixasFases(doc: jsPDF, fases: FaseRelatorio[], de: string, ate: string, X: (d: string) => number, py0: number, py1: number) {
  fases.forEach((f, i) => {
    const a = f.inicio < de ? de : f.inicio;
    const fimF = diaSeguinte(f.fim);
    const b = fimF > ate ? ate : fimF;
    if (b <= a) return;
    doc.setFillColor(...clara(corFase(i), 0.92));
    doc.rect(X(a), py0, X(b) - X(a), py1 - py0, 'F');
  });
}

/** Rótulo de valor com fundo branco (pontas da linha). */
function rotuloValor(doc: jsPDF, s: string, x: number, y: number, alinhar: 'left' | 'right' | 'center', cor: Cor) {
  const w = largura(doc, s, { tam: 7.5, negrito: true }) + 2;
  const x0 = alinhar === 'left' ? x : alinhar === 'right' ? x - w : x - w / 2;
  comOpacidade(doc, 0.88, () => caixa(doc, x0, y - 3, w, 4, BRANCO, 1));
  escrever(doc, s, x0 + 1, y, { tam: 7.5, negrito: true, cor });
}

function graficoTempo(doc: jsPDF, x: number, y: number, w: number, o: OpTempo): number {
  const legenda: ItemLegenda[] = o.series.length > 1 ? o.series.map((s) => ({ rotulo: s.rotulo, cor: s.cor })) : [];
  if (o.series.some((s) => s.pontos.some((p) => p.atipico))) legenda.push({ rotulo: 'atípica', cor: C.mudo, tipo: 'vazio' });
  cabecalhoGrafico(doc, x, y, w, o.titulo, legenda);
  const todos = o.series.flatMap((s) => s.pontos).filter((p) => p.data >= o.de && p.data <= o.ate);
  const px0 = x + 11;
  const px1 = x + w - 2;
  const py0 = y + 8;
  const py1 = y + o.alt - 6;
  if (!todos.length) {
    vazio(doc, x, py0, w, py1 - py0 + 4, o.vazio);
    return o.alt;
  }
  const total = Math.max(diferencaDias(o.de, o.ate), 1);
  const X = (d: string) => px0 + (Math.min(Math.max(diferencaDias(o.de, d), 0), total) / total) * (px1 - px0);
  const valores = todos.map((p) => p.valor).concat(o.ref ? [o.ref.valor] : []);
  const { marcas, passo } = marcasEixo(Math.min(...valores), Math.max(...valores), o.alt < 50 ? 3 : 4);
  const lo = marcas[0];
  const hi = marcas[marcas.length - 1];
  const Y = (v: number) => (o.invertido ? py0 + ((v - lo) / (hi - lo || 1)) * (py1 - py0) : py1 - ((v - lo) / (hi - lo || 1)) * (py1 - py0));

  if (o.fases?.length) faixasFases(doc, o.fases, o.de, o.ate, X, py0, py1);
  eixoY(doc, px0, px1, Y, marcas, passo, o.fmtEixo ?? ((v, p) => num(v, casasPasso(p))));
  eixoDatas(doc, px0, px1, py1, o.de, o.ate, X);
  if (o.ref) {
    doc.setDrawColor(...C.tinta2);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.2, 1], 0);
    doc.line(px0, Y(o.ref.valor), px1, Y(o.ref.valor));
    doc.setLineDashPattern([], 0);
    escrever(doc, o.ref.rotulo, px1, Y(o.ref.valor) - 1.2, { tam: 7, cor: C.tinta2, alinhar: 'right' });
  }

  for (const s of o.series) {
    const pts = s.pontos.filter((p) => p.data >= o.de && p.data <= o.ate).sort((a, b) => a.data.localeCompare(b.data));
    const normais = pts.filter((p) => !p.atipico);
    if (normais.length) {
      const xy = normais.map((p) => [X(p.data), Y(p.valor)] as const);
      if (s.area && xy.length > 1) {
        const base = o.invertido ? py0 : py1;
        const caminho: number[][] = [[0, xy[0][1] - base]];
        for (let i = 1; i < xy.length; i++) caminho.push([xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]]);
        caminho.push([0, base - xy[xy.length - 1][1]]);
        doc.setFillColor(...s.cor);
        comOpacidade(doc, 0.13, () => doc.lines(caminho, xy[0][0], base, [1, 1], 'F', true));
      }
      if (xy.length > 1) {
        doc.setDrawColor(...s.cor);
        doc.setLineWidth(0.55);
        doc.setLineJoin('round');
        doc.setLineCap('round');
        const deltas: number[][] = [];
        for (let i = 1; i < xy.length; i++) deltas.push([xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]]);
        doc.lines(deltas, xy[0][0], xy[0][1], [1, 1], 'S', false);
        doc.setLineCap('butt');
      }
      const comPontos = o.pontos || normais.length <= 40;
      for (const [i, [px, py]] of xy.entries()) {
        if (!comPontos && i !== 0 && i !== xy.length - 1) continue;
        doc.setFillColor(...BRANCO);
        doc.circle(px, py, 1.05, 'F');
        doc.setFillColor(...s.cor);
        doc.circle(px, py, 0.72, 'F');
      }
    }
    // Atípicas: ponto vazio, fora da linha
    doc.setDrawColor(...s.cor);
    doc.setFillColor(...BRANCO);
    doc.setLineWidth(0.35);
    for (const p of pts.filter((p) => p.atipico)) doc.circle(X(p.data), Y(p.valor), 1, 'FD');
    // Valores do começo e do fim (só com até 2 séries)
    if (o.series.length <= 2 && normais.length) {
      const a = normais[0];
      const b = normais[normais.length - 1];
      const ya = (p: PontoRelatorio) => {
        const yy = Y(p.valor);
        return yy - 2 < py0 + 2.5 ? yy + 4.6 : yy - 2;
      };
      const sb = s.fmt(b.valor);
      rotuloValor(doc, sb, Math.min(X(b.data) + 1, px1), ya(b), 'right', escura(s.cor, 0.25));
      if (normais.length > 1 && X(b.data) - X(a.data) > largura(doc, sb, { tam: 7.5, negrito: true }) + largura(doc, s.fmt(a.valor), { tam: 7.5, negrito: true }) + 6)
        rotuloValor(doc, s.fmt(a.valor), X(a.data) - 1, ya(a), 'left', escura(s.cor, 0.25));
    }
  }
  return o.alt;
}

/** Faixa das doses embaixo do gráfico de peso: degraus coloridos por bloco, no mesmo eixo de datas. */
function faixaDoses(doc: jsPDF, fases: FaseRelatorio[], x: number, y: number, w: number, alt: number, de: string, ate: string): number {
  if (!fases.length) return 0;
  const px0 = x + 11;
  const px1 = x + w - 2;
  const total = Math.max(diferencaDias(de, ate), 1);
  const X = (d: string) => px0 + (Math.min(Math.max(diferencaDias(de, d), 0), total) / total) * (px1 - px0);
  const max = Math.max(...fases.map((f) => f.dose_mg));
  const base = y + alt;
  escrever(doc, 'Dose', px0 - 1.5, y + alt / 2 + 0.4, { tam: 7, cor: C.mudo, alinhar: 'right' });
  escrever(doc, 'mg', px0 - 1.5, y + alt / 2 + 3.4, { tam: 7, cor: C.mudo, alinhar: 'right' });
  fases.forEach((f, i) => {
    const a = f.inicio < de ? de : f.inicio;
    const fimF = diaSeguinte(f.fim);
    const b = fimF > ate ? ate : fimF;
    if (b <= a) return;
    const h = Math.max((f.dose_mg / max) * (alt - 1), 3.2);
    const xa = X(a) + 0.25;
    const wb = Math.max(X(b) - X(a) - 0.5, 0.4);
    doc.setFillColor(...corFase(i));
    doc.roundedRect(xa, base - h, wb, h, Math.min(0.8, wb / 2), Math.min(0.8, wb / 2), 'F');
    doc.rect(xa, base - Math.min(h, 1), wb, Math.min(h, 1), 'F');
    const rot = num(f.dose_mg);
    if (wb >= largura(doc, rot, { tam: 7, negrito: true }) + 1.6 && h >= 4) escrever(doc, rot, xa + wb / 2, base - h + 3.4, { tam: 7, negrito: true, cor: BRANCO, alinhar: 'center' });
  });
  return alt;
}

// ---------- Barras por semana ----------

interface GrupoBarras {
  rotulo: string;
  valores: (number | null)[];
  cor: Cor;
  /** Cor de cada barra (ex.: mais clara abaixo da meta) */
  corDe?: (v: number, i: number) => Cor;
}

interface OpBarras {
  titulo: string;
  rotulos: string[];
  grupos: GrupoBarras[];
  legenda?: ItemLegenda[];
  min?: number;
  max?: number;
  ref?: { valor: number; rotulo: string };
  /** Meta de cada barra (traço sobre a barra) */
  metas?: (number | null)[];
  fmtEixo: (v: number, passo: number) => string;
  alt: number;
  vazio: string;
}

function graficoBarras(doc: jsPDF, x: number, y: number, w: number, o: OpBarras): number {
  const legenda: ItemLegenda[] = [...(o.legenda ?? (o.grupos.length > 1 ? o.grupos.map((g) => ({ rotulo: g.rotulo, cor: g.cor, tipo: 'barra' as const })) : [])), ...(o.ref ? [{ rotulo: o.ref.rotulo, cor: C.tinta2, tipo: 'tracejada' as const }] : [])];
  cabecalhoGrafico(doc, x, y, w, o.titulo, legenda);
  const px0 = x + 11;
  const px1 = x + w - 2;
  const py0 = y + 8;
  const py1 = y + o.alt - 6;
  const vals = o.grupos.flatMap((g) => g.valores).filter((v): v is number => v !== null);
  if (!vals.length || !o.rotulos.length) {
    vazio(doc, x, py0, w, py1 - py0 + 4, o.vazio);
    return o.alt;
  }
  const extras = [...(o.ref ? [o.ref.valor] : []), ...((o.metas ?? []).filter((v): v is number => v !== null))];
  const { marcas, passo } = marcasEixo(o.min ?? Math.min(0, ...vals), o.max ?? Math.max(...vals, ...extras), o.alt < 45 ? 3 : 4);
  const lo = marcas[0];
  const hi = marcas[marcas.length - 1];
  const Y = (v: number) => py1 - ((v - lo) / (hi - lo || 1)) * (py1 - py0);
  eixoY(doc, px0, px1, Y, marcas, passo, o.fmtEixo);
  const n = o.rotulos.length;
  const slot = (px1 - px0) / n;
  const grupoW = slot * (n > 20 ? 0.74 : 0.62);
  const ng = o.grupos.length;
  const folga = ng > 1 ? Math.min(0.4, slot * 0.04) : 0;
  const bw = (grupoW - folga * (ng - 1)) / ng;
  const r = Math.min(0.9, bw / 2);
  for (let i = 0; i < n; i++) {
    const x0 = px0 + i * slot + (slot - grupoW) / 2;
    o.grupos.forEach((g, k) => {
      const v = g.valores[i];
      if (v === null || v === undefined) return;
      const yv = Y(Math.max(v, lo));
      const yb = Y(Math.max(lo, 0));
      const h = Math.max(yb - yv, 0.35);
      const xb = x0 + k * (bw + folga);
      doc.setFillColor(...(g.corDe ? g.corDe(v, i) : g.cor));
      if (h > r * 2) {
        doc.roundedRect(xb, yb - h, bw, h, r, r, 'F');
        doc.rect(xb, yb - r, bw, r, 'F');
      } else doc.rect(xb, yb - h, bw, h, 'F');
    });
    const meta = o.metas?.[i];
    if (meta !== null && meta !== undefined) {
      doc.setDrawColor(...C.tinta);
      doc.setLineWidth(0.45);
      doc.line(x0 - 0.3, Y(meta), x0 + grupoW + 0.3, Y(meta));
    }
  }
  if (o.ref) {
    doc.setDrawColor(...C.tinta2);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.2, 1], 0);
    doc.line(px0, Y(o.ref.valor), px1, Y(o.ref.valor));
    doc.setLineDashPattern([], 0);
  }
  // Rótulos das semanas (S1, S5…), espaçados
  const cada = Math.max(1, Math.ceil(9 / slot));
  for (let i = 0; i < n; i += cada) escrever(doc, o.rotulos[i], px0 + i * slot + slot / 2, py1 + 4.2, { tam: 7, cor: C.mudo, alinhar: 'center' });
  doc.setDrawColor(...C.linha);
  doc.setLineWidth(0.25);
  doc.line(px0, Y(Math.max(lo, 0)), px1, Y(Math.max(lo, 0)));
  return o.alt;
}

// ---------- Anéis de adesão ----------

function anel(doc: jsPDF, cx: number, cy: number, rFora: number, rDentro: number, fracao: number | null, cor: Cor) {
  const esp = rFora - rDentro;
  const rm = (rFora + rDentro) / 2;
  doc.setDrawColor(...clara(cor, 0.85));
  doc.setLineWidth(esp);
  doc.circle(cx, cy, rm, 'S');
  if (fracao === null || fracao <= 0) return;
  const f = Math.min(fracao, 1);
  const a0 = -Math.PI / 2;
  const a1 = a0 + f * Math.PI * 2;
  const passos = Math.max(Math.ceil((f * 360) / 4), 2);
  const pts: [number, number][] = [];
  for (let i = 0; i <= passos; i++) {
    const a = a0 + ((a1 - a0) * i) / passos;
    pts.push([cx + Math.cos(a) * rFora, cy + Math.sin(a) * rFora]);
  }
  for (let i = passos; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / passos;
    pts.push([cx + Math.cos(a) * rDentro, cy + Math.sin(a) * rDentro]);
  }
  const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  doc.setFillColor(...cor);
  doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], 'F', true);
  // Pontas arredondadas
  doc.circle(cx + Math.cos(a0) * rm, cy + Math.sin(a0) * rm, esp / 2, 'F');
  doc.circle(cx + Math.cos(a1) * rm, cy + Math.sin(a1) * rm, esp / 2, 'F');
}

// ---------- Capa ----------

function capa(c: Ctx) {
  const { doc, r } = c;
  const par = c.imagens && r.fotos.capa ? r.fotos.capa : null;
  const altBanda = par ? 86 : 92;
  gradienteDiagonal(doc, 0, 0, L, altBanda, [hex('#1e1b4b'), hex('#3730a3'), hex('#6d28d9'), hex('#a21caf'), hex('#db2777')]);
  // Círculos de enfeite, bem discretos
  doc.setFillColor(...BRANCO);
  comOpacidade(doc, 0.07, () => {
    doc.circle(186, 12, 40, 'F');
    doc.circle(206, 78, 24, 'F');
    doc.circle(122, altBanda + 6, 16, 'F');
  });
  comOpacidade(doc, 0.05, () => doc.circle(150, 40, 9, 'F'));

  escrever(doc, `RELATÓRIO FINAL · ${(r.remedio.nome || 'ciclo').toUpperCase()}`, M, 16, { tam: 7.5, negrito: true, cor: hex('#c7d2fe'), esp: 0.6 });
  escrever(doc, 'Relatório final do ciclo', M, 30, { tam: 27, negrito: true, cor: BRANCO });
  let y = 30;
  if (r.pessoa.nome) {
    escrever(doc, r.pessoa.nome, M, 40.5, { tam: 14, cor: BRANCO });
    y = 40.5;
  }
  const extras = [r.pessoa.idade !== null ? `${r.pessoa.idade} anos` : null, r.pessoa.altura_cm ? `${num(r.pessoa.altura_cm, 0)} cm` : null].filter(Boolean).join(' · ');
  escrever(doc, `${r.periodo.texto} · ${r.periodo.dias} ${r.periodo.dias === 1 ? 'dia' : 'dias'} (${num(r.periodo.semanas, 1)} semanas)${extras ? ` · ${extras}` : ''}`, M, y + 7, { tam: 9.5, cor: hex('#e0e7ff') });
  // Estado: concluído (verde) ou prévia (âmbar)
  const concluido = r.estado === 'concluido';
  const yp = y + 11.5;
  const wp = pilula(doc, concluido ? 'Ciclo concluído' : 'Prévia — ciclo em andamento', M, yp, concluido ? hex('#22c55e') : hex('#fbbf24'), concluido ? hex('#052e16') : hex('#451a03'), 8.5);
  if (concluido) marcaOk(doc, M + wp + 4, yp + 2.8, 3.4, BRANCO);
  y = yp + 8;

  if (!par) {
    // Sem fotos: a frase-resumo vai na própria faixa
    escrever(doc, r.resumo_texto, M, y + 9, { tam: 10.5, cor: BRANCO, largura: LW - 20, maxLinhas: 4 });
    y = altBanda + 8;
  } else {
    // Antes | Depois, com moldura branca e sombra suave, saindo da faixa
    const h = 94;
    const w = (h * 3) / 4;
    const vao = 12;
    const x0 = (L - (w * 2 + vao)) / 2;
    const y0 = 60;
    for (const [i, lado] of (['antes', 'depois'] as const).entries()) {
      const x = x0 + i * (w + vao);
      const id = lado === 'antes' ? par.id_antes : par.id_depois;
      comOpacidade(doc, 0.16, () => caixa(doc, x - 1.6 + 0.8, y0 - 1.6 + 1.6, w + 3.2, h + 3.2, hex('#1e1b4b'), 4));
      caixa(doc, x - 1.6, y0 - 1.6, w + 3.2, h + 3.2, BRANCO, 4);
      desenharFoto(doc, c.imagens!.get(id), id, x, y0, w, h, 3);
      const data = curta(lado === 'antes' ? par.data_antes : par.data_depois);
      const rot = `${lado === 'antes' ? 'ANTES' : 'DEPOIS'}  ${data}`;
      comOpacidade(doc, 0.72, () => caixa(doc, x + 2.5, y0 + h - 8.5, largura(doc, rot, { tam: 7.5, negrito: true }) + 5, 6, hex('#111827'), 3));
      escrever(doc, rot, x + 5, y0 + h - 4.4, { tam: 7.5, negrito: true, cor: BRANCO });
    }
    // Seta no meio
    const cx = L / 2;
    const cy = y0 + h / 2;
    doc.setFillColor(...BRANCO);
    doc.circle(cx, cy, 4.6, 'F');
    doc.setFillColor(...C.violeta);
    doc.circle(cx, cy, 3.8, 'F');
    doc.setDrawColor(...BRANCO);
    doc.setLineWidth(0.7);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.lines(
      [
        [1.3, 1.4],
        [-1.3, 1.4],
      ],
      cx - 0.5,
      cy - 1.4,
      [1, 1],
      'S',
      false,
    );
    doc.setLineCap('butt');
    if (par.chave !== 'frente')
      escrever(doc, par.chave === 'geral' ? 'Primeira do Antes × mais recente do Depois' : par.rotulo, L / 2, y0 + h + 6, { tam: 7.5, cor: C.mudo, alinhar: 'center' });
    y = y0 + h + 9;
  }

  // Peso em destaque
  const p = r.numeros.peso;
  const hHero = 27;
  caixa(doc, M, y, LW, hHero, clara(C.indigo, 0.93), 3);
  cortar(doc, M, y, LW, hHero, 3, () => gradienteH(doc, M, y, 2, hHero, [C.indigo, C.rosa], 20));
  escrever(doc, 'PESO', M + 6, y + 7, { tam: 7.5, negrito: true, cor: escura(C.indigo, 0.25), esp: 0.4 });
  escrever(doc, valorVariacao(p), M + 6, y + 20.5, { tam: 28, negrito: true, cor: corTom(p.tom) });
  const xd = M + LW - 5;
  escrever(doc, p.delta !== null ? `${p.texto_inicio} → ${p.texto_fim}` : p.inicio !== null ? 'Sem nova pesagem' : 'Sem pesagem', xd, y + 10.5, { tam: 11, negrito: true, cor: C.tinta2, alinhar: 'right' });
  const subPeso = [
    p.delta_pct !== null ? `${sinal(p.delta_pct * 100, 1, '%')} do peso inicial` : null,
    r.ritmo_medio && r.ritmo_medio.faixa !== 'ganho' ? `ritmo médio ${sinal(r.ritmo_medio.kg_semana, 2, ' kg')}/sem.` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (subPeso) escrever(doc, subPeso, xd, y + 16.5, { tam: 8.5, cor: C.mudo, alinhar: 'right' });
  if (p.data_inicio) escrever(doc, `${curta(p.data_inicio)}${p.data_fim && p.delta !== null ? ` a ${curta(p.data_fim)}` : ''}`, xd, y + 22, { tam: 7.5, cor: C.mudo, alinhar: 'right' });
  y += hHero + 4;

  // Ladrilhos
  const n = r.numeros;
  const mm = r.massa_magra;
  const w3 = (LW - 8) / 3;
  const h3 = par ? 24 : 26;
  const tiles: [Cor, string, string, string | null, Cor][] = [
    [C.ciano, 'Cintura', valorVariacao(n.cintura), subVariacao(n.cintura), corTom(n.cintura.tom)],
    [C.rosa, '% de gordura', valorVariacao(n.bf), subVariacao(n.bf), corTom(n.bf.tom)],
    mm.preservada
      ? [C.azul, 'Massa magra', 'Preservada', `${n.massa_magra.texto_delta} (dentro do erro da fita)`, C.bom]
      : [C.azul, 'Massa magra', valorVariacao(n.massa_magra), subVariacao(n.massa_magra), corTom(n.massa_magra.tom)],
    [C.laranja, 'Massa gorda', valorVariacao(n.massa_gorda), subVariacao(n.massa_gorda), corTom(n.massa_gorda.tom)],
    [C.violeta, 'Duração', `${r.periodo.dias} dias`, `${num(r.periodo.semanas, 1)} semanas`, C.tinta],
    [
      C.indigo,
      'Aplicações',
      String(r.remedio.aplicacoes),
      r.remedio.dose_inicial !== null ? `${num(r.remedio.dose_inicial)} → ${num(r.remedio.dose_final)} mg · ${num(r.remedio.total_mg)} mg no total` : 'nenhuma ainda',
      C.tinta,
    ],
  ];
  if (n.quadril) tiles.splice(2, 0, [C.violeta, 'Quadril', valorVariacao(n.quadril), subVariacao(n.quadril), corTom(n.quadril.tom)]);
  // Com o quadril (perfil feminino) são 7: a duração sai da grade e fica no texto da capa
  const lista = tiles.length > 6 ? tiles.filter((x) => x[1] !== 'Duração') : tiles;
  lista.forEach(([cor, rot, val, sub, corV], i) => ladrilho(doc, M + (i % 3) * (w3 + 4), y + Math.floor(i / 3) * (h3 + 4), w3, h3, cor, rot, val, sub, corV));
  y += Math.ceil(lista.length / 3) * (h3 + 4);

  if (r.textos.aviso_previa) {
    const hA = alturaTexto(doc, r.textos.aviso_previa, { tam: 8.5, largura: LW - 12 }) + 5;
    caixa(doc, M, y, LW, hA, hex('#fef3c7'), 2.4);
    caixa(doc, M, y, 1.4, hA, C.ambar, 0);
    escrever(doc, r.textos.aviso_previa, M + 6, y + 5, { tam: 8.5, cor: hex('#78350f'), largura: LW - 12 });
    y += hA + 4;
  }
  if (par) {
    const h = alturaTexto(doc, r.resumo_texto, { tam: 9.5, largura: LW });
    if (y + h < FIM) escrever(doc, r.resumo_texto, M, y + 4, { tam: 9.5, cor: C.tinta2, largura: LW });
  } else if (r.series.peso.length && FIM - y >= 52) {
    // Sem fotos: a jornada do peso, com as doses embaixo
    const de = [r.periodo.inicio, r.series.peso[0].data].sort()[0];
    const alt = Math.min(FIM - y - 20, 74);
    graficoTempo(doc, M, y + 2, LW, {
      titulo: 'A jornada: peso (kg) e dose',
      series: [{ pontos: r.series.peso, cor: C.indigo, rotulo: 'Peso', area: true, fmt: (v) => `${num(v, 1)} kg` }],
      de,
      ate: r.periodo.fim,
      fases: r.fases,
      alt,
      vazio: '',
    });
    faixaDoses(doc, r.fases, M, y + 4 + alt, LW, 10, de, r.periodo.fim);
  }
}

// ---------- Resumo ----------

function resumo(c: Ctx) {
  const { doc, r } = c;
  secao(c, 'Resumo do ciclo', 'O ciclo em números: do início ao fim, pelas medições com fita em jejum.', C.indigo);
  c.y += escrever(doc, r.resumo_texto, M, c.y + 4.5, { tam: 12, cor: C.tinta, largura: LW }) + 3;

  // Início × fim
  const n = r.numeros;
  const lista = [n.peso, n.cintura, n.bf, n.massa_gorda, n.massa_magra, ...(n.quadril ? [n.quadril] : []), n.pescoco];
  const cores: Record<string, Cor> = { peso_kg: C.indigo, cintura_cm: C.ciano, bf: C.rosa, massa_gorda_kg: C.laranja, massa_magra_kg: C.azul, quadril_cm: C.violeta, pescoco_cm: C.mudo };
  const col = [M, M + 50, M + 92, M + 134];
  const hl = 7.6;
  espaco(c, hl * (lista.length + 1) + 6);
  let y = c.y;
  caixa(doc, M, y, LW, hl, C.fundo, 1.6);
  ['Medida', 'Início', 'Fim', 'Variação'].forEach((h, i) => escrever(doc, h.toUpperCase(), col[i] + 3, y + 5, { tam: 7, negrito: true, cor: C.mudo, esp: 0.3 }));
  y += hl;
  for (const v of lista) {
    doc.setFillColor(...cores[v.chave]);
    doc.circle(col[0] + 4, y + hl / 2, 1.2, 'F');
    escrever(doc, v.rotulo, col[0] + 7, y + 5, { tam: 9, negrito: true });
    escrever(doc, v.inicio === null ? '–' : v.texto_inicio, col[1] + 3, y + 5, { tam: 9, cor: C.tinta2 });
    if (v.data_inicio) escrever(doc, curta(v.data_inicio), col[1] + 3 + largura(doc, v.texto_inicio, { tam: 9 }) + 2, y + 5, { tam: 7, cor: C.mudo });
    const fimTxt = v.delta === null ? '–' : v.texto_fim;
    escrever(doc, fimTxt, col[2] + 3, y + 5, { tam: 9, cor: C.tinta2 });
    if (v.delta !== null && v.data_fim) escrever(doc, curta(v.data_fim), col[2] + 3 + largura(doc, fimTxt, { tam: 9 }) + 2, y + 5, { tam: 7, cor: C.mudo });
    if (v.delta !== null) {
      const tom = v.tom;
      pilula(doc, v.texto_delta, col[3] + 3, y + 1.4, tom === 'bom' ? clara(C.bom, 0.86) : tom === 'ruim' ? clara(C.ruim, 0.86) : C.fundo, corTom(tom), 8);
    } else escrever(doc, '–', col[3] + 3, y + 5, { tam: 9, cor: C.mudo });
    doc.setDrawColor(...C.linha);
    doc.setLineWidth(0.2);
    doc.line(M, y + hl, M + LW, y + hl);
    y += hl;
  }
  c.y = y + 2;
  nota(c, 'Variação colorida só quando passa do erro da fita ou da balança (mínima mudança detectável); abaixo disso fica neutra.');
  c.y += 3;

  // Três cartões: ritmo, de onde veio a perda, massa magra
  const w3 = (LW - 8) / 3;
  const h3 = 36;
  espaco(c, h3 + 4);
  y = c.y;
  const cartao = (i: number, cor: Cor, rotulo: string) => {
    const x = M + i * (w3 + 4);
    caixa(doc, x, y, w3, h3, clara(cor, 0.92), 2.6);
    escrever(doc, rotulo.toUpperCase(), x + 4, y + 6, { tam: 7, negrito: true, cor: escura(cor, 0.3), esp: 0.3 });
    return x + 4;
  };
  let x = cartao(0, C.indigo, 'Ritmo médio');
  const rm = r.ritmo_medio;
  if (rm) {
    escrever(doc, `${num(rm.pct, 2)}%`, x, y + 16, { tam: 18, negrito: true });
    escrever(doc, `do peso por semana (${sinal(rm.kg_semana, 2, ' kg')}/sem.)`, x, y + 22, { tam: 7.5, cor: C.tinta2, largura: w3 - 8 });
    escrever(doc, `${r.periodo.dias} dias, do início ao fim`, x, y + 31, { tam: 7.5, cor: C.mudo, largura: w3 - 8 });
  } else escrever(doc, 'Aparece com duas pesagens em dias diferentes.', x, y + 14, { tam: 8, cor: C.mudo, largura: w3 - 8 });

  x = cartao(1, C.laranja, 'De onde veio a perda');
  const q = r.qualidade;
  if (q && !q.sem_perda) {
    const g = Math.min(Math.max(q.gordura, 0), 1);
    escrever(doc, `${Math.round(g * 100)}% gordura`, x, y + 16, { tam: 15, negrito: true });
    const bw = w3 - 8;
    caixa(doc, x, y + 19.5, bw, 3.6, C.azul, 1.8);
    if (g > 0) caixa(doc, x, y + 19.5, Math.max(bw * g, 3.6), 3.6, C.laranja, 1.8);
    escrever(doc, q.texto, x, y + 27.5, { tam: 7.5, cor: C.tinta2, largura: bw, maxLinhas: 1 });
    escrever(doc, `Pela tendência de ${q.medicoes} medições`, x, y + 31.5, { tam: 7.5, cor: C.mudo, largura: bw, maxLinhas: 1 });
  } else escrever(doc, q ? q.texto : 'Aparece com 3 medições em pelo menos 2 semanas.', x, y + 14, { tam: 8, cor: C.mudo, largura: w3 - 8 });

  x = cartao(2, C.azul, 'Massa magra');
  const mm = r.massa_magra;
  escrever(doc, mm.preservada === null ? '–' : mm.preservada ? 'Preservada' : r.numeros.massa_magra.texto_delta, x, y + 16, { tam: 15, negrito: true, cor: mm.preservada ? C.bom : corTom(r.numeros.massa_magra.tom) });
  escrever(doc, mm.texto, x, y + 22, { tam: 7.5, cor: C.tinta2, largura: w3 - 8, maxLinhas: 3 });
  c.y = y + h3 + 6;

  // Tudo o que foi registrado
  const g = r.registros;
  const itens: [string, number | null, Cor][] = [
    ['dias de Diário', g.dias_diario, C.verde],
    ['pesagens', g.pesagens, C.indigo],
    ['medições', g.medicoes, C.ciano],
    ['aplicações', g.aplicacoes, C.violeta],
    ['dias de treino', g.dias_treino, C.rosa],
    ['fotos', g.fotos, C.laranja],
    ['decisões', g.decisoes, C.azul],
  ];
  const visiveis = itens.filter(([, v]) => v !== null) as [string, number, Cor][];
  subtitulo(c, 'Tudo o que você registrou', C.verde, 16);
  const wi = (LW - (visiveis.length - 1) * 3) / visiveis.length;
  visiveis.forEach(([rot, v, cor], i) => {
    const xi = M + i * (wi + 3);
    caixa(doc, xi, c.y, wi, 15, clara(cor, 0.9), 2.4);
    escrever(doc, String(v), xi + wi / 2, c.y + 7.5, { tam: 14, negrito: true, cor: escura(cor, 0.25), alinhar: 'center' });
    escrever(doc, rot, xi + wi / 2, c.y + 12, { tam: 7, cor: C.tinta2, alinhar: 'center' });
  });
  c.y += 15 + (g.atipicas ? 1 : 3);
  if (g.atipicas) nota(c, `${g.atipicas} ${g.atipicas === 1 ? 'medição marcada' : 'medições marcadas'} como atípica${g.atipicas === 1 ? '' : 's'}: fica${g.atipicas === 1 ? '' : 'm'} fora das comparações e aparece${g.atipicas === 1 ? '' : 'm'} como ponto vazio nos gráficos.`);

  // Destaques
  subtitulo(c, 'Destaques', C.indigo, 12);
  if (!r.destaques.length) nota(c, 'Os destaques aparecem com medições e registros no Diário. Variações menores que o erro da fita não entram.', 8.5);
  for (const d of r.destaques) {
    const h = alturaTexto(doc, d.texto, { tam: 9, largura: LW - 10 });
    espaco(c, h + 3);
    const cor = d.tom === 'bom' ? C.bom : d.tom === 'atencao' ? C.ambar : C.azul;
    doc.setFillColor(...cor);
    doc.circle(M + 2.6, c.y + 2.2, 2.4, 'F');
    if (d.tom === 'bom') marcaOk(doc, M + 2.6, c.y + 2.2, 2.6, BRANCO);
    else escrever(doc, d.tom === 'atencao' ? '!' : 'i', M + 2.6, c.y + 3.3, { tam: 8, negrito: true, cor: BRANCO, alinhar: 'center' });
    escrever(doc, d.texto, M + 8, c.y + 3.3, { tam: 9, largura: LW - 10 });
    c.y += Math.max(h, 4.6) + 2.4;
  }
  c.y += 2;
  nota(c, r.textos.medicao);
  if (r.pos_remedio) nota(c, r.pos_remedio.texto);
}

// ---------- Corpo ----------

function corpo(c: Ctx) {
  const { doc, r } = c;
  const s = r.series;
  const temMedida = r.numeros.cintura.inicio !== null || r.numeros.peso.inicio !== null;
  secao(
    c,
    'Corpo',
    temMedida
      ? 'Peso, medidas e composição ao longo do ciclo. Faixas coloridas ao fundo: blocos de dose (as mesmas cores da faixa de doses e das fases).'
      : 'Nenhuma medição no período: os gráficos aparecem com as medidas registradas.',
    C.azul,
  );
  const de = [r.periodo.inicio, s.peso[0]?.data, s.cintura[0]?.data].filter((d): d is string => !!d).sort()[0];
  const ate = r.periodo.fim;
  const fmt1 = (suf: string) => (v: number) => `${num(v, 1)}${suf}`;
  const kgEixo = (v: number, p: number) => num(v, casasPasso(p));

  // Perfil feminino: um gráfico a mais (quadril); tudo um pouco mais baixo para caber na página
  const fem = r.pessoa.feminino;
  const altPeso = fem ? 54 : 64;
  const altM = fem ? 44 : 50;

  // Peso + doses
  espaco(c, altPeso + 22);
  c.y += graficoTempo(doc, M, c.y, LW, {
    titulo: 'Peso (kg)',
    series: [{ pontos: s.peso, cor: C.indigo, rotulo: 'Peso', area: true, fmt: fmt1(' kg') }],
    de,
    ate,
    fases: r.fases,
    alt: altPeso,
    vazio: 'Sem pesagens no período.',
    fmtEixo: kgEixo,
  });
  c.y += 2;
  c.y += faixaDoses(doc, r.fases, M, c.y, LW, 11, de, ate) + 3;
  if (r.fases.length) {
    escrever(doc, 'Dose aplicada em cada bloco (mg), no mesmo eixo de datas do peso.', M + 11, c.y + 1.5, { tam: 7, cor: C.mudo });
    c.y += 5;
  }

  // Metades
  const wm = (LW - 8) / 2;
  const par = (a: OpTempo, b: OpTempo | null) => {
    espaco(c, altM + 4);
    graficoTempo(doc, M, c.y, wm, a);
    if (b) graficoTempo(doc, M + wm + 8, c.y, wm, b);
    c.y += altM + 4;
  };
  const vaz = 'Aparece com as medições de fita.';
  const op = (titulo: string, pontos: PontoRelatorio[], cor: Cor, suf: string): OpTempo => ({ titulo, series: [{ pontos, cor, rotulo: titulo, fmt: fmt1(suf) }], de, ate, fases: r.fases, alt: altM, vazio: vaz });
  par(op('Cintura (cm)', s.cintura, C.ciano, ' cm'), op('% de gordura', s.bf, C.rosa, '%'));
  par(op('Massa magra (kg)', s.massa_magra, C.azul, ' kg'), op('Massa gorda (kg)', s.massa_gorda, C.laranja, ' kg'));
  const linhas = temMedida
    ? [r.massa_magra.texto, r.qualidade && !r.qualidade.sem_perda ? `De onde veio a perda (${r.qualidade.medicoes} medições): ${r.qualidade.texto}.` : null].filter((x): x is string => !!x)
    : [];
  if (fem) {
    // Quadril à esquerda; as leituras da composição à direita
    espaco(c, altM + 4);
    graficoTempo(doc, M, c.y, wm, op('Quadril (cm)', s.quadril, C.violeta, ' cm'));
    if (linhas.length) {
      const x = M + wm + 8;
      caixa(doc, x, c.y + 8, wm, altM - 10, clara(C.azul, 0.93), 2.6);
      escrever(doc, 'COMPOSIÇÃO', x + 4, c.y + 14, { tam: 7, negrito: true, cor: escura(C.azul, 0.3), esp: 0.3 });
      let yy = c.y + 19.5;
      for (const l of linhas) yy += escrever(doc, l, x + 4, yy, { tam: 8.5, cor: C.tinta2, largura: wm - 8 }) + 2;
    }
    c.y += altM + 4;
  } else for (const l of linhas) nota(c, l, 8);
  nota(c, `${r.textos.medicao} Ponto vazio: medição atípica (fora da linha).`);
}

// ---------- Fases ----------

function textoSintomas(f: FaseRelatorio): string {
  const partes = [
    f.vomito !== null && f.vomito > 0 ? `vômito ${pct(f.vomito, 0)}` : null,
    f.diarreia !== null && f.diarreia > 0 ? `diarreia ${pct(f.diarreia, 0)}` : null,
    f.intestino_preso !== null && f.intestino_preso > 0 ? `int. preso ${pct(f.intestino_preso, 0)}` : null,
  ].filter(Boolean);
  if (partes.length) return `${partes.join(' · ')} dos dias`;
  return f.vomito === null && f.diarreia === null && f.intestino_preso === null ? '–' : 'nenhum marcado';
}

function degraus(c: Ctx) {
  const { doc, r } = c;
  const fases = r.fases;
  const alt = 30;
  espaco(c, alt + 12);
  const y = c.y;
  const totalDias = fases.reduce((s, f) => s + f.dias, 0) || 1;
  const max = Math.max(...fases.map((f) => f.dose_mg));
  const vao = 1;
  const util = LW - vao * (fases.length - 1);
  let x = M;
  fases.forEach((f, i) => {
    const w = Math.max((f.dias / totalDias) * util, 2);
    const h = Math.max((f.dose_mg / max) * alt, 7);
    const cor = corFase(i);
    caixa(doc, x, y + alt - h, w, h, cor, 1.4);
    doc.setFillColor(...cor);
    doc.rect(x, y + alt - 1.4, w, 1.4, 'F');
    const rot = num(f.dose_mg);
    if (w >= largura(doc, rot, { tam: 9, negrito: true }) + 2) escrever(doc, rot, x + w / 2, y + alt - h + 5, { tam: 9, negrito: true, cor: BRANCO, alinhar: 'center' });
    const sub = `${f.doses} ${f.doses === 1 ? 'dose' : 'doses'}`;
    if (w >= largura(doc, sub, { tam: 7 }) + 1.5 && h >= 12) escrever(doc, sub, x + w / 2, y + alt - h + 9, { tam: 7, cor: BRANCO, alinhar: 'center' });
    x += w + vao;
  });
  escrever(doc, curta(fases[0].inicio), M, y + alt + 4.5, { tam: 7, cor: C.mudo });
  escrever(doc, 'mg por bloco de doses (largura = dias do bloco)', L / 2, y + alt + 4.5, { tam: 7, cor: C.mudo, alinhar: 'center' });
  escrever(doc, curta(fases[fases.length - 1].fim), M + LW, y + alt + 4.5, { tam: 7, cor: C.mudo, alinhar: 'right' });
  c.y = y + alt + 9;
}

/** Altura do cartão de um bloco: cabeçalho, datas, a grade de números (2 por linha) e os sintomas. */
/** Altura de cada linha de números no cartão do bloco */
const LINHA_FASE = 7.6;
const alturaCartaoFase = (comTreino: boolean) => 17 + Math.ceil((comTreino ? 7 : 6) / 2) * LINHA_FASE + LINHA_FASE + 1;

function cartaoFase(doc: jsPDF, f: FaseRelatorio, i: number, x: number, y: number, w: number, comTreino: boolean): number {
  const cor = corFase(i);
  const itens: [string, string, Cor][] = [
    ['Doses', `${f.doses} × ${num(f.dose_mg)} mg`, C.tinta],
    ['Peso', f.variacao_kg === null ? '–' : sinal(f.variacao_kg, 1, ' kg'), corTom(corVariacao(f.variacao_kg, true, MDC.peso_kg))],
    ['Ritmo', f.kg_por_semana === null ? 'poucos dados' : `${sinal(f.kg_por_semana, 2, ' kg')}/sem.`, C.tinta],
    ['Cintura', f.cintura_cm === null ? '–' : sinal(f.cintura_cm, 1, ' cm'), corTom(corVariacao(f.cintura_cm, true, MDC.cintura_cm))],
    ['Náusea', f.nausea_media === null ? '–' : `média ${num(f.nausea_media, 1)} · máx. ${f.nausea_max ?? '–'}`, C.tinta],
    ['Sono', f.sono_medio === null ? '–' : `${num(f.sono_medio, 1)} h por noite`, C.tinta],
    ...(comTreino ? ([['Treino', f.treino === null ? '–' : `${pct(f.treino, 0)} · cardio ${f.cardio === null ? '–' : pct(f.cardio, 0)}`, C.tinta]] as [string, string, Cor][]) : []),
  ];
  const h = alturaCartaoFase(comTreino);
  caixa(doc, x, y, w, h, clara(cor, 0.93), 2.6);
  cortar(doc, x, y, w, h, 2.6, () => caixa(doc, x, y, w, 9.5, cor, 0));
  // Cabeçalho: dose, nome do bloco e os dias
  const dose = `${num(f.dose_mg)} mg`;
  const wDose = largura(doc, dose, { tam: 10, negrito: true });
  const dias = `${f.dias} dias`;
  const wDias = largura(doc, dias, { tam: 8, negrito: true });
  escrever(doc, dose, x + 4, y + 6.4, { tam: 10, negrito: true, cor: BRANCO });
  escrever(doc, dias, x + w - 4, y + 6.3, { tam: 8, negrito: true, cor: BRANCO, alinhar: 'right' });
  const nome = `${f.nome}${f.fase_indice === null ? '' : ` · fase ${f.fase_indice + 1}`}`;
  escrever(doc, nome, x + 4 + wDose + 2.5, y + 6.3, { tam: 8, cor: BRANCO, largura: w - 8 - wDose - 2.5 - wDias - 3, maxLinhas: 1 });
  escrever(doc, `${formatarData(f.inicio)} a ${formatarData(f.fim)}${f.em_andamento ? ' · em andamento' : ''}`, x + 4, y + 13.6, { tam: 7.5, cor: C.tinta2 });
  const cw = (w - 8) / 2;
  const y0 = y + 16;
  itens.forEach(([k, v, corV], j) => {
    const cx = x + 4 + (j % 2) * cw;
    const cy = y0 + Math.floor(j / 2) * LINHA_FASE;
    escrever(doc, k.toUpperCase(), cx, cy + 2.4, { tam: 7, negrito: true, cor: escura(cor, 0.35), esp: 0.2 });
    escrever(doc, v, cx, cy + 5.8, { tam: 8, negrito: corV !== C.tinta, cor: corV, largura: cw - 2, maxLinhas: 1 });
  });
  // Sintomas na largura toda (o texto é o mais longo)
  const ys = y0 + Math.ceil(itens.length / 2) * LINHA_FASE;
  escrever(doc, 'SINTOMAS', x + 4, ys + 2.4, { tam: 7, negrito: true, cor: escura(cor, 0.35), esp: 0.2 });
  escrever(doc, textoSintomas(f), x + 4, ys + 5.8, { tam: 8, largura: w - 8, maxLinhas: 1 });
  return h;
}

function fases(c: Ctx) {
  const { doc, r } = c;
  secao(c, 'Fases e decisões', `${r.fases.length} ${r.fases.length === 1 ? 'bloco' : 'blocos'} de dose · ${r.remedio.aplicacoes} ${r.remedio.aplicacoes === 1 ? 'aplicação' : 'aplicações'} · ${num(r.remedio.total_mg)} mg no total`, C.indigo);
  if (!r.fases.length) {
    nota(c, 'Os blocos de dose aparecem a partir da primeira aplicação.', 8.5);
    return;
  }
  degraus(c);
  nota(c, 'Peso e cintura: variação do início ao fim de cada bloco. Ritmo: tendência das pesagens do bloco. Náusea de 0 a 3. Sintomas: parte dos dias registrados com o sintoma marcado.');
  c.y += 2;
  const w = (LW - 6) / 2;
  const alt = alturaCartaoFase(r.pessoa.com_treino);
  for (let i = 0; i < r.fases.length; i += 2) {
    espaco(c, alt + 4);
    cartaoFase(doc, r.fases[i], i, M, c.y, w, r.pessoa.com_treino);
    if (r.fases[i + 1]) cartaoFase(doc, r.fases[i + 1], i + 1, M + w + 6, c.y, w, r.pessoa.com_treino);
    c.y += alt + 4;
  }
}

function nausea(c: Ctx) {
  const { doc, r } = c;
  const cols = r.nausea.colunas;
  const fs = r.fases.filter((f) => f.nausea_por_dia.some((v) => v !== null));
  secao(c, 'Náusea depois da dose', 'Média de 0 a 3 em cada dia depois da aplicação (D0 = dia da dose), em cada bloco.', C.laranja, false);
  if (!fs.length || !cols.length) {
    nota(c, 'Sem náusea anotada no Diário.', 8.5);
    return;
  }
  const escala = [hex('#fff7ed'), hex('#fed7aa'), hex('#fb923c'), hex('#c2410c'), hex('#7c2d12')];
  const rotW = 34;
  const cw = (LW - rotW) / cols.length;
  const ch = 8;
  espaco(c, 7 + Math.min(fs.length, 4) * (ch + 1));
  let y = c.y;
  cols.forEach((col, j) => escrever(doc, col, M + rotW + j * cw + cw / 2, y + 3.5, { tam: 7.5, negrito: true, cor: C.mudo, alinhar: 'center' }));
  y += 5.5;
  for (const f of fs) {
    const i = r.fases.indexOf(f);
    if (y + ch > FIM) {
      novaPagina(c);
      y = c.y;
    }
    doc.setFillColor(...corFase(i));
    doc.circle(M + 1.6, y + ch / 2, 1.4, 'F');
    escrever(doc, `${num(f.dose_mg)} mg`, M + 4.6, y + ch / 2 + 0.4, { tam: 8.5, negrito: true });
    escrever(doc, f.nome, M + 4.6, y + ch / 2 + 3.6, { tam: 7, cor: C.mudo, largura: rotW - 6, maxLinhas: 1 });
    f.nausea_por_dia.forEach((v, j) => {
      const x = M + rotW + j * cw + 0.5;
      if (v === null) {
        caixa(doc, x, y, cw - 1, ch, C.fundo, 1.2);
        escrever(doc, '–', x + (cw - 1) / 2, y + ch / 2 + 1.2, { tam: 7.5, cor: C.mudo, alinhar: 'center' });
        return;
      }
      const cor = corNaEscala(escala, v / 3);
      caixa(doc, x, y, cw - 1, ch, cor, 1.2);
      escrever(doc, num(v, 1), x + (cw - 1) / 2, y + ch / 2 + 1.2, { tam: 7.5, negrito: true, cor: v / 3 > 0.45 ? BRANCO : C.tinta, alinhar: 'center' });
    });
    y += ch + 1;
  }
  c.y = y + 2;
  // Legenda da escala
  espaco(c, 9);
  escrever(doc, '0 sem náusea', M + rotW, c.y + 3.2, { tam: 7, cor: C.mudo });
  const xg = M + rotW + 18;
  cortar(doc, xg, c.y + 0.8, 50, 3, 1.5, () => gradienteH(doc, xg, c.y + 0.8, 50, 3, escala, 40));
  escrever(doc, '3 forte', xg + 52, c.y + 3.2, { tam: 7, cor: C.mudo });
  if (r.nausea.pico) escrever(doc, `Maior média: ${r.nausea.pico.rotulo} (${num(r.nausea.pico.media, 1)} de 3)`, M + LW, c.y + 3.2, { tam: 7.5, negrito: true, cor: escura(C.laranja, 0.3), alinhar: 'right' });
  c.y += 7;
}

const COR_EVENTO: Record<EventoRelatorio['tipo'], Cor> = { inicio: C.verde, fase: C.indigo, decisao_fase: hex('#475569'), anotacao: C.ambar, registro: C.azul, fim: C.tinta };
const ROTULO_EVENTO: Record<EventoRelatorio['tipo'], string> = { inicio: 'Início', fase: 'Dose', decisao_fase: 'Fim de fase', anotacao: 'Anotação', registro: 'Registro', fim: 'Fim' };

function linhaDoTempo(c: Ctx) {
  const { doc, r } = c;
  const xl = M + 21;
  const xt = xl + 5;
  const wt = LW - (xt - M);
  const alturas = r.linha_do_tempo.map((ev) => 4.6 + (ev.detalhe ? alturaTexto(doc, ev.detalhe, { tam: 8, largura: wt }) : 0) + 2.2);
  const total = 24 + alturas.reduce((a, b) => a + b, 0);
  secao(c, 'Linha do tempo', 'Início, trocas de dose e as decisões registradas, em ordem.', C.violeta, inteiraNaPagina(c, total));
  if (!r.linha_do_tempo.length) {
    nota(c, 'A linha do tempo começa na primeira aplicação.', 8.5);
    return;
  }
  r.linha_do_tempo.forEach((ev, k) => {
    const detalhe = ev.detalhe ?? '';
    const h = alturas[k];
    espaco(c, h);
    const y = c.y;
    // Início e trocas de dose: ponto cheio na cor do bloco; decisões e registros: anel
    const doBloco = ev.tipo === 'inicio' || ev.tipo === 'fase';
    const cor = ev.tipo === 'inicio' ? corFase(0) : ev.tipo === 'fase' && ev.fase !== undefined ? corFase(ev.fase) : COR_EVENTO[ev.tipo];
    const ultimo = k === r.linha_do_tempo.length - 1;
    if (!ultimo) {
      doc.setDrawColor(...C.linha);
      doc.setLineWidth(0.5);
      doc.line(xl, y + 2, xl, y + h + 1.5);
    }
    doc.setFillColor(...BRANCO);
    doc.circle(xl, y + 2, 2, 'F');
    if (doBloco || ev.tipo === 'fim') {
      doc.setFillColor(...cor);
      doc.circle(xl, y + 2, 1.5, 'F');
    } else {
      doc.setDrawColor(...cor);
      doc.setLineWidth(0.6);
      doc.circle(xl, y + 2, 1.2, 'S');
    }
    escrever(doc, curta(ev.data), M, y + 3, { tam: 8, negrito: true, cor: C.tinta2 });
    const kick = ROTULO_EVENTO[ev.tipo].toUpperCase();
    escrever(doc, kick, xt, y + 3, { tam: 7, negrito: true, cor: escura(cor, 0.25), esp: 0.3 });
    escrever(doc, ev.titulo, xt + largura(doc, kick, { tam: 7, negrito: true }) + kick.length * 0.3 + 2.5, y + 3, { tam: 9, negrito: true, largura: wt - 30, maxLinhas: 1 });
    if (detalhe) escrever(doc, detalhe, xt, y + 6.8, { tam: 8, cor: C.tinta2, largura: wt });
    c.y = y + h;
  });
}

// ---------- Hábitos ----------

function habitos(c: Ctx) {
  const { doc, r } = c;
  const h = r.habitos;
  secao(c, 'Hábitos', `${curta(h.de)} a ${curta(h.ate)}${r.estado === 'previa' ? ' (até ontem)' : ''}: quanto dos dias ficou na meta.`, C.verde);
  const a = h.adesao;
  const aneis: [string, { feito: number; total: number; fracao: number | null } | null, string, Cor][] = [
    ['Treino', a.treino, 'dias', C.rosa],
    ['Cardio', a.cardio, 'dias', C.ciano],
    ['Dieta', a.dieta, 'dias', C.verde],
    ['Água', a.agua, 'dias', C.azul],
    ['Sono 7 h+', a.sono, 'noites', C.violeta],
    ['Diário', a.registro, 'dias', C.indigo],
  ];
  const lista = aneis.filter(([, x]) => x !== null) as [string, { feito: number; total: number; fracao: number | null }, string, Cor][];
  espaco(c, 36);
  const wa = LW / lista.length;
  lista.forEach(([rot, tx, un, cor], i) => {
    const cx = M + wa * i + wa / 2;
    const cy = c.y + 11;
    anel(doc, cx, cy, 10, 7, tx.fracao, cor);
    escrever(doc, tx.fracao === null ? '–' : pct(tx.fracao, 0), cx, cy + 1.5, { tam: 10, negrito: true, alinhar: 'center' });
    escrever(doc, rot, cx, cy + 15, { tam: 8.5, negrito: true, alinhar: 'center' });
    escrever(doc, tx.total ? `${num(tx.feito, tx.feito % 1 ? 1 : 0)} de ${tx.total} ${un}` : 'sem registro', cx, cy + 19, { tam: 7, cor: C.mudo, alinhar: 'center' });
  });
  c.y += 34;

  // Números
  const w4 = (LW - 12) / 4;
  espaco(c, 26);
  const tiles: [Cor, string, string, string][] = [
    [C.violeta, 'Sono médio', h.sono_medio === null ? '–' : `${num(h.sono_medio, 1)} h`, `${h.noites} noites anotadas`],
    [C.ciano, 'Água média', h.agua_media === null ? '–' : `${num(h.agua_media, 1)} L`, h.agua_meta_media === null ? 'sem registro' : `meta média ${num(h.agua_meta_media, 1)} L`],
    [C.verde, 'Dieta seguida', h.sequencias.dieta ? `${h.sequencias.dieta} dias` : '–', 'maior sequência no plano'],
    [C.laranja, 'Náusea', h.nausea_media === null ? '–' : `${num(h.nausea_media, 1)} de 3`, `${h.dias_com_nausea} dias com náusea · ${h.dias_sintoma} com sintoma`],
  ];
  tiles.forEach(([cor, rot, val, sub], i) => ladrilho(doc, M + i * (w4 + 4), c.y, w4, 24, cor, rot, val, sub, C.tinta, 13));
  c.y += 28;

  // Urina e sequências
  const totalU = h.urina.clara + h.urina.amarela + h.urina.escura;
  espaco(c, 16);
  const wm = (LW - 8) / 2;
  let y = c.y;
  escrever(doc, 'Cor da urina', M, y + 3.5, { tam: 8.5, negrito: true });
  if (totalU) {
    const partes: [string, number, Cor][] = [
      ['clara', h.urina.clara, hex('#fde68a')],
      ['amarela', h.urina.amarela, hex('#f59e0b')],
      ['escura', h.urina.escura, hex('#92400e')],
    ];
    let xu = M;
    cortar(doc, M, y + 5.5, wm, 4, 2, () => {
      for (const [, v, cor] of partes) {
        const w = (v / totalU) * wm;
        caixa(doc, xu, y + 5.5, w, 4, cor, 0);
        xu += w;
      }
    });
    escrever(doc, partes.map(([rot, v]) => `${rot} ${pct(v / totalU, 0)}`).join(' · ') + ` (${totalU} dias)`, M, y + 13.5, { tam: 7.5, cor: C.tinta2 });
  } else escrever(doc, 'Sem registro.', M, y + 9, { tam: 8, cor: C.mudo });
  const xs = M + wm + 8;
  escrever(doc, 'Maiores sequências (dias seguidos)', xs, y + 3.5, { tam: 8.5, negrito: true });
  const seqs: [string, number, Cor][] = [
    ['Diário', h.sequencias.diario, C.indigo],
    ['Dieta', h.sequencias.dieta, C.verde],
    ['Sono 7 h+', h.sequencias.sono, C.violeta],
    ['Água', h.sequencias.agua, C.azul],
  ];
  let xx = xs;
  for (const [rot, v, cor] of seqs) {
    xx += pilula(doc, `${rot} ${v}`, xx, y + 5.8, clara(cor, 0.86), escura(cor, 0.35), 7.5) + 2;
  }
  c.y = y + 18;

  // Semana a semana
  const sem = r.semanas;
  const rot = sem.map((_, i) => `S${i + 1}`);
  subtitulo(c, 'Semana a semana', C.verde, 48);
  const graf = (o: OpBarras) => {
    espaco(c, o.alt + 3);
    c.y += graficoBarras(doc, M, c.y, LW, o) + 3;
  };
  const sonoMin = 7;
  graf({
    titulo: 'Sono médio por noite (h)',
    rotulos: rot,
    grupos: [{ rotulo: 'Sono', valores: sem.map((s) => s.sono_h), cor: C.violeta, corDe: (v) => (v >= sonoMin - 1e-9 ? C.violeta : clara(C.violeta, 0.55)) }],
    legenda: [
      { rotulo: '7 h ou mais', cor: C.violeta, tipo: 'barra' },
      { rotulo: 'menos de 7 h', cor: clara(C.violeta, 0.55), tipo: 'barra' },
    ],
    min: 0,
    ref: { valor: sonoMin, rotulo: '7 h' },
    fmtEixo: (v, p) => num(v, casasPasso(p)),
    alt: 42,
    vazio: 'Sem sono anotado.',
  });
  graf({
    titulo: 'Água por dia (L)',
    rotulos: rot,
    grupos: [{ rotulo: 'Água', valores: sem.map((s) => s.agua_l), cor: C.azul, corDe: (v, i) => (sem[i].agua_meta_l !== null && v >= sem[i].agua_meta_l! - 0.05 ? C.azul : clara(C.azul, 0.55)) }],
    legenda: [
      { rotulo: 'na meta', cor: C.azul, tipo: 'barra' },
      { rotulo: 'abaixo da meta', cor: clara(C.azul, 0.55), tipo: 'barra' },
      { rotulo: 'meta da semana', cor: C.tinta, tipo: 'linha' },
    ],
    metas: sem.map((s) => s.agua_meta_l),
    min: 0,
    fmtEixo: (v, p) => num(v, casasPasso(p)),
    alt: 42,
    vazio: 'Sem água anotada.',
  });
  graf({
    titulo: 'Dieta seguida (% dos dias respondidos; "em parte" vale meio)',
    rotulos: rot,
    grupos: [{ rotulo: 'Dieta', valores: sem.map((s) => (s.dieta_fracao === null ? null : s.dieta_fracao * 100)), cor: C.verde }],
    min: 0,
    max: 100,
    fmtEixo: (v) => `${num(v, 0)}%`,
    alt: 42,
    vazio: 'Sem resposta em "Segui o plano?".',
  });
  nota(c, 'S1 = semana da 1ª aplicação (segunda a domingo).');
}

// ---------- Treino ----------

function treino(c: Ctx) {
  const { doc, r } = c;
  const tr = r.treino;
  if (!tr) return;
  secao(c, 'Treino', `Placar de ${curta(tr.inicio)} a ${curta(tr.fim)}.`, C.rosa);
  const w4 = (LW - 12) / 4;
  espaco(c, 26);
  const tiles: [Cor, string, string, string][] = [
    [C.rosa, 'Treinos', `${tr.treino.feito} de ${tr.treino.meta}`, tr.treino.aderencia === null ? '–' : `${pct(tr.treino.aderencia, 0)} de aderência`],
    [C.ciano, 'Cardios', `${tr.cardio.feito} de ${tr.cardio.meta}`, tr.cardio.aderencia === null ? '–' : `${pct(tr.cardio.aderencia, 0)} de aderência`],
    [C.laranja, 'Corridas', String(tr.corridas.feito), tr.corridas.km > 0 ? `${formatarKm(tr.corridas.km)} anotados` : 'sem distância'],
    [C.azul, 'Melhor pace', tr.melhor_pace ? `${formatarTempo(tr.melhor_pace.pace)} /km` : '–', tr.melhor_pace ? `${curta(tr.melhor_pace.data)} · ${formatarKm(tr.melhor_pace.km)}` : 'sem corrida com tempo'],
  ];
  tiles.forEach(([cor, rot, val, sub], i) => ladrilho(doc, M + i * (w4 + 4), c.y, w4, 24, cor, rot, val, sub, C.tinta, 13));
  c.y += 27;
  const extras = [
    tr.bike.feito ? `Bike: ${tr.bike.feito} ${tr.bike.feito === 1 ? 'vez' : 'vezes'}, ${tr.bike.minutos} min` : null,
    tr.recorde_sequencia >= 2 ? `Maior sequência de treino + cardio: ${tr.recorde_sequencia} dias` : null,
    tr.corridas.sem_distancia ? `${tr.corridas.sem_distancia} corrida${tr.corridas.sem_distancia === 1 ? '' : 's'} sem distância anotada` : null,
  ].filter((x): x is string => !!x);
  if (extras.length) nota(c, extras.join(' · '), 8);
  c.y += 2;

  if (tr.semanas.length) {
    espaco(c, 48);
    c.y +=
      graficoBarras(doc, M, c.y, LW, {
        titulo: 'Dias com treino e cardio por semana',
        rotulos: tr.semanas.map((s) => `S${r.semanas.findIndex((x) => x.segunda === s.segunda) + 1 || '?'}`),
        grupos: [
          { rotulo: 'Treino', valores: tr.semanas.map((s) => s.treino), cor: C.rosa },
          { rotulo: 'Cardio', valores: tr.semanas.map((s) => s.cardio), cor: C.ciano },
        ],
        min: 0,
        max: 7,
        fmtEixo: (v) => num(v, 0),
        alt: 46,
        vazio: 'Sem treino marcado.',
      }) + 4;
  }

  const corr = tr.lista_corridas;
  if (corr.length) {
    const wm = (LW - 8) / 2;
    espaco(c, 52);
    const de = tr.inicio < r.periodo.inicio ? tr.inicio : r.periodo.inicio;
    const ate = r.periodo.fim;
    graficoTempo(doc, M, c.y, wm, {
      titulo: 'Distância por corrida (km)',
      series: [{ pontos: corr.map((x) => ({ data: x.data, valor: x.km })), cor: C.laranja, rotulo: 'km', fmt: (v) => num(v, 1), area: true }],
      de,
      ate,
      alt: 48,
      vazio: 'Sem corrida com distância.',
      pontos: true,
    });
    graficoTempo(doc, M + wm + 8, c.y, wm, {
      titulo: 'Pace por corrida (min/km; mais alto = mais rápido)',
      series: [{ pontos: corr.map((x) => ({ data: x.data, valor: x.pace / 60 })), cor: C.azul, rotulo: 'pace', fmt: (v) => formatarTempo(v * 60) }],
      de,
      ate,
      alt: 48,
      vazio: 'Sem corrida com tempo.',
      fmtEixo: (v) => formatarTempo(v * 60),
      invertido: true,
      pontos: true,
    });
    c.y += 52;
  }

  const f = tr.forca;
  if (f && f.semanas.some((s) => s.suavizado !== null)) {
    const pts = f.semanas.filter((s) => s.suavizado !== null).map((s) => ({ data: s.segunda, valor: s.suavizado! * 100 }));
    espaco(c, 50);
    c.y +=
      graficoTempo(doc, M, c.y, LW, {
        titulo: 'Índice de força (variação média do 1RM estimado desde o início, %)',
        series: [{ pontos: pts, cor: C.verde, rotulo: 'Força', fmt: (v) => sinal(v, 1, '%'), area: false }],
        de: pts[0].data < r.periodo.inicio ? pts[0].data : r.periodo.inicio,
        ate: r.periodo.fim,
        alt: 46,
        vazio: 'Sem registros de força.',
        ref: { valor: 0, rotulo: 'início' },
        fmtEixo: (v, p) => `${num(v, casasPasso(p))}%`,
        pontos: true,
      }) + 3;
    if (f.exercicios.length) {
      espaco(c, 20);
      autoTable(doc, {
        startY: c.y,
        head: [['Exercício', 'Primeiro registro', 'Último registro', '1RM estimado', 'Variação'].map(t)],
        body: f.exercicios.map((e) => [t(e.nome), curta(e.data_inicio), curta(e.data_fim), t(`${num(e.e1rm_inicio, 1)} → ${num(e.e1rm_fim, 1)} kg`), t(sinal(e.variacao * 100, 0, '%'))]),
        ...estiloTabela(C.verde),
        didParseCell: (d: CellHookData) => {
          if (d.section === 'body' && d.column.index === 4) {
            const v = f.exercicios[d.row.index].variacao;
            d.cell.styles.textColor = v > 0.0005 ? C.bom : v < -0.0005 ? C.ruim : C.tinta;
            d.cell.styles.fontStyle = 'bold';
          }
        },
      });
      c.y = fimTabela(doc) + 4;
    }
  }

  if (corr.length) {
    subtitulo(c, `Corridas (${corr.length})`, C.laranja, 20);
    // Legenda dos destaques na linha do subtítulo
    const itensLeg = [tr.melhor_pace ? ['melhor pace', C.azul] : null, tr.maior_corrida ? ['corrida mais longa', C.laranja] : null].filter(Boolean) as [string, Cor][];
    let xLeg = M + LW;
    for (const [rot, cor] of [...itensLeg].reverse()) {
      xLeg -= largura(doc, rot, { tam: 7.5 });
      escrever(doc, rot, xLeg, c.y - 4, { tam: 7.5, cor: C.tinta2 });
      xLeg -= 4.5;
      caixa(doc, xLeg, c.y - 6.6, 3, 3, clara(cor, 0.78), 0.6);
      xLeg -= 4;
    }
    const metade = Math.ceil(corr.length / 2);
    const linhas = Array.from({ length: metade }, (_, i) => {
      const a = corr[i];
      const b = corr[i + metade];
      const cel = (x: typeof a | undefined) => (x ? [curta(x.data), formatarKm(x.km), formatarTempo(x.segundos), `${formatarTempo(x.pace)} /km`] : ['', '', '', '']);
      return [...cel(a), '', ...cel(b)].map(t);
    });
    const destaque = (x: (typeof corr)[number] | undefined) => (x && tr.melhor_pace && x === tr.melhor_pace ? C.azul : x && tr.maior_corrida && x === tr.maior_corrida ? C.laranja : null);
    autoTable(doc, {
      startY: c.y,
      head: [['Data', 'Distância', 'Tempo', 'Pace', '', 'Data', 'Distância', 'Tempo', 'Pace'].map(t)],
      body: linhas,
      ...estiloTabela(C.laranja),
      columnStyles: { 4: { cellWidth: 4, fillColor: BRANCO } },
      didParseCell: (d: CellHookData) => {
        if (d.section !== 'body' || d.column.index === 4) {
          if (d.column.index === 4) d.cell.styles.fillColor = BRANCO;
          return;
        }
        const x = d.column.index < 4 ? corr[d.row.index] : corr[d.row.index + metade];
        const cor = destaque(x);
        if (cor) {
          d.cell.styles.fillColor = clara(cor, 0.78);
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
    c.y = fimTabela(doc) + 2;
  }
}

// ---------- Antes e depois ----------

function fotos(c: Ctx) {
  const { doc, r, imagens } = c;
  const fp = r.fotos.pdf;
  if (!imagens || (!r.fotos.pares.length && !fp.outrasAntes.length && !fp.outrasDepois.length)) return;
  secao(c, 'Antes e depois', `${r.fotos.antes} ${r.fotos.antes === 1 ? 'foto' : 'fotos'} no Antes · ${r.fotos.depois} no Depois. Primeira do Antes × mais recente do Depois, por pose, com a medição mais próxima de cada foto (até 7 dias).`, C.violeta);
  // Fotos lado a lado no meio (comparação direta); os números de cada uma por fora
  const hFoto = 88;
  const wFoto = (hFoto * 3) / 4;
  const vao = 5;
  const xA = M + (LW - (wFoto * 2 + vao)) / 2;
  const xD = xA + wFoto + vao;
  const lateral = xA - M - 4;
  for (const p of r.fotos.pares) {
    const alt = 8 + 7 + hFoto + 2;
    espaco(c, alt + 4);
    const y = c.y;
    const titulo = p.chave === 'geral' ? 'Primeira do Antes × mais recente do Depois' : p.rotulo;
    const dias = `${diferencaDias(p.data_antes, p.data_depois)} dias entre as fotos`;
    escrever(doc, titulo, M, y + 4.5, { tam: 11, negrito: true });
    escrever(doc, dias, M + LW, y + 4.5, { tam: 8, cor: C.mudo, alinhar: 'right' });
    doc.setDrawColor(...C.linha);
    doc.setLineWidth(0.2);
    doc.line(M + largura(doc, titulo, { tam: 11, negrito: true }) + 4, y + 3.2, M + LW - largura(doc, dias, { tam: 8 }) - 4, y + 3.2);
    const yl = y + 9;
    for (const lado of ['antes', 'depois'] as const) {
      const antes = lado === 'antes';
      const xf = antes ? xA : xD;
      const data = antes ? p.data_antes : p.data_depois;
      const id = antes ? p.id_antes : p.id_depois;
      const wp = pilula(doc, antes ? 'ANTES' : 'DEPOIS', xf, yl, antes ? C.mudo : C.violeta, BRANCO, 7.5);
      escrever(doc, formatarData(data), xf + wp + 2, yl + 3.4, { tam: 8.5, negrito: true, cor: C.tinta2 });
      desenharFoto(doc, imagens.get(id), id, xf, yl + 7, wFoto, hFoto, 3);
      // Números ao lado (Antes: à esquerda, alinhados à direita; Depois: à direita)
      const nums = antes ? p.numeros_antes : p.numeros_depois;
      const xn = antes ? xA - 4 : xD + wFoto + 4;
      const al = antes ? 'right' : 'left';
      let yn = yl + 12;
      const med = antes ? p.medicao_antes : p.medicao_depois;
      if (!nums.length) {
        escrever(doc, 'Sem medição até 7 dias da foto.', xn, yn, { tam: 7.5, cor: C.mudo, alinhar: al, largura: lateral });
        continue;
      }
      for (const nf of nums) {
        escrever(doc, (nf.rotulo === '% de gordura' ? 'Gordura' : nf.rotulo).toUpperCase(), xn, yn, { tam: 7, negrito: true, cor: C.mudo, alinhar: al });
        escrever(doc, nf.valor, xn, yn + 5, { tam: 11, negrito: true, alinhar: al });
        yn += 9.5;
        if (nf.variacao !== undefined) {
          escrever(doc, nf.variacao, xn, yn - 0.6, { tam: 8.5, negrito: true, cor: corTom(corVariacao(nf.delta, true, MDC[nf.chave])), alinhar: al });
          yn += 4.6;
        }
        yn += 2.4;
      }
      if (med && med.data !== data) escrever(doc, `Medição de ${curta(med.data)}`, xn, yn, { tam: 7, cor: C.mudo, alinhar: al, largura: lateral });
    }
    c.y = y + alt + 4;
  }

  // Outras fotos em grade
  const porLinha = 4;
  const wg = (LW - (porLinha - 1) * 5) / porLinha;
  const hg = (wg * 4) / 3;
  for (const [sessao, lista] of [
    ['antes', fp.outrasAntes],
    ['depois', fp.outrasDepois],
  ] as const) {
    if (!lista.length) continue;
    subtitulo(c, sessao === 'antes' ? 'Outras fotos do Antes' : 'Outras fotos do Depois', sessao === 'antes' ? C.mudo : C.violeta, hg + 8);
    for (let i = 0; i < lista.length; i += porLinha) {
      espaco(c, hg + 8);
      lista.slice(i, i + porLinha).forEach((f, j) => {
        const x = M + j * (wg + 5);
        desenharFoto(doc, imagens.get(f.id), f.id, x, c.y, wg, hg, 2.4);
        escrever(doc, f.legenda, x + wg / 2, c.y + hg + 4, { tam: 7.5, cor: C.tinta2, alinhar: 'center' });
      });
      c.y += hg + 8;
    }
  }
  nota(c, 'As fotos ficam só no aparelho: entram no PDF apenas com a opção "Incluir fotos" marcada.');
}

// ---------- Recordes e metas ----------

function recordesEMetas(c: Ctx) {
  const { doc, r } = c;
  secao(c, 'Recordes', 'Calculados dos seus registros (medições atípicas ficam de fora).', C.ciano);
  if (!r.recordes.length) nota(c, 'Os recordes aparecem conforme você registra medições, o Diário e os treinos.', 8.5);
  const w = (LW - 6) / 2;
  const h = 27;
  for (let i = 0; i < r.recordes.length; i += 2) {
    espaco(c, h + 4);
    r.recordes.slice(i, i + 2).forEach((x, j) => {
      const cor = COR_CATEGORIA[x.categoria];
      const xx = M + j * (w + 6);
      const y = c.y;
      caixa(doc, xx, y, w, h, clara(cor, 0.91), 2.6);
      cortar(doc, xx, y, w, h, 2.6, () => caixa(doc, xx, y, 1.6, h, cor, 0));
      escrever(doc, ROTULO_CATEGORIA[x.categoria].toUpperCase(), xx + 5, y + 5.6, { tam: 7, negrito: true, cor: escura(cor, 0.3), esp: 0.3 });
      escrever(doc, x.texto, xx + w - 4, y + 9, { tam: 15, negrito: true, cor: escura(cor, 0.3), alinhar: 'right' });
      escrever(doc, x.titulo, xx + 5, y + 15.5, { tam: 9, negrito: true, largura: w - 9, maxLinhas: 1 });
      escrever(doc, x.detalhe, xx + 5, y + 20.5, { tam: 7.5, cor: C.tinta2, largura: w - 9, maxLinhas: 2 });
    });
    c.y += h + 4;
  }

  secao(c, 'Metas do projeto', r.estado === 'concluido' ? 'Do início até a medição final.' : 'Do início até a medição mais recente.', C.verde, false, 22);
  if (!r.metas.itens.length) {
    nota(c, 'Sem metas do projeto: o caminho até a meta aparece quando houver meta e duas medições.', 8.5);
    return;
  }
  const fmt = (u: 'kg' | 'cm' | '%') => (n: number) => (u === 'kg' ? kg(n) : u === 'cm' ? cm(n) : pp(n));
  for (const m of r.metas.itens) {
    espaco(c, 20);
    const p = m.progresso;
    const f = fmt(m.unidade);
    const y = c.y;
    const cor = p.alcancada ? C.bom : C.azul;
    escrever(doc, m.nome, M, y + 4, { tam: 10, negrito: true });
    if (p.alcancada) {
      const wp = pilula(doc, 'Meta atingida', M + LW, y + 0.4, clara(C.bom, 0.85), escura(C.bom, 0.2), 7.5, 'right');
      marcaOk(doc, M + LW - wp - 3.5, y + 2.6, 3, C.bom);
    } else escrever(doc, `${pct(p.fracao, 0)} do caminho`, M + LW, y + 4, { tam: 9, negrito: true, cor: escura(C.azul, 0.2), alinhar: 'right' });
    caixa(doc, M, y + 6.5, LW, 4, C.grade, 2);
    const fr = Math.min(Math.max(p.fracao, 0), 1);
    if (fr > 0) caixa(doc, M, y + 6.5, Math.max(LW * fr, 4), 4, cor, 2);
    escrever(doc, `Início ${f(p.inicio)}`, M, y + 14.6, { tam: 7.5, cor: C.tinta2 });
    escrever(doc, `${r.estado === 'concluido' ? 'Final' : 'Agora'} ${f(p.atual)}`, L / 2, y + 14.6, { tam: 7.5, negrito: true, cor: C.tinta, alinhar: 'center' });
    escrever(doc, `Meta ${f(p.meta)}${!p.alcancada && p.falta > 0 ? ` · ${r.estado === 'concluido' ? 'faltou' : 'falta'} ${f(p.falta)}` : ''}`, M + LW, y + 14.6, { tam: 7.5, cor: C.tinta2, alinhar: 'right' });
    c.y = y + 20;
  }
}

// ---------- Tabelas ----------

function fimTabela(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function estiloTabela(cor: Cor) {
  return {
    theme: 'plain' as const,
    margin: { left: M, right: M, top: TOPO, bottom: A - FIM },
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.2, textColor: C.tinta, lineColor: C.linha, lineWidth: { bottom: 0.15 } },
    headStyles: { fillColor: escura(cor, 0.3), textColor: 255, fontStyle: 'bold' as const, lineWidth: 0 },
    alternateRowStyles: { fillColor: clara(cor, 0.95) },
  };
}

function semanaASemana(c: Ctx) {
  const { doc, r } = c;
  if (!r.semanas.length) return;
  const comTreino = !!r.treino;
  // A tabela inteira numa página quando dá (cada linha tem ~5 mm)
  const altTabela = 30 + (r.semanas.length + 1) * 5.1 + 8;
  secao(c, 'Semana a semana', 'Medição de cada segunda (asterisco: atípica) e as médias do Diário de cada semana.', C.indigo, inteiraNaPagina(c, altTabela), 50);
  const indiceFase = (dose: number | null) => (dose === null ? -1 : r.fases.findIndex((f) => f.dose_mg === dose));
  const cab = ['Sem.', 'Segunda', 'Dose', 'Peso', 'Cintura', '% gord.', 'M. magra', 'M. gorda', 'Sono', 'Água', 'Dieta', 'Náusea', ...(comTreino ? ['Treino', 'Cardio', 'km'] : [])];
  const v = (n: number | null, casas = 1) => (n === null ? '–' : num(n, casas));
  const corpoT = r.semanas.map((s, i) => {
    const at = s.atipica ? '*' : '';
    return [
      `S${i + 1}`,
      curta(s.segunda),
      s.dose_mg === null ? '–' : num(s.dose_mg),
      s.peso_kg === null ? '–' : `${v(s.peso_kg)}${at}`,
      s.cintura_cm === null ? '–' : `${v(s.cintura_cm)}${at}`,
      v(s.bf),
      v(s.massa_magra_kg),
      v(s.massa_gorda_kg),
      s.sono_h === null ? '–' : `${v(s.sono_h)} h`,
      s.agua_l === null ? '–' : `${v(s.agua_l)} L`,
      s.dieta_fracao === null ? '–' : pct(s.dieta_fracao, 0),
      s.nausea_media === null ? '–' : `${v(s.nausea_media)}${s.nausea_max !== null ? ` / ${s.nausea_max}` : ''}`,
      ...(comTreino ? [s.treino === null ? '–' : String(s.treino), s.cardio === null ? '–' : String(s.cardio), s.km ? num(s.km, 1) : '–'] : []),
    ].map(t);
  });
  autoTable(doc, {
    startY: c.y,
    head: [cab.map(t)],
    body: corpoT,
    ...estiloTabela(C.indigo),
    styles: { ...estiloTabela(C.indigo).styles, fontSize: 7, cellPadding: { top: 1.1, bottom: 1.1, left: 1, right: 1 }, halign: 'right' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'left' }, 2: { halign: 'center' } },
    didParseCell: (d: CellHookData) => {
      if (d.section === 'head') {
        d.cell.styles.halign = d.column.index < 2 ? 'left' : d.column.index === 2 ? 'center' : 'right';
        return;
      }
      if (d.column.index === 2) {
        const i = indiceFase(r.semanas[d.row.index].dose_mg);
        if (i >= 0) {
          d.cell.styles.fillColor = clara(corFase(i), 0.78);
          d.cell.styles.textColor = escura(corFase(i), 0.45);
          d.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  c.y = fimTabela(doc) + 2;
  nota(c, `Náusea: média / máximo da semana (0 a 3). Dieta: dias no plano entre os respondidos ("em parte" vale meio).${comTreino ? ' Treino e cardio: dias marcados na semana.' : ''}`);
}

// ---------- Montagem ----------

export interface OpcoesPdfFinal {
  /** Comprime o conteúdo das páginas (padrão: sim; os testes leem o texto sem compressão) */
  comprimir?: boolean;
}

/** Monta o documento (os testes inspecionam as páginas e o texto). */
export function montarRelatorioFinalPdf(r: RelatorioFinal, imagens: Map<string, ImagemPdf> | null, o: OpcoesPdfFinal = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: o.comprimir ?? true });
  doc.setProperties({
    title: t(`Relatório final do ciclo${r.pessoa.nome ? ` · ${r.pessoa.nome}` : ''}`),
    subject: t(`${r.rotulo_estado} · ${r.periodo.texto}`),
    creator: 'Ciclo',
  });
  const c: Ctx = { doc, r, imagens: imagens && imagens.size ? imagens : null, y: 0, n: 1 };
  capa(c);
  if (r.remedio.aplicacoes) {
    resumo(c);
    corpo(c);
    fases(c);
    nausea(c);
    linhaDoTempo(c);
    habitos(c);
    treino(c);
    fotos(c);
    recordesEMetas(c);
    semanaASemana(c);
  } else {
    novaPagina(c);
    nota(c, 'O relatório começa na primeira aplicação. Registre a dose e ele vai se montando com o Diário, as medidas e as fotos.', 9);
  }

  // Linha final
  const hR = alturaTexto(doc, r.textos.rodape, { tam: 8.5, largura: LW - 12 }) + 6;
  espaco(c, hR + 6);
  c.y += 4;
  caixa(doc, M, c.y, LW, hR, clara(C.indigo, 0.93), 2.4);
  escrever(doc, r.textos.rodape, M + 6, c.y + 5.2, { tam: 8.5, cor: escura(C.indigo, 0.35), largura: LW - 12 });

  // Rodapé de todas as páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    escrever(doc, `${i}/${total}`, L - M, 290, { tam: 7.5, negrito: true, cor: C.mudo, alinhar: 'right' });
    escrever(doc, `Relatório final do ciclo · gerado em ${formatarData(r.gerado_em)}${r.estado === 'previa' ? ' · prévia' : ''}`, M, 290, { tam: 7, cor: C.mudo });
  }
  return doc;
}

/** PDF final do ciclo (Blob). `imagens` só quando a pessoa marca "Incluir fotos". */
export function gerarRelatorioFinalPdf(r: RelatorioFinal, imagens: Map<string, ImagemPdf> | null, o: OpcoesPdfFinal = {}): Blob {
  return montarRelatorioFinalPdf(r, imagens, o).output('blob');
}
