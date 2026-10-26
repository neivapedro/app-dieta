import { describe, expect, it } from 'vitest';
import { deBase64 } from './fotos';
import { montarRelatorioFinal } from './relatorio-final';
import { dia, entrada, foto } from './relatorio-final-teste';
import { casasPasso, gerarRelatorioFinalPdf, marcasEixo, montarRelatorioFinalPdf } from './relatorioFinalPdf';
import type { ImagemPdf } from './relatorioPdf';

// JPEG mínimo de 3x4 (retrato)
const JPEG = deBase64(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAEAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCOiiigD//Z',
);
const img = (): ImagemPdf => ({ dados: JPEG, largura: 3, altura: 4 });

const FOTOS = [
  foto('fa', 'antes', 'frente', dia(0)),
  foto('la', 'antes', 'lado', dia(0), 1),
  foto('oa', 'antes', 'outra', dia(1), 2),
  foto('fd', 'depois', 'frente', dia(210)),
  foto('ld', 'depois', 'lado', dia(210), 1),
  foto('od', 'depois', 'outra', dia(205), 2),
];
const imagens = () => new Map(FOTOS.map((f) => [f.id, img()]));

/** Páginas e o texto do PDF (sem compressão, para ler as strings). */
function gerar(o: Parameters<typeof entrada>[0], comFotos = false) {
  const r = montarRelatorioFinal(entrada(o));
  const doc = montarRelatorioFinalPdf(r, comFotos ? imagens() : null, { comprimir: false });
  const texto = new TextDecoder('latin1').decode(new Uint8Array(doc.output('arraybuffer')));
  return { r, paginas: doc.getNumberOfPages(), texto };
}

describe('PDF final do ciclo', () => {
  it('ciclo concluído com treino e fotos: capa, seções, fotos e linha final', () => {
    const { paginas, texto } = gerar({ fotos: FOTOS }, true);
    expect(texto.startsWith('%PDF-')).toBe(true);
    expect(paginas).toBeGreaterThanOrEqual(9);
    expect(paginas).toBeLessThanOrEqual(18);
    for (const s of ['Ciclo conclu', 'PESO', 'Resumo do ciclo', 'Corpo', 'Fases e decis', 'Linha do tempo', 'Treino', 'Antes e depois', 'Recordes', 'Metas do projeto', 'Semana a semana', 'registra e calcula'])
      expect(texto, s).toContain(s);
    // Cada foto entra uma vez só no arquivo (a capa reaproveita a do par)
    expect((texto.match(/\/Subtype \/Image/g) ?? []).length).toBe(FOTOS.length);
    // Número da página em todas
    expect(texto).toContain(`(${paginas}/${paginas})`);
    // A fonte não tem o sinal de menos: nenhum sobra no texto
    expect(texto).not.toContain('−');
  });

  it('sem marcar "Incluir fotos": nenhuma imagem e sem a seção de fotos', () => {
    const { texto } = gerar({ fotos: FOTOS }, false);
    expect(texto).not.toContain('/Subtype /Image');
    expect(texto).not.toContain('Antes e depois');
  });

  it('prévia: estado e aviso na capa', () => {
    const { r, paginas, texto } = gerar({ doses: 10, hoje: dia(68) });
    expect(r.estado).toBe('previa');
    expect(texto).toContain('ciclo em andamento');
    expect(texto).toContain('mudam at');
    expect(paginas).toBeGreaterThanOrEqual(6);
  });

  it('perfil feminino sem a aba Treino: quadril e nada de treino', () => {
    const { texto } = gerar({ sexo: 'Feminino', treino: false });
    expect(texto).toContain('Quadril');
    expect(texto).not.toContain('Dias com treino');
    expect(texto).not.toContain('Melhor pace');
  });

  it('sem medições, com uma medição só e sem aplicação: gera sem erro', () => {
    expect(gerar({ semMedidas: true, semPesoDiario: true }).texto).toContain('sem medi');
    expect(gerar({ medicoes: 1 }).paginas).toBeGreaterThan(3);
    const vazio = gerar({ doses: 0, hoje: '2026-01-01', semMedidas: true });
    expect(vazio.paginas).toBeLessThanOrEqual(2);
    expect(vazio.texto).toContain('primeira aplica');
  });

  it('com foto marcada mas sem a imagem (apagada no meio): caixa "Sem foto"', () => {
    const r = montarRelatorioFinal(entrada({ fotos: FOTOS }));
    const doc = montarRelatorioFinalPdf(r, new Map([['fa', img()]]), { comprimir: false });
    const texto = new TextDecoder('latin1').decode(new Uint8Array(doc.output('arraybuffer')));
    expect(texto).toContain('Sem foto');
  });

  it('devolve um Blob de PDF', () => {
    const blob = gerarRelatorioFinalPdf(montarRelatorioFinal(entrada({ doses: 4, hoje: dia(30) })), null);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(10_000);
  });
});

describe('eixos dos gráficos', () => {
  it('marcas redondas que cobrem os dados', () => {
    expect(marcasEixo(83.4, 98.1)).toEqual({ marcas: [80, 85, 90, 95, 100], passo: 5 });
    expect(marcasEixo(0, 7.3, 3).marcas).toEqual([0, 2.5, 5, 7.5]);
    const um = marcasEixo(70, 70);
    expect(um.marcas[0]).toBeLessThan(70);
    expect(um.marcas.at(-1)!).toBeGreaterThan(70);
  });
  it('casas decimais pelo passo', () => {
    expect(casasPasso(5)).toBe(0);
    expect(casasPasso(2.5)).toBe(1);
    expect(casasPasso(0.25)).toBe(2);
  });
});
