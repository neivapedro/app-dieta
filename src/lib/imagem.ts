// Redimensiona e comprime fotos no próprio aparelho (canvas), respeitando a
// orientação EXIF (foto em retrato tirada pelo iPhone continua em pé).

/** Lado maior das fotos guardadas no aparelho */
export const LADO_FOTO = 1280;
export const QUALIDADE_FOTO = 0.8;
/** Lado maior e qualidade das fotos embutidas no PDF (arquivo leve para compartilhar) */
export const LADO_PDF = 900;
export const QUALIDADE_PDF = 0.72;

export interface ImagemPronta {
  blob: Blob;
  largura: number;
  altura: number;
}

const ehHeic = (f: Blob & { name?: string }) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name ?? '');

const ERRO_HEIC =
  'Esta foto está em HEIC e o navegador não conseguiu abrir. No iPhone, escolha "Tirar foto" ou mude em Ajustes → Câmera → Formatos → "Mais compatível" e tente de novo.';

type Fonte = { desenho: CanvasImageSource; largura: number; altura: number; liberar: () => void };

/** Abre a imagem já virada pela orientação EXIF. */
async function decodificar(arquivo: Blob): Promise<Fonte> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
      return { desenho: bmp, largura: bmp.width, altura: bmp.height, liberar: () => bmp.close() };
    } catch {
      /* navegador sem a opção (ou sem suporte ao formato): tenta pela <img> */
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // A <img> já aplica a orientação EXIF nos navegadores atuais
    return { desenho: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasParaBlob(c: HTMLCanvasElement, qualidade: number): Promise<Blob> {
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não deu para comprimir a foto.'))), 'image/jpeg', qualidade));
}

/** Reduz para o lado maior `lado` (sem aumentar) e comprime em JPEG. */
export async function reduzirImagem(arquivo: Blob, lado: number, qualidade: number): Promise<ImagemPronta> {
  let fonte: Fonte;
  try {
    fonte = await decodificar(arquivo);
  } catch {
    throw new Error(ehHeic(arquivo) ? ERRO_HEIC : 'Não deu para abrir este arquivo como foto. Use uma foto JPEG ou PNG.');
  }
  try {
    const escala = Math.min(1, lado / Math.max(fonte.largura, fonte.altura));
    const largura = Math.max(1, Math.round(fonte.largura * escala));
    const altura = Math.max(1, Math.round(fonte.altura * escala));
    const c = document.createElement('canvas');
    c.width = largura;
    c.height = altura;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Não deu para preparar a foto neste aparelho.');
    // Fundo branco: PNG com transparência não vira preto no JPEG
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fonte.desenho, 0, 0, largura, altura);
    const blob = await canvasParaBlob(c, qualidade);
    // Libera a memória do canvas já (o iPhone tem limite baixo para canvas)
    c.width = c.height = 0;
    return { blob, largura, altura };
  } finally {
    fonte.liberar();
  }
}

/** Foto escolhida (câmera ou galeria) → JPEG de ~1280 px para guardar no aparelho. */
export function prepararFoto(arquivo: File): Promise<ImagemPronta> {
  if (arquivo.type && !arquivo.type.startsWith('image/') && !ehHeic(arquivo)) return Promise.reject(new Error('Escolha uma foto (imagem).'));
  return reduzirImagem(arquivo, LADO_FOTO, QUALIDADE_FOTO);
}
