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

/**
 * Orientação EXIF (1 a 8) e tamanho gravado no JPEG (marcador SOF), lidos do
 * cabeçalho. null quando não é JPEG ou o cabeçalho não chega ao SOF.
 */
export function lerCabecalhoJpeg(b: Uint8Array): { orientacao: number; largura: number; altura: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let orientacao = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = b[i + 1];
    if (marcador === 0xff) {
      i++;
      continue;
    }
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      i += 2;
      continue;
    }
    const tam = (b[i + 2] << 8) | b[i + 3];
    if (tam < 2) return null;
    const ini = i + 4;
    // APP1 "Exif\0\0": procura a tag 0x0112 (orientação) no IFD0
    if (marcador === 0xe1 && ini + 14 <= b.length && b[ini] === 0x45 && b[ini + 1] === 0x78 && b[ini + 2] === 0x69 && b[ini + 3] === 0x66) {
      const t = ini + 6;
      const le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000 : b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]));
      const ifd = t + u32(t + 4);
      if (ifd + 2 <= b.length) {
        const n = u16(ifd);
        for (let k = 0; k < n && ifd + 2 + k * 12 + 10 <= b.length; k++) {
          const e = ifd + 2 + k * 12;
          if (u16(e) === 0x0112) {
            const v = u16(e + 8);
            if (v >= 1 && v <= 8) orientacao = v;
            break;
          }
        }
      }
    }
    // SOF0..SOF15 (menos DHT, JPG e DAC): altura e largura gravadas
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      if (ini + 5 > b.length) return null;
      return { orientacao, altura: (b[ini + 1] << 8) | b[ini + 2], largura: (b[ini + 3] << 8) | b[ini + 4] };
    }
    if (marcador === 0xda) return null;
    i = ini + tam - 2;
  }
  return null;
}

/**
 * Orientações 5 a 8 (foto em pé gravada deitada) que o navegador NÃO aplicou:
 * a imagem aberta tem o mesmo tamanho gravado no arquivo. Rede de segurança
 * para navegadores que ignoram o EXIF no createImageBitmap ou no canvas.
 */
export function giroPendente(cab: { orientacao: number; largura: number; altura: number } | null, largura: number, altura: number): number | null {
  if (!cab || cab.orientacao < 5 || cab.largura === cab.altura) return null;
  return cab.largura === largura && cab.altura === altura ? cab.orientacao : null;
}

/** Transformação do canvas para desenhar a imagem (sw × sh) já girada pela orientação 5 a 8. */
export function transformacaoGiro(orientacao: number, sw: number, sh: number): [number, number, number, number, number, number] {
  switch (orientacao) {
    case 5:
      return [0, 1, 1, 0, 0, 0];
    case 6:
      return [0, 1, -1, 0, sh, 0];
    case 7:
      return [0, -1, -1, 0, sh, sw];
    default:
      return [0, -1, 1, 0, 0, sw];
  }
}

async function cabecalho(arquivo: Blob): Promise<ReturnType<typeof lerCabecalhoJpeg>> {
  try {
    // O EXIF e o SOF ficam no começo do arquivo
    return lerCabecalhoJpeg(new Uint8Array(await arquivo.slice(0, 512 * 1024).arrayBuffer()));
  } catch {
    return null;
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
    const giro = giroPendente(await cabecalho(arquivo), fonte.largura, fonte.altura);
    const escala = Math.min(1, lado / Math.max(fonte.largura, fonte.altura));
    // Tamanho da imagem como está gravada (sw × sh) e como fica em pé (largura × altura)
    const sw = Math.max(1, Math.round(fonte.largura * escala));
    const sh = Math.max(1, Math.round(fonte.altura * escala));
    const [largura, altura] = giro ? [sh, sw] : [sw, sh];
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
    // O navegador não virou a foto pelo EXIF: vira aqui
    if (giro) ctx.setTransform(...transformacaoGiro(giro, sw, sh));
    ctx.drawImage(fonte.desenho, 0, 0, sw, sh);
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
