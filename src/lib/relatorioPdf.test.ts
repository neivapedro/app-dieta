import { describe, expect, it } from 'vitest';
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
});
