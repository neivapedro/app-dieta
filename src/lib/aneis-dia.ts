// Anéis do dia (estilo Apple Fitness) no Início: Treino (ou Diário), Dieta (ou Checklist) e Água.
// Só descreve o que foi anotado; não grava nada e nunca sugere dose.
import { diferencaDias, segundaDaSemana as segunda, somarDias } from './datas';
import { num } from './formato';
import { progressoTarefas, tarefasDoDia } from './inicio-hoje';
import type { Medida, RegistroDiario, TreinoDia } from './tipos';

export type ChaveAnel = 'treino' | 'diario' | 'dieta' | 'checklist' | 'agua';
export type PosicaoAnel = 'externo' | 'meio' | 'interno';

export interface AnelDia {
  chave: ChaveAnel;
  rotulo: string;
  /** 0 a 1 (Água pode passar de 1: o anel desenha no máximo a volta inteira) */
  fracao: number;
  /** Algo anotado no dia para este anel */
  anotado: boolean;
  fechado: boolean;
  /** Valor da legenda: "1/2", "—", "2,0/3,1 L" */
  texto: string;
  /** Frase curta para leitores de tela e para o detalhe do dia */
  descricao: string;
}

export interface AneisDia {
  externo: AnelDia;
  meio: AnelDia;
  interno: AnelDia;
}

export const POSICOES: PosicaoAnel[] = ['externo', 'meio', 'interno'];

export interface EntradaAneis {
  /** Conta com Treino (placar em andamento): o anel de fora é treino + cardio; sem: o Diário */
  comTreino: boolean;
  /** Plano de dieta montado: o anel do meio é o "Segui o plano?"; sem: o checklist */
  comDieta: boolean;
  treino?: TreinoDia | null;
  reg?: RegistroDiario | null;
  /** Peso da medição do dia (vale como o peso do Diário) */
  pesoMedicao?: number | null;
  metaAgua: number;
  /** Checklist completo de hoje (com dose e medição); sem ele, conta o checklist do Diário e do treino */
  checklist?: { feitas: number; total: number } | null;
}

const TRACO = '—';

function anelTreino(t: TreinoDia | null | undefined): AnelDia {
  const n = (t?.treino ? 1 : 0) + (t?.cardio ? 1 : 0);
  const partes = [t?.treino && 'treino', t?.cardio && 'cardio'].filter(Boolean).join(' e ');
  return {
    chave: 'treino',
    rotulo: 'Treino',
    fracao: n / 2,
    anotado: n > 0,
    fechado: n === 2,
    texto: `${n}/2`,
    descricao: n === 2 ? 'treino e cardio feitos' : n === 1 ? `${partes} feito` : 'nada marcado',
  };
}

// Itens do Diário (os mesmos do checklist): peso, náusea, água, sono e, com dieta, o plano
function itensDiario(e: EntradaAneis) {
  return tarefasDoDia({ reg: e.reg, pesoMedicao: e.pesoMedicao, comTreino: false, comDieta: e.comDieta, metaAgua: e.metaAgua });
}

function anelDiario(e: EntradaAneis): AnelDia {
  const { feitas, total, fracao } = progressoTarefas(itensDiario(e));
  return {
    chave: 'diario',
    rotulo: 'Diário',
    fracao,
    anotado: feitas > 0,
    fechado: total > 0 && feitas === total,
    texto: `${feitas}/${total}`,
    descricao: `${feitas} de ${total} itens do Diário`,
  };
}

const VALOR_DIETA = { sim: 1, parcial: 0.5, nao: 0 } as const;
const TEXTO_DIETA = { sim: 'Sim', parcial: 'Em parte', nao: 'Não' } as const;

function anelDieta(reg: RegistroDiario | null | undefined): AnelDia {
  const v = reg?.dieta_seguida ?? null;
  return {
    chave: 'dieta',
    rotulo: 'Dieta',
    fracao: v ? VALOR_DIETA[v] : 0,
    anotado: !!v,
    fechado: v === 'sim',
    texto: v ? TEXTO_DIETA[v] : TRACO,
    descricao: v ? `segui o plano: ${TEXTO_DIETA[v].toLowerCase()}` : 'plano sem resposta',
  };
}

function anelChecklist(e: EntradaAneis): AnelDia {
  // Sem o checklist de hoje: os itens do Diário e, com Treino, treino e cardio
  const p =
    e.checklist ??
    progressoTarefas(tarefasDoDia({ reg: e.reg, pesoMedicao: e.pesoMedicao, comTreino: e.comTreino, treinoDia: e.treino, comDieta: false, metaAgua: e.metaAgua }));
  const fracao = p.total ? p.feitas / p.total : 0;
  return {
    chave: 'checklist',
    rotulo: 'Checklist',
    fracao,
    anotado: p.feitas > 0,
    fechado: p.total > 0 && p.feitas === p.total,
    texto: `${p.feitas}/${p.total}`,
    descricao: `${p.feitas} de ${p.total} itens do checklist`,
  };
}

function anelAgua(reg: RegistroDiario | null | undefined, meta: number): AnelDia {
  const a = reg?.agua_l ?? null;
  const fracao = a !== null && meta > 0 ? a / meta : 0;
  return {
    chave: 'agua',
    rotulo: 'Água',
    fracao,
    anotado: a !== null,
    fechado: a !== null && meta > 0 && a >= meta - 1e-9,
    texto: `${a !== null ? num(a, 1) : TRACO}/${num(meta, 1)} L`,
    descricao: a !== null ? `${num(a, 1)} de ${num(meta, 1)} L` : `sem registro · meta ${num(meta, 1)} L`,
  };
}

/** Os três anéis de um dia. */
export function aneisDoDia(e: EntradaAneis): AneisDia {
  return {
    externo: e.comTreino ? anelTreino(e.treino) : anelDiario(e),
    meio: e.comDieta ? anelDieta(e.reg) : anelChecklist(e),
    interno: anelAgua(e.reg, e.metaAgua),
  };
}

/** Quantos anéis fecharam no dia (0 a 3). */
export function anelFechados(a: AneisDia): number {
  return POSICOES.filter((p) => a[p].fechado).length;
}

export interface CelulaAneis {
  data: string;
  /** Antes do início do ciclo ou depois de hoje: célula vazia */
  fora: boolean;
  hoje: boolean;
  aneis: AneisDia | null;
}

export interface SemanaAneis {
  /** Segunda-feira da semana */
  segunda: string;
  dias: CelulaAneis[];
}

export interface EntradaHistorico {
  /** Início do ciclo (1ª aplicação); dias antes ficam de fora */
  inicio: string;
  hoje: string;
  diario: RegistroDiario[];
  treinos: TreinoDia[];
  medidas: Pick<Medida, 'data' | 'peso_kg'>[];
  comTreino: boolean;
  comDieta: boolean;
  metaAgua: (data: string) => number;
  /** Checklist completo de hoje (o mesmo do cartão) */
  checklistHoje?: { feitas: number; total: number } | null;
}

/** Semanas do ciclo (segunda a domingo), a mais recente primeiro. Vazio antes do início. */
export function historicoAneis(e: EntradaHistorico): SemanaAneis[] {
  if (e.hoje < e.inicio) return [];
  const diario = new Map(e.diario.map((r) => [r.data, r]));
  const treinos = new Map(e.treinos.map((t) => [t.data, t]));
  const pesos = new Map<string, number>();
  for (const m of e.medidas) if (m.peso_kg > 0) pesos.set(m.data, m.peso_kg);
  const semanas: SemanaAneis[] = [];
  const primeira = segunda(e.inicio);
  for (let s = segunda(e.hoje); s >= primeira; s = somarDias(s, -7)) {
    const dias: CelulaAneis[] = [];
    for (let i = 0; i < 7; i++) {
      const data = somarDias(s, i);
      const fora = data < e.inicio || data > e.hoje;
      const hoje = data === e.hoje;
      dias.push({
        data,
        fora,
        hoje,
        aneis: fora
          ? null
          : aneisDoDia({
              comTreino: e.comTreino,
              comDieta: e.comDieta,
              treino: treinos.get(data) ?? null,
              reg: diario.get(data) ?? null,
              pesoMedicao: pesos.get(data) ?? null,
              metaAgua: e.metaAgua(data),
              checklist: hoje ? e.checklistHoje : null,
            }),
      });
    }
    semanas.push({ segunda: s, dias });
  }
  return semanas;
}

export interface ResumoHistorico {
  dias: number;
  /** Dias com os três anéis fechados */
  completos: number;
  porAnel: Record<PosicaoAnel, number>;
}

/** Contagem dos anéis fechados no ciclo (hoje entra só se já fechou). */
export function resumoHistorico(semanas: SemanaAneis[]): ResumoHistorico {
  const r: ResumoHistorico = { dias: 0, completos: 0, porAnel: { externo: 0, meio: 0, interno: 0 } };
  for (const s of semanas)
    for (const c of s.dias) {
      if (!c.aneis) continue;
      r.dias++;
      for (const p of POSICOES) if (c.aneis[p].fechado) r.porAnel[p]++;
      if (anelFechados(c.aneis) === 3) r.completos++;
    }
  return r;
}

/** Dias do ciclo até hoje (para o "Ver tudo"). */
export function diasNoCiclo(inicio: string, hoje: string): number {
  return hoje < inicio ? 0 : diferencaDias(inicio, hoje) + 1;
}
