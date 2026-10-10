import bruto from './retatrutida.json';

// Conteúdo educativo da aba Retatrutida. O texto fica no retatrutida.json;
// aqui só os tipos e a separação das citações [n] para virar link.

export type BlocoTexto = { tipo: 'paragrafo' | 'destaque'; texto: string };
export type BlocoLista = { tipo: 'lista'; itens: string[] };
export type BlocoTabela = { tipo: 'tabela'; cabecalho: string[]; linhas: string[][] };
export type BlocoRetatrutida = BlocoTexto | BlocoLista | BlocoTabela;

export interface SecaoRetatrutida {
  id: string;
  titulo: string;
  resumo?: string;
  blocos: BlocoRetatrutida[];
}

export interface Referencia {
  n: number;
  texto: string;
  url?: string;
}

export interface ConteudoRetatrutida {
  atualizado_em: string;
  aviso: string;
  secoes: SecaoRetatrutida[];
  glossario: { termo: string; definicao: string }[];
  referencias: Referencia[];
}

export const conteudo = bruto as ConteudoRetatrutida;

/** Pedaço de texto: trecho comum, citação (números das referências) ou marca de "dado preliminar". */
export type Parte = { tipo: 'texto'; texto: string } | { tipo: 'cita'; numeros: number[] } | { tipo: 'preliminar'; texto: string };

// Citações no formato [1], [5, 34] ou [27, 35, 36, 45]
const CITACAO = /\[(\d+(?:\s*,\s*\d+)*)\]|(dado preliminar)/g;

export function partesTexto(texto: string): Parte[] {
  const partes: Parte[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(CITACAO)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push({ tipo: 'texto', texto: texto.slice(ultimo, i) });
    if (m[1]) partes.push({ tipo: 'cita', numeros: m[1].split(',').map((n) => Number(n.trim())) });
    else partes.push({ tipo: 'preliminar', texto: m[2] });
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ tipo: 'texto', texto: texto.slice(ultimo) });
  return partes;
}

/** Todos os textos do conteúdo (parágrafos, listas, células, glossário), para conferir as citações. */
export function todosOsTextos(c: ConteudoRetatrutida = conteudo): string[] {
  const textos: string[] = [c.aviso];
  for (const s of c.secoes) {
    if (s.resumo) textos.push(s.resumo);
    for (const b of s.blocos) {
      if (b.tipo === 'lista') textos.push(...b.itens);
      else if (b.tipo === 'tabela') textos.push(...b.cabecalho, ...b.linhas.flat());
      else textos.push(b.texto);
    }
  }
  for (const g of c.glossario) textos.push(g.termo, g.definicao);
  return textos;
}
