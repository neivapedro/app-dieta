import { describe, expect, it } from 'vitest';
import { deBase64, montarFotosPdf, type FotoInfo, type Rotulo, type Sessao } from './fotos';
import { ALTURA_LINHA_GRADE_PDF, ALTURA_PAR_PDF, gerarRelatorioPdf, paginarFotosPdf, textoPdf, type ImagemPdf } from './relatorioPdf';

describe('Relatório em PDF', () => {
  it('troca símbolos que a fonte do PDF não tem', () => {
    expect(textoPdf('− 2,1 kg → 95 ≈ ok ✓ 💉')).toBe('- 2,1 kg -> 95 ~ ok ok');
  });
  it('gera um PDF com várias páginas sem erro', async () => {
    const linhas = Array.from({ length: 60 }, (_, i) => [String(i + 1), '01/10/26', '1,25 mg', '1', '–', 'Abdome direito']);
    const blob = gerarRelatorioPdf({
      titulo: 'Relatório do ciclo · Pedro',
      subtitulo: 'Gerado em 09/10/2026.',
      resumo: [
        ['Início', '01/10/2026'],
        ['Cintura', '− 2,4 cm'],
        ['Peso', '− 2,4 kg (− 2,5%)'],
      ],
      ritmo: 'Ritmo atual: 0,50% do peso por semana.',
      grafico: { pesos: [{ dia: 20000, kg: 97 }, { dia: 20007, kg: 96.5 }], doses: [{ dia: 20000, mg: 1.25 }], diaFinal: 20010, rotulo: (d) => String(d) },
      tabelas: [{ titulo: 'Aplicações', cabecalho: ['Nº', 'Data', 'Dose', 'Fase', 'Atraso', 'Local'], linhas, nota: 'nota' }],
      rodape: 'rodapé',
    });
    const texto = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(texto.startsWith('%PDF-')).toBe(true);
    expect((texto.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  it('gera o PDF com cabeçalho, quadro de decisão, semana a semana e marcos de decisão', async () => {
    const blob = gerarRelatorioPdf({
      titulo: 'Relatório do ciclo · Pedro',
      subtitulo: 'Gerado em 10 de outubro de 2026.',
      cabecalho: 'Retatrutida 20 mg/ml · 31 anos · 181 cm · peso no início 95,0 kg · 24,0% de gordura no início',
      quadro: {
        titulo: 'Quadro de decisão',
        colunas: ['Fase anterior: 1,25 mg · fase 1\n05/10/26 a 01/11/26', 'Fase atual: 1,50 mg · fase 2\n02/11/26 a 10/11/26 (em curso)'],
        secoes: [
          { titulo: 'Eficácia', linhas: [['Massa gorda', '− 0,24 kg/sem', '–']] },
          { titulo: 'Tolerância', linhas: [['Vômitos', '07/10 D2', 'nenhum']] },
        ],
        proxima: 'Próxima dose prevista: 11/12/2026 · 1,75 mg',
        regras: [['Tolerou bem', 'Sobe para a próxima fase.']],
        nota: 'nota',
      },
      semanal: { titulo: 'Semana a semana', cabecalho: ['Segunda', 'Dose mg'], linhas: [['05/10/26', '1,25']] },
      resumo: [['Início', '01/10/2026']],
      ritmo: 'Ritmo.',
      grafico: { pesos: [{ dia: 20000, kg: 97 }], doses: [{ dia: 20000, mg: 1.25 }], diaFinal: 20010, rotulo: (d) => String(d), marcos: [20005] },
      tabelas: [{ titulo: 'Vazia', cabecalho: [], linhas: [], nota: 'Aparece com 4 medições.' }],
      rodape: 'rodapé',
    });
    const texto = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(texto.startsWith('%PDF-')).toBe(true);
  });

  // JPEG mínimo de 3x4 (retrato)
  const jpeg = deBase64('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAEAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCOiiigD//Z');
  const comp = (data: string, peso: number) => ({ data, peso_kg: peso, bf: 24, massa_magra_kg: null, massa_gorda_kg: null, cintura_cm: 97, pescoco_cm: 41, quadril_cm: null });
  const modelo = { titulo: 'Relatório', subtitulo: 's', resumo: [], ritmo: 'r', grafico: null, tabelas: [], rodape: 'rodapé' };
  let n = 0;
  const foto = (sessao: Sessao, rotulo: Rotulo, data: string): FotoInfo => ({ id: `f${++n}`, sessao, rotulo, data, ordem: n });
  const paginas = async (b: Blob) => (new TextDecoder('latin1').decode(new Uint8Array(await b.arrayBuffer())).match(/\/Type \/Page\b/g) ?? []).length;
  const imagens = (fotos: FotoInfo[]) => new Map<string, ImagemPdf>(fotos.map((f) => [f.id, { dados: jpeg, largura: 3, altura: 4 }]));

  it('com fotos: página "Antes e depois" com as imagens embutidas', async () => {
    const fotos = [foto('antes', 'frente', '2026-09-07'), foto('depois', 'frente', '2026-12-07'), foto('antes', 'costas', '2026-09-07')];
    const semFotos = await gerarRelatorioPdf(modelo).arrayBuffer();
    const blob = gerarRelatorioPdf({
      ...modelo,
      fotos: { ...montarFotosPdf(fotos, [comp('2026-09-07', 96), comp('2026-12-07', 90)], false), imagens: imagens(fotos), nota: 'nota' },
    });
    const texto = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect((texto.match(/\/Type \/Page\b/g) ?? []).length).toBe(2);
    expect(texto).toContain('/DCTDecode');
    expect(new TextDecoder('latin1').decode(new Uint8Array(semFotos))).not.toContain('/DCTDecode');
    // Sem nenhuma foto no modelo: nenhuma página de fotos
    expect(await paginas(gerarRelatorioPdf({ ...modelo, fotos: { pares: [], outrasAntes: [], outrasDepois: [], imagens: new Map() } }))).toBe(1);
  });

  it('páginas de fotos: pares primeiro, grade 3 por linha, quebra de página sem cortar nada', () => {
    const itens = paginarFotosPdf({ pares: 3, antes: 10, depois: 7 }, 22);
    // 3 pares na 1ª página
    expect(itens.filter((i) => i.tipo === 'par').map((i) => i.pagina)).toEqual([0, 0, 0]);
    const linhas = itens.filter((i) => i.tipo === 'linha');
    expect(linhas.filter((i) => i.sessao === 'antes').map((i) => (i.tipo === 'linha' ? i.fim - i.inicio : 0))).toEqual([3, 3, 3, 1]);
    expect(linhas.filter((i) => i.sessao === 'depois').map((i) => (i.tipo === 'linha' ? i.fim - i.inicio : 0))).toEqual([3, 3, 1]);
    // Nada passa do fim da página, e as páginas só avançam
    for (const i of itens) {
      const altura = i.tipo === 'par' ? ALTURA_PAR_PDF : i.tipo === 'linha' ? ALTURA_LINHA_GRADE_PDF : 9;
      expect(i.y + altura).toBeLessThanOrEqual(297 - 16);
    }
    expect(itens.map((i) => i.pagina)).toEqual([...itens.map((i) => i.pagina)].sort((a, b) => a - b));
    // Subtítulo sempre na mesma página da primeira linha da sua grade
    for (const [k, i] of itens.entries()) if (i.tipo === 'subtitulo') expect(itens[k + 1]).toMatchObject({ tipo: 'linha', sessao: i.sessao, inicio: 0, pagina: i.pagina });
    // 4 linhas por página na grade (12 fotos)
    const soGrade = paginarFotosPdf({ pares: 0, antes: 30, depois: 0 }, 22);
    expect(soGrade.filter((i) => i.tipo === 'linha' && i.pagina === 1)).toHaveLength(4);
    expect(Math.max(...soGrade.map((i) => i.pagina))).toBe(2);
    expect(paginarFotosPdf({ pares: 0, antes: 0, depois: 0 }, 22)).toEqual([]);
  });

  it('PDF com muitas fotos (8 + 5 por sessão e pares): várias páginas, todas as imagens embutidas', async () => {
    const fotos = [
      ...Array.from({ length: 8 }, (_, i) => foto('antes', (['frente', 'lado', 'costas', 'outra'] as const)[i % 4], `2026-09-0${1 + i}`)),
      ...Array.from({ length: 5 }, (_, i) => foto('depois', (['frente', 'lado', 'outra'] as const)[i % 3], `2026-12-0${1 + i}`)),
    ];
    const conteudo = montarFotosPdf(fotos, [], false);
    expect(conteudo.pares.map((p) => p.rotulo)).toEqual(['frente', 'lado']);
    expect(conteudo.outrasAntes).toHaveLength(6);
    expect(conteudo.outrasDepois).toHaveLength(3);
    const blob = gerarRelatorioPdf({ ...modelo, fotos: { ...conteudo, imagens: imagens(fotos), nota: 'nota' } });
    // 1ª página do relatório + 2 pares e o subtítulo do Antes na 1ª de fotos, o resto na 2ª
    expect(await paginas(blob)).toBe(3);
    const texto = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect((texto.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(texto).toContain('Outras fotos do Depois');
  });
});
