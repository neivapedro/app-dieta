import { describe, expect, it } from 'vitest';
import { conteudo, partesTexto, todosOsTextos } from './retatrutida';

describe('Conteúdo da retatrutida', () => {
  it('toda seção tem id único, título e pelo menos um bloco', () => {
    const ids = conteudo.secoes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of conteudo.secoes) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.titulo.trim().length).toBeGreaterThan(0);
      expect(s.blocos.length).toBeGreaterThan(0);
    }
  });

  it('toda citação [n] aponta para uma referência que existe', () => {
    const existentes = new Set(conteudo.referencias.map((r) => r.n));
    const citadas = new Set<number>();
    for (const t of todosOsTextos()) {
      for (const p of partesTexto(t)) if (p.tipo === 'cita') p.numeros.forEach((n) => citadas.add(n));
    }
    expect(citadas.size).toBeGreaterThan(0);
    expect([...citadas].filter((n) => !existentes.has(n))).toEqual([]);
  });

  it('referências numeradas sem repetição e com link http(s)', () => {
    const ns = conteudo.referencias.map((r) => r.n);
    expect(new Set(ns).size).toBe(ns.length);
    for (const r of conteudo.referencias) {
      expect(r.texto.trim().length).toBeGreaterThan(0);
      if (r.url) expect(r.url).toMatch(/^https?:\/\//);
    }
  });

  it('blocos conhecidos e tabelas com o mesmo número de colunas em todas as linhas', () => {
    for (const s of conteudo.secoes) {
      for (const b of s.blocos) {
        expect(['paragrafo', 'destaque', 'lista', 'tabela']).toContain(b.tipo);
        if (b.tipo === 'tabela') for (const l of b.linhas) expect(l).toHaveLength(b.cabecalho.length);
        if (b.tipo === 'lista') expect(b.itens.length).toBeGreaterThan(0);
      }
    }
  });

  it('separa citações simples e múltiplas do texto', () => {
    expect(partesTexto('Meia-vida de 6 dias [7]. Bulas [5, 34].')).toEqual([
      { tipo: 'texto', texto: 'Meia-vida de 6 dias ' },
      { tipo: 'cita', numeros: [7] },
      { tipo: 'texto', texto: '. Bulas ' },
      { tipo: 'cita', numeros: [5, 34] },
      { tipo: 'texto', texto: '.' },
    ]);
    expect(partesTexto('sem citação')).toEqual([{ tipo: 'texto', texto: 'sem citação' }]);
  });
});
