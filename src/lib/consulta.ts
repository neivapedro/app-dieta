import { diaAposDose, MINIMO_RITMO, rotuloBloco, type AnaliseFase, type ComposicaoFase, type PontoPeso } from './analise';
import { REGRAS_FASE } from './ciclo';
import { ritmoComFaixa, tendenciaMedidas } from './conferencia';
import { diferencaDias, formatarData, segundaDaSemana, somarDias } from './datas';
import { num, pct, sinal } from './formato';
import type { Composicao } from './gordura';
import { descreverRegistro, ROTULO_TIPO } from './registroDecisoes';
import type { QuadroRelatorio, TabelaRelatorio } from './relatorioPdf';
import { AVISO_SEGURANCA, resumoAlerta, type EventoSeguranca } from './seguranca';
import type { Aplicacao, DecisaoFase, RegistroDecisao, RegistroDiario, TreinoDia } from './tipos';

// Peças do relatório da consulta (PDF): quadro de decisão, semana a semana,
// ocorrências, eventos, tendências e decisões. Só descrevem os dados: a
// decisão de dose é do médico com o paciente.

const curta = (d: string) => formatarData(d).slice(0, 5);

// ---------- Contagens do Diário num período ----------

export interface ContagemDieta {
  sim: number;
  parcial: number;
  nao: number;
}

function contarDieta(regs: RegistroDiario[]): ContagemDieta {
  return {
    sim: regs.filter((r) => r.dieta_seguida === 'sim').length,
    parcial: regs.filter((r) => r.dieta_seguida === 'parcial').length,
    nao: regs.filter((r) => r.dieta_seguida === 'nao').length,
  };
}

/** "79% (5 S · 1 P · 1 N)": plano seguido entre os dias respondidos ("em parte" vale meio dia, como no resto do app). */
export function textoDieta(c: ContagemDieta): string {
  const total = c.sim + c.parcial + c.nao;
  return total ? `${pct((c.sim + 0.5 * c.parcial) / total, 0)} (${c.sim} S · ${c.parcial} P · ${c.nao} N)` : '–';
}

const temSintoma = (r: RegistroDiario) => r.vomito === true || r.diarreia === true || r.intestino_preso === true;

// ---------- Semana a semana (uma linha por segunda-feira) ----------

export interface LinhaSemana {
  segunda: string;
  /** Dose aplicada na semana (segunda a domingo); null = sem aplicação */
  dose_mg: number | null;
  /** Peso da segunda (pesagem em jejum); sem ela, o primeiro da semana */
  peso_kg: number | null;
  /** Medição da semana (fita), se houver */
  composicao: Composicao | null;
  nausea_max: number | null;
  /** Dias com vômito, diarreia ou intestino preso */
  dias_sintoma: number;
  dieta: ContagemDieta;
  /** Treinos e cardios feitos na semana; null = conta sem a aba Treino */
  treino: number | null;
  cardio: number | null;
  /** Dias da semana já passados (a semana atual conta só até hoje; a 1ª, só a partir do início) */
  dias: number;
  /** Peso ou medição da semana marcados como atípicos (ficam fora das tendências) */
  atipica: boolean;
}

export function semanasDoCiclo(e: {
  inicio: string;
  hoje: string;
  aplicacoes: Aplicacao[];
  serie: PontoPeso[];
  composicoes: Composicao[];
  diario: RegistroDiario[];
  treinos: TreinoDia[] | null;
  /** Períodos do placar (projeto e, se houver, a fase pós-remédio): só esses dias contam no treino · cardio */
  periodosTreino?: { inicio: string; fim: string }[];
}): LinhaSemana[] {
  const linhas: LinhaSemana[] = [];
  if (e.inicio > e.hoje) return linhas;
  for (let seg = segundaDaSemana(e.inicio); seg <= e.hoje; seg = somarDias(seg, 7)) {
    const dom = somarDias(seg, 6);
    const ate = dom < e.hoje ? dom : e.hoje;
    const na = <T extends { data: string }>(l: T[]) => l.filter((x) => x.data >= seg && x.data <= ate);
    const aplic = na(e.aplicacoes).sort((a, b) => a.data.localeCompare(b.data));
    const pesos = na(e.serie);
    const regs = na(e.diario);
    const nauseas = regs.map((r) => r.nausea).filter((n): n is number => n !== null);
    // Treino · cardio só a partir do início (os dias antes da 1ª dose não contam como falta),
    // só nos dias do placar (nada depois do fim do projeto) e hoje só depois de marcado
    const de = seg < e.inicio ? e.inicio : seg;
    const marcados = new Map((e.treinos ?? []).map((t) => [t.data, t]));
    const diasTreino: string[] = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      if (e.periodosTreino && !e.periodosTreino.some((p) => d >= p.inicio && d <= p.fim)) continue;
      if (d === e.hoje && !marcados.has(d)) continue;
      diasTreino.push(d);
    }
    const treinos = e.treinos && diasTreino.length ? diasTreino.map((d) => marcados.get(d)).filter((t): t is TreinoDia => !!t) : null;
    const peso = pesos.find((p) => p.data === seg) ?? pesos[0];
    const composicao = na(e.composicoes)[0] ?? null;
    linhas.push({
      segunda: seg,
      dose_mg: aplic.length ? aplic[aplic.length - 1].dose_mg : null,
      peso_kg: peso?.peso_kg ?? null,
      composicao,
      atipica: !!peso?.atipica || !!composicao?.atipica,
      nausea_max: nauseas.length ? Math.max(...nauseas) : null,
      dias_sintoma: regs.filter(temSintoma).length,
      dieta: contarDieta(regs),
      treino: treinos ? treinos.filter((t) => t.treino).length : null,
      cardio: treinos ? treinos.filter((t) => t.cardio).length : null,
      dias: diasTreino.length,
    });
  }
  return linhas;
}

const casas = (n: number | null | undefined, c = 1) => (n === null || n === undefined ? '–' : num(n, c));

export function tabelaSemanal(linhas: LinhaSemana[], comTreino: boolean): TabelaRelatorio {
  const dieta = (c: ContagemDieta) => (c.sim + c.parcial + c.nao ? `${c.sim}/${c.parcial}/${c.nao}` : '–');
  return {
    titulo: 'Semana a semana (segundas-feiras)',
    cabecalho: ['Segunda', 'Dose mg', 'Peso kg', 'Cintura cm', '% gord.', 'Magra kg', 'Gorda kg', 'Náusea máx.', 'Dias c/ sintoma', 'Dieta S/P/N', ...(comTreino ? ['Treino · cardio'] : [])],
    linhas: linhas.map((l) => [
      formatarData(l.segunda, true),
      l.dose_mg === null ? '–' : num(l.dose_mg, 2),
      `${casas(l.peso_kg)}${l.atipica && l.peso_kg !== null ? '*' : ''}`,
      `${casas(l.composicao?.cintura_cm)}${l.composicao?.atipica ? '*' : ''}`,
      casas(l.composicao?.bf),
      casas(l.composicao?.massa_magra_kg),
      casas(l.composicao?.massa_gorda_kg),
      l.nausea_max === null ? '–' : String(l.nausea_max),
      String(l.dias_sintoma),
      dieta(l.dieta),
      ...(comTreino ? [l.treino === null ? '–' : `${l.treino}/${l.dias} · ${l.cardio}/${l.dias}`] : []),
    ]),
    nota: `Peso da segunda em jejum. Medidas pela fita (Marinha dos EUA) quando houve medição na semana. Náusea de 0 a 3; sintomas = vômito, diarreia ou intestino preso. Dieta: dias "segui o plano?" sim/parcial/não.${
      linhas.some((l) => l.atipica) ? ' * medição atípica (doente, inchado, viagem): fica fora das tendências.' : ''
    }`,
  };
}

// ---------- Quadro de decisão (fase atual × anterior) ----------

export interface ColunaQuadro {
  rotulo: string;
  inicio: string;
  /** Último dia considerado (véspera do bloco seguinte ou hoje) */
  fim: string;
  em_andamento: boolean;
  gorda_semana: number | null;
  cintura_semana: number | null;
  magra_semana: number | null;
  /** Medições usadas na eficácia */
  medicoes: { de: string; ate: string } | null;
  nausea_pico: { valor: number; data: string; d: number | null } | null;
  vomitos: { data: string; d: number | null }[];
  dias_registrados: number;
  dias: number;
  treino: number | null;
  cardio: number | null;
  dieta: ContagemDieta;
}

/** Colunas do quadro: o último bloco de dose (atual ou que termina) e o anterior. */
export function colunasQuadro(
  fases: AnaliseFase[],
  comp: ComposicaoFase[],
  diario: RegistroDiario[],
  datasAplicacoes: string[],
  hoje: string,
): { atual: ColunaQuadro | null; anterior: ColunaQuadro | null } {
  const coluna = (i: number): ColunaQuadro | null => {
    const f = fases[i];
    if (!f) return null;
    const c = comp[i];
    const prox = fases[i + 1]?.inicio ?? null;
    const fim = prox ? somarDias(prox, -1) : hoje;
    const regs = diario.filter((r) => r.data >= f.inicio && r.data <= fim);
    const comNausea = regs.filter((r) => r.nausea !== null);
    const max = comNausea.length ? Math.max(...comNausea.map((r) => r.nausea as number)) : null;
    const pico = max === null ? null : comNausea.find((r) => r.nausea === max)!;
    return {
      rotulo: rotuloBloco(f),
      inicio: f.inicio,
      fim,
      em_andamento: f.em_andamento,
      // As três pela mesma regressão (3+ medições em 14+ dias), para serem comparáveis
      gorda_semana: c?.gorda_semana ?? null,
      cintura_semana: c?.cintura_semana ?? null,
      magra_semana: c?.magra_semana ?? null,
      medicoes: c?.de && c?.ate ? { de: c.de.data, ate: c.ate.data } : null,
      nausea_pico: pico ? { valor: max!, data: pico.data, d: diaAposDose(pico.data, datasAplicacoes) } : null,
      vomitos: regs.filter((r) => r.vomito === true).map((r) => ({ data: r.data, d: diaAposDose(r.data, datasAplicacoes) })),
      dias_registrados: regs.length,
      dias: Math.max(diferencaDias(f.inicio, fim) + 1, 0),
      treino: c?.treino ?? null,
      cardio: c?.cardio ?? null,
      dieta: contarDieta(regs),
    };
  };
  const n = fases.length;
  return { atual: coluna(n - 1), anterior: coluna(n - 2) };
}

const dMais = (d: number | null) => (d === null ? '' : `D+${d}`);

export function montarQuadro(
  q: { atual: ColunaQuadro; anterior: ColunaQuadro | null },
  comTreino: boolean,
  proxima: string,
  /** Remédio concluído (frasco no fim ou fase pós-remédio): a última fase não "termina" para subir, e sem regras de subir */
  remedioConcluido = false,
): QuadroRelatorio {
  const cols = [q.anterior, q.atual];
  const linha = (rotulo: string, f: (c: ColunaQuadro) => string): [string, string, string] => [rotulo, ...cols.map((c) => (c ? f(c) : '–'))] as [string, string, string];
  const cab = (c: ColunaQuadro | null, papel: string) =>
    c ? `${papel}: ${c.rotulo}\n${formatarData(c.inicio, true)} a ${formatarData(c.fim, true)}${c.em_andamento ? ' (em curso)' : ''}` : `${papel}: –`;
  return {
    titulo: 'Quadro de decisão',
    colunas: [cab(q.anterior, 'Fase anterior'), cab(q.atual, remedioConcluido ? 'Última fase do remédio' : q.atual.em_andamento ? 'Fase atual' : 'Fase que termina')],
    secoes: [
      {
        titulo: 'Eficácia (pela fita, por semana)',
        linhas: [
          linha('Massa gorda', (c) => sinal(c.gorda_semana, 2, ' kg/sem')),
          linha('Cintura', (c) => sinal(c.cintura_semana, 2, ' cm/sem')),
          linha('Massa magra', (c) => sinal(c.magra_semana, 2, ' kg/sem')),
          // Sem regressão (números em "–"), as datas não deram resultado: "poucas medições"
          linha('Medições usadas', (c) =>
            c.medicoes && c.gorda_semana !== null
              ? `${curta(c.medicoes.de)} a ${curta(c.medicoes.ate)}`
              : c.medicoes
                ? `poucas medições (${curta(c.medicoes.de)} a ${curta(c.medicoes.ate)})`
                : 'poucas medições',
          ),
        ],
      },
      {
        titulo: 'Tolerância',
        linhas: [
          linha('Pico de náusea (0 a 3)', (c) => (c.nausea_pico ? `${c.nausea_pico.valor} em ${curta(c.nausea_pico.data)} ${dMais(c.nausea_pico.d)}`.trim() : '–')),
          linha('Vômitos', (c) => (c.vomitos.length ? c.vomitos.map((v) => `${curta(v.data)} ${dMais(v.d)}`.trim()).join(', ') : 'nenhum')),
          linha('Dias com registro no Diário', (c) => `${c.dias_registrados} de ${c.dias}`),
        ],
      },
      {
        titulo: 'Rotina',
        linhas: [
          ...(comTreino ? [linha('Treino', (c) => (c.treino === null ? '–' : pct(c.treino, 0))), linha('Cardio', (c) => (c.cardio === null ? '–' : pct(c.cardio, 0)))] : []),
          linha('Dieta seguida', (c) => textoDieta(c.dieta)),
        ],
      },
    ],
    proxima,
    regras: remedioConcluido ? [] : REGRAS_FASE,
    nota: 'Cada fase é um bloco de doses seguidas iguais (dose realmente aplicada). Fases seguidas também mudam tempo de uso, dieta e treino: a diferença entre elas não se atribui só à dose.',
  };
}

// ---------- Tolerância entre doses e ocorrências ----------

export interface ToleranciaIntervalo {
  dias: number;
  nausea_max: number | null;
  vomito: number;
  diarreia: number;
  intestino_preso: number;
}

/** Diário de `de` até a véspera de `ate` (ou até hoje, no último intervalo). */
export function toleranciaIntervalo(diario: RegistroDiario[], de: string, ate: string | null, hoje: string): ToleranciaIntervalo {
  const regs = diario.filter((r) => r.data >= de && (ate ? r.data < ate : r.data <= hoje));
  const nauseas = regs.map((r) => r.nausea).filter((n): n is number => n !== null);
  const conta = (k: 'vomito' | 'diarreia' | 'intestino_preso') => regs.filter((r) => r[k] === true).length;
  return {
    dias: regs.length,
    nausea_max: nauseas.length ? Math.max(...nauseas) : null,
    vomito: conta('vomito'),
    diarreia: conta('diarreia'),
    intestino_preso: conta('intestino_preso'),
  };
}

/** "2 · vômito 1 d · diarreia 2 d" · "0 · sem sintomas" · "sem registro" */
export function textoTolerancia(t: ToleranciaIntervalo): string {
  if (!t.dias) return 'sem registro';
  const sint = [
    t.vomito && `vômito ${t.vomito} d`,
    t.diarreia && `diarreia ${t.diarreia} d`,
    t.intestino_preso && `intest. preso ${t.intestino_preso} d`,
  ].filter(Boolean);
  return `${t.nausea_max ?? '–'} · ${sint.length ? sint.join(' · ') : 'sem sintomas'}`;
}

export interface Ocorrencia {
  data: string;
  /** Dias depois da última dose (0 = dia da dose); null antes da 1ª */
  d: number | null;
  dose_mg: number | null;
  texto: string;
}

/** Dias com observação, vômito, diarreia ou náusea forte (3), e observações das aplicações. */
export function ocorrencias(diario: RegistroDiario[], aplicacoes: Aplicacao[]): Ocorrencia[] {
  const ordenadas = [...aplicacoes].sort((a, b) => a.data.localeCompare(b.data));
  const datas = ordenadas.map((a) => a.data);
  const doseEm = (data: string) => [...ordenadas].reverse().find((a) => a.data <= data)?.dose_mg ?? null;
  const lista: Ocorrencia[] = [];
  for (const r of diario) {
    const obs = r.observacoes?.trim() ?? '';
    const marcas = [r.nausea === 3 && 'náusea forte', r.vomito === true && 'vômito', r.diarreia === true && 'diarreia'].filter(Boolean) as string[];
    if (!obs && !marcas.length) continue;
    if (r.intestino_preso === true) marcas.push('intestino preso');
    const partes = [marcas.length ? marcas.join(', ').replace(/^./, (c) => c.toUpperCase()) : '', obs].filter(Boolean);
    lista.push({ data: r.data, d: diaAposDose(r.data, datas), dose_mg: doseEm(r.data), texto: partes.join(' — ') });
  }
  for (const a of ordenadas) {
    const obs = a.observacoes?.trim();
    if (obs) lista.push({ data: a.data, d: 0, dose_mg: a.dose_mg, texto: `Na aplicação: ${obs}` });
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

export function tabelaOcorrencias(lista: Ocorrencia[]): TabelaRelatorio {
  return {
    titulo: 'Ocorrências',
    cabecalho: ['Data', 'Dia', 'Dose', 'O que houve'],
    linhas: lista.map((o) => [formatarData(o.data, true), o.d === null ? '–' : `D+${o.d}`, o.dose_mg === null ? '–' : `${num(o.dose_mg, 2)} mg`, o.texto]),
    nota: 'Dias do Diário com observação, vômito, diarreia ou náusea forte (3), e observações das aplicações. D+0 = dia da dose.',
  };
}

// ---------- Eventos (alertas de segurança e anotações para o médico) ----------

export function tabelaEventos(alertas: EventoSeguranca[], anotacoes: DecisaoFase[]): TabelaRelatorio {
  const linhas: { data: string; l: string[] }[] = [
    ...alertas.map((a) => ({
      data: a.data,
      l: [formatarData(a.data, true), 'Alerta', `${resumoAlerta(a.texto)}${a.desde < a.data ? ` (alerta ativo desde ${curta(a.desde)})` : ''}`],
    })),
    ...anotacoes.map((d) => ({ data: d.data, l: [formatarData(d.data, true), 'Anotação', `${d.texto ?? ''} (após a ${d.apos_aplicacao}ª dose, ${num(d.dose_mg, 2)} mg)`] })),
  ];
  return {
    titulo: 'Eventos',
    cabecalho: ['Data', 'Tipo', 'Descrição'],
    linhas: linhas.sort((a, b) => a.data.localeCompare(b.data)).map((x) => x.l),
    nota: `Alertas: ${AVISO_SEGURANCA} Anotações: escritas pelo paciente para o médico.`,
  };
}

// ---------- Tendências das medidas e ritmo por bloco ----------

/** Faixa de 95%: "entre −0,40 e −0,10" */
const faixa = (v: number, ic: number, c: number) => `entre ${sinal(v - ic, c)} e ${sinal(v + ic, c)}`;

export function tabelaTendencias(composicoes: Composicao[]): TabelaRelatorio {
  const t = tendenciaMedidas(composicoes);
  if (!t) return { titulo: 'Tendência das medidas', cabecalho: [], linhas: [], nota: 'A tendência aparece com 4 medições cobrindo 3 semanas.' };
  const l = (rotulo: string, v: number, ic: number, un: string, c = 2) => [rotulo, sinal(v, c, un), `${faixa(v, ic, c)}${un}`];
  return {
    titulo: 'Tendência das medidas',
    cabecalho: ['Medida', 'Por semana', 'Faixa provável (95%)'],
    linhas: [
      l('Massa gorda', t.gorda_semana, t.ic95_semana.gorda, ' kg'),
      l('Massa magra', t.magra_semana, t.ic95_semana.magra, ' kg'),
      l('Cintura', t.cintura_semana, t.ic95_semana.cintura, ' cm'),
      l('Peso', t.peso_semana, t.ic95_semana.peso, ' kg'),
    ],
    nota: `Regressão de ${t.medicoes} medições de ${formatarData(t.de, true)} a ${formatarData(t.ate, true)} (janela de até 6 semanas). Déficit que as medidas mostram: ${num(t.deficit_dia, 0)} kcal/dia, faixa provável entre ${num(t.deficit_dia - t.ic95_dia, 0)} e ${num(t.deficit_dia + t.ic95_dia, 0)}. A fita e a balança têm ruído; com mais medições a faixa estreita.`,
  };
}

/** kg/semana de um bloco de dose pela regressão das pesagens do bloco, com a faixa: "− 0,45 ± 0,20 (8 pesagens)". */
export function ritmoDoBloco(
  serie: PontoPeso[],
  f: Pick<AnaliseFase, 'inicio' | 'fim' | 'kg_por_semana'> & { pontos_peso?: { data: string; peso_kg: number }[]; variacao_kg?: number | null },
  ultimoDoBloco: boolean,
): string {
  const fim = ultimoDoBloco ? f.fim : somarDias(f.fim, -1);
  // A mesma regra da tela: sem ritmo lá (pontos_peso vazio = poucos dados), sem ritmo aqui
  if (f.pontos_peso && !f.pontos_peso.length) {
    return f.variacao_kg != null ? `${sinal(f.variacao_kg, 2)} kg no bloco (poucas pesagens)` : 'poucas pesagens';
  }
  // Os mesmos pontos da tela (com a pesagem de referência de até 7 dias antes do bloco)
  const pontos = f.pontos_peso?.length ? f.pontos_peso : serie.filter((p) => !p.atipica && p.data >= f.inicio && p.data <= fim);
  const ordenados = [...pontos].sort((a, b) => a.data.localeCompare(b.data));
  const cobre = ordenados.length >= MINIMO_RITMO.pontos && diferencaDias(ordenados[0].data, ordenados[ordenados.length - 1].data) >= MINIMO_RITMO.dias;
  const r = cobre ? ritmoComFaixa(pontos.map((p) => ({ data: p.data, valor: p.peso_kg }))) : null;
  if (r) return `${sinal(r.semana, 2)} ± ${num(r.ic95, 2)} (${r.n} pesagens)`;
  // Bloco curto com pesagem só às segundas: fica a conta entre a primeira e a última pesagem, sem faixa
  return f.kg_por_semana !== null ? `${sinal(f.kg_por_semana, 2)} (sem faixa: poucas pesagens)` : 'poucas pesagens';
}

// ---------- Registro de decisões ----------

export function tabelaDecisoes(registros: RegistroDecisao[]): TabelaRelatorio {
  const ordenados = [...registros].sort((a, b) => a.data.localeCompare(b.data));
  return {
    titulo: 'Decisões (mudanças no período)',
    cabecalho: ['Data', 'Área', 'O que mudou', 'Motivo'],
    linhas: ordenados.map((r) => [formatarData(r.data, true), ROTULO_TIPO[r.tipo], descreverRegistro(r), r.motivo?.trim() || '–']),
    nota: 'Gravadas pelo app quando o paciente mudou déficit, fator, proteína/gordura, exercício, fases do Plano, metas ou a dose. No mesmo dia, cada campo aparece uma vez.',
  };
}
