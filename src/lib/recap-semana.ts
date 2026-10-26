// Resumo da semana em "stories": as contas de cada cartão, puras.
// Só descrevem o que foi registrado; o foco da semana vem das regras que já existem
// (sugestão da semana, faltas de treino, hábitos) e nunca fala de dose.
import { diaAposDose } from './analise';
import { NOITES_MINIMAS } from './bemestar';
import { diaSemanaCurto, diferencaDias, formatarData, segundaDaSemana, somarDias } from './datas';
import { cm, corVariacao, kg, num, pct, pp, sinal } from './formato';
import { MDC, type Composicao } from './gordura';
import { adesaoPeriodo, type AdesaoPeriodo } from './painel';
import { diasCurtos, dietaNoPeriodo, efeitosNoPeriodo, type EfeitosSemana, type FaltasTreino, type Sugestao } from './semana';
import type { RegistroDiario, TreinoDia } from './tipos';
import { formatarTempo, type Corrida } from './treino';

export type TomRecap = 'bom' | 'ruim' | '';

export interface NumeroRecap {
  chave: 'cintura_cm' | 'peso_kg' | 'bf' | 'massa_gorda_kg';
  rotulo: string;
  delta: number | null;
  texto: string;
  tom: TomRecap;
  /** "94,2 cm agora" */
  agora: string;
}

export interface DiaCorpo {
  data: string;
  /** "Seg" */
  dia: string;
  /** Dias desde a dose (0 = dia da dose); null antes da 1ª */
  apos: number | null;
  nausea: number | null;
  sintomas: string[];
}

export interface ItemDestaque {
  tipo: 'pace' | 'sequencia' | 'cintura' | 'gorda' | 'dieta' | 'sono' | 'agua' | 'treino';
  titulo: string;
  valor: string;
  detalhe: string;
}

export interface ItemFoco {
  texto: string;
  detalhe?: string;
}

export interface Recap {
  /** Medição que fecha a semana */
  data: string;
  /** Semana do ciclo (S1, S2…), a mesma numeração do Resumo da semana */
  semana: number;
  antesDoCiclo: boolean;
  /** Os 7 dias antes da medição (os dias antes do início do ciclo ficam de fora) */
  de: string;
  ate: string;
  dias: number;
  numeros: { anterior: string | null; atipica: boolean; itens: NumeroRecap[] };
  constancia: {
    adesao: AdesaoPeriodo | null;
    treino: { feito: number; dias: number } | null;
    cardio: { feito: number; dias: number } | null;
    faltas: string | null;
    vazio: boolean;
  };
  corpo: { dias: DiaCorpo[]; efeitos: EfeitosSemana; pico: DiaCorpo | null; texto: string; doses: number };
  destaques: ItemDestaque[];
  foco: ItemFoco[];
}

export interface EntradaRecap {
  /** Medição aberta (sem ela, a última) */
  data?: string;
  composicoes: Composicao[];
  diario: RegistroDiario[];
  aplicacoes: { data: string; dose_mg: number }[];
  /** null sem a aba Treino */
  treinos: TreinoDia[] | null;
  /** Faltas da semana no placar do Treino (o mesmo cálculo do Resumo da semana) */
  faltas: FaltasTreino | null;
  corridas: Corrida[];
  /** 1ª dose (ou início do ciclo) */
  inicio: string;
  hoje: string;
  metaAgua: (data: string) => number;
  sugestao: Sugestao;
}

export const NIVEL_NAUSEA = ['nenhuma', 'leve', 'moderada', 'forte'] as const;

/** Maior sequência de dias seguidos (entre `de` e `ate`) em que `ok` vale. */
export function maiorSequencia(de: string, ate: string, ok: (d: string) => boolean): number {
  let maior = 0;
  let atual = 0;
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    atual = ok(d) ? atual + 1 : 0;
    maior = Math.max(maior, atual);
  }
  return maior;
}

const SINTOMAS = [
  ['vomito', 'vômito'],
  ['diarreia', 'diarreia'],
  ['intestino_preso', 'intestino preso'],
] as const;

export function montarRecap(e: EntradaRecap): Recap | null {
  const comps = e.composicoes;
  const i = e.data ? comps.findIndex((c) => c.data === e.data) : comps.length - 1;
  const idx = i >= 0 ? i : comps.length - 1;
  const atual = comps[idx];
  if (!atual) return null;
  // Comparada com a última medição normal antes dela (a atípica fica fora da comparação)
  const ant = [...comps.slice(0, idx)].reverse().find((c) => !c.atipica) ?? null;
  const antesDoCiclo = atual.data <= e.inicio;
  const semana = Math.max(Math.floor(diferencaDias(segundaDaSemana(e.inicio), atual.data) / 7), 1);
  const ate = somarDias(atual.data, -1);
  const deSemana = somarDias(atual.data, -7);
  const de = deSemana > e.inicio ? deSemana : e.inicio;
  const dias = Math.max(diferencaDias(de, ate) + 1, 0);

  // (a) A semana em números
  const n = (chave: NumeroRecap['chave'], rotulo: string, fmt: (v: number | null | undefined) => string, sufixo: string): NumeroRecap => {
    const a = ant ? (ant[chave] as number | null) : null;
    const b = atual[chave] as number | null;
    const delta = a !== null && b !== null ? b - a : null;
    return { chave, rotulo, delta, texto: delta === null ? '–' : sinal(delta, 1, sufixo), tom: corVariacao(delta, true, MDC[chave]) as TomRecap, agora: `${fmt(b)} agora` };
  };
  const numeros = {
    anterior: ant?.data ?? null,
    atipica: !!atual.atipica,
    itens: [n('cintura_cm', 'Cintura', cm, ' cm'), n('peso_kg', 'Peso', kg, ' kg'), n('bf', '% de gordura', pp, ' p.p.')],
  };

  // (b) Constância
  const adesao = dias > 0 ? adesaoPeriodo({ diario: e.diario, treinos: e.treinos, de, ate, metaAgua: e.metaAgua }) : null;
  const f = e.faltas && e.faltas.dias > 0 ? e.faltas : null;
  const faltas = f
    ? f.treino.length === 0 && f.cardio.length === 0
      ? 'Treino e cardio feitos em todos os dias.'
      : [f.treino.length ? `Faltou treino: ${diasCurtos(f.treino)}.` : '', f.cardio.length ? `Faltou cardio: ${diasCurtos(f.cardio)}.` : ''].filter(Boolean).join(' ')
    : null;
  const constancia = {
    adesao,
    treino: f ? { feito: f.treinos_feitos, dias: f.dias } : null,
    cardio: f ? { feito: f.cardios_feitos, dias: f.dias } : null,
    faltas,
    vazio: !adesao || (adesao.registro.feito === 0 && !f),
  };

  // (c) Como o corpo reagiu depois da dose (só descreve)
  const datasDose = [...e.aplicacoes].map((a) => a.data).sort();
  const porData = new Map(e.diario.map((r) => [r.data, r]));
  const diasCorpo: DiaCorpo[] = [];
  for (let d = de; d <= ate && dias > 0; d = somarDias(d, 1)) {
    const r = porData.get(d);
    diasCorpo.push({
      data: d,
      dia: diaSemanaCurto(d),
      apos: diaAposDose(d, datasDose),
      nausea: r?.nausea ?? null,
      sintomas: r ? SINTOMAS.filter(([k]) => r[k] === true).map(([, t]) => t) : [],
    });
  }
  const efeitos = efeitosNoPeriodo(e.diario, de, dias > 0 ? ate : somarDias(de, -1));
  const comNausea = diasCorpo.filter((d) => d.nausea !== null);
  const pico = comNausea.length ? comNausea.reduce((m, d) => ((d.nausea as number) > (m.nausea as number) ? d : m)) : null;
  const doses = e.aplicacoes.filter((a) => a.data >= de && a.data <= ate).length;
  let texto: string;
  if (dias === 0) texto = 'Medição antes do início do ciclo: ainda não há dias de remédio para resumir.';
  else if (efeitos.registros === 0) texto = `Sem registro de efeitos no Diário nestes ${dias} ${dias === 1 ? 'dia' : 'dias'}.`;
  else if (!pico || !pico.nausea) texto = 'Sem náusea nos dias anotados.';
  else texto = `Náusea mais alta ${pico.apos !== null ? `no D${pico.apos} depois da dose` : `na ${pico.dia}`} (${NIVEL_NAUSEA[pico.nausea] ?? num(pico.nausea, 0)}).`;
  const corpo = { dias: diasCorpo, efeitos, pico: pico && pico.nausea ? pico : null, texto, doses };

  return {
    data: atual.data,
    semana,
    antesDoCiclo,
    de,
    ate,
    dias,
    numeros,
    constancia,
    corpo,
    destaques: destaquesDaSemana(e, { atual, ant, de, ate, dias, adesao }),
    foco: focoDaSemana(e, { de, ate, dias, adesao, faltas: f }),
  };
}

/** Destaques da semana, o melhor primeiro: recorde de pace, sequência, medidas e hábitos. */
export function destaquesDaSemana(
  e: Pick<EntradaRecap, 'composicoes' | 'corridas' | 'treinos' | 'inicio' | 'diario'>,
  s: { atual: Composicao; ant: Composicao | null; de: string; ate: string; dias: number; adesao: AdesaoPeriodo | null },
): ItemDestaque[] {
  // Cada destaque com a ordem de importância (menor primeiro)
  const lista: { item: ItemDestaque; ordem: number }[] = [];
  const add = (ordem: number, item: ItemDestaque) => lista.push({ item, ordem });
  // Corrida: melhor pace da semana; recorde quando bate todas as anteriores (ao segundo, como na tela)
  const daSemana = e.corridas.filter((c) => c.data >= s.de && c.data <= s.ate);
  if (daSemana.length) {
    const melhor = daSemana.reduce((m, c) => (c.pace < m.pace ? c : m));
    const antes = e.corridas.filter((c) => c.data < s.de);
    const recordeAntes = antes.length ? Math.min(...antes.map((c) => Math.round(c.pace))) : null;
    const recorde = recordeAntes !== null && Math.round(melhor.pace) < recordeAntes;
    const km = num(melhor.km, melhor.km % 1 ? 1 : 0);
    // A melhor corrida sem recorde vem depois das medidas
    add(recorde ? 0 : 5, {
      tipo: 'pace',
      titulo: recorde ? 'Recorde de pace' : 'Melhor corrida da semana',
      valor: `${formatarTempo(melhor.pace)} /km`,
      detalhe: recorde
        ? `${km} km em ${diaSemanaCurto(melhor.data)} · ${Math.round(recordeAntes! - melhor.pace)} s/km mais rápido que o melhor anterior`
        : `${km} km em ${diaSemanaCurto(melhor.data)} · ${daSemana.length} ${daSemana.length === 1 ? 'corrida' : 'corridas'} na semana`,
    });
  }
  // Sequência de dias com treino e cardio dentro da semana
  if (e.treinos && s.dias > 0) {
    const porData = new Map(e.treinos.map((t) => [t.data, t]));
    const seq = maiorSequencia(s.de, s.ate, (d) => !!porData.get(d)?.treino && !!porData.get(d)?.cardio);
    if (seq >= 3) {
      add(1, {
        tipo: 'sequencia',
        titulo: seq === s.dias && s.dias >= 7 ? 'Semana completa' : 'Sequência da semana',
        valor: `${seq} dias`,
        detalhe: seq === s.dias && s.dias >= 7 ? 'Treino e cardio em todos os dias.' : 'seguidos com treino e cardio.',
      });
    }
  }
  // Medidas: menor cintura do ciclo (só quando a queda desde o início passa do erro da fita)
  const normais = e.composicoes.filter((c) => !c.atipica && c.data <= s.atual.data);
  const inicial = [...normais].reverse().find((c) => c.data <= e.inicio) ?? normais[0] ?? null;
  if (!s.atual.atipica && inicial && inicial !== s.atual) {
    const antes = normais.filter((c) => c.data < s.atual.data);
    const desdeInicio = s.atual.cintura_cm - inicial.cintura_cm;
    const menor = antes.length > 0 && antes.every((c) => s.atual.cintura_cm < c.cintura_cm);
    if (menor && desdeInicio <= -MDC.cintura_cm + 1e-9) {
      add(2, { tipo: 'cintura', titulo: 'Menor cintura do ciclo', valor: cm(s.atual.cintura_cm), detalhe: `${sinal(desdeInicio, 1, ' cm')} desde o início.` });
    }
    const gorda = s.atual.massa_gorda_kg !== null && inicial.massa_gorda_kg !== null ? s.atual.massa_gorda_kg - inicial.massa_gorda_kg : null;
    if (gorda !== null && gorda <= -MDC.massa_gorda_kg + 1e-9) {
      add(3, { tipo: 'gorda', titulo: 'Massa gorda desde o início', valor: sinal(gorda, 1, ' kg'), detalhe: `${kg(s.atual.massa_gorda_kg)} agora.` });
    }
  }
  // Hábitos fortes na semana
  const a = s.adesao;
  if (a) {
    if (a.dieta.total >= 5 && a.dieta.fracao === 1) {
      add(4, { tipo: 'dieta', titulo: 'Plano alimentar', valor: '100%', detalhe: `seguido em todos os ${a.dieta.total} dias respondidos.` });
    }
    if (a.treino && a.treino.total >= 5 && a.treino.fracao !== null && a.treino.fracao >= 0.85 && !lista.some((x) => x.item.tipo === 'sequencia')) {
      add(6, { tipo: 'treino', titulo: 'Treino', valor: pct(a.treino.fracao, 0), detalhe: `dos dias (${a.treino.feito} de ${a.treino.total}).` });
    }
    const sonos = e.diario.filter((r) => r.data >= s.de && r.data <= s.ate && typeof r.sono_h === 'number').map((r) => r.sono_h as number);
    if (sonos.length >= NOITES_MINIMAS) {
      const m = sonos.reduce((x, y) => x + y, 0) / sonos.length;
      if (m >= 7) add(7, { tipo: 'sono', titulo: 'Sono médio', valor: `${num(m, 1)} h`, detalhe: `em ${sonos.length} noites anotadas.` });
    }
    if (a.agua.total >= 5 && a.agua.fracao === 1) {
      add(8, { tipo: 'agua', titulo: 'Água na meta', valor: `${a.agua.feito} de ${a.agua.total}`, detalhe: 'dias anotados.' });
    }
  }
  return lista.sort((x, y) => x.ordem - y.ordem).map((x) => x.item);
}

/** Foco da próxima semana: até 3 itens, das regras do app (sem falar de dose). */
export function focoDaSemana(
  e: Pick<EntradaRecap, 'diario' | 'sugestao'>,
  s: { de: string; ate: string; dias: number; adesao: AdesaoPeriodo | null; faltas: FaltasTreino | null },
): ItemFoco[] {
  const itens: ItemFoco[] = [];
  const sug = e.sugestao;
  if (sug.tipo !== 'sem_dados') itens.push({ texto: sug.texto, detalhe: sug.motivo });
  const f = s.faltas;
  if (f && f.treino.length) itens.push({ texto: `Treino nos dias que faltaram`, detalhe: `Nesta semana faltou ${diasCurtos(f.treino)}.` });
  else if (f && f.cardio.length >= 2) itens.push({ texto: 'Cardio nos dias que faltaram', detalhe: `Nesta semana faltou ${diasCurtos(f.cardio)}.` });
  const a = s.adesao;
  if (a && s.dias > 0) {
    const dieta = dietaNoPeriodo(e.diario, s.de, s.ate);
    if (dieta.dias >= 3 && dieta.respondidos / dieta.dias < 0.8) {
      itens.push({ texto: 'Responder “Segui o plano?” no Diário', detalhe: `${dieta.respondidos} de ${dieta.dias} dias respondidos: com 80% a sugestão da semana fica disponível.` });
    }
    if (a.sono.total >= NOITES_MINIMAS && a.sono.fracao !== null && a.sono.fracao < 0.5) {
      itens.push({ texto: 'Dormir 7 h ou mais', detalhe: `${a.sono.feito} de ${a.sono.total} noites anotadas nesta semana.` });
    }
    if (a.agua.total >= 3 && a.agua.fracao !== null && a.agua.fracao < 0.5) {
      itens.push({ texto: 'Água na meta do dia', detalhe: `${a.agua.feito} de ${a.agua.total} dias anotados nesta semana.` });
    }
  }
  if (!itens.length) {
    itens.push(
      sug.tipo === 'sem_dados'
        ? { texto: 'Manter os registros em dia', detalhe: sug.motivo }
        : { texto: 'Manter o que está funcionando', detalhe: 'A semana foi consistente.' },
    );
  }
  return itens.slice(0, 3);
}

/** "26/10 a 01/11" */
export function textoSemana(de: string, ate: string): string {
  return `${formatarData(de).slice(0, 5)} a ${formatarData(ate).slice(0, 5)}`;
}
