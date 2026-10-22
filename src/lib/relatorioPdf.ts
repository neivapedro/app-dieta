import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';
import type { FotosPdf, LadoFotoPdf, Sessao } from './fotos';

// Relatório da Análise em PDF de verdade, gerado no próprio aparelho.
// No iPhone com o app instalado, window.print() não funciona; o PDF vai para o
// menu Compartilhar (Salvar em Arquivos, Imprimir, WhatsApp, e-mail).

export interface TabelaRelatorio {
  titulo: string;
  cabecalho: string[];
  linhas: string[][];
  nota?: string;
}

export interface GraficoRelatorio {
  /** Dia (número de dias desde 1970) e valor */
  pesos: { dia: number; kg: number; atipica?: boolean }[];
  /** Doses aplicadas, em degraus */
  doses: { dia: number; mg: number }[];
  diaFinal: number;
  /** Fim do degrau da última dose (remédio concluído); sem ele, vai até diaFinal */
  fimDoses?: number;
  rotulo: (dia: number) => string;
  /** Dias com decisão registrada: linhas verticais pontilhadas */
  marcos?: number[];
}

/** Quadro de decisão da 1ª página: fase anterior × fase atual (ou que termina). */
export interface QuadroRelatorio {
  titulo: string;
  /** Cabeçalho das colunas: [anterior, atual] */
  colunas: [string, string];
  secoes: { titulo: string; linhas: [string, string, string][] }[];
  /** "Próxima dose prevista: data · mg" */
  proxima: string;
  /** Regras do Plano (situação, o que fazer), com caixa para o médico marcar */
  regras: [string, string][];
  nota?: string;
}

/** JPEG já reduzido para o PDF */
export interface ImagemPdf {
  dados: Uint8Array;
  largura: number;
  altura: number;
}

/**
 * Páginas "Antes e depois": os pares por pose (Antes × Depois, com a data e os
 * números de cada foto) e as outras fotos de cada sessão em grade. As imagens
 * vêm por id da foto.
 */
export interface FotosRelatorio extends FotosPdf {
  imagens: Map<string, ImagemPdf>;
  nota?: string;
}

export interface ModeloRelatorio {
  titulo: string;
  subtitulo: string;
  /** Uma linha: remédio e concentração, idade, altura, peso e % de gordura no início */
  cabecalho?: string;
  /** Quadro de decisão e tabela semana a semana, antes do resumo */
  quadro?: QuadroRelatorio | null;
  semanal?: TabelaRelatorio | null;
  resumo: [string, string][];
  ritmo: string;
  grafico: GraficoRelatorio | null;
  tabelas: TabelaRelatorio[];
  /** Só quando a pessoa marca "Incluir fotos de antes e depois" */
  fotos?: FotosRelatorio | null;
  rodape: string;
}

/** As fontes padrão do PDF não têm alguns símbolos: troca por equivalentes. */
export function textoPdf(s: string): string {
  return s
    .replace(/−/g, '-')
    .replace(/→/g, '->')
    .replace(/≈/g, '~')
    .replace(/✓/g, 'ok')
    .replace(/ | /g, ' ')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[μµ]/g, 'u')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{FE0E}\u{200D}]/gu, '')
    // O que sobrar fora do WinAnsi (a codificação da fonte padrão) sairia embaralhado: sai do texto
    .replace(/[^\n\t\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/gu, '')
    .trim();
}

const MARGEM = 14;
const LARGURA = 210 - MARGEM * 2;
const ESCURO: [number, number, number] = [24, 24, 27];
const CINZA: [number, number, number] = [110, 110, 115];

function fimTabela(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function garantirEspaco(doc: jsPDF, y: number, altura: number): number {
  if (y + altura > 297 - 16) {
    doc.addPage();
    return 18;
  }
  return y;
}

function titulo(doc: jsPDF, y: number, texto: string): number {
  y = garantirEspaco(doc, y, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ESCURO);
  doc.text(textoPdf(texto), MARGEM, y);
  return y + 3;
}

function nota(doc: jsPDF, y: number, texto: string): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA);
  const linhas = doc.splitTextToSize(textoPdf(texto), LARGURA);
  y = garantirEspaco(doc, y, linhas.length * 3.4 + 2);
  doc.text(linhas, MARGEM, y + 3);
  return y + linhas.length * 3.4 + 3;
}

/** Até 2 casas, sem zeros à direita (0,75 e não 0,8). */
function rotuloEixo(v: number): string {
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

function tabela(doc: jsPDF, y: number, t: TabelaRelatorio, fonte = 7.5): number {
  if (!t.linhas.length) {
    // Sem linhas, mas com nota (ex.: metas do plano alimentar sem refeições): mostra a nota
    if (!t.nota) return y;
    y = titulo(doc, y + 6, t.titulo);
    return nota(doc, y + 1, t.nota);
  }
  y = titulo(doc, y + 6, t.titulo);
  autoTable(doc, {
    startY: y + 1,
    head: [t.cabecalho.map(textoPdf)],
    body: t.linhas.map((l) => l.map(textoPdf)),
    theme: 'grid',
    margin: { left: MARGEM, right: MARGEM, top: 18 },
    styles: { fontSize: fonte, cellPadding: 1.4, textColor: ESCURO, lineColor: [225, 225, 228], lineWidth: 0.2 },
    headStyles: { fillColor: [38, 38, 41], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 247, 248] },
  });
  y = fimTabela(doc);
  if (t.nota) y = nota(doc, y + 1, t.nota);
  return y;
}

function desenharQuadro(doc: jsPDF, y: number, q: QuadroRelatorio): number {
  y = titulo(doc, y, q.titulo);
  const corpo: RowInput[] = [];
  for (const s of q.secoes) {
    corpo.push([{ content: textoPdf(s.titulo), colSpan: 3, styles: { fontStyle: 'bold', fillColor: [236, 236, 239], textColor: ESCURO } }]);
    for (const l of s.linhas) corpo.push(l.map(textoPdf));
  }
  autoTable(doc, {
    startY: y + 1,
    head: [['', ...q.colunas.map(textoPdf)]],
    body: corpo,
    theme: 'grid',
    margin: { left: MARGEM, right: MARGEM, top: 18 },
    styles: { fontSize: 8, cellPadding: 1.4, textColor: ESCURO, lineColor: [225, 225, 228], lineWidth: 0.2 },
    headStyles: { fillColor: [38, 38, 41], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 48, textColor: CINZA } },
  });
  y = fimTabela(doc);
  if (q.nota) y = nota(doc, y + 1, q.nota);

  // Próxima dose prevista
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...ESCURO);
  const prox = doc.splitTextToSize(textoPdf(q.proxima), LARGURA);
  y = garantirEspaco(doc, y + 3, prox.length * 4.2 + 2);
  doc.text(prox, MARGEM, y + 4);
  y += prox.length * 4.2 + 3;

  // Regras do Plano com caixas para marcar (remédio concluído: sem regras de subir de fase)
  if (!q.regras.length) return y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...CINZA);
  y = garantirEspaco(doc, y, 8);
  doc.text(textoPdf('Regras do Plano para o fim da fase (marcar a decisão combinada):'), MARGEM, y + 3);
  y += 5;
  doc.setTextColor(...ESCURO);
  doc.setDrawColor(...ESCURO);
  doc.setLineWidth(0.3);
  const itens = [...q.regras.map(([sit, acao]) => `${sit} -> ${acao}`), 'Outra decisão: ____________________________________________'];
  for (const item of itens) {
    const linhas = doc.splitTextToSize(textoPdf(item), LARGURA - 7);
    y = garantirEspaco(doc, y, linhas.length * 3.6 + 2);
    doc.rect(MARGEM, y + 0.6, 3, 3);
    doc.text(linhas, MARGEM + 5.5, y + 3);
    y += linhas.length * 3.6 + 1.6;
  }
  return y;
}

function desenharGrafico(doc: jsPDF, y: number, g: GraficoRelatorio): number {
  const altura = 62;
  y = garantirEspaco(doc, y, altura + 14);
  const x0 = MARGEM + 10;
  const x1 = MARGEM + LARGURA - 10;
  const yTopo = y + 4;
  const yBase = y + altura - 8;
  const dias = [...g.pesos.map((p) => p.dia), ...g.doses.map((d) => d.dia), g.diaFinal];
  const dMin = Math.min(...dias);
  const dMax = Math.max(Math.max(...dias), dMin + 1);
  const px = (d: number) => x0 + ((d - dMin) / (dMax - dMin)) * (x1 - x0);

  // Eixo do peso (esquerda) e da dose (direita)
  const kgs = g.pesos.map((p) => p.kg);
  let kMin = kgs.length ? Math.floor(Math.min(...kgs) - 0.5) : 0;
  let kMax = kgs.length ? Math.ceil(Math.max(...kgs) + 0.5) : 1;
  if (kMax - kMin < 2) kMax = kMin + 2;
  const mgMax = Math.max(1, Math.ceil(Math.max(0, ...g.doses.map((d) => d.mg)) + 0.5));
  const pyKg = (v: number) => yBase - ((v - kMin) / (kMax - kMin)) * (yBase - yTopo);
  const pyMg = (v: number) => yBase - (v / mgMax) * (yBase - yTopo);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...CINZA);
  doc.setDrawColor(225, 225, 228);
  doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) {
    const yy = yTopo + ((yBase - yTopo) * i) / 4;
    doc.line(x0, yy, x1, yy);
    doc.text(rotuloEixo(kMax - ((kMax - kMin) * i) / 4), x0 - 1.5, yy + 1, { align: 'right' });
    doc.text(rotuloEixo(mgMax - (mgMax * i) / 4), x1 + 1.5, yy + 1);
  }
  // Datas no eixo X: início, meio e fim
  for (const d of [dMin, Math.round((dMin + dMax) / 2), dMax]) doc.text(g.rotulo(d), px(d), yBase + 4, { align: 'center' });

  // Decisões registradas: linhas verticais pontilhadas, discretas
  if (g.marcos?.length) {
    doc.setDrawColor(190, 190, 195);
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([0.6, 1], 0);
    for (const d of g.marcos) if (d >= dMin && d <= dMax) doc.line(px(d), yTopo, px(d), yBase);
    doc.setLineDashPattern([], 0);
  }
  // Dose em degraus (tracejada)
  if (g.doses.length) {
    doc.setDrawColor(150, 150, 155);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([1.5, 1.2], 0);
    const degraus = [...g.doses].sort((a, b) => a.dia - b.dia);
    for (let i = 0; i < degraus.length; i++) {
      const atual = degraus[i];
      const prox = degraus[i + 1]?.dia ?? Math.min(g.fimDoses ?? g.diaFinal, g.diaFinal);
      doc.line(px(atual.dia), pyMg(atual.mg), px(prox), pyMg(atual.mg));
      if (degraus[i + 1]) doc.line(px(prox), pyMg(atual.mg), px(prox), pyMg(degraus[i + 1].mg));
    }
    doc.setLineDashPattern([], 0);
  }
  // Peso (linha cheia com pontos)
  if (g.pesos.length) {
    doc.setDrawColor(...ESCURO);
    doc.setFillColor(...ESCURO);
    doc.setLineWidth(0.6);
    // A medição atípica fica fora da linha, como ponto vazio (como no gráfico da tela)
    const pts = [...g.pesos].filter((p) => !p.atipica).sort((a, b) => a.dia - b.dia);
    for (let i = 1; i < pts.length; i++) doc.line(px(pts[i - 1].dia), pyKg(pts[i - 1].kg), px(pts[i].dia), pyKg(pts[i].kg));
    for (const p of pts) doc.circle(px(p.dia), pyKg(p.kg), 0.7, 'F');
    doc.setLineWidth(0.35);
    for (const p of g.pesos.filter((x) => x.atipica)) doc.circle(px(p.dia), pyKg(p.kg), 0.9, 'S');
  }
  // Legenda
  doc.setTextColor(...ESCURO);
  doc.setFontSize(7.5);
  const yl = y + altura - 1;
  doc.setDrawColor(...ESCURO);
  doc.setLineWidth(0.6);
  doc.line(MARGEM + LARGURA / 2 - 32, yl - 1, MARGEM + LARGURA / 2 - 26, yl - 1);
  doc.text('Peso (kg, esquerda)', MARGEM + LARGURA / 2 - 25, yl);
  doc.setDrawColor(150, 150, 155);
  doc.setLineDashPattern([1.5, 1.2], 0);
  doc.line(MARGEM + LARGURA / 2 + 8, yl - 1, MARGEM + LARGURA / 2 + 14, yl - 1);
  doc.setLineDashPattern([], 0);
  doc.text('Dose (mg, direita)', MARGEM + LARGURA / 2 + 15, yl);
  const notas = [
    ...(g.pesos.some((p) => p.atipica) ? ['Ponto vazio: medição atípica (fora da linha do peso).'] : []),
    ...(g.marcos?.some((d) => d >= dMin && d <= dMax) ? ['Linhas pontilhadas verticais: decisões registradas (tabela Decisões).'] : []),
  ];
  if (notas.length) {
    doc.setFontSize(7);
    doc.setTextColor(...CINZA);
    notas.forEach((n, i) => doc.text(textoPdf(n), MARGEM + LARGURA / 2, yl + 4 + i * 3.5, { align: 'center' }));
    return y + altura + 2.5 + notas.length * 3.5;
  }
  return y + altura + 2;
}

// ---------- Páginas "Antes e depois" ----------

/** Topo e limite de baixo das páginas (o número da página fica abaixo) */
const TOPO_PAGINA = 18;
const FIM_PAGINA = 297 - 16;
/** Par por pose: título, rótulo, foto 3:4 e respiro */
export const ALTURA_IMG_PAR_PDF = 64;
export const ALTURA_PAR_PDF = ALTURA_IMG_PAR_PDF + 16;
/** Subtítulo "Outras fotos do Antes" */
export const ALTURA_SUBTITULO_PDF = 9;
/** Linha da grade: 3 fotos 3:4 com a data embaixo */
export const ALTURA_IMG_GRADE_PDF = 52;
export const ALTURA_LINHA_GRADE_PDF = ALTURA_IMG_GRADE_PDF + 10;
export const FOTOS_POR_LINHA_PDF = 3;

export type ItemPaginaFotos = { pagina: number; y: number } & (
  | { tipo: 'par'; indice: number }
  | { tipo: 'subtitulo'; sessao: Sessao }
  /** Fotos [inicio, fim) da grade da sessão */
  | { tipo: 'linha'; sessao: Sessao; inicio: number; fim: number }
);

/**
 * Onde vai cada bloco das páginas de fotos (página 0 = a primeira delas, que
 * começa abaixo do título). Os pares vêm primeiro; depois as outras fotos do
 * Antes e do Depois, 3 por linha. O subtítulo nunca fica sozinho no pé da
 * página: vai junto com a primeira linha.
 */
export function paginarFotosPdf(n: { pares: number; antes: number; depois: number }, yInicio: number): ItemPaginaFotos[] {
  const itens: ItemPaginaFotos[] = [];
  let pagina = 0;
  let y = yInicio;
  const caber = (altura: number) => {
    if (y + altura > FIM_PAGINA) {
      pagina++;
      y = TOPO_PAGINA;
    }
  };
  for (let i = 0; i < n.pares; i++) {
    caber(ALTURA_PAR_PDF);
    itens.push({ tipo: 'par', indice: i, pagina, y });
    y += ALTURA_PAR_PDF;
  }
  for (const [sessao, total] of [
    ['antes', n.antes],
    ['depois', n.depois],
  ] as const) {
    if (!total) continue;
    caber(ALTURA_SUBTITULO_PDF + ALTURA_LINHA_GRADE_PDF);
    itens.push({ tipo: 'subtitulo', sessao, pagina, y });
    y += ALTURA_SUBTITULO_PDF;
    for (let inicio = 0; inicio < total; inicio += FOTOS_POR_LINHA_PDF) {
      caber(ALTURA_LINHA_GRADE_PDF);
      itens.push({ tipo: 'linha', sessao, inicio, fim: Math.min(total, inicio + FOTOS_POR_LINHA_PDF), pagina, y });
      y += ALTURA_LINHA_GRADE_PDF;
    }
  }
  return itens;
}

/** Imagem inteira dentro da caixa (foto deitada fica menor, sem cortar); sem imagem, a caixa vazia. */
function desenharImagem(doc: jsPDF, img: ImagemPdf | null | undefined, x: number, y: number, w: number, h: number) {
  if (img && img.largura > 0 && img.altura > 0) {
    const escala = Math.min(w / img.largura, h / img.altura);
    const iw = img.largura * escala;
    const ih = img.altura * escala;
    doc.addImage(img.dados, 'JPEG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'NONE');
    return;
  }
  doc.setDrawColor(225, 225, 228);
  doc.setFillColor(247, 247, 248);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA);
  doc.text('Sem foto', x + w / 2, y + h / 2, { align: 'center' });
}

/** Um lado (Antes ou Depois) de um par: foto à esquerda, data e números à direita. */
function desenharLadoFoto(doc: jsPDF, x: number, y: number, largura: number, alturaImg: number, rotulo: string, lado: LadoFotoPdf, img: ImagemPdf | null | undefined, variacao: string[]) {
  const larguraImg = (alturaImg * 3) / 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...ESCURO);
  doc.text(textoPdf(`${rotulo} · ${lado.data}`), x, y + 3);
  const yImg = y + 5;
  desenharImagem(doc, img, x, yImg, larguraImg, alturaImg);
  // Números ao lado da foto
  const xt = x + larguraImg + 3;
  const lt = largura - larguraImg - 3;
  let yt = yImg + 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...ESCURO);
  for (const l of lado.linhas) {
    const linhas = doc.splitTextToSize(textoPdf(l), lt);
    doc.text(linhas, xt, yt);
    yt += linhas.length * 3.4 + 0.6;
  }
  if (variacao.length) {
    yt += 2;
    doc.setFont('helvetica', 'bold');
    doc.text(textoPdf('Variação'), xt, yt);
    yt += 3.8;
    doc.setFont('helvetica', 'normal');
    for (const l of variacao) {
      const linhas = doc.splitTextToSize(textoPdf(l), lt);
      doc.text(linhas, xt, yt);
      yt += linhas.length * 3.4 + 0.6;
    }
  }
}

/**
 * Páginas "Antes e depois": primeiro um par por pose (a primeira foto do Antes
 * × a mais recente do Depois), depois as outras fotos de cada sessão em grade
 * com a data embaixo, quebrando a página quando precisa.
 */
function desenharFotos(doc: jsPDF, f: FotosRelatorio): number {
  doc.addPage();
  const primeira = doc.getNumberOfPages();
  const yInicio = titulo(doc, TOPO_PAGINA, 'Antes e depois') + 1;
  const coluna = (LARGURA - 6) / 2;
  const colunaGrade = (LARGURA - 6 * (FOTOS_POR_LINHA_PDF - 1)) / FOTOS_POR_LINHA_PDF;
  const larguraImgGrade = (ALTURA_IMG_GRADE_PDF * 3) / 4;
  let y = yInicio;
  for (const item of paginarFotosPdf({ pares: f.pares.length, antes: f.outrasAntes.length, depois: f.outrasDepois.length }, yInicio)) {
    while (doc.getNumberOfPages() < primeira + item.pagina) doc.addPage();
    doc.setPage(primeira + item.pagina);
    if (item.tipo === 'par') {
      const p = f.pares[item.indice];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...ESCURO);
      doc.text(textoPdf(p.titulo), MARGEM, item.y + 3);
      doc.setDrawColor(225, 225, 228);
      doc.setLineWidth(0.2);
      doc.line(MARGEM + 16, item.y + 2, MARGEM + LARGURA, item.y + 2);
      desenharLadoFoto(doc, MARGEM, item.y + 5, coluna, ALTURA_IMG_PAR_PDF, 'Antes', p.antes, f.imagens.get(p.idAntes), []);
      desenharLadoFoto(doc, MARGEM + coluna + 6, item.y + 5, coluna, ALTURA_IMG_PAR_PDF, 'Depois', p.depois, f.imagens.get(p.idDepois), p.variacao);
      y = item.y + ALTURA_PAR_PDF;
    } else if (item.tipo === 'subtitulo') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...ESCURO);
      const texto = item.sessao === 'antes' ? 'Outras fotos do Antes' : 'Outras fotos do Depois';
      doc.text(textoPdf(texto), MARGEM, item.y + 4);
      doc.setDrawColor(225, 225, 228);
      doc.setLineWidth(0.2);
      doc.line(MARGEM + doc.getTextWidth(textoPdf(texto)) + 3, item.y + 3, MARGEM + LARGURA, item.y + 3);
      y = item.y + ALTURA_SUBTITULO_PDF;
    } else {
      const lista = item.sessao === 'antes' ? f.outrasAntes : f.outrasDepois;
      for (let i = item.inicio; i < item.fim; i++) {
        const foto = lista[i];
        const x = MARGEM + (i - item.inicio) * (colunaGrade + 6);
        desenharImagem(doc, f.imagens.get(foto.id), x + (colunaGrade - larguraImgGrade) / 2, item.y, larguraImgGrade, ALTURA_IMG_GRADE_PDF);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...ESCURO);
        doc.text(textoPdf(foto.legenda), x + colunaGrade / 2, item.y + ALTURA_IMG_GRADE_PDF + 4, { align: 'center' });
      }
      y = item.y + ALTURA_LINHA_GRADE_PDF;
    }
  }
  doc.setPage(doc.getNumberOfPages());
  if (f.nota) y = nota(doc, y + 1, f.nota);
  return y;
}

export function gerarRelatorioPdf(m: ModeloRelatorio): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: textoPdf(m.titulo) });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...ESCURO);
  doc.text(textoPdf(m.titulo), MARGEM, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...CINZA);
  doc.text(textoPdf(m.subtitulo), MARGEM, 23.5);
  let y = 26;
  if (m.cabecalho) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ESCURO);
    const cab = doc.splitTextToSize(textoPdf(m.cabecalho), LARGURA);
    doc.text(cab, MARGEM, 28.5);
    y = 28.5 + cab.length * 3.8;
  }

  // 1ª página: quadro de decisão e, em seguida, a tabela semana a semana
  if (m.quadro) y = desenharQuadro(doc, y + 5, m.quadro);
  if (m.semanal) y = tabela(doc, y, m.semanal, 6.8);

  // Resumo em 2 pares por linha
  y = titulo(doc, y + 7, 'Resumo do ciclo');
  const pares: string[][] = [];
  for (let i = 0; i < m.resumo.length; i += 2) {
    const a = m.resumo[i];
    const b = m.resumo[i + 1];
    pares.push([textoPdf(a[0]), textoPdf(a[1]), b ? textoPdf(b[0]) : '', b ? textoPdf(b[1]) : '']);
  }
  autoTable(doc, {
    startY: y,
    body: pares,
    theme: 'plain',
    margin: { left: MARGEM, right: MARGEM },
    styles: { fontSize: 8.5, cellPadding: 1.3, textColor: ESCURO },
    columnStyles: { 0: { textColor: CINZA, cellWidth: 34 }, 1: { fontStyle: 'bold', cellWidth: 57 }, 2: { textColor: CINZA, cellWidth: 34 }, 3: { fontStyle: 'bold' } },
  });
  y = nota(doc, fimTabela(doc) + 1, m.ritmo);

  if (m.grafico && (m.grafico.pesos.length || m.grafico.doses.length)) {
    y = titulo(doc, y + 5, 'Peso x dose');
    y = desenharGrafico(doc, y, m.grafico);
  }

  for (const t of m.tabelas) y = tabela(doc, y, t);

  if (m.fotos && (m.fotos.pares.length || m.fotos.outrasAntes.length || m.fotos.outrasDepois.length)) y = desenharFotos(doc, m.fotos);

  y = nota(doc, y + 6, m.rodape);

  // Número das páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...CINZA);
    doc.text(`${i}/${total}`, 210 - MARGEM, 290, { align: 'right' });
  }
  return doc.output('blob');
}
