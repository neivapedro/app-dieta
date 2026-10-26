// Contas da tela Medidas: pares do comparador Antes × Depois, a posição da
// cortina e o histórico com a medição anterior de cada uma.
import { fotosDaSessao, POSES, ROTULO_POSE, type FotoInfo, type Pose } from './fotos';

export type ChaveComparar = Pose | 'geral';

export interface ParComparar<T> {
  chave: ChaveComparar;
  rotulo: string;
  antes: T;
  depois: T;
}

/**
 * Pares do comparador: um por pose com foto nas duas sessões (a 1ª do Antes ×
 * a mais recente do Depois, como no PDF). Sem pose em comum, um par só: a 1ª
 * do Antes × a mais recente do Depois. Sem foto numa das sessões, nenhum.
 */
export function paresComparar<T extends FotoInfo>(fotos: T[]): ParComparar<T>[] {
  const antes = fotosDaSessao(fotos, 'antes');
  const depois = fotosDaSessao(fotos, 'depois');
  if (!antes.length || !depois.length) return [];
  const pares: ParComparar<T>[] = [];
  for (const pose of POSES) {
    const a = antes.find((f) => f.rotulo === pose);
    const d = depois.filter((f) => f.rotulo === pose).at(-1);
    if (a && d) pares.push({ chave: pose, rotulo: ROTULO_POSE[pose], antes: a, depois: d });
  }
  if (pares.length) return pares;
  return [{ chave: 'geral', rotulo: 'Primeira × última', antes: antes[0], depois: depois[depois.length - 1] }];
}

/** Posição da cortina (0 a 100%) pelo ponto x do dedo dentro da caixa. */
export function posicaoCortina(x: number, esquerda: number, largura: number): number {
  if (!(largura > 0)) return 50;
  return Math.min(Math.max(((x - esquerda) / largura) * 100, 0), 100);
}

/** Teclado na cortina: setas andam 5%, Page Up/Down 25%, Home/End vão às pontas. null: outra tecla. */
export function passoCortina(pos: number, tecla: string): number | null {
  const passos: Record<string, number> = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -25, PageUp: 25 };
  if (tecla === 'Home') return 0;
  if (tecla === 'End') return 100;
  if (!(tecla in passos)) return null;
  return Math.min(Math.max(pos + passos[tecla], 0), 100);
}

/**
 * Histórico, da mais recente para a mais antiga, com a medição normal anterior
 * de cada uma (para as variações). A atípica fica sem anterior: fica fora das
 * comparações. `indice` é a posição na lista original.
 */
export function historicoComAnterior<T extends { atipica?: boolean }>(lista: T[]): { item: T; indice: number; anterior: T | null }[] {
  const saida: { item: T; indice: number; anterior: T | null }[] = [];
  for (let i = lista.length - 1; i >= 0; i--) {
    const item = lista[i];
    let anterior: T | null = null;
    if (!item.atipica) {
      for (let j = i - 1; j >= 0; j--)
        if (!lista[j].atipica) {
          anterior = lista[j];
          break;
        }
    }
    saida.push({ item, indice: i, anterior });
  }
  return saida;
}
