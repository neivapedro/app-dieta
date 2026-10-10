import { describe, expect, it } from 'vitest';
import { deBase64, montarSecoesFotos } from './fotos';
import { gerarRelatorioPdf, textoPdf } from './relatorioPdf';

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

  it('com fotos: página "Antes e depois" com as imagens embutidas', async () => {
    // JPEG mínimo de 3x4 (retrato)
    const jpeg = deBase64('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAEAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCOiiigD//Z');
    const comp = (data: string, peso: number) => ({ data, peso_kg: peso, bf: 24, massa_magra_kg: null, massa_gorda_kg: null, cintura_cm: 97, pescoco_cm: 41, quadril_cm: null });
    const secoes = montarSecoesFotos(
      [
        { sessao: 'antes', pose: 'frente', data: '2026-09-07' },
        { sessao: 'depois', pose: 'frente', data: '2026-12-07' },
        { sessao: 'antes', pose: 'costas', data: '2026-09-07' },
      ],
      [comp('2026-09-07', 96), comp('2026-12-07', 90)],
      false,
    );
    const img = { dados: jpeg, largura: 3, altura: 4 };
    const modelo = { titulo: 'Relatório', subtitulo: 's', resumo: [], ritmo: 'r', grafico: null, tabelas: [], rodape: 'rodapé' };
    const semFotos = await gerarRelatorioPdf(modelo).arrayBuffer();
    const blob = gerarRelatorioPdf({
      ...modelo,
      fotos: { secoes: secoes.map((s) => ({ ...s, imgAntes: img, imgDepois: s.depois ? img : null })), nota: 'nota' },
    });
    const texto = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect((texto.match(/\/Type \/Page\b/g) ?? []).length).toBe(2);
    expect(texto).toContain('/DCTDecode');
    expect(new TextDecoder('latin1').decode(new Uint8Array(semFotos))).not.toContain('/DCTDecode');
  });
});
