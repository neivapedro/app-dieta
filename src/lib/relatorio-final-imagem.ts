// Cartão de stories do Relatório final (1080 × 1920, PNG) com a Canvas 2D. Sempre escuro,
// como o cartão de progresso; os números vêm prontos do modelo (relatorio-final.ts).
import { corAdesao, corDoTom, espacar, fonte, hexComAlfa, PALETA, painel, retangulo, rotulo, texto, type Caixa } from './compartilhar-imagem';
import type { MetricaCartaoFinal, RelatorioFinal } from './relatorio-final';

export const LARGURA_STORIES = 1080;
export const ALTURA_STORIES = 1920;
const M = 72;

/** Acentos do relatório (= tokens --c-* do tema escuro). */
export const ACENTOS = { indigo: '#8e8cff', rosa: '#ff6482', ciano: '#5ac8e6', azul: '#409cff', roxo: '#c77dff', laranja: '#ff9f0a' } as const;

export interface FotoStories {
  imagem: CanvasImageSource & { width: number; height: number };
  /** "Antes · 05/01/26" */
  legenda: string;
}

export interface OpcoesStories {
  incluirPeso: boolean;
  incluirDose: boolean;
  /** Par de fotos (só com a opção ligada) */
  fotos: { antes: FotoStories; depois: FotoStories } | null;
}

function fundo(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, LARGURA_STORIES * 0.4, ALTURA_STORIES);
  g.addColorStop(0, '#17162a');
  g.addColorStop(0.55, '#0d0d12');
  g.addColorStop(1, '#09090a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LARGURA_STORIES, ALTURA_STORIES);
  const brilho = (x: number, y: number, r: number, cor: string, a: number) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexComAlfa(cor, a));
    rg.addColorStop(1, hexComAlfa(cor, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, LARGURA_STORIES, ALTURA_STORIES);
  };
  brilho(LARGURA_STORIES - 80, 120, 820, ACENTOS.indigo, 0.32);
  brilho(40, 900, 700, ACENTOS.rosa, 0.12);
  brilho(LARGURA_STORIES, ALTURA_STORIES - 200, 760, ACENTOS.ciano, 0.12);
}

function cabecalho(ctx: CanvasRenderingContext2D, c: RelatorioFinal['cartao'], marca: CanvasImageSource | null) {
  const lado = 96;
  const caixa = { x: M, y: M, l: lado, a: lado };
  retangulo(ctx, caixa, 26);
  const g = ctx.createLinearGradient(0, M, 0, M + lado);
  g.addColorStop(0, '#3a3a3c');
  g.addColorStop(1, '#0b0b0c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETA.borda;
  ctx.stroke();
  if (marca) {
    const a = 74;
    const l = a * (417 / 480);
    ctx.drawImage(marca, M + (lado - l) / 2, M + (lado - a) / 2, l, a);
  }
  texto(ctx, 'Ciclo', M + lado + 24, M + 50, { px: 44, peso: 750, cor: PALETA.texto });
  texto(ctx, 'relatório final', M + lado + 24, M + 86, { px: 26, peso: 500, cor: PALETA.texto3 });
  fonte(ctx, 600, 26);
  const largura = Math.min(ctx.measureText(c.periodo).width + 48, 440);
  const p = { x: LARGURA_STORIES - M - largura, y: M + 20, l: largura, a: 56 };
  retangulo(ctx, p, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETA.borda;
  ctx.stroke();
  texto(ctx, c.periodo, p.x + largura / 2, p.y + 37, { px: 26, peso: 600, cor: PALETA.texto, alinhar: 'center', max: largura - 32 });
}

/** Foto preenchendo a caixa (corte central), com cantos arredondados e a legenda embaixo. */
function foto(ctx: CanvasRenderingContext2D, f: FotoStories, c: Caixa, cor: string) {
  ctx.save();
  retangulo(ctx, c, 32);
  ctx.clip();
  ctx.fillStyle = '#1c1c1f';
  ctx.fillRect(c.x, c.y, c.l, c.a);
  const ri = f.imagem.width / f.imagem.height;
  const rc = c.l / c.a;
  let sw = f.imagem.width;
  let sh = f.imagem.height;
  if (ri > rc) sw = sh * rc;
  else sh = sw / rc;
  ctx.drawImage(f.imagem, (f.imagem.width - sw) / 2, (f.imagem.height - sh) / 2, sw, sh, c.x, c.y, c.l, c.a);
  const g = ctx.createLinearGradient(0, c.y + c.a - 160, 0, c.y + c.a);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = g;
  ctx.fillRect(c.x, c.y + c.a - 160, c.l, 160);
  ctx.restore();
  retangulo(ctx, c, 32);
  ctx.lineWidth = 3;
  ctx.strokeStyle = hexComAlfa(cor, 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c.x + 36, c.y + c.a - 38, 9, 0, Math.PI * 2);
  ctx.fillStyle = cor;
  ctx.fill();
  texto(ctx, f.legenda, c.x + 56, c.y + c.a - 28, { px: 28, peso: 700, cor: '#ffffff', max: c.l - 80, minimo: 16 });
}

function blocoPrincipal(ctx: CanvasRenderingContext2D, m: MetricaCartaoFinal, c: Caixa) {
  painel(ctx, c, 40, true);
  // Faixa colorida à esquerda
  ctx.save();
  retangulo(ctx, c, 40);
  ctx.clip();
  const g = ctx.createLinearGradient(c.x, c.y, c.x, c.y + c.a);
  g.addColorStop(0, ACENTOS.indigo);
  g.addColorStop(1, ACENTOS.rosa);
  ctx.fillStyle = g;
  ctx.fillRect(c.x, c.y, 10, c.a);
  ctx.restore();
  const x = c.x + 48;
  rotulo(ctx, m.rotulo, x, c.y + 62, ACENTOS.indigo, 26);
  // Número entre o rótulo e o detalhe, do maior tamanho que cabe na altura (nunca encosta neles)
  const px = Math.max(48, Math.min(150, (c.a - 62 - 20 - 34 - 40) / 0.9));
  texto(ctx, m.texto, x, c.y + 62 + 20 + px * 0.76, { px, peso: 800, cor: m.tom ? corDoTom(m.tom) : PALETA.texto, max: c.l - 96, minimo: 40 });
  texto(ctx, m.detalhe, x, c.y + c.a - 34, { px: 30, peso: 500, cor: PALETA.texto2, max: c.l - 96 });
}

function blocoMetrica(ctx: CanvasRenderingContext2D, m: MetricaCartaoFinal, c: Caixa, cor: string) {
  painel(ctx, c, 32);
  const x = c.x + 34;
  ctx.beginPath();
  ctx.arc(x + 8, c.y + 48, 8, 0, Math.PI * 2);
  ctx.fillStyle = cor;
  ctx.fill();
  espacar(ctx, 2);
  texto(ctx, m.rotulo.toUpperCase(), x + 26, c.y + 56, { px: 22, peso: 700, cor: PALETA.texto3, max: c.l - 80, minimo: 14 });
  espacar(ctx, 0);
  const px = Math.max(30, Math.min(76, (c.a - 56 - 14 - 26 - 30) / 0.9));
  texto(ctx, m.texto, x, c.y + 56 + 14 + px * 0.76, { px, peso: 800, cor: m.tom ? corDoTom(m.tom) : PALETA.texto, max: c.l - 68, minimo: 26 });
  texto(ctx, m.detalhe, x, c.y + c.a - 26, { px: 25, peso: 500, cor: PALETA.texto2, max: c.l - 68, minimo: 14 });
}

function blocoAdesao(ctx: CanvasRenderingContext2D, itens: { rotulo: string; fracao: number }[], c: Caixa) {
  painel(ctx, c, 32);
  const n = itens.length;
  const l = (c.l - 24) / n;
  const r = Math.min(34, (c.a - 48) / 2);
  const cy = c.y + c.a / 2;
  itens.forEach((it, i) => {
    const x0 = c.x + 12 + l * i;
    const cx = x0 + 22 + r;
    ctx.lineWidth = 10;
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
    texto(ctx, `${Math.round(f * 100)}%`, tx, cy + 4, { px: 34, peso: 800, cor: PALETA.texto, max: largura, minimo: 16 });
    texto(ctx, it.rotulo, tx, cy + 34, { px: 22, peso: 600, cor: PALETA.texto2, max: largura, minimo: 12 });
  });
}

function fichas(ctx: CanvasRenderingContext2D, itens: string[], y: number) {
  let x = M;
  fonte(ctx, 650, 28);
  const cores = [ACENTOS.ciano, ACENTOS.laranja];
  itens.forEach((t, i) => {
    const l = Math.min(ctx.measureText(t).width + 70, (LARGURA_STORIES - 2 * M - 20) / itens.length);
    const c = { x, y, l, a: 64 };
    retangulo(ctx, c, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETA.borda;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 30, y + 32, 8, 0, Math.PI * 2);
    ctx.fillStyle = cores[i % cores.length];
    ctx.fill();
    texto(ctx, t, x + 48, y + 42, { px: 28, peso: 650, cor: PALETA.texto, max: l - 64, minimo: 16 });
    x += l + 20;
  });
}

/** Desenha o cartão de stories inteiro (1080 × 1920). */
export function desenharStoriesFinal(ctx: CanvasRenderingContext2D, c: RelatorioFinal['cartao'], o: OpcoesStories, marca: CanvasImageSource | null) {
  ctx.textBaseline = 'alphabetic';
  fundo(ctx);
  cabecalho(ctx, c, marca);
  rotulo(ctx, c.sobretitulo, M, 268, ACENTOS.rosa, 28);
  texto(ctx, c.titulo, M, 356, { px: 88, peso: 800, cor: PALETA.texto, max: LARGURA_STORIES - 2 * M, minimo: 44 });

  const L = LARGURA_STORIES - 2 * M;
  const gapX = 24;
  const meia = (L - gapX) / 2;
  const metricas = [...c.metricas, ...(o.incluirPeso ? [c.peso] : [])].slice(0, 4);
  const coresMetricas = [ACENTOS.laranja, ACENTOS.azul, ACENTOS.ciano, ACENTOS.roxo];
  const blocos: { a: number; desenhar: (y: number, a: number) => void }[] = [];
  if (o.fotos) {
    const f = o.fotos;
    blocos.push({
      a: 470,
      desenhar: (y, a) => {
        foto(ctx, f.antes, { x: M, y, l: meia, a }, ACENTOS.indigo);
        foto(ctx, f.depois, { x: M + meia + gapX, y, l: meia, a }, ACENTOS.rosa);
      },
    });
  }
  blocos.push({ a: o.fotos ? 250 : 340, desenhar: (y, a) => blocoPrincipal(ctx, c.principal, { x: M, y, l: L, a }) });
  for (let i = 0; i < metricas.length; i += 2) {
    const par = metricas.slice(i, i + 2);
    blocos.push({
      a: o.fotos ? 190 : 230,
      desenhar: (y, a) =>
        par.forEach((m, k) => blocoMetrica(ctx, m, { x: M + k * (meia + gapX), y, l: par.length === 1 ? L : meia, a }, coresMetricas[i + k])),
    });
  }
  const itensFichas = [c.duracao, ...(o.incluirDose ? [c.doses] : [])];
  blocos.push({ a: 64, desenhar: (y) => fichas(ctx, itensFichas, y) });
  if (c.adesao.length) blocos.push({ a: o.fotos ? 130 : 160, desenhar: (y, a) => blocoAdesao(ctx, c.adesao, { x: M, y, l: L, a }) });

  const topo = 410;
  const base = ALTURA_STORIES - M - 80;
  const vagas = blocos.length - 1;
  const gapMin = 22;
  const soma = blocos.reduce((s, b) => s + b.a, 0);
  const escala = Math.min((base - topo - gapMin * vagas) / soma, 1);
  for (const b of blocos) b.a = Math.floor(b.a * escala);
  const total = blocos.reduce((s, b) => s + b.a, 0);
  const gap = vagas ? Math.min(Math.max((base - topo - total) / vagas, gapMin), 48) : 0;
  let y = topo + Math.max((base - topo - total - gap * vagas) / 2, 0);
  for (const b of blocos) {
    b.desenhar(y, b.a);
    y += b.a + gap;
  }

  // Rodapé
  const yr = ALTURA_STORIES - M + 6;
  ctx.fillStyle = PALETA.borda;
  ctx.fillRect(M, yr - 52, L, 2);
  const g = ctx.createLinearGradient(M, 0, M + 18, 0);
  g.addColorStop(0, ACENTOS.indigo);
  g.addColorStop(1, ACENTOS.rosa);
  ctx.beginPath();
  ctx.arc(M + 8, yr - 9, 9, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  texto(ctx, 'Ciclo · acompanhamento', M + 28, yr, { px: 26, peso: 650, cor: PALETA.texto2 });
  texto(ctx, 'Sem cor: dentro do erro da fita', LARGURA_STORIES - M, yr, { px: 22, peso: 500, cor: PALETA.texto3, alinhar: 'right', max: 440, minimo: 14 });
}

/** Gera o PNG do cartão de stories. */
export function gerarStoriesFinal(c: RelatorioFinal['cartao'], o: OpcoesStories, marca: CanvasImageSource | null): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA_STORIES;
  canvas.height = ALTURA_STORIES;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas indisponível'));
  desenharStoriesFinal(ctx, c, o, marca);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png'));
}
