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
