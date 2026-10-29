// Contas puras do movimento: contagem dos números, puxar para atualizar e arrastar a folha.

/** Duração da contagem dos números (ms) */
export const DURACAO_CONTAGEM = 600;

/** Desacelera no fim (ease-out cúbica). t de 0 a 1. */
export function easeOut(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - x, 3);
}

/** Valor da contagem no instante t (0 a 1): no fim é exatamente o alvo. */
export function valorContagem(de: number, ate: number, t: number): number {
  if (t >= 1) return ate;
  return de + (ate - de) * easeOut(t);
}

/** Puxar para atualizar: distância (após a resistência) que dispara a atualização */
export const LIMITE_PUXAR = 70;
/** Teto da distância do indicador */
export const MAX_PUXAR = 110;

/** O indicador anda menos que o dedo e para perto do teto (efeito elástico). */
export function resistencia(dy: number, max = MAX_PUXAR, k = 130): number {
  if (dy <= 0) return 0;
  return max * (1 - Math.exp(-dy / k));
}

/** Direção do gesto depois de um pequeno limiar; null enquanto não dá para saber. */
export function direcaoGesto(dx: number, dy: number, limiar = 8): 'vertical' | 'horizontal' | null {
  if (Math.abs(dx) < limiar && Math.abs(dy) < limiar) return null;
  return Math.abs(dy) >= Math.abs(dx) ? 'vertical' : 'horizontal';
}

/** Soltou a folha: fecha passando de 25% da altura ou num gesto rápido para baixo (px/ms). */
export function deveFecharFolha(dy: number, altura: number, velocidade: number): boolean {
  if (dy <= 0) return false;
  if (dy >= Math.max(altura, 1) * 0.25) return true;
  return velocidade >= 0.5 && dy >= 20;
}

/** Velocidade (px/ms) entre a primeira e a última amostra recente do dedo. */
export function velocidadeGesto(amostras: { y: number; t: number }[], janela = 100): number {
  if (amostras.length < 2) return 0;
  const ultima = amostras[amostras.length - 1];
  const recentes = amostras.filter((a) => ultima.t - a.t <= janela);
  const primeira = recentes.length >= 2 ? recentes[0] : amostras[amostras.length - 2];
  const dt = ultima.t - primeira.t;
  return dt > 0 ? (ultima.y - primeira.y) / dt : 0;
}

/* ---------- Folha com detentes (média e grande, como no Mapas do iPhone) ---------- */

/** Fração da altura da tela que a folha mostra no detente médio */
export const FRACAO_MEDIA = 0.58;
/** Telas a partir desta largura mostram a folha como janela no meio (sem detentes) */
export const LARGURA_SEM_DETENTES = 600;

/** Altura visível da folha no detente médio (px) */
export function alturaMedia(alturaTela: number): number {
  return Math.round(Math.max(alturaTela, 0) * FRACAO_MEDIA);
}

/**
 * A folha abre no detente médio quando o conteúdo passa bem da altura média
 * (com folga: um conteúdo só um pouco maior abre inteiro, sem detente).
 */
export function usarDetentes(alturaConteudo: number, alturaTela: number, larguraTela: number): boolean {
  if (larguraTela >= LARGURA_SEM_DETENTES || alturaTela <= 0) return false;
  return alturaConteudo > alturaMedia(alturaTela) + 48;
}

export type DestinoFolha = 'grande' | 'media' | 'fechar';

/**
 * Soltou a folha: para onde ela vai. `visivel` é a altura visível agora (px), `media` a do
 * detente médio (0 = sem detentes), `grande` a altura inteira e `v` a velocidade (px/ms,
 * positiva para baixo). Um gesto rápido segue para o detente na direção dele; devagar, vai
 * para o mais perto. Abaixo do médio (ou sem detentes), fecha passando de 25% ou num gesto rápido.
 */
export function destinoFolha(visivel: number, v: number, media: number, grande: number): DestinoFolha {
  const base = media > 0 ? Math.min(media, grande) : grande;
  if (visivel < base) return deveFecharFolha(base - visivel, base, v) ? 'fechar' : media > 0 ? 'media' : 'grande';
  if (media <= 0 || grande - media < 1) return 'grande';
  if (v <= -0.5) return 'grande';
  if (v >= 0.5) return 'media';
  return visivel - media > (grande - media) / 2 ? 'grande' : 'media';
}

/* ---------- Deslizar entre as sub-abas ---------- */

/** Distância mínima (px) para decidir a direção do gesto de troca de aba */
export const LIMIAR_DIRECAO_ABA = 12;

/** O conteúdo acompanha o dedo com resistência (no máximo ~1/3 da largura), mais forte sem aba vizinha. */
export function seguirDedoAba(dx: number, largura: number, temVizinha: boolean): number {
  const max = Math.max(largura, 1) * (temVizinha ? 0.35 : 0.12);
  const s = Math.sign(dx);
  return s * max * (1 - Math.exp(-Math.abs(dx) / (max * 1.6)));
}

/**
 * Soltou: -1 (aba anterior), 1 (próxima) ou 0 (fica). Troca passando de 28% da largura
 * ou num gesto rápido (≥ 0,45 px/ms) de pelo menos 40 px na mesma direção.
 */
export function destinoAba(dx: number, v: number, largura: number): -1 | 0 | 1 {
  const longe = Math.abs(dx) >= Math.max(largura, 1) * 0.28;
  const rapido = Math.abs(v) >= 0.45 && Math.abs(dx) >= 40 && Math.sign(v) === Math.sign(dx);
  if (!longe && !rapido) return 0;
  // Dedo para a esquerda (dx < 0) mostra a próxima aba
  return dx < 0 ? 1 : -1;
}
