import type { QualidadePerda, Tendencia } from './conferencia';
import { faixaImprecisa, magraCaindo, ritmoPercentual } from './conferencia';
import { diaSemanaCurto, diferencaDias, somarDias } from './datas';
import type { RegistroDiario, TreinoDia } from './tipos';

// Resumo da semana (aberto ao salvar a medição de segunda): contas puras.

export interface DietaSemana {
  sim: number;
  parcial: number;
  nao: number;
  /** Dias com "segui o plano?" respondido */
  respondidos: number;
  /** Dias do período (respondidos ou não) */
  dias: number;
}

/** "Segui o plano?" entre `de` e `ate` (inclusive); dia sem resposta conta só no total. */
export function dietaNoPeriodo(diario: RegistroDiario[], de: string, ate: string): DietaSemana {
  const regs = diario.filter((r) => r.data >= de && r.data <= ate && r.dieta_seguida);
  const conta = (v: 'sim' | 'parcial' | 'nao') => regs.filter((r) => r.dieta_seguida === v).length;
  return { sim: conta('sim'), parcial: conta('parcial'), nao: conta('nao'), respondidos: regs.length, dias: Math.max(diferencaDias(de, ate) + 1, 0) };
}

/** "0 sim · 3 em parte · 4 não (7 de 7)" */
export function textoDietaSemana(d: DietaSemana): string {
  return `${d.sim} sim · ${d.parcial} em parte · ${d.nao} não (${d.respondidos} de ${d.dias})`;
}

/** Quanto do plano foi seguido nos dias respondidos: sim = 1, em parte = 0,5, não = 0. */
export function fracaoSeguida(d: DietaSemana): number | null {
  return d.respondidos ? (d.sim + 0.5 * d.parcial) / d.respondidos : null;
}

export interface EfeitosSemana {
  /** Dias com registro no Diário */
  registros: number;
  nausea_media: number | null;
  nausea_max: number | null;
  vomito: number;
  intestino_preso: number;
  diarreia: number;
}

export function efeitosNoPeriodo(diario: RegistroDiario[], de: string, ate: string): EfeitosSemana {
  const regs = diario.filter((r) => r.data >= de && r.data <= ate);
  const nauseas = regs.filter((r) => r.nausea !== null).map((r) => r.nausea as number);
  return {
    registros: regs.length,
    nausea_media: nauseas.length ? nauseas.reduce((a, b) => a + b, 0) / nauseas.length : null,
    nausea_max: nauseas.length ? Math.max(...nauseas) : null,
    vomito: regs.filter((r) => r.vomito).length,
    intestino_preso: regs.filter((r) => r.intestino_preso).length,
    diarreia: regs.filter((r) => r.diarreia).length,
  };
}

export interface FaltasTreino {
  /** Datas sem treino e sem cardio marcados */
  treino: string[];
  cardio: string[];
  /** Dias do período que já eram do projeto */
  dias: number;
}

/** Dias do período (dentro do projeto) em que faltou treino ou cardio. */
export function faltasNoPeriodo(treinos: TreinoDia[], de: string, ate: string, inicioProjeto: string, fimProjeto: string): FaltasTreino {
  const porData = new Map(treinos.map((t) => [t.data, t]));
  const datas: string[] = [];
  for (let d = de > inicioProjeto ? de : inicioProjeto; d <= ate && d <= fimProjeto; d = somarDias(d, 1)) datas.push(d);
  return {
    treino: datas.filter((d) => !porData.get(d)?.treino),
    cardio: datas.filter((d) => !porData.get(d)?.cardio),
    dias: datas.length,
  };
}

/** "Qua e Sáb" */
export function diasCurtos(datas: string[]): string {
  return juntar(datas.map(diaSemanaCurto));
}

/** "a, b e c" */
export function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** Atalho "Resumo da semana" no Início: segunda e terça, se a medição desta semana já foi feita. */
export function mostrarAtalhoResumo(hoje: string, ultimaMedicao: string | null, segundaDeHoje: string): boolean {
  if (!ultimaMedicao) return false;
  const dia = diferencaDias(segundaDeHoje, hoje);
  return dia >= 0 && dia <= 1 && ultimaMedicao >= segundaDeHoje && ultimaMedicao <= hoje;
}

// ---------- Sugestão da semana ----------

export type TipoSugestao = 'sem_dados' | 'seguir_plano' | 'reduzir' | 'aumentar' | 'manter';

export interface Sugestao {
  tipo: TipoSugestao;
  texto: string;
  /** Os números que levaram à sugestão */
  motivo: string;
}

/** Mínimo de dias respondidos e de plano seguido para a sugestão valer. */
export const LIMITE_SUGESTAO = { respondidos: 0.8, seguido: 0.8 } as const;

/**
 * Regra fixa e transparente, sempre na mesma janela da tendência das medidas.
 * Pré-condições: tendência disponível e 80%+ dos dias com "segui o plano?"
 * respondido. Depois, na ordem: seguiu menos de 80% → seguir o plano; ritmo
 * acima de 1%/sem com massa magra caindo → considerar reduzir o déficit; ritmo
 * abaixo de 0,5%/sem tendo seguido bem → considerar aumentar; senão, manter.
 * Plano sem déficit (`ajusteKcal` ≥ 0: manutenção ou superávit, escolha do
 * usuário) não recebe as regras do déficit. É só texto: nada muda sozinho.
 */
export function sugestaoSemana(tendencia: Tendencia | null, peso: number, diario: RegistroDiario[], ajusteKcal: number | null = null): Sugestao {
  if (!tendencia) {
    return { tipo: 'sem_dados', texto: 'Sem sugestão por enquanto.', motivo: 'A regra precisa da tendência das medidas (4 medições cobrindo 3 semanas).' };
  }
  // Dias da janela da tendência; o dia da última medição já é da semana seguinte
  const dieta = dietaNoPeriodo(diario, tendencia.de, somarDias(tendencia.ate, -1));
  const respondidos = dieta.dias ? dieta.respondidos / dieta.dias : 0;
  const pctTxt = (f: number) => `${Math.round(f * 100)}%`;
  if (respondidos < LIMITE_SUGESTAO.respondidos) {
    return {
      tipo: 'sem_dados',
      texto: 'Sem sugestão por enquanto.',
      motivo: `"Segui o plano?" respondido em ${dieta.respondidos} de ${dieta.dias} dias (${pctTxt(respondidos)}); a regra precisa de 80% dos dias da janela da tendência.`,
    };
  }
  const seguido = fracaoSeguida(dieta) ?? 0;
  const ritmo = ritmoPercentual(tendencia.peso_semana, peso).pct;
  const base = `Plano seguido em ${pctTxt(seguido)} dos dias respondidos · ritmo ${ritmo.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%/sem · massa magra ${magraCaindo(tendencia) ? 'caindo' : 'estável ou subindo'} na tendência.`;
  if (seguido < LIMITE_SUGESTAO.seguido) return { tipo: 'seguir_plano', texto: 'Siga o plano antes de mexer no déficit.', motivo: base };
  if (ajusteKcal !== null && ajusteKcal >= 0) {
    return { tipo: 'manter', texto: 'Manter.', motivo: `${base} O plano está sem déficit (manutenção ou superávit): as regras de reduzir ou aumentar o déficit não se aplicam.` };
  }
  if (ritmo > 1 && magraCaindo(tendencia)) return { tipo: 'reduzir', texto: 'Considere reduzir o déficit.', motivo: base };
  if (ritmo < 0.5) return { tipo: 'aumentar', texto: 'Considere aumentar o déficit.', motivo: base };
  return { tipo: 'manter', texto: 'Manter.', motivo: base };
}

// ---------- "Segui o plano?" na Conferência da Dieta e na Análise ----------

/** "Segui o plano?" na janela da tendência das medidas (o dia da última medição já é da semana seguinte). */
export function dietaNaTendencia(diario: RegistroDiario[], tendencia: Tendencia): DietaSemana {
  return dietaNoPeriodo(diario, tendencia.de, somarDias(tendencia.ate, -1));
}

/** "Plano seguido: 18 de 28 dias (64%)": "em parte" vale meio dia; conta só os dias respondidos. */
export function textoPlanoSeguido(d: DietaSemana): string {
  const seguidos = d.sim + 0.5 * d.parcial;
  const f = fracaoSeguida(d);
  const n = seguidos.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return f === null ? 'Plano seguido: nenhum dia respondido' : `Plano seguido: ${n} de ${d.respondidos} dias (${Math.round(f * 100)}%)`;
}

export type TipoConselho = 'responder' | 'seguir_plano' | 'reduzir' | 'gasto_outro' | 'impreciso' | 'bate';

export interface Conselho {
  tipo: TipoConselho;
  texto: string;
}

/**
 * Conselho da Conferência (só texto; a meta não muda sozinha), na mesma janela
 * da tendência. Na ordem: poucos dias respondidos → responder no Diário;
 * seguiu menos de 80% → seguir o plano antes de mexer no déficit; com déficit,
 * perda acima de 1%/sem e massa magra caindo → considerar reduzir; plano fora
 * da faixa de 95% das medidas → o gasto real pode ser outro; faixa larga →
 * esperar mais medições; senão, o plano e as medidas batem.
 */
export function conselhoConferencia(tendencia: Tendencia, peso: number, dieta: DietaSemana, deficitPlano: number | null, ajusteKcal: number | null): Conselho {
  if (!dieta.dias || dieta.respondidos / dieta.dias < LIMITE_SUGESTAO.respondidos) {
    return {
      tipo: 'responder',
      texto: `Responda o "Segui o plano?" no Diário (${dieta.respondidos} de ${dieta.dias} dias nesta janela): com 80% dos dias respondidos, dá para separar plano não seguido de gasto diferente do previsto.`,
    };
  }
  if ((fracaoSeguida(dieta) ?? 0) < LIMITE_SUGESTAO.seguido) {
    return { tipo: 'seguir_plano', texto: 'Antes de mexer no déficit, tente seguir o plano: as medidas só dizem algo sobre o plano quando ele é seguido.' };
  }
  const ritmo = ritmoPercentual(tendencia.peso_semana, peso).pct;
  if ((ajusteKcal === null || ajusteKcal < 0) && ritmo > 1 && magraCaindo(tendencia)) {
    return { tipo: 'reduzir', texto: 'Perda acima de 1% do peso por semana com a massa magra caindo: considere reduzir o déficit.' };
  }
  if (faixaImprecisa(tendencia)) return { tipo: 'impreciso', texto: 'Plano seguido; a faixa das medidas ainda é larga para comparar com o plano. Espere mais medições.' };
  if (deficitPlano !== null && Math.abs(tendencia.deficit_dia - deficitPlano) > tendencia.ic95_dia) {
    return { tipo: 'gasto_outro', texto: 'Plano seguido e as medidas mostram outro déficit: o gasto real pode ser outro. Ajuste o déficit se quiser.' };
  }
  return { tipo: 'bate', texto: 'Plano seguido e as medidas batem com ele.' };
}

// ---------- Ação ligada à qualidade da perda ----------

export interface AcaoQualidade {
  texto: string;
  /** Aba que resolve */
  para: '/dieta' | '/treino';
  rotulo: string;
}

export interface InsumosAcao {
  /** Refeições com alimentos abaixo do alvo de proteína animal por refeição */
  refeicoesAbaixo: string[];
  alvoRefeicao: number | null;
  /** Proteína animal do plano e meta do dia (g) */
  ptnPlano: number | null;
  ptnMeta: number | null;
  /** Aderência do treino nas últimas 4 semanas (só conta com Treino) */
  treino: number | null;
}

/**
 * Uma ação tirada do próprio app quando a qualidade da perda pede atenção:
 * proteína por refeição, proteína do dia, treino ou ritmo.
 */
export function acaoQualidade(q: QualidadePerda | null, i: InsumosAcao): AcaoQualidade | null {
  if (!q || !q.aviso) return null;
  const g = (n: number) => `${Math.round(n)} g`;
  if (i.refeicoesAbaixo.length && i.alvoRefeicao) {
    return { texto: `${juntar(i.refeicoesAbaixo)} abaixo de ${g(i.alvoRefeicao)} de proteína animal`, para: '/dieta', rotulo: 'Abrir Dieta' };
  }
  if (i.ptnPlano !== null && i.ptnMeta && i.ptnPlano < i.ptnMeta * 0.95) {
    return { texto: `Proteína animal do plano: ${g(i.ptnPlano)} de ${g(i.ptnMeta)}`, para: '/dieta', rotulo: 'Abrir Dieta' };
  }
  if (i.treino !== null && i.treino < 0.8) {
    return { texto: `Treino feito em ${Math.round(i.treino * 100)}% dos dias nas últimas 4 semanas`, para: '/treino', rotulo: 'Abrir Treino' };
  }
  if (q.ritmo_pct > 1) return { texto: 'Ritmo acima de 1% do peso por semana: confira o déficit do plano', para: '/dieta', rotulo: 'Abrir Dieta' };
  return null;
}
