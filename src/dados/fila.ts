import type { PlanoDieta } from '../lib/dieta';
import type { RegistroDiario, TreinoDia } from '../lib/tipos';
import type { Repositorio } from './repositorio';

// Fila de gravações guardada no aparelho. A tela muda na hora (otimista) e a
// gravação vai em seguida, uma de cada vez. Sem internet, a fila espera e é
// enviada quando a conexão volta, mesmo que o app seja fechado no meio.

export type Operacao =
  | { tipo: 'treino'; dado: Omit<TreinoDia, 'id'> }
  | { tipo: 'diario'; dado: Omit<RegistroDiario, 'id'> }
  | { tipo: 'dieta'; dado: PlanoDieta };

export type ItemFila = Operacao & { chave: string; versao: number };

export function chaveDe(op: Operacao): string {
  return op.tipo === 'dieta' ? 'dieta' : `${op.tipo}:${op.dado.data}`;
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
  return repo.salvarDieta(op.dado);
}

interface Aplicavel {
  treinos: TreinoDia[];
  diario: RegistroDiario[];
  dieta: PlanoDieta | null;
}

/** Aplica as operações ainda não enviadas sobre os dados (do servidor ou do cache). */
export function aplicarFila<T extends Aplicavel>(dados: T, fila: ItemFila[]): T {
  let { treinos, diario, dieta } = dados;
  for (const op of fila) {
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
  return { ...dados, treinos, diario, dieta };
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

export function gravarCache(usuario: string, dados: unknown) {
  try {
    localStorage.setItem(prefixoCache + usuario, JSON.stringify({ em: new Date().toISOString(), dados }));
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
