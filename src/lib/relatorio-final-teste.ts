// Dados de exemplo do relatório final (testes do modelo e do PDF final): um ciclo
// de 30 semanas com Diário, medidas, treinos, força e decisões, e as contas de useCalculos().
import { analisarFases, serieDePeso } from './analise';
import { calcularCiclo, cicloPadrao } from './ciclo';
import { somarDias } from './datas';
import type { FotoInfo } from './fotos';
import { ajusteVigente, historicoComposicao } from './gordura';
import { decisaoPosRemedio } from './projeto';
import type { EntradaRelatorioFinal } from './relatorio-final';
import { periodoProjeto } from './treino';
import type { Aplicacao, Ciclo, DecisaoFase, Medida, Perfil, RegistroDecisao, RegistroDiario, RegistroForca, TreinoDia } from './tipos';
// Ciclo de 30 semanas (plano padrão: 4+4+4+4+4+10 doses) a partir de segunda, 05/01/2026
export const INICIO = '2026-01-05';
export const DOSES = [...Array(4).fill(1.25), ...Array(4).fill(1.5), ...Array(4).fill(1.75), ...Array(4).fill(2), ...Array(4).fill(2.25), ...Array(10).fill(2.5)] as number[];
export const dia = (n: number) => somarDias(INICIO, n);

export function perfilBase(extra: Partial<Perfil> = {}): Perfil {
  return {
    nome: 'Pedro Teste',
    sexo: 'Masculino',
    altura_cm: 181,
    lembretes_ativos: false,
    hora_lembrete: '09:00',
    fuso_horario: 'America/Sao_Paulo',
    modulo_treino: true,
    metas_projeto: { pescoco_cm: null, cintura_cm: 86, quadril_cm: null, peso_kg: 85, bf: 15 },
    ...extra,
  };
}

/** Decisões de subir a cada fim de fase (o app só sobe com a decisão registrada). */
export function decisoesSubir(): DecisaoFase[] {
  const lista: DecisaoFase[] = [];
  let n = 0;
  for (let i = 1; i < DOSES.length; i++) {
    if (DOSES[i] !== DOSES[i - 1]) {
      n++;
      lista.push({ id: `dec${n}`, data: dia(7 * i - 1), apos_aplicacao: i, dose_mg: DOSES[i - 1], fase_indice: n, escolha: 'subir', dose_nova_mg: DOSES[i] });
    }
  }
  return lista;
}

export interface OpcoesEntrada {
  /** Quantas doses (semanas) foram aplicadas */
  doses?: number;
  hoje?: string;
  sexo?: 'Masculino' | 'Feminino';
  treino?: boolean;
  semMedidas?: boolean;
  medicoes?: number;
  atipicaNoFim?: boolean;
  posRemedio?: boolean;
  fotos?: FotoInfo[];
  semPesoDiario?: boolean;
}

/** Entrada completa, com as contas de useCalculos(). */
export function entrada(o: OpcoesEntrada = {}): EntradaRelatorioFinal {
  const nDoses = o.doses ?? 30;
  const hoje = o.hoje ?? '2026-11-02';
  const feminino = o.sexo === 'Feminino';
  const comTreino = o.treino ?? true;
  const ciclo: Ciclo = { ...cicloPadrao(INICIO), id: 'c1', decisoes: decisoesSubir().filter((d) => d.apos_aplicacao < nDoses) };
  const aplicacoes: Aplicacao[] = DOSES.slice(0, nDoses).map((mg, i) => ({ id: `a${i}`, ciclo_id: 'c1', data: dia(7 * i), dose_mg: mg, local: 'Abdome direito', observacoes: null }));
  if (o.posRemedio) {
    ciclo.decisoes = [
      ...(ciclo.decisoes ?? []),
      { id: 'pos', data: dia(7 * (nDoses - 1) + 10), apos_aplicacao: nDoses, dose_mg: DOSES[nDoses - 1], fase_indice: null, escolha: 'pos_remedio', bloco_inicio: dia(7 * (nDoses - 1)) },
    ];
  }
  // Uma medição por segunda (31 semanas), cintura e peso caindo; a última semana de dados até hoje
  const nMed = o.semMedidas ? 0 : (o.medicoes ?? 40);
  const medidas: Medida[] = [];
  for (let s = 0; s < nMed; s++) {
    const data = dia(7 * s);
    if (data > hoje) break;
    medidas.push({
      id: `m${s}`,
      data,
      altura_cm: feminino ? 165 : 181,
      pescoco_cm: feminino ? 33 : 41,
      // Semana 3 tem a maior queda (1,5 cm e 1,6 kg)
      cintura_cm: (feminino ? 88 : 100) - s * 0.4 - (s >= 3 ? 1.1 : 0),
      quadril_cm: feminino ? 108 - s * 0.3 : null,
      peso_kg: (feminino ? 82 : 98) - s * 0.45 - (s >= 3 ? 1.15 : 0),
    });
  }
  if (o.atipicaNoFim && medidas.length) {
    const ult = medidas[medidas.length - 1];
    medidas.push({ ...ult, id: 'atip', data: somarDias(ult.data, 2), cintura_cm: 70, peso_kg: 60, atipica: true });
  }
  const diario: RegistroDiario[] = [];
  for (let i = 0; dia(i) <= hoje; i++) {
    const d = dia(i);
    diario.push({
      id: `d${i}`,
      data: d,
      peso_kg: o.semPesoDiario || i % 7 === 0 ? null : (feminino ? 82 : 98) - i * 0.06,
      nausea: i % 7 === 1 ? 2 : i % 7 === 2 ? 1 : 0,
      observacoes: null,
      // 12 dias seguidos no plano a partir do dia 20
      dieta_seguida: i >= 20 && i < 32 ? 'sim' : i % 5 === 0 ? 'nao' : 'sim',
      sono_h: i % 4 === 0 ? 6 : 7.5,
      agua_l: 2 + (i % 3) * 0.5,
      vomito: i % 30 === 1 ? true : null,
    });
  }
  const treinos: TreinoDia[] = [];
  for (let i = 0; dia(i) <= hoje; i++) {
    treinos.push({
      id: `t${i}`,
      data: dia(i),
      treino: i % 6 !== 0,
      cardio: i % 4 !== 0,
      corrida_km: i % 7 === 3 ? 5 + (i % 21 === 3 ? 3 : 0) : null,
      corrida_seg: i % 7 === 3 ? 1800 - i : null,
      cardio_tipo: i % 7 === 3 ? 'corrida' : 'bike',
    });
  }
  const forca: RegistroForca[] = [0, 1, 2, 3, 4, 5].map((s) => ({ id: `f${s}`, data: dia(7 * s * 4 + 2), exercicio: 'Supino', carga_kg: 60 + s * 2, reps: 8, rir: 2 }));
  const registroDecisoes: RegistroDecisao[] = [
    { id: 'r1', data: dia(40), tipo: 'dieta', campo: 'Déficit/superávit', de: '−300 kcal', para: '−400 kcal', motivo: 'ritmo baixo' },
    { id: 'r2', data: dia(400), tipo: 'nota', campo: 'Depois do fim', de: null, para: null },
  ];
  const perfil = perfilBase({
    sexo: feminino ? 'Feminino' : 'Masculino',
    altura_cm: feminino ? 165 : 181,
    modulo_treino: comTreino,
    metas_projeto: feminino ? { pescoco_cm: null, cintura_cm: 78, quadril_cm: 100, peso_kg: 70, bf: 28 } : perfilBase().metas_projeto,
  });
  // As contas de useCalculos()
  const resumo = calcularCiclo(ciclo, aplicacoes, diario, hoje, medidas);
  const serie = serieDePeso(diario, medidas);
  const composicoes = historicoComposicao(medidas, perfil.sexo, { altura_cm: perfil.altura_cm, ajuste: ajusteVigente(perfil, medidas) });
  const pos = decisaoPosRemedio(ciclo, aplicacoes);
  const fimRemedio = resumo.linhas.length && (pos || !resumo.proxima) ? periodoProjeto(ciclo, resumo, pos?.bloco_inicio).fim : null;
  const fases = analisarFases(resumo, serie, diario, hoje, fimRemedio);
  return {
    perfil,
    ciclo,
    resumo,
    diario,
    serie,
    composicoes,
    fases,
    hoje,
    fimRemedio,
    posRemedio: pos,
    treinos: comTreino ? treinos : null,
    forca: comTreino ? forca : null,
    registroDecisoes,
    dieta: null,
    fotos: o.fotos ?? [],
  };
}

export const foto = (id: string, sessao: 'antes' | 'depois', rotulo: FotoInfo['rotulo'], data: string, ordem = 0): FotoInfo => ({ id, sessao, rotulo, data, ordem });
