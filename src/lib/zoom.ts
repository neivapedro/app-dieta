/**
 * Contas do zoom da foto (pinça, toque duplo e arraste), sem DOM.
 *
 * Coordenadas: tudo em px relativos ao canto de cima/esquerda da imagem sem
 * transformação. A imagem usa `transform-origin: 0 0`, então um ponto `q` da
 * imagem aparece em `t + s·q` (t = translação, s = escala).
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
/** Escala do toque duplo */
export const ZOOM_DUPLO = 2.5;
/** Acima disto a foto conta como ampliada (troca de foto desligada, arraste move a foto) */
export const ZOOM_LIMIAR = 1.01;

export interface Vista {
  x: number;
  y: number;
  s: number;
}
export interface Tamanho {
  w: number;
  h: number;
}
export interface Ponto {
  x: number;
  y: number;
}

export const VISTA_INICIAL: Vista = { x: 0, y: 0, s: 1 };

export const ampliada = (v: Vista) => v.s > ZOOM_LIMIAR;

/** Texto do data-zoom: escala com até 2 casas ("1", "2.5") */
export const textoEscala = (s: number) => String(Math.round(s * 100) / 100);

/**
 * Tamanho do desenho de verdade dentro do elemento com `object-fit: contain`
 * (sem as faixas vazias). Sem o tamanho natural (imagem não carregou), usa o elemento todo.
 */
export function areaConteudo(elemento: Tamanho, natural: Tamanho): Tamanho {
  if (!(natural.w > 0 && natural.h > 0) || !(elemento.w > 0 && elemento.h > 0)) return { ...elemento };
  const k = Math.min(elemento.w / natural.w, elemento.h / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

/** Escala com resistência fora de [mín, máx], para a pinça passar um pouco e voltar ao soltar */
export function escalaElastica(s: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  if (s > max) return max * Math.pow(s / max, 0.3);
  if (s < min) return min * Math.pow(s / min, 0.5);
  return s;
}

/** Nova vista com a escala `s` mantendo `p` (ponto na tela) parado sob o dedo */
export function zoomNoPonto(v: Vista, s: number, p: Ponto): Vista {
  const k = s / v.s;
  return { x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, s };
}

/**
 * Pinça: guarda o ponto da imagem que estava sob o meio dos dedos no começo e o
 * põe sob o meio atual (então mexer os dois dedos juntos também arrasta).
 */
export function vistaDaPinca(inicio: Vista, meio0: Ponto, dist0: number, meio: Ponto, dist: number): Vista {
  const s = escalaElastica(inicio.s * (dist / Math.max(dist0, 1)));
  const qx = (meio0.x - inicio.x) / inicio.s;
  const qy = (meio0.y - inicio.y) / inicio.s;
  return { x: meio.x - s * qx, y: meio.y - s * qy, s };
}

/** Limite de uma direção: o desenho cobre a janela (sem vão) ou, se for menor que ela, fica no meio */
function limitarEixo(t: number, s: number, janela: number, conteudo: number): number {
  const ini = (janela - conteudo) / 2; // faixa vazia do contain antes do desenho
  const tam = s * conteudo;
  if (tam <= janela) return (janela - s * janela) / 2 + 0; // centraliza (o desenho está no meio do elemento)
  const min = janela - s * (ini + conteudo);
  const max = -s * ini;
  return Math.min(max, Math.max(min, t)) + 0; // + 0: sem -0
}

/**
 * Prende a translação para o desenho nunca deixar vão nas bordas da janela
 * (a própria imagem sem transformação). `conteudo` é o desenho dentro dela (ver areaConteudo).
 */
export function limitarVista(v: Vista, janela: Tamanho, conteudo: Tamanho): Vista {
  return { s: v.s, x: limitarEixo(v.x, v.s, janela.w, conteudo.w), y: limitarEixo(v.y, v.s, janela.h, conteudo.h) };
}

/** Fim do gesto: escala de volta para [1, 4] (abaixo de 1 volta ao normal) e translação presa */
export function assentarVista(v: Vista, janela: Tamanho, conteudo: Tamanho, p?: Ponto): Vista {
  if (v.s <= ZOOM_LIMIAR) return { ...VISTA_INICIAL };
  const s = Math.min(ZOOM_MAX, v.s);
  const centro = p ?? { x: janela.w / 2, y: janela.h / 2 };
  return limitarVista(s === v.s ? v : zoomNoPonto(v, s, centro), janela, conteudo);
}

/** Toque duplo: normal → 2,5× no ponto tocado; ampliada → volta ao normal */
export function alternarZoom(v: Vista, p: Ponto, janela: Tamanho, conteudo: Tamanho): Vista {
  if (ampliada(v)) return { ...VISTA_INICIAL };
  return limitarVista(zoomNoPonto(v, ZOOM_DUPLO, p), janela, conteudo);
}
