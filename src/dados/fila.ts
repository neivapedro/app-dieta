import type { PlanoDieta } from '../lib/dieta';
import type { Aplicacao, Medida, RegistroDiario, TreinoDia } from '../lib/tipos';
import type { Repositorio } from './repositorio';

// Fila de gravações guardada no aparelho. A tela muda na hora (otimista) e a
// gravação vai em seguida, uma de cada vez. Sem internet, a fila espera e é
// enviada quando a conexão volta, mesmo que o app seja fechado no meio.

export type Operacao =
  | { tipo: 'treino'; dado: Omit<TreinoDia, 'id'> }
  | { tipo: 'diario'; dado: Omit<RegistroDiario, 'id'> }
  | { tipo: 'dieta'; dado: PlanoDieta }
  // Aplicação e medição levam o id criado no aparelho: reenviar nunca duplica
  | { tipo: 'aplicacao'; dado: Aplicacao }
  | { tipo: 'medida'; dado: Medida }
  // Exclusão também passa pela fila: substitui uma edição pendente do mesmo registro
  // e funciona sem internet. No Diário, o id pode ser 'pendente:<data>'.
  | { tipo: 'excluir'; dado: { alvo: 'aplicacao' | 'medida' | 'diario'; id: string; data: string } };

export type ItemFila = Operacao & { chave: string; versao: number };

export function chaveDe(op: Operacao): string {
  if (op.tipo === 'dieta') return 'dieta';
  if (op.tipo === 'excluir') return op.dado.alvo === 'diario' ? `diario:${op.dado.data}` : `${op.dado.alvo}:${op.dado.id}`;
  if (op.tipo === 'aplicacao' || op.tipo === 'medida') return `${op.tipo}:${op.dado.id}`;
  return `${op.tipo}:${op.dado.data}`;
}

const prefixo = 'app-dieta:fila:';

export function lerFila(usuario: string): ItemFila[] {
  try {
    return JSON.parse(localStorage.getItem(prefixo + usuario) ?? '[]') as ItemFila[];
  } catch {
    return [];
  }
}

export function gravarFila(usuario: string, fila: ItemFila[]) {
  try {
    if (fila.length) localStorage.setItem(prefixo + usuario, JSON.stringify(fila));
    else localStorage.removeItem(prefixo + usuario);
  } catch {
    /* armazenamento indisponível: a fila segue só na memória */
  }
}

/** Uma operação nova substitui a anterior com a mesma chave (o último estado vale). */
export function enfileirar(fila: ItemFila[], op: Operacao, versao: number): ItemFila[] {
  const chave = chaveDe(op);
  return [...fila.filter((i) => i.chave !== chave), { ...op, chave, versao }];
}

export async function executarOperacao(repo: Repositorio, op: Operacao) {
  if (op.tipo === 'treino') return repo.salvarTreino(op.dado);
  if (op.tipo === 'diario') return repo.salvarDiario(op.dado);
  if (op.tipo === 'aplicacao') return repo.salvarAplicacao(op.dado);
  if (op.tipo === 'medida') return repo.salvarMedida(op.dado);
  if (op.tipo === 'excluir') {
    if (op.dado.alvo === 'aplicacao') return repo.excluirAplicacao(op.dado.id);
    if (op.dado.alvo === 'medida') return repo.excluirMedida(op.dado.id);
    return repo.excluirDiario(op.dado.id);
  }
  return repo.salvarDieta(op.dado);
}

interface Aplicavel {
  treinos: TreinoDia[];
  diario: RegistroDiario[];
  dieta: PlanoDieta | null;
  aplicacoes?: Aplicacao[];
  medidas?: Medida[];
}

const porData = <T extends { data: string }>(a: T, b: T) => a.data.localeCompare(b.data);

/** Aplica as operações ainda não enviadas sobre os dados (do servidor ou do cache). */
export function aplicarFila<T extends Aplicavel>(dados: T, fila: ItemFila[]): T {
  let { treinos, diario, dieta, aplicacoes, medidas } = dados;
  for (const op of fila) {
    if (op.tipo === 'excluir') {
      const { alvo, id, data } = op.dado;
      if (alvo === 'aplicacao' && aplicacoes) aplicacoes = aplicacoes.filter((a) => a.id !== id);
      if (alvo === 'medida' && medidas) medidas = medidas.filter((m) => m.id !== id);
      if (alvo === 'diario') diario = diario.filter((r) => r.data !== data);
      continue;
    }
    if (op.tipo === 'aplicacao' && aplicacoes) {
      aplicacoes = [...aplicacoes.filter((a) => a.id !== op.dado.id), op.dado].sort(porData);
      continue;
    }
    if (op.tipo === 'medida' && medidas) {
      medidas = [...medidas.filter((m) => m.id !== op.dado.id), op.dado].sort(porData);
      continue;
    }
    if (op.tipo === 'aplicacao' || op.tipo === 'medida') continue;
    if (op.tipo === 'treino') {
      const atual = treinos.find((t) => t.data === op.dado.data);
      treinos = [...treinos.filter((t) => t.data !== op.dado.data), { ...op.dado, id: atual?.id ?? `pendente:${op.dado.data}` }].sort((a, b) =>
        a.data.localeCompare(b.data),
      );
    } else if (op.tipo === 'diario') {
      const atual = diario.find((r) => r.data === op.dado.data);
      diario = [...diario.filter((r) => r.data !== op.dado.data), { ...op.dado, id: atual?.id ?? `pendente:${op.dado.data}` }].sort((a, b) =>
        a.data.localeCompare(b.data),
      );
    } else {
      dieta = op.dado;
    }
  }
  return { ...dados, treinos, diario, dieta, ...(aplicacoes ? { aplicacoes } : {}), ...(medidas ? { medidas } : {}) };
}

// --- Última cópia dos dados, para abrir sem internet ---

const prefixoCache = 'app-dieta:cache:';

export function lerCache<T>(usuario: string): { em: string; dados: T } | null {
  try {
    const v = localStorage.getItem(prefixoCache + usuario);
    return v ? (JSON.parse(v) as { em: string; dados: T }) : null;
  } catch {
    return null;
  }
}

export function gravarCache(usuario: string, dados: unknown, em = new Date().toISOString()) {
  try {
    localStorage.setItem(prefixoCache + usuario, JSON.stringify({ em, dados }));
  } catch {
    /* sem espaço: segue sem cópia offline */
  }
}

export function apagarDadosLocais(usuario: string) {
  try {
    localStorage.removeItem(prefixoCache + usuario);
  } catch {
    /* nada */
  }
}
