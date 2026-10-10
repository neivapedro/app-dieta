import { describe, expect, it } from 'vitest';
import { deBase64 } from './fotos';
import { giroPendente, lerCabecalhoJpeg, transformacaoGiro } from './imagem';

// JPEG 4×2 de verdade (gerado pelo Pillow), EXIF big-endian com orientação 6
const JPEG_MM_6 = '/9j/4AAQSkZJRgABAQAAAQABAAD/4QA0RXhpZgAATU0AKgAAAAgAAgEPAAIAAAAGAAAAJgESAAMAAAABAAYAAAAAAABBcHBsZQD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAACAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDnaKKK88+vP//Z';

/** JPEG mínimo à mão: SOI, APP1 Exif little-endian (só a orientação) e SOF0 */
function jpegLe(orientacao: number, largura: number, altura: number): Uint8Array {
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientacao, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const sof = [0x08, altura >> 8, altura & 0xff, largura >> 8, largura & 0xff, 0x01, 0x01, 0x11, 0x00];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, app1.length + 2, ...app1, 0xff, 0xc0, 0x00, sof.length + 2, ...sof, 0xff, 0xd9]);
}

describe('Cabeçalho do JPEG (orientação EXIF)', () => {
  it('lê a orientação e o tamanho gravado (big-endian, arquivo real)', () => {
    expect(lerCabecalhoJpeg(deBase64(JPEG_MM_6))).toEqual({ orientacao: 6, largura: 4, altura: 2 });
  });
  it('lê little-endian e assume 1 sem EXIF', () => {
    expect(lerCabecalhoJpeg(jpegLe(8, 4000, 3000))).toEqual({ orientacao: 8, largura: 4000, altura: 3000 });
    const semExif = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x01, 0x11, 0x00]);
    expect(lerCabecalhoJpeg(semExif)).toEqual({ orientacao: 1, largura: 32, altura: 16 });
  });
  it('não é JPEG ou arquivo cortado: null, sem erro', () => {
    expect(lerCabecalhoJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(lerCabecalhoJpeg(new Uint8Array([]))).toBeNull();
    expect(lerCabecalhoJpeg(jpegLe(6, 4000, 3000).slice(0, 20))).toBeNull();
  });
  it('só gira quando o navegador não aplicou a orientação 5 a 8', () => {
    const cab = { orientacao: 6, largura: 4000, altura: 3000 };
    expect(giroPendente(cab, 4000, 3000)).toBe(6); // aberta deitada: falta girar
    expect(giroPendente(cab, 3000, 4000)).toBeNull(); // o navegador já girou
    expect(giroPendente({ ...cab, orientacao: 1 }, 4000, 3000)).toBeNull();
    expect(giroPendente({ ...cab, orientacao: 3 }, 4000, 3000)).toBeNull();
    expect(giroPendente(null, 4000, 3000)).toBeNull();
  });
  it('transformação leva os cantos para o lugar certo', () => {
    const aplicar = (t: number[], x: number, y: number) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
    // Imagem gravada 400×300; em pé fica 300×400
    // 6 (girar 90° horário): canto de cima à esquerda vai para cima à direita
    expect(aplicar(transformacaoGiro(6, 400, 300), 0, 0)).toEqual([300, 0]);
    expect(aplicar(transformacaoGiro(6, 400, 300), 400, 300)).toEqual([0, 400]);
    // 8 (girar 90° anti-horário): cima à esquerda vai para baixo à esquerda
    expect(aplicar(transformacaoGiro(8, 400, 300), 0, 0)).toEqual([0, 400]);
    // 5 (transposta) e 7 (transversa)
    expect(aplicar(transformacaoGiro(5, 400, 300), 400, 0)).toEqual([0, 400]);
    expect(aplicar(transformacaoGiro(7, 400, 300), 0, 0)).toEqual([300, 400]);
  });
});
