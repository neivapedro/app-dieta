// Galeria de conquistas (estilo "prêmios" do Apple Fitness): a partir de todo o
// histórico, quais conquistas já aconteceram, em que dia, e quanto falta para as
// outras. Só conta registros; não sugere dose nem mexe em meta. Os nomes e ids
// seguem as comemorações (conquistas.ts) onde coincidem: checklist do dia completo,
// recorde de corrida, meta atingida e fase concluída.
import { blocosDeDose, localizarDegraus, ordenarAplicacoes, totalDosesPlano } from './ciclo';
import { diferencaDias, formatarData, segundaDaSemana, somarDias } from './datas';
import { num, sinal } from './formato';
import { MDC, type Composicao } from './gordura';
import { tarefasDoDia } from './inicio-hoje';
import type { Aplicacao, Ciclo, Medida, MetasProjeto, RegistroDiario, Sexo, TreinoDia } from './tipos';
import { formatarKm, formatarTempo, listarCorridas, tipoCardioEfetivo } from './treino';
import { SONO_MINIMO_H } from './bemestar';

export type CategoriaGaleria = 'remedio' | 'habitos' | 'corpo' | 'treino';

export const CATEGORIAS_GALERIA: { chave: CategoriaGaleria; titulo: string; icone: string; cor: 'indigo' | 'verde' | 'ciano' | 'rosa' }[] = [
  { chave: 'remedio', titulo: 'Remédio', icone: 'frasco', cor: 'indigo' },
  { chave: 'habitos', titulo: 'Hábitos', icone: 'check', cor: 'verde' },
  { chave: 'corpo', titulo: 'Corpo', icone: 'medidas', cor: 'ciano' },
  { chave: 'treino', titulo: 'Treino', icone: 'treino', cor: 'rosa' },
];

export interface ProgressoConquista {
  atual: number;
  alvo: number;
  /** 0 a 1 */
  fracao: number;
}

export interface ConquistaGaleria {
  id: string;
  categoria: CategoriaGaleria;
  titulo: string;
  /** Como é calculada, em uma ou duas frases */
  criterio: string;
  /** Nome do ícone (ui.tsx) desenhado na medalha */
  icone: string;
  /** Texto curto no centro da medalha no lugar do ícone ("7", "5K") */
  selo?: string;
  forma: 'circulo' | 'hexagono';
  ganha: boolean;
  /** Dia em que aconteceu (a primeira vez) */
  data: string | null;
  /** Progresso até ela (só bloqueadas); null quando não dá para medir */
  progresso: ProgressoConquista | null;
  /** "faltam 3 dias" (bloqueada) */
  falta: string | null;
  /** Informação extra: melhor sequência, recorde atual */
  detalhe: string | null;
}

export interface ResumoCategoria {
  chave: CategoriaGaleria;
  titulo: string;
  ganhas: number;
  total: number;
}

export interface Galeria {
  itens: ConquistaGaleria[];
  ganhas: number;
  total: number;
  categorias: ResumoCategoria[];
  /** Últimas ganhas (mais recente primeiro) */
  recentes: ConquistaGaleria[];
}

export interface EntradaGaleria {
  hoje: string;
  sexo: Sexo;
  ciclo: Pick<Ciclo, 'id' | 'fases' | 'decisoes' | 'data_inicio'> | null;
  aplicacoes: Aplicacao[];
  diario: RegistroDiario[];
  /** Medidas cruas (peso do dia da medição vale como o peso do Diário) */
  medidas: Pick<Medida, 'data' | 'peso_kg'>[];
  composicoes: Composicao[];
  metas: MetasProjeto | null;
  /** null = conta sem a aba Treino (as conquistas de treino não aparecem) */
  treinos: TreinoDia[] | null;
  /** Períodos em que treino e cardio entram no checklist (placar do projeto e da fase pós-remédio) */
  periodosTreino?: { inicio: string; fim: string }[];
  /** Há plano de dieta montado (o "Segui o plano?" entra no checklist) */
  comDieta: boolean;
  metaAgua: (data: string) => number;
  /** Checklist completo de hoje, como no cartão do Início (com dose e medição) */
  checklistHoje?: { feitas: number; total: number } | null;
  /** Fim do período do remédio, se o ciclo acabou (useCalculos().fimRemedio) */
  fimRemedio?: string | null;
}

const temNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
/** "falta 1 dia" · "faltam 3 dias" */
const textoFalta = (n: number, texto: string) => `${n === 1 ? 'falta' : 'faltam'} ${texto}`;
const fracaoDe = (atual: number, alvo: number) => (alvo > 0 ? Math.min(Math.max(atual / alvo, 0), 1) : 0);

/**
 * Sequências de dias seguidos que cumprem a regra entre duas datas: a maior e o
 * dia em que cada tamanho foi alcançado pela primeira vez (primeiraVez[k]).
 */
export function sequencias(de: string, ate: string, ok: (data: string) => boolean): { maior: number; atual: number; primeiraVez: string[]; total: number; enesimo: string[] } {
  let maior = 0;
  let atual = 0;
  let total = 0;
  const primeiraVez: string[] = [];
  const enesimo: string[] = [];
  if (de > ate) return { maior, atual, primeiraVez, total, enesimo };
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    if (ok(d)) {
      atual++;
      total++;
      enesimo[total] = d;
      if (atual > maior) {
        maior = atual;
        primeiraVez[atual] = d;
      }
    } else atual = 0;
  }
  return { maior, atual, primeiraVez, total, enesimo };
}

function conquista(c: Omit<ConquistaGaleria, 'ganha' | 'progresso' | 'falta' | 'detalhe' | 'forma'> & Partial<Pick<ConquistaGaleria, 'progresso' | 'falta' | 'detalhe' | 'forma'>>): ConquistaGaleria {
  return { forma: 'circulo', progresso: null, falta: null, detalhe: null, ...c, ganha: c.data !== null };
}

/** Medalha de contagem ("7 dias", "50 treinos"): ganha no dia do n-ésimo. */
function deContagem(
  base: { id: string; categoria: CategoriaGaleria; titulo: string; criterio: string; icone: string; selo?: string; forma?: 'circulo' | 'hexagono' },
  feitos: number,
  alvo: number,
  dataDoAlvo: string | null,
  unidade: (n: number) => string,
  detalhe: string | null = null,
): ConquistaGaleria {
  const ganha = feitos >= alvo && !!dataDoAlvo;
  return conquista({
    ...base,
    data: ganha ? dataDoAlvo : null,
    progresso: ganha ? null : { atual: feitos, alvo, fracao: fracaoDe(feitos, alvo) },
    falta: ganha ? null : textoFalta(alvo - feitos, unidade(alvo - feitos)),
    detalhe,
  });
}

// ---------- Remédio ----------

function conquistasRemedio(e: EntradaGaleria): ConquistaGaleria[] {
  const ciclo = e.ciclo;
  const saida: ConquistaGaleria[] = [];
  const ordenadas = ordenarAplicacoes(e.aplicacoes.filter((a) => (!ciclo || a.ciclo_id === ciclo.id) && a.data <= e.hoje));
  saida.push(
    conquista({
      id: 'primeira-aplicacao',
      categoria: 'remedio',
      titulo: 'Primeira aplicação',
      criterio: 'A 1ª aplicação registrada no ciclo.',
      icone: 'frasco',
      data: ordenadas[0]?.data ?? null,
      progresso: ordenadas.length ? null : { atual: 0, alvo: 1, fracao: 0 },
      falta: ordenadas.length ? null : 'falta registrar a 1ª aplicação',
    }),
  );
  if (!ciclo || !ciclo.fases.length) return saida;
  const fases = ciclo.fases;
  const degraus = localizarDegraus(fases, blocosDeDose(ordenadas), ciclo.decisoes ?? []);
  // Degraus do plano: fases seguidas com a mesma dose contam como um degrau só
  const inicios: number[] = [];
  for (let i = 0; i < fases.length; i++) if (i === 0 || Math.abs(fases[i].dose_mg - fases[i - 1].dose_mg) > 0.01 + 1e-9) inicios.push(i);
  let fimCiclo: string | null = null;
  inicios.forEach((f, n) => {
    const ultimaFase = (inicios[n + 1] ?? fases.length) - 1;
    const previstas = fases.slice(f, ultimaFase + 1).reduce((s, x) => s + x.semanas, 0);
    let feitasMax = 0;
    let data: string | null = null;
    for (const d of degraus) {
      if (d.primeira_fase === null || d.primeira_fase < f || d.primeira_fase > ultimaFase) continue;
      feitasMax = Math.max(feitasMax, Math.min(d.bloco.aplicacoes, previstas));
      if (d.bloco.aplicacoes >= previstas && previstas > 0) {
        const dia = ordenadas[d.bloco.primeira + previstas - 1]?.data ?? null;
        if (dia && (!data || dia < data)) data = dia;
      }
    }
    const nome = fases[f].nome;
    const numero = ultimaFase > f ? `${f + 1}–${ultimaFase + 1}` : `${f + 1}`;
    if (n === inicios.length - 1) fimCiclo = data;
    saida.push(
      conquista({
        id: `fase:${f}`,
        categoria: 'remedio',
        titulo: ultimaFase > f ? `Fases ${numero} concluídas` : `Fase ${numero} concluída`,
        criterio: `As ${previstas} aplicações previstas da fase${nome ? ` “${nome}”` : ''} registradas, uma atrás da outra, na dose da fase.`,
        icone: 'frasco',
        selo: numero,
        forma: 'hexagono',
        data,
        progresso: data ? null : { atual: feitasMax, alvo: previstas, fracao: fracaoDe(feitasMax, previstas) },
        falta: data ? null : textoFalta(previstas - feitasMax, `${previstas - feitasMax} ${previstas - feitasMax === 1 ? 'aplicação' : 'aplicações'}`),
        detalhe: nome ? `Nome da fase: ${nome}` : null,
      }),
    );
  });
  // Ciclo completo: a última fase do plano concluída ou a fase pós-remédio iniciada
  const pos = (ciclo.decisoes ?? []).find((d) => d.escolha === 'pos_remedio' && !!d.bloco_inicio && d.data <= e.hoje);
  const dataCiclo = fimCiclo ?? pos?.bloco_inicio ?? null;
  const totalPlano = totalDosesPlano(fases);
  const restantes = Math.max(totalPlano - ordenadas.length, 0);
  saida.push(
    conquista({
      id: 'ciclo-completo',
      categoria: 'remedio',
      titulo: 'Ciclo completo',
      criterio: 'A última fase do plano concluída (ou o fim do remédio registrado ao iniciar a fase pós-remédio).',
      icone: 'trofeu',
      forma: 'hexagono',
      data: dataCiclo,
      progresso: dataCiclo ? null : { atual: Math.min(ordenadas.length, totalPlano), alvo: totalPlano, fracao: fracaoDe(ordenadas.length, totalPlano) },
      falta: dataCiclo ? null : textoFalta(restantes, `${restantes} ${restantes === 1 ? 'aplicação' : 'aplicações'} do plano`),
      detalhe: `${ordenadas.length} ${ordenadas.length === 1 ? 'aplicação registrada' : 'aplicações registradas'}`,
    }),
  );
  return saida;
}

// ---------- Hábitos ----------

/** Checklist do dia completo no histórico: os itens do Diário, o plano (com dieta) e, no placar, treino e cardio. */
export function checklistCompletoNoDia(e: EntradaGaleria, data: string, reg: RegistroDiario | undefined, pesoMedicao: number | null, treino: TreinoDia | undefined): boolean {
  if (data === e.hoje && e.checklistHoje) return e.checklistHoje.total > 0 && e.checklistHoje.feitas >= e.checklistHoje.total;
  const comTreino = !!e.treinos && (e.periodosTreino ?? []).some((p) => data >= p.inicio && data <= p.fim);
  const t = tarefasDoDia({ reg, pesoMedicao, comTreino, treinoDia: treino ?? null, comDieta: e.comDieta, metaAgua: e.metaAgua(data) });
  return t.length > 0 && t.every((x) => x.feito);
}

function conquistasHabitos(e: EntradaGaleria): ConquistaGaleria[] {
  const regs = new Map(e.diario.map((r) => [r.data, r]));
  const treinos = new Map((e.treinos ?? []).map((t) => [t.data, t]));
  const pesos = new Map<string, number>();
  for (const m of e.medidas) if (m.peso_kg > 0) pesos.set(m.data, m.peso_kg);
  const primeira = ordenarAplicacoes(e.aplicacoes)[0]?.data;
  const inicio = [primeira, e.ciclo?.data_inicio, e.diario.map((r) => r.data).sort()[0]].filter((d): d is string => !!d).sort()[0] ?? e.hoje;
  const ate = e.hoje;

  const chk = sequencias(inicio, ate, (d) => checklistCompletoNoDia(e, d, regs.get(d), pesos.get(d) ?? null, treinos.get(d)));
  const resumoChk = chk.total ? `Total: ${dias(chk.total)} · melhor sequência: ${dias(chk.maior)}` : null;
  const criterioChk =
    'Dia com todos os itens do checklist anotados: peso, náusea, água, sono' +
    `${e.comDieta ? ', “Segui o plano?”' : ''}${e.treinos ? ' e, no período do placar, treino e cardio' : ''}. Hoje vale o checklist do Início (com aplicação e medição).`;
  const chkBase = (alvo: number, titulo: string, selo?: string) =>
    deContagem({ id: alvo === 1 ? 'checklist' : `checklist-${alvo}`, categoria: 'habitos', titulo, criterio: criterioChk, icone: 'check', selo }, chk.total, alvo, chk.enesimo[alvo] ?? null, dias, resumoChk);
  const saida: ConquistaGaleria[] = [
    chkBase(1, 'Checklist do dia completo'),
    chkBase(7, '7 dias de checklist completo', '7'),
    chkBase(30, '30 dias de checklist completo', '30'),
    chkBase(100, '100 dias de checklist completo', '100'),
  ];
  const seq = (id: string, titulo: string, criterio: string, icone: string, alvo: number, s: ReturnType<typeof sequencias>, unidade = dias) =>
    deContagem({ id, categoria: 'habitos', titulo, criterio, icone }, s.maior, alvo, s.primeiraVez[alvo] ?? null, unidade, s.maior ? `Melhor sequência: ${unidade(s.maior)} · atual: ${unidade(s.atual)}` : null);
  saida.push(seq('checklist-semana', 'Semana perfeita', 'Checklist do dia completo em 7 dias seguidos.', 'calendario', 7, chk));
  saida.push(
    seq(
      'agua-7',
      'Água na meta 7 dias seguidos',
      'Água anotada no Diário na meta do dia (2,0 L + 0,7 L por hora de treino e cardio) em 7 dias seguidos.',
      'gota',
      7,
      sequencias(inicio, ate, (d) => {
        const r = regs.get(d);
        return !!r && temNumero(r.agua_l) && r.agua_l >= e.metaAgua(d) - 0.05;
      }),
    ),
  );
  const noites = (n: number) => `${n} ${n === 1 ? 'noite' : 'noites'}`;
  saida.push(
    seq(
      'sono-7',
      'Sono de 7 h+ por 7 noites',
      `Sono anotado de ${num(SONO_MINIMO_H, 0)} h ou mais em 7 noites seguidas.`,
      'lua',
      7,
      sequencias(inicio, ate, (d) => {
        const h = regs.get(d)?.sono_h;
        return temNumero(h) && h >= SONO_MINIMO_H;
      }),
      noites,
    ),
  );
  if (e.comDieta || e.diario.some((r) => !!r.dieta_seguida))
    saida.push(
      seq('dieta-14', 'Plano alimentar 14 dias seguidos', '“Segui o plano?” = sim no Diário em 14 dias seguidos.', 'prato', 14, sequencias(inicio, ate, (d) => regs.get(d)?.dieta_seguida === 'sim')),
    );
  return saida;
}

// ---------- Corpo ----------

type ChaveMeta = 'cintura_cm' | 'quadril_cm' | 'bf' | 'peso_kg';

function conquistasCorpo(e: EntradaGaleria): ConquistaGaleria[] {
  const comps = [...e.composicoes].filter((c) => c.data <= e.hoje).sort((a, b) => a.data.localeCompare(b.data));
  const normais = comps.filter((c) => !c.atipica);
  const saida: ConquistaGaleria[] = [];
  saida.push(
    conquista({
      id: 'primeira-medicao',
      categoria: 'corpo',
      titulo: 'Primeira medição',
      criterio: 'A 1ª medição com fita registrada em Medidas.',
      icone: 'medidas',
      data: comps[0]?.data ?? null,
      progresso: comps.length ? null : { atual: 0, alvo: 1, fracao: 0 },
      falta: comps.length ? null : 'falta a 1ª medição',
    }),
  );
  // Segundas seguidas com medição (semanas seguidas, medindo na segunda)
  const segundas = [...new Set(comps.map((c) => c.data).filter((d) => segundaDaSemana(d) === d))].sort();
  let maior = 0;
  let atual = 0;
  const primeiraVez: string[] = [];
  segundas.forEach((d, i) => {
    atual = i > 0 && diferencaDias(segundas[i - 1], d) === 7 ? atual + 1 : 1;
    if (atual > maior) {
      maior = atual;
      primeiraVez[atual] = d;
    }
  });
  // A sequência atual só vale se a última segunda medida for a desta semana ou a anterior
  const ultima = segundas.at(-1);
  const atualValida = ultima && diferencaDias(ultima, segundaDaSemana(e.hoje)) <= 7 ? atual : 0;
  const semanas = (n: number) => `${n} ${n === 1 ? 'segunda' : 'segundas'}`;
  const criterioSeg = 'Medição registrada na segunda-feira em semanas seguidas (atípicas também contam: o hábito é medir).';
  for (const alvo of [4, 12])
    saida.push(
      deContagem(
        { id: `medicoes-${alvo}`, categoria: 'corpo', titulo: `${alvo} segundas seguidas medindo`, criterio: criterioSeg, icone: 'calendario', selo: String(alvo) },
        maior,
        alvo,
        primeiraVez[alvo] ?? null,
        semanas,
        maior ? `Melhor sequência: ${semanas(maior)} · atual: ${semanas(atualValida)}` : null,
      ),
    );
  // Metas (só as definidas): a 1ª medição normal no valor da meta ou abaixo
  const metas = e.metas;
  if (metas) {
    const itens: [ChaveMeta, string, (n: number) => string][] = [
      ['cintura_cm', 'cintura', (n) => `${num(n, 1)} cm`],
      ...(e.sexo === 'Feminino' ? [['quadril_cm', 'quadril', (n: number) => `${num(n, 1)} cm`] as [ChaveMeta, string, (n: number) => string]] : []),
      ['bf', '% de gordura', (n) => `${num(n, 1)}%`],
      ['peso_kg', 'peso', (n) => `${num(n, 1)} kg`],
    ];
    for (const [k, nome, fmt] of itens) {
      const meta = metas[k];
      if (!temNumero(meta) || meta <= 0) continue;
      const comValor = normais.filter((c) => temNumero(c[k]));
      const atingiu = comValor.find((c) => (c[k] as number) <= meta + 1e-9) ?? null;
      const ini = comValor[0]?.[k] as number | undefined;
      const atu = comValor.at(-1)?.[k] as number | undefined;
      const caminho = temNumero(ini) ? ini - meta : 0;
      const fracao = temNumero(ini) && temNumero(atu) && caminho > 0 ? fracaoDe(ini - atu, caminho) : 0;
      const falta = temNumero(atu) ? Math.max(atu - meta, 0) : null;
      saida.push(
        conquista({
          id: `meta:${k}`,
          categoria: 'corpo',
          titulo: `Meta de ${nome} atingida`,
          criterio: `Uma medição normal (não atípica) com ${nome} em ${fmt(meta)} ou menos.`,
          icone: 'alvo',
          data: atingiu?.data ?? null,
          progresso: atingiu ? null : temNumero(atu) ? { atual: fracao, alvo: 1, fracao } : null,
          falta: atingiu ? null : falta !== null ? `faltam ${fmt(falta).replace('%', ' p.p.')}` : 'aparece com a 1ª medição',
          detalhe: atingiu ? `${fmt(atingiu[k] as number)} em ${formatarData(atingiu.data)} · meta ${fmt(meta)}` : temNumero(atu) ? `Agora: ${fmt(atu)} · meta ${fmt(meta)}` : `Meta: ${fmt(meta)}`,
        }),
      );
    }
  }
  // Massa magra preservada: avaliada no fim do ciclo, da 1ª à última medição normal do período do remédio
  const comMagra = normais.filter((c) => temNumero(c.massa_magra_kg));
  const fim = e.fimRemedio && e.fimRemedio <= e.hoje ? e.fimRemedio : null;
  const ate = fim ? comMagra.filter((c) => c.data <= fim) : comMagra;
  const a = ate[0];
  const b = ate.at(-1);
  const delta = a && b && a !== b ? b.massa_magra_kg! - a.massa_magra_kg! : null;
  const preservada = delta !== null && Math.round(delta * 10) / 10 > -MDC.massa_magra_kg + 1e-9;
  const textoDelta = delta === null ? null : `${sinal(delta, 1, ' kg')} de ${formatarData(a!.data)} a ${formatarData(b!.data)}`;
  saida.push(
    conquista({
      id: 'massa-magra-preservada',
      categoria: 'corpo',
      titulo: 'Massa magra preservada',
      criterio: `No fim do ciclo, a massa magra da última medição ficou a menos de ${num(MDC.massa_magra_kg, 1)} kg (o erro da fita) abaixo da primeira. Medições atípicas ficam de fora.`,
      icone: 'balanca',
      data: fim && preservada ? b!.data : null,
      falta: fim && preservada ? null : !fim ? 'avaliada no fim do ciclo' : delta === null ? 'sem duas medições no ciclo' : 'não aconteceu neste ciclo',
      detalhe: textoDelta ? `${fim ? 'No ciclo' : 'Até agora'}: ${textoDelta}` : null,
    }),
  );
  return saida;
}

// ---------- Treino ----------

function conquistasTreino(e: EntradaGaleria): ConquistaGaleria[] {
  if (!e.treinos) return [];
  const treinos = e.treinos.filter((t) => t.data <= e.hoje).sort((a, b) => a.data.localeCompare(b.data));
  const corridasDias = treinos.filter((t) => t.cardio && tipoCardioEfetivo(t.data, t) === 'corrida');
  const saida: ConquistaGaleria[] = [];
  saida.push(
    conquista({
      id: 'primeira-corrida',
      categoria: 'treino',
      titulo: 'Primeira corrida',
      criterio: 'O 1º cardio de corrida marcado no Treino.',
      icone: 'raio',
      data: corridasDias[0]?.data ?? null,
      progresso: corridasDias.length ? null : { atual: 0, alvo: 1, fracao: 0 },
      falta: corridasDias.length ? null : 'falta a 1ª corrida',
    }),
  );
  const maisLonga = Math.max(0, ...corridasDias.map((t) => t.corrida_km ?? 0));
  for (const [alvo, selo] of [
    [5, '5K'],
    [10, '10K'],
    [21, '21K'],
  ] as const) {
    const primeira = corridasDias.find((t) => (t.corrida_km ?? 0) >= alvo - 1e-9) ?? null;
    saida.push(
      conquista({
        id: `corrida-${alvo}k`,
        categoria: 'treino',
        titulo: `Corrida de ${alvo} km`,
        criterio: `Uma corrida só com ${alvo} km ou mais anotados.`,
        icone: 'raio',
        selo,
        data: primeira?.data ?? null,
        progresso: primeira ? null : { atual: maisLonga, alvo, fracao: fracaoDe(maisLonga, alvo) },
        falta: primeira ? null : `faltam ${formatarKm(Math.max(alvo - maisLonga, 0))} na corrida mais longa`,
        detalhe: maisLonga > 0 ? `Corrida mais longa: ${formatarKm(maisLonga)}` : null,
      }),
    );
  }
  // Recorde de pace: uma corrida mais rápida que todas as anteriores (como a comemoração)
  const corridas = listarCorridas(treinos);
  let melhor: number | null = null;
  const recordes: { data: string; pace: number }[] = [];
  for (const c of corridas) {
    const p = Math.round(c.pace);
    if (melhor !== null && p < melhor) recordes.push({ data: c.data, pace: p });
    melhor = melhor === null ? p : Math.min(melhor, p);
  }
  const melhorCorrida = corridas.length ? corridas.reduce((x, c) => (Math.round(c.pace) < Math.round(x.pace) ? c : x)) : null;
  saida.push(
    conquista({
      id: 'recorde-pace',
      categoria: 'treino',
      titulo: 'Recorde de pace',
      criterio: 'Uma corrida com distância e tempo mais rápida (pace por km) que todas as anteriores.',
      icone: 'relogio',
      data: recordes[0]?.data ?? null,
      progresso: recordes.length ? null : { atual: Math.min(corridas.length, 2), alvo: 2, fracao: fracaoDe(corridas.length, 2) },
      falta: recordes.length ? null : corridas.length < 2 ? textoFalta(2 - corridas.length, `${2 - corridas.length} ${2 - corridas.length === 1 ? 'corrida' : 'corridas'} com tempo`) : 'falta uma corrida mais rápida que a melhor',
      detalhe: melhorCorrida
        ? `Melhor pace: ${formatarTempo(melhorCorrida.pace)}/km em ${formatarData(melhorCorrida.data)}${recordes.length ? ` · ${recordes.length} ${recordes.length === 1 ? 'recorde' : 'recordes'}` : ''}`
        : null,
    }),
  );
  const comTreino = treinos.filter((t) => t.treino);
  const nTreinos = (n: number) => `${n} ${n === 1 ? 'treino' : 'treinos'}`;
  for (const alvo of [50, 100])
    saida.push(
      deContagem(
        { id: `treinos-${alvo}`, categoria: 'treino', titulo: `${alvo} treinos`, criterio: 'Dias com musculação marcada no Treino.', icone: 'treino', selo: String(alvo) },
        comTreino.length,
        alvo,
        comTreino[alvo - 1]?.data ?? null,
        nTreinos,
        `Total: ${nTreinos(comTreino.length)}`,
      ),
    );
  const porData = new Map(treinos.map((t) => [t.data, t]));
  const s = treinos.length ? sequencias(treinos[0].data, e.hoje, (d) => !!porData.get(d)?.treino && !!porData.get(d)?.cardio) : sequencias(e.hoje, e.hoje, () => false);
  saida.push(
    deContagem(
      { id: 'treino-seq-7', categoria: 'treino', titulo: 'Sequência de 7 dias', criterio: 'Treino e cardio marcados em 7 dias seguidos (a sequência do placar).', icone: 'fogo' },
      s.maior,
      7,
      s.primeiraVez[7] ?? null,
      dias,
      s.maior ? `Melhor sequência: ${dias(s.maior)}` : null,
    ),
  );
  return saida;
}

/** A galeria inteira, na ordem das categorias. */
export function montarGaleria(e: EntradaGaleria): Galeria {
  const itens = [...conquistasRemedio(e), ...conquistasHabitos(e), ...conquistasCorpo(e), ...conquistasTreino(e)];
  const categorias = CATEGORIAS_GALERIA.map((c) => {
    const da = itens.filter((i) => i.categoria === c.chave);
    return { chave: c.chave, titulo: c.titulo, ganhas: da.filter((i) => i.ganha).length, total: da.length };
  }).filter((c) => c.total > 0);
  const recentes = itens
    .filter((i) => i.ganha)
    .sort((a, b) => b.data!.localeCompare(a.data!) || a.id.localeCompare(b.id))
    .slice(0, 3);
  return { itens, ganhas: itens.filter((i) => i.ganha).length, total: itens.length, categorias, recentes };
}
