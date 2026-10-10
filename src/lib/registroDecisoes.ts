import { diferencaDias, formatarData } from './datas';
import type { ConfigDieta } from './dieta';
import { num } from './formato';
import type { DecisaoFase, Fase, MetasProjeto, RegistroDecisao, TipoDecisao } from './tipos';

// Registro de decisões: cada vez que um valor relevante muda (déficit, fator,
// g/kg, fases, metas, dose), o app guarda {data, tipo, campo, de, para}. Só
// registra o que o usuário mudou; nada aqui muda meta, dose ou plano.

/** Mudança detectada, antes de virar registro (sem id e sem data) */
export interface Alteracao {
  tipo: TipoDecisao;
  campo: string;
  de: string | null;
  para: string | null;
  ref?: string | null;
}

export const ROTULO_TIPO: Record<TipoDecisao, string> = { dieta: 'Dieta', plano: 'Plano', metas: 'Metas', dose: 'Dose', nota: 'Nota' };

/** −300 kcal · +200 kcal · 0 kcal */
function kcal(n: number): string {
  const s = n < 0 ? '−' : n > 0 ? '+' : '';
  return `${s}${Math.abs(Math.round(n)).toLocaleString('pt-BR')} kcal`;
}

/** Até 2 casas, sem zeros sobrando (1,2 · 1,45) */
export function curto(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const mg = (n: number | null | undefined) => (n === null || n === undefined ? null : `${num(n, 2)} mg`);
const semanas = (n: number) => `${n} sem.`;

/** Exercício da meta em kcal por semana (a lista detalhada fica na Dieta) */
function exercicioSemana(c: ConfigDieta): string {
  const total = (c.atividades ?? []).reduce((s, a) => s + (a.kcal || 0) * (a.vezes_semana || 0), 0);
  return total > 0 ? `${Math.round(total).toLocaleString('pt-BR')} kcal/sem` : 'nenhum';
}

function empurrar(lista: Alteracao[], tipo: TipoDecisao, campo: string, de: string | null, para: string | null) {
  if (de !== para) lista.push({ tipo, campo, de, para });
}

/** Mudanças relevantes da Dieta: déficit, fator, proteína, gordura, exercício da meta e como ele entra (planejado ou feito). */
export function compararDieta(antes: ConfigDieta, depois: ConfigDieta): Alteracao[] {
  const r: Alteracao[] = [];
  empurrar(r, 'dieta', 'Déficit/superávit', kcal(antes.ajuste_kcal), kcal(depois.ajuste_kcal));
  empurrar(r, 'dieta', 'Fator de atividade', curto(antes.fator_atividade), curto(depois.fator_atividade));
  // Até 2 casas: 2,2 → 2,24 muda a meta e entra no registro
  empurrar(r, 'dieta', 'Proteína animal', `${curto(antes.ptn_gkg)} g/kg`, `${curto(depois.ptn_gkg)} g/kg`);
  empurrar(r, 'dieta', 'Gordura', `${curto(antes.gord_gkg)} g/kg`, `${curto(depois.gord_gkg)} g/kg`);
  empurrar(r, 'dieta', 'Exercício da meta', exercicioSemana(antes), exercicioSemana(depois));
  // "Como planejado" × "Pelo que fiz" também muda a meta de kcal
  const modo = (c: ConfigDieta) => (c.usar_aderencia ? 'pelo que fiz' : 'como planejado');
  empurrar(r, 'dieta', 'Exercício na meta', modo(antes), modo(depois));
  return r;
}

const descreverFase = (f: Fase) => `${semanas(f.semanas)} × ${num(f.dose_mg, 2)} mg`;

/** Mudanças do Plano: dose e semanas de cada fase, fases novas e removidas (nome e objetivo não contam). */
export function compararFases(antes: Fase[], depois: Fase[]): Alteracao[] {
  const r: Alteracao[] = [];
  const n = Math.max(antes.length, depois.length);
  for (let i = 0; i < n; i++) {
    const a = antes[i];
    const b = depois[i];
    if (a && b) {
      if (Math.abs(a.dose_mg - b.dose_mg) > 1e-9) empurrar(r, 'plano', `Fase ${i + 1}: dose`, mg(a.dose_mg), mg(b.dose_mg));
      empurrar(r, 'plano', `Fase ${i + 1}: semanas`, semanas(a.semanas), semanas(b.semanas));
    } else empurrar(r, 'plano', `Fase ${i + 1}`, a ? descreverFase(a) : null, b ? descreverFase(b) : null);
  }
  return r;
}

const METAS: [keyof MetasProjeto, string, (n: number) => string][] = [
  ['cintura_cm', 'Meta de cintura', (n) => `${num(n, 1)} cm`],
  ['pescoco_cm', 'Meta de pescoço', (n) => `${num(n, 1)} cm`],
  ['quadril_cm', 'Meta de quadril', (n) => `${num(n, 1)} cm`],
  ['peso_kg', 'Meta de peso', (n) => `${num(n, 1)} kg`],
  ['bf', 'Meta de % de gordura', (n) => `${num(n, 1)}%`],
];

export function compararMetas(antes: MetasProjeto | null | undefined, depois: MetasProjeto): Alteracao[] {
  const r: Alteracao[] = [];
  for (const [k, campo, fmt] of METAS) {
    const a = antes?.[k] ?? null;
    const b = depois[k] ?? null;
    empurrar(r, 'metas', campo, a === null ? null : fmt(a), b === null ? null : fmt(b));
  }
  return r;
}

/**
 * Decisões do fim de fase que entraram ou saíram da lista. Anotações não são
 * mudança (vão para o PDF por outro caminho). Removidas: ids para apagar os
 * registros que elas geraram.
 */
export function alteracoesDasDecisoesFase(
  antes: DecisaoFase[],
  depois: DecisaoFase[],
  fases: Fase[],
  /** Fases antes da operação: o "de" do Repetir são as semanas planejadas antes (não as doses feitas) */
  fasesAntes?: Fase[],
): { novas: Alteracao[]; removidas: string[] } {
  const idsAntes = new Set(antes.map((d) => d.id));
  const idsDepois = new Set(depois.map((d) => d.id));
  const novas: Alteracao[] = [];
  for (const d of depois) {
    if (idsAntes.has(d.id)) continue;
    const fase = d.fase_indice !== null && d.fase_indice >= 0 ? d.fase_indice + 1 : null;
    if (d.escolha === 'subir') novas.push({ tipo: 'dose', campo: 'Dose', de: mg(d.dose_mg), para: mg(d.dose_nova_mg), ref: d.id });
    else if (d.escolha === 'repetir' && fase !== null) {
      const total = fases[fase - 1]?.semanas ?? null;
      const mais = d.semanas ?? 0;
      const anterior = fasesAntes?.[fase - 1]?.semanas ?? (total === null ? null : total - mais);
      novas.push({
        tipo: 'plano',
        campo: `Repetir fase ${fase}`,
        de: total === null || anterior === null ? null : semanas(anterior),
        para: total === null ? `+${mais} sem.` : semanas(total),
        ref: d.id,
      });
    } else if (d.escolha === 'confirmar_fase') {
      novas.push({ tipo: 'dose', campo: 'Dose fora do plano', de: null, para: `${mg(d.dose_mg)} seguindo a fase ${fase ?? '?'}`, ref: d.id });
    } else if (d.escolha === 'pos_remedio') {
      novas.push({ tipo: 'plano', campo: 'Fase pós-remédio', de: null, para: `início em ${formatarData(d.bloco_inicio ?? d.data, true)}`, ref: d.id });
    }
  }
  const removidas = antes.filter((d) => !idsDepois.has(d.id)).map((d) => d.id);
  return { novas, removidas };
}

export interface Mescla {
  salvar: RegistroDecisao[];
  excluir: RegistroDecisao[];
  /** Lista resultante (para quem precisa do estado depois da mescla) */
  lista: RegistroDecisao[];
}

/**
 * Junta as mudanças ao registro. No mesmo dia, o mesmo campo fica numa linha
 * só: vale o primeiro "de" e o último "para"; se voltou ao valor de antes (e
 * não tem motivo escrito), a linha some. Mudanças de uma decisão de fase
 * (ref) não se juntam com as outras.
 */
export function mesclarAlteracoes(
  registros: RegistroDecisao[],
  alteracoes: Alteracao[],
  hoje: string,
  novoId: () => string,
  refsRemovidas: string[] = [],
): Mescla {
  let lista = [...registros];
  const salvar = new Map<string, RegistroDecisao>();
  const excluir = new Map<string, RegistroDecisao>();
  const tirar = (r: RegistroDecisao) => {
    lista = lista.filter((x) => x.id !== r.id);
    salvar.delete(r.id);
    excluir.set(r.id, r);
  };
  const por = (r: RegistroDecisao) => {
    lista = [...lista.filter((x) => x.id !== r.id), r];
    salvar.set(r.id, r);
    excluir.delete(r.id);
  };
  for (const ref of refsRemovidas) for (const r of lista.filter((x) => x.ref === ref)) tirar(r);
  for (const a of alteracoes) {
    const existente = a.ref
      ? lista.find((x) => x.ref === a.ref)
      : lista.find((x) => !x.ref && x.data === hoje && x.tipo === a.tipo && x.campo === a.campo);
    if (existente) {
      const atualizado = { ...existente, para: a.para };
      if (!a.ref && atualizado.de === atualizado.para && !atualizado.motivo) tirar(existente);
      else por(atualizado);
    } else if (a.de !== a.para || a.ref) {
      por({ id: novoId(), data: hoje, tipo: a.tipo, campo: a.campo, de: a.de, para: a.para, motivo: null, ref: a.ref ?? null });
    }
  }
  return { salvar: [...salvar.values()], excluir: [...excluir.values()], lista };
}

/** "Déficit/superávit: −300 kcal → −450 kcal" */
export function descreverRegistro(r: Pick<RegistroDecisao, 'tipo' | 'campo' | 'de' | 'para'>): string {
  if (r.tipo === 'nota') return r.campo;
  if (r.de === null && r.para === null) return r.campo;
  if (r.para === null) return `${r.campo}: ${r.de} → removida`;
  if (r.de === null) return `${r.campo}: ${r.para}`;
  return `${r.campo}: ${r.de} → ${r.para}`;
}

export interface DiaDeDecisoes {
  data: string;
  registros: RegistroDecisao[];
}

/** Registros agrupados por dia, do mais recente para o mais antigo (um marcador por dia nos gráficos). */
export function decisoesPorDia(registros: RegistroDecisao[]): DiaDeDecisoes[] {
  const dias = new Map<string, RegistroDecisao[]>();
  for (const r of [...registros].sort((a, b) => a.data.localeCompare(b.data))) {
    const l = dias.get(r.data) ?? [];
    l.push(r);
    dias.set(r.data, l);
  }
  return [...dias.entries()].map(([data, regs]) => ({ data, registros: regs })).sort((a, b) => b.data.localeCompare(a.data));
}

/** Um marcador por dia com decisões, para os gráficos (texto para a dica). */
export function marcosDasDecisoes(registros: RegistroDecisao[]): { data: string; texto: string }[] {
  return decisoesPorDia(registros).map((d) => ({ data: d.data, texto: d.registros.map(descreverRegistro).join('; ') }));
}

/**
 * Dose e dieta mudaram com menos de 7 dias de diferença: o resultado dessas
 * semanas não dá para atribuir a uma coisa só. Devolve um par de datas por caso.
 */
export function mudancasMisturadas(registros: RegistroDecisao[]): { dose: string; dieta: string }[] {
  const doses = registros.filter((r) => r.tipo === 'dose').map((r) => r.data);
  const dietas = registros.filter((r) => r.tipo === 'dieta').map((r) => r.data);
  const casos: { dose: string; dieta: string }[] = [];
  for (const d of [...new Set(doses)].sort()) {
    const perto = [...new Set(dietas)].sort().find((x) => Math.abs(diferencaDias(d, x)) < 7);
    if (perto) casos.push({ dose: d, dieta: perto });
  }
  return casos;
}
