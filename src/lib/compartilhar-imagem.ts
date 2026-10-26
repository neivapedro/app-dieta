// Desenho do cartão de progresso (1080 × 1350, PNG) com a Canvas 2D, sem bibliotecas.
// A imagem é sempre escura (identidade do app): as cores abaixo espelham os tokens do tema escuro.
import { diferencaDias } from './datas';
import type { DadosCartao, MetricaCartao, TomCartao } from './compartilhar-cartao';

export const LARGURA = 1080;
export const ALTURA = 1350;
const M = 72;
const FONTE = 'system-ui, -apple-system, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Paleta fixa da imagem (= tokens do tema escuro em estilos.css). */
export const PALETA = {
  fundoTopo: '#1d1d20',
  fundoBase: '#09090a',
  superficie: 'rgba(255,255,255,0.055)',
  superficieForte: 'rgba(255,255,255,0.085)',
  borda: 'rgba(255,255,255,0.10)',
  trilho: 'rgba(255,255,255,0.10)',
  texto: '#f5f5f7',
  texto2: '#a1a1a6',
  texto3: '#8e8e93',
  bom: '#34c759',
  ruim: '#ff453a',
  aviso: '#ffd60a',
} as const;

export function corDoTom(tom: TomCartao): string {
  return tom === 'bom' ? PALETA.bom : tom === 'ruim' ? PALETA.ruim : PALETA.texto;
}

/** Cor do anel de adesão (mesma régua do painel: 80%+ bom, abaixo de 50% atenção). */
export function corAdesao(f: number): string {
  return f >= 0.8 ? PALETA.bom : f < 0.5 ? PALETA.ruim : PALETA.aviso;
}

/** Maior tamanho de fonte (de `inicial` até `minimo`, de 2 em 2 px) em que o texto cabe em `max`. */
export function tamanhoQueCabe(medir: (px: number) => number, max: number, inicial: number, minimo = 12): number {
  let px = inicial;
  while (px > minimo && medir(px) > max) px -= 2;
  return Math.max(px, minimo);
}

export interface Caixa {
  x: number;
  y: number;
  l: number;
  a: number;
}

/** Pontos da linha dentro da caixa: x proporcional às datas, y pela faixa dos valores (com folga). */
export function pontosLinha(serie: { data: string; valor: number }[], c: Caixa): [number, number][] {
  if (serie.length < 2) return [];
  const dias = Math.max(diferencaDias(serie[0].data, serie[serie.length - 1].data), 1);
  const vs = serie.map((p) => p.valor);
  let min = Math.min(...vs);
  let max = Math.max(...vs);
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }
  return serie.map((p) => [c.x + (diferencaDias(serie[0].data, p.data) / dias) * c.l, c.y + c.a - ((p.valor - min) / (max - min)) * c.a]);
}

// ---------- Peças de desenho ----------

function fonte(ctx: CanvasRenderingContext2D, peso: number, px: number) {
  ctx.font = `${peso} ${px}px ${FONTE}`;
}

function espacar(ctx: CanvasRenderingContext2D, px: number) {
  // letterSpacing não existe em todo navegador: sem ele, o texto sai sem o espaçamento
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Escreve o texto no maior tamanho (até `px`) que cabe em `max`. */
function texto(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, o: { px: number; peso?: number; cor: string; max?: number; alinhar?: CanvasTextAlign; minimo?: number }) {
  const peso = o.peso ?? 400;
  const px = o.max ? tamanhoQueCabe((p) => (fonte(ctx, peso, p), ctx.measureText(t).width), o.max, o.px, o.minimo ?? 12) : o.px;
  fonte(ctx, peso, px);
  ctx.fillStyle = o.cor;
  ctx.textAlign = o.alinhar ?? 'left';
  ctx.fillText(t, x, y);
  return px;
}

function rotulo(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, cor: string = PALETA.texto3, px = 24) {
  espacar(ctx, 3);
  texto(ctx, t.toUpperCase(), x, y, { px, peso: 700, cor });
  espacar(ctx, 0);
}

function retangulo(ctx: CanvasRenderingContext2D, c: Caixa, raio: number) {
  // Caminho à mão (roundRect só existe nos navegadores mais novos)
  const r = Math.min(raio, c.l / 2, c.a / 2);
  ctx.beginPath();
  ctx.moveTo(c.x + r, c.y);
  ctx.arcTo(c.x + c.l, c.y, c.x + c.l, c.y + c.a, r);
  ctx.arcTo(c.x + c.l, c.y + c.a, c.x, c.y + c.a, r);
  ctx.arcTo(c.x, c.y + c.a, c.x, c.y, r);
  ctx.arcTo(c.x, c.y, c.x + c.l, c.y, r);
  ctx.closePath();
}

function painel(ctx: CanvasRenderingContext2D, c: Caixa, raio = 32, forte = false) {
  retangulo(ctx, c, raio);
  const g = ctx.createLinearGradient(0, c.y, 0, c.y + c.a);
  g.addColorStop(0, forte ? PALETA.superficieForte : PALETA.superficie);
  g.addColorStop(1, 'rgba(255,255,255,0.025)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETA.borda;
  ctx.stroke();
}

function fundo(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, LARGURA * 0.3, ALTURA);
  g.addColorStop(0, PALETA.fundoTopo);
  g.addColorStop(1, PALETA.fundoBase);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  // Brilho âmbar sutil (o acento do app) no alto e um eco discreto embaixo
  const brilho = (x: number, y: number, r: number, a: number) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,214,10,${a})`);
    rg.addColorStop(0.45, `rgba(255,170,0,${a * 0.35})`);
    rg.addColorStop(1, 'rgba(255,170,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, LARGURA, ALTURA);
  };
  brilho(LARGURA - 120, 60, 760, 0.2);
  brilho(60, ALTURA + 80, 620, 0.07);
}

function cabecalho(ctx: CanvasRenderingContext2D, d: DadosCartao, marca: CanvasImageSource | null) {
  const lado = 96;
  const c = { x: M, y: M, l: lado, a: lado };
  retangulo(ctx, c, 26);
  const g = ctx.createLinearGradient(0, c.y, 0, c.y + lado);
  g.addColorStop(0, '#3a3a3c');
  g.addColorStop(1, '#0b0b0c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETA.borda;
  ctx.stroke();
  if (marca) {
    // braco.webp: 417 × 480
    const a = 74;
    const l = a * (417 / 480);
    ctx.drawImage(marca, c.x + (lado - l) / 2, c.y + (lado - a) / 2, l, a);
  }
  texto(ctx, 'Ciclo', M + lado + 24, M + 50, { px: 44, peso: 750, cor: PALETA.texto });
  texto(ctx, 'acompanhamento', M + lado + 24, M + 86, { px: 26, peso: 500, cor: PALETA.texto3 });
  // Período numa pílula à direita
  fonte(ctx, 600, 26);
  const largura = Math.min(ctx.measureText(d.periodoTexto).width + 48, 420);
  const p = { x: LARGURA - M - largura, y: M + 20, l: largura, a: 56 };
  retangulo(ctx, p, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETA.borda;
  ctx.stroke();
  texto(ctx, d.periodoTexto, p.x + largura / 2, p.y + 37, { px: 26, peso: 600, cor: PALETA.texto, alinhar: 'center', max: largura - 32 });
}

function linha(ctx: CanvasRenderingContext2D, serie: { data: string; valor: number }[], c: Caixa, cor: string, espessura = 6) {
  const pts = pontosLinha(serie, c);
  if (pts.length < 2) return;
  const caminho = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    // Curva suave pelos pontos médios
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  };
  // Área com degradê que some para baixo
  caminho();
  ctx.lineTo(pts[pts.length - 1][0], c.y + c.a + 10);
  ctx.lineTo(pts[0][0], c.y + c.a + 10);
  ctx.closePath();
  const ga = ctx.createLinearGradient(0, c.y, 0, c.y + c.a + 10);
  ga.addColorStop(0, hexComAlfa(cor, 0.28));
  ga.addColorStop(1, hexComAlfa(cor, 0));
  ctx.fillStyle = ga;
  ctx.fill();
  caminho();
  ctx.lineWidth = espessura;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = cor;
  ctx.stroke();
  // Primeiro ponto vazado, último com brilho
  const [x0, y0] = pts[0];
  ctx.beginPath();
  ctx.arc(x0, y0, espessura + 2, 0, Math.PI * 2);
  ctx.fillStyle = PALETA.fundoBase;
  ctx.fill();
  ctx.lineWidth = espessura * 0.6;
  ctx.strokeStyle = cor;
  ctx.stroke();
  const [x1, y1] = pts[pts.length - 1];
  const gb = ctx.createRadialGradient(x1, y1, 0, x1, y1, espessura * 5);
  gb.addColorStop(0, hexComAlfa(cor, 0.55));
  gb.addColorStop(1, hexComAlfa(cor, 0));
  ctx.fillStyle = gb;
  ctx.fillRect(x1 - espessura * 5, y1 - espessura * 5, espessura * 10, espessura * 10);
  ctx.beginPath();
  ctx.arc(x1, y1, espessura + 3, 0, Math.PI * 2);
  ctx.fillStyle = cor;
  ctx.fill();
}

function hexComAlfa(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Cor da linha: a do tom (verde/vermelho) ou âmbar quando a variação está dentro do erro. */
function corLinha(m: MetricaCartao): string {
  return m.tom ? corDoTom(m.tom) : PALETA.aviso;
}

function blocoPrincipal(ctx: CanvasRenderingContext2D, d: DadosCartao, c: Caixa) {
  painel(ctx, c, 40, true);
  const m = d.principal;
  const x = c.x + 44;
  if (!d.temDados) {
    rotulo(ctx, 'Cintura, peso e % de gordura', x, c.y + 64);
    texto(ctx, 'Sem medições ainda', x, c.y + c.a / 2 + 24, { px: 72, peso: 800, cor: PALETA.texto, max: c.l - 88 });
    texto(ctx, 'Registre a primeira para ver o progresso.', x, c.y + c.a / 2 + 84, { px: 34, peso: 500, cor: PALETA.texto2, max: c.l - 88 });
    return;
  }
  const alto = c.a >= 290;
  const comLinha = d.serieCintura.length >= 2;
  const largTexto = comLinha ? c.l * 0.54 : c.l - 88;
  rotulo(ctx, m.rotulo, x, c.y + 64);
  texto(ctx, d.temVariacao ? m.texto : m.detalhe.replace(' agora', ''), x, c.y + (alto ? 196 : 180), {
    px: alto ? 136 : 116,
    peso: 800,
    cor: d.temVariacao ? corDoTom(m.tom) : PALETA.texto,
    max: largTexto,
    minimo: 48,
  });
  texto(ctx, d.temVariacao ? m.detalhe : 'A variação aparece com a próxima medição.', x, c.y + c.a - 28, { px: 30, peso: 500, cor: PALETA.texto2, max: comLinha ? largTexto : c.l - 88 });
  if (comLinha) {
    const lx = c.x + c.l * 0.6;
    texto(ctx, d.legendaLinhas, c.x + c.l - 44, c.y + 64, { px: 22, peso: 500, cor: PALETA.texto3, alinhar: 'right', max: c.l * 0.38 });
    linha(ctx, d.serieCintura, { x: lx, y: c.y + 104, l: c.x + c.l - 60 - lx, a: c.a - 152 }, corLinha(m), 7);
  }
}

function blocosMetricas(ctx: CanvasRenderingContext2D, d: DadosCartao, y: number, a: number) {
  const ms = d.metricas.filter((m) => m.chave !== 'peso_kg' || !d.seriePeso);
  const gap = 24;
  const l = (LARGURA - 2 * M - gap * (ms.length - 1)) / ms.length;
  const alto = a >= 200;
  ms.forEach((m, i) => {
    const c = { x: M + i * (l + gap), y, l, a };
    painel(ctx, c, 32);
    const x = c.x + 34;
    rotulo(ctx, m.rotulo, x, y + 52, PALETA.texto3, 22);
    const valor = d.temVariacao ? m.texto : m.detalhe.replace(' agora', '') || '–';
    texto(ctx, valor, x, y + (alto ? 130 : 120), { px: ms.length > 2 ? 58 : alto ? 76 : 64, peso: 800, cor: d.temVariacao ? corDoTom(m.tom) : PALETA.texto, max: l - 68, minimo: 30 });
    if (d.temVariacao && m.detalhe) texto(ctx, m.detalhe, x, y + a - 26, { px: 26, peso: 500, cor: PALETA.texto2, max: l - 68, minimo: 16 });
  });
}

function blocoPeso(ctx: CanvasRenderingContext2D, d: DadosCartao, c: Caixa) {
  const m = d.metricas.find((x) => x.chave === 'peso_kg');
  if (!m || !d.seriePeso) return;
  painel(ctx, c, 32);
  const x = c.x + 34;
  rotulo(ctx, m.rotulo, x, c.y + 50, PALETA.texto3, 22);
  texto(ctx, m.texto, x, c.y + 114, { px: 60, peso: 800, cor: corDoTom(m.tom), max: 330, minimo: 30 });
  texto(ctx, m.detalhe, x, c.y + c.a - 22, { px: 26, peso: 500, cor: PALETA.texto2, max: 330, minimo: 16 });
  const lx = c.x + 410;
  texto(ctx, d.legendaLinhas, c.x + c.l - 36, c.y + 50, { px: 22, peso: 500, cor: PALETA.texto3, alinhar: 'right', max: c.l - 440 });
  linha(ctx, d.seriePeso, { x: lx, y: c.y + 80, l: c.x + c.l - 52 - lx, a: c.a - 112 }, corLinha(m), 6);
}

function blocoAdesao(ctx: CanvasRenderingContext2D, d: DadosCartao, c: Caixa) {
  painel(ctx, c, 32);
  const n = d.adesao.length;
  const l = (c.l - 24) / n;
  // Cada item: anel à esquerda, a porcentagem e o nome à direita
  const r = Math.min(30, (c.a - 44) / 2);
  const cy = c.y + c.a / 2;
  d.adesao.forEach((it, i) => {
    const x0 = c.x + 12 + l * i;
    const cx = x0 + 18 + r;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = PALETA.trilho;
    ctx.stroke();
    const f = Math.min(Math.max(it.fracao, 0), 1);
    if (f > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.strokeStyle = corAdesao(f);
      ctx.stroke();
    }
    const tx = cx + r + 16;
    const largura = x0 + l - tx - 6;
    texto(ctx, `${Math.round(f * 100)}%`, tx, cy + 4, { px: 32, peso: 800, cor: PALETA.texto, max: largura, minimo: 16 });
    texto(ctx, it.rotulo, tx, cy + 32, { px: 21, peso: 600, cor: PALETA.texto2, max: largura, minimo: 13 });
  });
}

function rodape(ctx: CanvasRenderingContext2D, d: DadosCartao) {
  const y = ALTURA - M + 6;
  ctx.fillStyle = PALETA.borda;
  ctx.fillRect(M, y - 52, LARGURA - 2 * M, 2);
  // Marquinha âmbar antes do nome
  ctx.beginPath();
  ctx.arc(M + 8, y - 9, 8, 0, Math.PI * 2);
  ctx.fillStyle = PALETA.aviso;
  ctx.fill();
  texto(ctx, 'Ciclo · acompanhamento', M + 28, y, { px: 26, peso: 650, cor: PALETA.texto2 });
  if (d.dose) texto(ctx, d.dose, LARGURA - M, y, { px: 24, peso: 500, cor: PALETA.texto3, alinhar: 'right', max: 520, minimo: 14 });
}

/** Desenha o cartão inteiro no contexto (1080 × 1350). */
export function desenharCartao(ctx: CanvasRenderingContext2D, d: DadosCartao, marca: CanvasImageSource | null) {
  ctx.textBaseline = 'alphabetic';
  fundo(ctx);
  cabecalho(ctx, d, marca);
  rotulo(ctx, d.sobretitulo, M, 244, PALETA.aviso, 26);
  texto(ctx, d.titulo, M, 318, { px: 72, peso: 800, cor: PALETA.texto, max: LARGURA - 2 * M, minimo: 40 });

  // Blocos em coluna: a sobra de altura vira espaço entre eles
  const comPeso = !!d.seriePeso;
  const comAdesao = d.adesao.length > 0 && d.temDados;
  const blocos: { a: number; desenhar: (y: number, a: number) => void }[] = [
    { a: comPeso ? 262 : 300, desenhar: (y, a) => blocoPrincipal(ctx, d, { x: M, y, l: LARGURA - 2 * M, a }) },
  ];
  if (d.temDados) blocos.push({ a: comPeso ? 196 : 210, desenhar: (y, a) => blocosMetricas(ctx, d, y, a) });
  if (comPeso) blocos.push({ a: 180, desenhar: (y, a) => blocoPeso(ctx, d, { x: M, y, l: LARGURA - 2 * M, a }) });
  if (comAdesao) blocos.push({ a: comPeso ? 124 : 140, desenhar: (y, a) => blocoAdesao(ctx, d, { x: M, y, l: LARGURA - 2 * M, a }) });
  const topo = 352;
  const base = ALTURA - M - 72;
  const vagas = blocos.length - 1;
  const gapMin = 22;
  const soma = blocos.reduce((s, b) => s + b.a, 0);
  // Não cabe: os blocos encolhem por igual (o conteúdo deles é proporcional à altura)
  const escala = Math.min((base - topo - gapMin * vagas) / soma, 1);
  for (const b of blocos) b.a = Math.floor(b.a * escala);
  const total = blocos.reduce((s, b) => s + b.a, 0);
  const gap = vagas ? Math.min(Math.max((base - topo - total) / vagas, gapMin), 40) : 0;
  let y = topo + Math.max((base - topo - total - gap * vagas) / 2, 0);
  for (const b of blocos) {
    b.desenhar(y, b.a);
    y += b.a + gap;
  }
  rodape(ctx, d);
}

/** Carrega a marca do app (o desenho sai sem ela se não carregar em 3 s). */
export function carregarMarca(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), 3000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.src = url;
  });
}

/** Gera o PNG do cartão. */
export function gerarPng(d: DadosCartao, marca: CanvasImageSource | null): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas indisponível'));
  desenharCartao(ctx, d, marca);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png'));
}
