import { diferencaDias, somarDias } from './datas';
import type { Composicao } from './gordura';
import type { Aplicacao, Ciclo, DecisaoFase, MetasProjeto, Sexo } from './tipos';

// Fim do projeto e fase pós-remédio. A fase pós-remédio começa na data da
// última dose, dura 52 semanas e é iniciada pelo usuário (decisão registrada
// junto das decisões de fase). Nada aqui muda meta, dose ou plano, e a fase
// pós-remédio não tem sugestão de meta: o que sai daqui é só informação.

export const SEMANAS_POS = 52;
/** Semanas 0 a 5 depois da última dose: o remédio ainda está saindo do corpo */
export const SEMANAS_SAIDA = 5;
/** Medições seguidas subindo que geram o aviso de reganho */
export const SUBIDAS_AVISO = 3;

/** Decisão de início da fase pós-remédio mais recente, se ainda valer. */
export function decisaoPosRemedio(ciclo: Pick<Ciclo, 'decisoes'> | null | undefined, aplicacoes: Pick<Aplicacao, 'data'>[]): DecisaoFase | null {
  const lista = ciclo?.decisoes ?? [];
  for (let i = lista.length - 1; i >= 0; i--) {
    const d = lista[i];
    if (d.escolha !== 'pos_remedio' || !d.bloco_inicio) continue;
    // Uma aplicação depois do início retoma o remédio: a fase pós-remédio deixa de valer
    return aplicacoes.some((a) => a.data > d.bloco_inicio!) ? null : d;
  }
  return null;
}

export interface FasePos {
  /** Data da última dose (semana 0 começa nela) */
  inicio: string;
  /** Último dia das 52 semanas */
  fim: string;
  /** Semana atual (0 = a semana da última dose); null antes do início */
  semana: number | null;
  /** Semanas 0 a 5: saída do remédio */
  saida: boolean;
  encerrada: boolean;
}

export function fasePos(inicio: string, hoje: string): FasePos {
  const fim = somarDias(inicio, SEMANAS_POS * 7 - 1);
  const d = diferencaDias(inicio, hoje);
  const semana = d < 0 ? null : Math.min(Math.floor(d / 7), SEMANAS_POS - 1);
  return { inicio, fim, semana, saida: semana !== null && semana <= SEMANAS_SAIDA, encerrada: hoje > fim };
}

/**
 * Período do placar de treino da fase pós-remédio: começa no dia seguinte ao
 * fim do placar do projeto (que vai até 7 dias depois da última dose) e vai
 * até o fim das 52 semanas. Os dois placares nunca contam o mesmo dia. Se o
 * usuário iniciou a fase depois disso, o placar começa no dia em que iniciou:
 * os dias em que o app não tinha check para marcar não contam como falta.
 */
export function periodoTreinoPos(inicioPos: string, fimProjeto: string, iniciadaEm?: string | null): { inicio: string; fim: string } {
  const depoisDoProjeto = somarDias(fimProjeto, 1);
  const inicio = iniciadaEm && iniciadaEm > depoisDoProjeto ? iniciadaEm : depoisDoProjeto;
  return { inicio, fim: fasePos(inicioPos, inicioPos).fim };
}

/** Quantas medições seguidas, no fim da série, subiram em relação à anterior. */
export function subidasSeguidas(valores: number[]): number {
  let n = 0;
  for (let i = valores.length - 1; i > 0; i--) {
    if (valores[i] > valores[i - 1] + 1e-9) n++;
    else break;
  }
  return n;
}

export interface AvisoReganho {
  cintura: number;
  peso: number;
  /** Data da medição mais recente */
  data: string;
  texto: string;
}

/**
 * Aviso informativo quando a cintura ou o peso sobem 3 medições seguidas
 * depois da última dose (a referência é a última medição até a última dose).
 */
export function avisoReganho(todas: Composicao[], inicioPos: string): AvisoReganho | null {
  // Medição atípica (doente, inchado, viagem) não conta como subida
  const composicoes = todas.filter((c) => !c.atipica);
  const antes = composicoes.filter((c) => c.data <= inicioPos);
  const serie = [...antes.slice(-1), ...composicoes.filter((c) => c.data > inicioPos)];
  if (serie.length < SUBIDAS_AVISO + 1) return null;
  const cintura = subidasSeguidas(serie.map((c) => c.cintura_cm));
  const peso = subidasSeguidas(serie.map((c) => c.peso_kg));
  if (cintura < SUBIDAS_AVISO && peso < SUBIDAS_AVISO) return null;
  const partes = [cintura >= SUBIDAS_AVISO && `a cintura subiu ${cintura}`, peso >= SUBIDAS_AVISO && `o peso subiu ${peso}`].filter(Boolean);
  return {
    cintura,
    peso,
    data: serie[serie.length - 1].data,
    texto: `Depois da última dose, ${partes.join(' e ')} medições seguidas. Só um aviso: nada muda sozinho.`,
  };
}

// ---------- Balanço do projeto ----------

export interface LinhaBalanco {
  nome: string;
  inicio: number | null;
  final: number | null;
  meta: number | null;
  /** final − início */
  variacao: number | null;
  /** Quanto ainda faltava para a meta no fim (sempre ≥ 0); null sem meta ou atingida */
  faltou: number | null;
  atingida: boolean | null;
  unidade: string;
  menorMelhor: boolean;
  /** Medida da linha (para a mudança mínima detectável, MDC) */
  chave: Chave;
}

type Chave = 'cintura_cm' | 'quadril_cm' | 'pescoco_cm' | 'bf' | 'massa_gorda_kg' | 'massa_magra_kg' | 'peso_kg';

/**
 * Metas atingidas × quanto faltou, na ordem do projeto: medidas antes do peso.
 * O pescoço só aparece se houver meta para ele; o quadril só no perfil feminino.
 */
export function linhasBalanco(inicial: Composicao | null, final: Composicao | null, metas: MetasProjeto | null, sexo: Sexo): LinhaBalanco[] {
  const metaGorda = metas?.peso_kg && metas.bf ? (metas.peso_kg * metas.bf) / 100 : null;
  const metaMagra = metas?.peso_kg && metas.bf ? metas.peso_kg * (1 - metas.bf / 100) : null;
  const itens: [string, Chave, number | null, string, boolean][] = [
    ['Cintura', 'cintura_cm', metas?.cintura_cm ?? null, ' cm', true],
    ...(sexo === 'Feminino' ? [['Quadril', 'quadril_cm', metas?.quadril_cm ?? null, ' cm', true] as [string, Chave, number | null, string, boolean]] : []),
    ...(metas?.pescoco_cm ? [['Pescoço', 'pescoco_cm', metas.pescoco_cm, ' cm', true] as [string, Chave, number | null, string, boolean]] : []),
    ['% de gordura', 'bf', metas?.bf ?? null, ' p.p.', true],
    ['Massa gorda', 'massa_gorda_kg', metaGorda, ' kg', true],
    ['Massa magra', 'massa_magra_kg', metaMagra, ' kg', false],
    ['Peso', 'peso_kg', metas?.peso_kg ?? null, ' kg', true],
  ];
  return itens.map(([nome, k, meta, unidade, menorMelhor]) => {
    const a = inicial ? (inicial[k] as number | null) : null;
    const b = final ? (final[k] as number | null) : null;
    const atingida = meta !== null && b !== null ? (menorMelhor ? b <= meta + 1e-9 : b >= meta - 1e-9) : null;
    return {
      nome,
      inicio: a,
      final: b,
      meta,
      variacao: a !== null && b !== null ? b - a : null,
      faltou: atingida === false ? Math.abs(b! - meta!) : null,
      atingida,
      unidade,
      menorMelhor,
      chave: k,
    };
  });
}
