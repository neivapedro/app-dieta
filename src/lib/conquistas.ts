// Comemorações: compara o retrato dos dados antes e depois da última alteração e
// diz quais conquistas acabaram de acontecer. Só descreve registros (checklist,
// corrida, meta, fase); não sugere dose nem mexe em meta nenhuma.
import { num } from './formato';
import type { MetasProjeto, Sexo } from './tipos';
import { formatarTempo } from './treino';

export type TipoConquista = 'checklist' | 'corrida' | 'meta' | 'fase';

export interface Conquista {
  /** Identificador estável: a mesma conquista não comemora duas vezes */
  id: string;
  tipo: TipoConquista;
  titulo: string;
  detalhe?: string;
}

export interface CorridaRetrato {
  data: string;
  km: number;
  segundos: number;
}

export interface MedidaRetrato {
  data: string;
  peso_kg: number;
  bf: number | null;
  cintura_cm: number;
  pescoco_cm: number;
  quadril_cm: number | null;
  atipica?: boolean;
}

export interface FaseRetrato {
  /** Bloco de doses iguais (início + dose): muda quando começa outro degrau */
  chave: string;
  nome: string;
  feitas: number;
  previstas: number | null;
}

/** O que importa para as comemorações, num instante. */
export interface RetratoConquistas {
  hoje: string;
  /** Checklist do dia (mesma conta do Início) */
  checklist: { feitas: number; total: number } | null;
  corridas: CorridaRetrato[];
  medidas: MedidaRetrato[];
  metas: MetasProjeto | null;
  sexo: Sexo;
  /** Aplicações registradas no ciclo */
  aplicacoes: number;
  fase: FaseRetrato | null;
}

const chaveCorrida = (c: CorridaRetrato) => `${c.data}|${c.km}|${c.segundos}`;
const chaveMedida = (m: MedidaRetrato) => `${m.data}|${m.peso_kg}|${m.cintura_cm}|${m.pescoco_cm}|${m.quadril_cm ?? ''}|${m.atipica ? 1 : 0}`;

/** Itens que só existem depois (o que a última alteração acrescentou). */
function novos<T>(antes: T[], agora: T[], chave: (x: T) => string): T[] {
  const vistos = new Set(antes.map(chave));
  return agora.filter((x) => !vistos.has(chave(x)));
}

function checklistCompleto(r: RetratoConquistas): boolean {
  return !!r.checklist && r.checklist.total > 0 && r.checklist.feitas >= r.checklist.total;
}

function conquistaChecklist(antes: RetratoConquistas, agora: RetratoConquistas): Conquista | null {
  if (antes.hoje !== agora.hoje || !antes.checklist || checklistCompleto(antes) || !checklistCompleto(agora)) return null;
  return { id: `checklist:${agora.hoje}`, tipo: 'checklist', titulo: 'Checklist do dia completo!', detalhe: `${agora.checklist!.total} de ${agora.checklist!.total} anotados hoje` };
}

function conquistaCorrida(antes: RetratoConquistas, agora: RetratoConquistas): Conquista | null {
  const n = novos(antes.corridas, agora.corridas, chaveCorrida);
  // Mais de uma corrida nova de uma vez é carga de dados, não um registro do momento
  if (n.length !== 1) return null;
  const c = n[0];
  if (!(c.km > 0 && c.segundos > 0)) return null;
  // Compara com as outras corridas (a mesma data editada não conta contra si mesma)
  const outras = agora.corridas.filter((x) => x.data !== c.data && x.km > 0 && x.segundos > 0);
  if (!outras.length) return null;
  const pace = c.segundos / c.km;
  // Paces como aparecem na tela (arredondados ao segundo): 5:12 contra 5:12 não é recorde
  const melhorPace = Math.min(...outras.map((x) => Math.round(x.segundos / x.km)));
  const maisLonga = Math.max(...outras.map((x) => x.km));
  const recordePace = Math.round(pace) < melhorPace;
  const recordeKm = c.km > maisLonga + 1e-9;
  if (!recordePace && !recordeKm) return null;
  const id = `corrida:${c.data}:${recordePace ? `p${Math.round(pace)}` : ''}${recordeKm ? `k${c.km}` : ''}`;
  if (recordePace)
    return {
      id,
      tipo: 'corrida',
      titulo: `Novo recorde de corrida: ${formatarTempo(pace)}/km`,
      detalhe: recordeKm ? `E a corrida mais longa até agora: ${num(c.km, 1)} km` : `${num(c.km, 1)} km em ${formatarTempo(c.segundos)}`,
    };
  return { id, tipo: 'corrida', titulo: `Corrida mais longa: ${num(c.km, 1)} km`, detalhe: `${formatarTempo(c.segundos)} · ${formatarTempo(pace)}/km` };
}

type ChaveMeta = 'cintura_cm' | 'quadril_cm' | 'pescoco_cm' | 'bf' | 'peso_kg';

/** Metas com o nome no texto; todas "menor é melhor" (a mesma regra do balanço do projeto). */
function metasDoPerfil(metas: MetasProjeto | null, sexo: Sexo): [ChaveMeta, string, number, string, number][] {
  if (!metas) return [];
  const lista: [ChaveMeta, string, number | null, string, number][] = [
    ['cintura_cm', 'cintura', metas.cintura_cm, ' cm', 1],
    ...(sexo === 'Feminino' ? [['quadril_cm', 'quadril', metas.quadril_cm, ' cm', 1] as [ChaveMeta, string, number | null, string, number]] : []),
    ['pescoco_cm', 'pescoço', metas.pescoco_cm, ' cm', 1],
    ['bf', '% de gordura', metas.bf, '%', 1],
    ['peso_kg', 'peso', metas.peso_kg, ' kg', 1],
  ];
  return lista.filter((x): x is [ChaveMeta, string, number, string, number] => typeof x[2] === 'number' && x[2] > 0);
}

/** Última medição normal (atípica fica fora, como em Medidas e no balanço). */
function ultimaNormal(medidas: MedidaRetrato[]): MedidaRetrato | null {
  let u: MedidaRetrato | null = null;
  for (const m of medidas) if (!m.atipica && (!u || m.data >= u.data)) u = m;
  return u;
}

function atingiu(m: MedidaRetrato | null, chave: ChaveMeta, meta: number): boolean {
  const v = m ? m[chave] : null;
  return typeof v === 'number' && v <= meta + 1e-9;
}

function conquistasMeta(antes: RetratoConquistas, agora: RetratoConquistas): Conquista[] {
  const n = novos(antes.medidas, agora.medidas, chaveMedida);
  if (n.length !== 1 || n[0].atipica) return [];
  const atual = ultimaNormal(agora.medidas);
  // A medição nova precisa ser a mais recente (uma antiga lançada agora não conta)
  if (!atual || chaveMedida(atual) !== chaveMedida(n[0])) return [];
  const anterior = ultimaNormal(antes.medidas);
  return metasDoPerfil(agora.metas, agora.sexo)
    .filter(([k, , meta]) => atingiu(atual, k, meta) && !atingiu(anterior, k, meta))
    .map(([k, nome, meta, unidade, casas]) => ({
      id: `meta:${k}:${meta}`,
      tipo: 'meta' as const,
      titulo: `Meta de ${nome} atingida`,
      detalhe: `${num(atual[k] as number, casas)}${unidade} · meta ${num(meta, casas)}${unidade}`,
    }));
}

function faseCompleta(f: FaseRetrato | null): boolean {
  return !!f && f.previstas !== null && f.previstas > 0 && f.feitas === f.previstas;
}

function conquistaFase(antes: RetratoConquistas, agora: RetratoConquistas): Conquista | null {
  // Só a aplicação que acabou de ser registrada (uma a mais), fechando a fase
  if (agora.aplicacoes !== antes.aplicacoes + 1 || !faseCompleta(agora.fase)) return null;
  if (faseCompleta(antes.fase) && antes.fase!.chave === agora.fase!.chave) return null;
  const f = agora.fase!;
  return { id: `fase:${f.chave}`, tipo: 'fase', titulo: 'Fase concluída', detalhe: f.nome ? `${f.nome} · ${f.previstas} de ${f.previstas} aplicações` : undefined };
}

/** Conquistas novas entre dois retratos (vazio quando nada mudou para melhor). */
export function detectarConquistas(antes: RetratoConquistas, agora: RetratoConquistas): Conquista[] {
  const lista: (Conquista | null)[] = [conquistaFase(antes, agora), ...conquistasMeta(antes, agora), conquistaCorrida(antes, agora), conquistaChecklist(antes, agora)];
  return lista.filter((c): c is Conquista => !!c);
}

// ---------- Memória: cada conquista comemora uma vez (por dia, no caso do checklist) ----------

const LIMITE_MEMORIA = 200;

export function chaveMemoria(usuario: string | null | undefined): string {
  return `ciclo-conquistas:${usuario ?? 'anon'}`;
}

type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

function armazenamento(): Armazenamento | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function lerMemoria(chave: string, a: Armazenamento | null = armazenamento()): string[] {
  try {
    const v = JSON.parse(a?.getItem(chave) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Separa as que ainda não comemoraram e grava todas na memória (sem armazenamento: comemora mesmo assim). */
export function filtrarNovas(conquistas: Conquista[], chave: string, a: Armazenamento | null = armazenamento()): Conquista[] {
  if (!conquistas.length) return [];
  const memoria = lerMemoria(chave, a);
  const vistas = new Set(memoria);
  const novas = conquistas.filter((c) => !vistas.has(c.id));
  if (!novas.length) return [];
  try {
    a?.setItem(chave, JSON.stringify([...memoria, ...novas.map((c) => c.id)].slice(-LIMITE_MEMORIA)));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem memória */
  }
  return novas;
}
