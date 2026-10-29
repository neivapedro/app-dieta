import '../estilos/analise.css';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ListaDecisoes } from '../componentes/decisoes';
import { prepararFotosPdf, useFotos } from '../componentes/fotos';
import { LinhaQualidade, useQualidade } from '../componentes/composicao';
import { Anel, BarraMeta, LinhaDoses, MapaCalor, Pilulas, tomAdesao, Variacoes } from '../componentes/painel';
import { Bloco, IconeChip, Vazio } from '../componentes/ui';
import { EstadoVazio } from '../componentes/estado-vazio';
import { useDeslizarAbas } from '../componentes/deslizar-abas';
import { vibrarLeve } from '../lib/haptico';
import { GraficoBarrasSemana, ProvedorSincronia, type Marco, type PontoSerie, type Serie } from '../componentes/grafico';
import { BarraPeriodo, type DestaqueAnalise } from '../componentes/analise-filtro';
import { FaixaFases, GraficoJanela, LinhaDoTempo } from '../componentes/analise-graficos';
import { BarrasRitmo, FolhaMetrica, KpiToque, type DetalheMetrica } from '../componentes/analise-detalhe';
import { GraficoPrevisao } from '../componentes/analise-previsao';
import { Padroes } from '../componentes/analise-padroes';
import { ResumoInsights } from '../componentes/insights';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useProjeto } from '../dados/useProjeto';
import { useMetaAgua, useTreino } from '../dados/useTreino';
import { analisarGeral, colunasNausea, composicaoPorFase, rotuloBloco, sintomasPorFase } from '../lib/analise';
import { fasePos } from '../lib/projeto';
import { aguaSemana, mediaSono7, SONO_MINIMO_H, sonoPorFase, TEXTO_SONO_BAIXO } from '../lib/bemestar';
import { descreverFaseAtual, textoProximaDoseRelatorio } from '../lib/ciclo';
import { qualidadePerda, ritmoPercentual, tendenciaMedidas, tendenciaPeso, textoQualidade } from '../lib/conferencia';
import {
  colunasQuadro,
  montarQuadro,
  ocorrencias,
  ritmoDoBloco,
  semanasDoCiclo,
  tabelaDecisoes,
  tabelaEventos,
  tabelaOcorrencias,
  tabelaSemanal,
  tabelaTendencias,
  textoTolerancia,
  toleranciaIntervalo,
} from '../lib/consulta';
import { dataPorExtenso, diferencaDias, formatarData, somarDias } from '../lib/datas';
import { curto, decisoesPorDia } from '../lib/registroDecisoes';
import { historicoAlertas } from '../lib/seguranca';
import { estimarTamanhoPdf, montarFotosPdf, textoTamanho } from '../lib/fotos';
import type { ImagemPdf, ModeloRelatorio } from '../lib/relatorioPdf';
import { calcularMetas, corpoParaMetas, idade, macrosDaRefeicao, textoBaseMetas } from '../lib/dieta';
import { cm, corVariacao, kg, mg, num, pct, pp, sinal } from '../lib/formato';
import { MDC, ultimaNormal, type ChaveMdc, type Composicao } from '../lib/gordura';
import { conselhoConferencia, dietaNaTendencia, textoDietaSemana, textoPlanoSeguido } from '../lib/semana';
import { adesaoPeriodo, destaques, habitosPorSemana, picoNausea, progressoMeta, serieMetrica, type AdesaoPeriodo, type ChavePainel, type ProgressoMeta, type Taxa } from '../lib/painel';
import { diaCurto } from '../lib/rotina';
import { aderenciaDoTreino, formatarTempo, textoCorridasPeriodo } from '../lib/treino';
import { BotaoCompartilharProgresso } from '../componentes/compartilhar';
import { CartaoRelatorioFinal } from '../componentes/relatorio-final-entrada';
import { fasesNoPeriodo, fimDoBloco, lerPeriodo, noPeriodo, opcoesPeriodo, resumoPeriodo, rotuloFaseCurto } from '../lib/analise-periodo';
import { preverMeta } from '../lib/analise-previsao';
import { marcosAnalise } from '../lib/analise-detalhe';
import { dadosCorrelacao, filtrarPeriodo } from '../lib/correlacoes';

type AbaAnalise = 'geral' | 'corpo' | 'remedio' | 'habitos' | 'relatorio';
const ABAS_ANALISE: [AbaAnalise, string][] = [
  ['geral', 'Geral'],
  ['corpo', 'Corpo'],
  ['remedio', 'Remédio'],
  ['habitos', 'Hábitos'],
  ['relatorio', 'PDF'],
];
const CHAVES_ANALISE = ABAS_ANALISE.map(([k]) => k);

function linhaComparacao(rotulo: string, a: number | null, b: number | null, fmt: (n: number | null) => string, fmtDelta: (n: number) => string, menorMelhor: boolean, chave: ChaveMdc) {
  const d = a !== null && b !== null ? b - a : null;
  return (
    <tr key={rotulo}>
      <td>{rotulo}</td>
      <td>{fmt(a)}</td>
      <td>{fmt(b)}</td>
      <td className={corVariacao(d, menorMelhor, MDC[chave])}>{d === null ? '–' : fmtDelta(d)}</td>
    </tr>
  );
}

function Comparacao({ ini, atu }: { ini: Composicao; atu: Composicao | null }) {
  const v = (c: Composicao | null, k: keyof Composicao) => (c ? (c[k] as number | null) : null);
  return (
    <div className="tabela-rolagem">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>{formatarData(ini.data, true)}</th>
            <th>{atu ? formatarData(atu.data, true) : 'Atual'}</th>
            <th>Variação</th>
          </tr>
        </thead>
        <tbody>
          {linhaComparacao('Cintura', ini.cintura_cm, v(atu, 'cintura_cm'), cm, (n) => sinal(n, 1, ' cm'), true, 'cintura_cm')}
          {linhaComparacao('% de gordura', ini.bf, v(atu, 'bf'), pp, (n) => sinal(n, 1, ' p.p.'), true, 'bf')}
          {linhaComparacao('Massa gorda', ini.massa_gorda_kg, v(atu, 'massa_gorda_kg'), kg, (n) => sinal(n, 1, ' kg'), true, 'massa_gorda_kg')}
          {linhaComparacao('Massa magra', ini.massa_magra_kg, v(atu, 'massa_magra_kg'), kg, (n) => sinal(n, 1, ' kg'), false, 'massa_magra_kg')}
          {linhaComparacao('Peso', ini.peso_kg, v(atu, 'peso_kg'), kg, (n) => sinal(n, 1, ' kg'), true, 'peso_kg')}
          {linhaComparacao('Pescoço', ini.pescoco_cm, v(atu, 'pescoco_cm'), cm, (n) => sinal(n, 1, ' cm'), true, 'pescoco_cm')}
          {ini.quadril_cm !== null && linhaComparacao('Quadril', ini.quadril_cm, v(atu, 'quadril_cm'), cm, (n) => sinal(n, 1, ' cm'), true, 'quadril_cm')}
        </tbody>
      </table>
    </div>
  );
}

const COR_FAIXA = { ideal: 'bom', rapido: 'ruim', lento: '', ganho: 'ruim' } as const;

export function Analise() {
  const { perfil, ciclo, diario, medidas, treinos, dieta, registroDecisoes, aplicacoes: todasAplicacoes } = useDados();
  const { resumo, geral: geralHoje, fases, serie, hoje, composicoes, fimRemedio, fimFases, posRemedio } = useCalculos();
  // Remédio concluído: Resumo e "Medidas: início × agora" mostram o resultado do período do remédio (como o Balanço do projeto)
  const geral =
    fimRemedio && fimRemedio < hoje
      ? analisarGeral(
          geralHoje.inicio_ciclo,
          serie.filter((p) => p.data <= fimRemedio),
          composicoes.filter((c) => c.data <= fimRemedio),
          fimRemedio,
        )
      : geralHoje;
  const treino = useTreino();
  const { banco } = useAlimentos();
  // O gerador de PDF é baixado ao abrir a aba: no toque, o PDF sai na hora
  // (o iPhone só abre o Compartilhar logo depois do toque)
  const gerador = useRef<Promise<typeof import('../lib/relatorioPdf')> | null>(null);
  useEffect(() => {
    gerador.current = import('../lib/relatorioPdf');
    gerador.current.catch(() => (gerador.current = null));
  }, []);
  const [pdf, setPdf] = useState<File | null>(null);
  // Dados mudaram depois de gerar: o PDF guardado ficou velho (Compartilhar sumiria com ele)
  useEffect(() => {
    setPdf(null);
  }, [registroDecisoes, ciclo, diario, medidas, todasAplicacoes, dieta, treinos, perfil]);
  const [msgPdf, setMsgPdf] = useState<{ tipo: string; texto: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  // Fotos no PDF: desmarcado por padrão e sem lembrar a escolha (o PDF pode ser compartilhado)
  const [incluirFotos, setIncluirFotos] = useState(false);
  const { fotos, carregando: carregandoFotos } = useFotos();
  const semFotos = fotos.length === 0;
  // Muitas fotos: avisa o tamanho aproximado do PDF (o compartilhamento pode ficar pesado)
  const tamanhoPdf = fotos.length > 6 ? estimarTamanhoPdf(fotos.map((f) => ({ ...f, bytes: f.dados.byteLength }))) : null;
  // Com a opção marcada, as fotos já são reduzidas antes do toque: o PDF sai na hora
  const fotosPdf = useRef<Promise<Map<string, ImagemPdf>> | null>(null);
  useEffect(() => {
    fotosPdf.current = incluirFotos && fotos.length ? prepararFotosPdf(fotos) : null;
    fotosPdf.current?.catch(() => undefined);
  }, [incluirFotos, fotos]);
  // Remédio concluído: a qualidade da perda do Resumo é a do período do remédio (como o peso e as massas)
  const remedioConcluido = !!fimRemedio && fimRemedio < hoje;
  const qualidade = useQualidade(remedioConcluido ? fimRemedio! : undefined);
  const metaAguaDe = useMetaAgua();
  const proj = useProjeto();
  // A aba fica no endereço (?aba=corpo): voltar para a Análise reabre a mesma
  const [params, setParams] = useSearchParams();
  const aba = (ABAS_ANALISE.find(([k]) => k === params.get('aba'))?.[0] ?? 'geral') as AbaAnalise;
  // O período do filtro também fica no endereço (?periodo=4s); a aba e o período não se apagam um ao outro
  const mudarParams = (aba: AbaAnalise, periodo: string | null) => {
    const novo: Record<string, string> = {};
    if (aba !== 'geral') novo.aba = aba;
    if (periodo && periodo !== 'ciclo') novo.periodo = periodo;
    setParams(novo, { replace: true });
  };
  const setAba = (a: AbaAnalise) => {
    if (a !== aba) vibrarLeve();
    mudarParams(a, params.get('periodo'));
    window.scrollTo({ top: 0 });
  };
  // Deslizar o dedo para o lado no conteúdo troca de aba (gráficos e filtros ficam fora do gesto)
  const deslizar = useDeslizarAbas(CHAVES_ANALISE, aba, setAba);
  const [metrica, setMetrica] = useState<ChavePainel>('cintura_cm');
  // Destaque cruzado (bloco de dose, semana ou dia) e o detalhe de um KPI aberto
  const [destaque, setDestaque] = useState<DestaqueAnalise | null>(null);
  const [folha, setFolha] = useState<ChavePainel | 'ritmo' | null>(null);
  const fecharFolha = useCallback(() => setFolha(null), []);
  const [metaPrev, setMetaPrev] = useState<'peso' | 'cintura'>('cintura');
  if (!resumo) return null;

  const datasAplic = resumo.linhas.map((l) => l.aplicacao.data);
  // Com o remédio concluído, as fases vão até o fim do período do remédio (fimFases), não até hoje
  const compFases = composicaoPorFase(fases, composicoes, treino ? treinos : null, fimFases, hoje);
  // Colunas pelo intervalo entre doses (a cada 14 dias: D7–13 entra na tabela)
  const colNausea = colunasNausea(ciclo?.intervalo_dias);
  const sintomas = sintomasPorFase(fases, datasAplic, diario, fimFases, ciclo?.intervalo_dias);
  // Sono por fase ao lado da massa magra e da cintura (associação, não causa)
  const sonoFases = sonoPorFase(fases, diario, fimFases);
  const temSono = sonoFases.some((v) => v !== null);
  const sono7 = mediaSono7(diario, hoje);
  const agua = aguaSemana(diario, hoje, (d) => metaAguaDe(d).meta);
  const temUrina = agua.urina.clara + agua.urina.amarela + agua.urina.escura > 0;
  const temSintomas = sintomas.some((s) => s.vomito !== null || s.diarreia !== null || s.intestino_preso !== null);
  // Fase pós-remédio iniciada: a "fase atual" é ela (o plano e a sobra do frasco já não valem)
  const faseDepois = posRemedio?.bloco_inicio ? fasePos(posRemedio.bloco_inicio, hoje) : null;
  const faseAtual = faseDepois ? `Fase pós-remédio · semana ${(faseDepois.semana ?? 0) + 1}` : descreverFaseAtual(resumo);
  // Decisões do fim de fase e anotações para o médico (vão para o PDF)
  const ESCOLHAS = { subir: 'Subir', repetir: 'Repetir fase', confirmar_fase: 'Confirmou fase', anotacao: 'Anotação', pos_remedio: 'Fase pós-remédio', intervalo: 'Intervalo' } as const;
  const decisoes = [...(ciclo?.decisoes ?? [])].sort((a, b) => a.data.localeCompare(b.data) || a.apos_aplicacao - b.apos_aplicacao);
  const detalheDecisao = (d: (typeof decisoes)[number]) =>
    d.escolha === 'subir'
      ? `${num(d.dose_mg)} -> ${num(d.dose_nova_mg)} mg`
      : d.escolha === 'repetir'
        ? `+${d.semanas} sem. na fase ${(d.fase_indice ?? 0) + 1} (${num(d.dose_mg)} mg)`
        : d.escolha === 'confirmar_fase'
          ? `${num(d.dose_mg)} mg seguindo a fase ${(d.fase_indice ?? 0) + 1}`
          : d.escolha === 'pos_remedio'
            ? `início em ${formatarData(d.bloco_inicio ?? d.data, true)} (última dose, ${num(d.dose_mg)} mg)`
            : d.escolha === 'intervalo'
              ? `${d.intervalo_anterior ?? '?'} -> ${d.intervalo_dias ?? '?'} dias entre doses`
              : (d.texto ?? '');
  // Ritmo pelas medições (em jejum, às segundas) quando houver 3 ou mais; senão, por todas as pesagens
  const serieMedidas = serie.filter((p) => p.origem === 'medida');
  // Pelas medições quando há 3 na janela da tendência (28 dias); senão, por todas as pesagens
  const pelaMedida = serieMedidas.filter((p) => !p.atipica && p.data <= hoje && diferencaDias(p.data, hoje) <= 28).length >= 3;
  const tend = tendenciaPeso(pelaMedida ? serieMedidas : serie, hoje);
  const pesoAtual = geral.peso_atual?.peso_kg ?? null;
  const pesagens = pelaMedida ? 'medições' : 'pesagens';
  const ritmo = tend && pesoAtual ? ritmoPercentual(tend.kg_semana, pesoAtual) : null;
  const ini = geral.medida_inicial;
  const atu = geral.medida_atual;
  const dif = (k: 'cintura_cm' | 'massa_gorda_kg' | 'massa_magra_kg') => (ini && atu && ini[k] !== null && atu[k] !== null ? (atu[k] as number) - (ini[k] as number) : null);

  // Plano alimentar (para o relatório)
  const ultimaComp = ultimaNormal(composicoes);
  // Metas pela média das últimas medições válidas (a mesma da aba Dieta)
  const corpoMetas = corpoParaMetas(composicoes);
  const metasDieta = dieta && corpoMetas ? calcularMetas(dieta.config, corpoMetas, treino ? aderenciaDoTreino(treinos, treino, hoje) : null) : null;
  const baseMetas = corpoMetas ? ` Peso e massa magra ${textoBaseMetas(corpoMetas)}.` : '';
  const refeicoes = dieta && banco ? dieta.refeicoes.filter((r) => r.itens.length).map((r) => ({ r, m: macrosDaRefeicao(r, banco.mapa) })) : [];
  // Plano com refeições, mas a lista de alimentos não carregou: as refeições ficam de fora (com aviso)
  const refeicoesSemBanco = !banco && !!dieta?.refeicoes.some((r) => r.itens.length);
  const avisoSemBanco = 'As refeições do plano ficaram de fora: a lista de alimentos não carregou (sem sinal?). Gere de novo com internet para incluí-las.';
  // "Segui o plano?" na janela da tendência das medidas, com o mesmo conselho da Conferência da Dieta
  const tendMedidas = tendenciaMedidas(composicoes);
  // Só os dias desde o início do ciclo (a medição inicial pode ser anterior à 1ª dose)
  const seguido = tendMedidas ? dietaNaTendencia(diario, tendMedidas, datasAplic[0] ?? ciclo?.data_inicio ?? null) : null;
  // No Resumo, com o remédio concluído, "Dieta seguida" usa a janela do período do remédio
  const tendResumo = remedioConcluido ? tendenciaMedidas(composicoes.filter((c) => c.data <= fimRemedio!)) : tendMedidas;
  const seguidoResumo = tendResumo ? dietaNaTendencia(diario, tendResumo, datasAplic[0] ?? ciclo?.data_inicio ?? null) : null;
  const temPlanoDieta = !!dieta?.refeicoes.some((r) => r.itens.length);
  const kcalPlano = refeicoes.reduce((s, x) => s + x.m.kcal, 0);
  const deficitPlano = metasDieta && dieta && !refeicoesSemBanco ? (kcalPlano > 0 ? metasDieta.gasto_total - kcalPlano : -dieta.config.ajuste_kcal) : null;
  const conselho =
    tendMedidas && seguido && ultimaComp && dieta && (banco || !dieta.refeicoes.some((r) => r.itens.length))
      ? conselhoConferencia(tendMedidas, ultimaComp.peso_kg, seguido, deficitPlano, dieta.config.ajuste_kcal)
      : null;

  // Treino: o resultado do período do remédio e, na fase pós-remédio, o placar da fase nova numa linha à parte
  const blocosTreino = treino
    ? [
        { rotulo: treino.placarPos ? 'Período do remédio' : '', placar: treino.projeto.placar, de: treino.projeto.inicio, ate: treino.projeto.fim },
        ...(treino.placarPos ? [{ rotulo: 'Fase pós-remédio', placar: treino.placar, de: treino.inicio, ate: treino.fim }] : []),
      ]
        .filter((b) => b.placar.iniciado)
        .map((b) => {
          const corridas = treino.corridas.filter((c) => c.data >= b.de && c.data <= b.ate);
          return {
            rotulo: b.rotulo,
            valores: [
              `${b.placar.treino.feito} de ${b.placar.treino.meta} · ${pct(b.placar.treino.aderencia, 0)}`,
              `${b.placar.cardio.feito} de ${b.placar.cardio.meta} · ${pct(b.placar.cardio.aderencia, 0)}`,
              // Só as distâncias anotadas (corrida sem distância não vira km)
              textoCorridasPeriodo(b.placar.corrida),
              corridas.length ? `${formatarTempo(Math.min(...corridas.map((c) => c.pace)))} /km` : '–',
            ],
          };
        })
    : [];
  const doisBlocosTreino = blocosTreino.length > 1;

  function montarModelo(imagens: Map<string, ImagemPdf> | null): ModeloRelatorio {
    const dia = (d: string) => diferencaDias('1970-01-01', d);
    const rotulo = (n: number) => {
      const d = new Date(n * 86400000);
      return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const tabelas: ModeloRelatorio['tabelas'] = [];
    const aplicacoes = resumo!.linhas.map((l) => l.aplicacao);
    const inicioCiclo = datasAplic[0] ?? ciclo?.data_inicio ?? hoje;

    // Cabeçalho de 1 linha: remédio, concentração, idade, altura, peso e % de gordura no início
    const anos = idade(perfil?.data_nascimento, hoje);
    const altura = perfil?.altura_cm ?? [...medidas].sort((a, b) => a.data.localeCompare(b.data))[0]?.altura_cm ?? null;
    const remedio = ciclo ? (ciclo.nome.includes(`${num(ciclo.concentracao_mg_ml, 0)} mg/ml`) ? ciclo.nome : `${ciclo.nome} · ${num(ciclo.concentracao_mg_ml, 0)} mg/ml`) : null;
    const cabecalho = [
      remedio,
      anos !== null ? `${anos} anos` : null,
      altura ? `${num(altura, 0)} cm` : null,
      geral.peso_inicial ? `peso no início ${kg(geral.peso_inicial.peso_kg)}` : null,
      ini?.bf != null ? `${pp(ini.bf)} de gordura no início` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    // Quadro de decisão: fase atual (ou que termina) × anterior, e a próxima dose
    const p = resumo!.proxima;
    const proxima = faseDepois
      ? `Próxima dose prevista: nenhuma (remédio concluído; fase pós-remédio desde ${formatarData(faseDepois.inicio)}).`
      : p
      ? textoProximaDoseRelatorio(resumo!)!
      : 'Próxima dose prevista: nenhuma (plano ou frasco concluído).';
    const colunas = colunasQuadro(fases, compFases, diario, datasAplic, fimFases);
    const quadro = colunas.atual ? montarQuadro({ atual: colunas.atual, anterior: colunas.anterior }, !!treino, proxima, !!fimRemedio) : null;
    const semanal = aplicacoes.length
      ? tabelaSemanal(
          semanasDoCiclo({
            inicio: inicioCiclo,
            hoje,
            aplicacoes,
            serie,
            composicoes,
            diario,
            treinos: treino ? treinos : null,
            // Só os dias do placar: projeto e, se houver, a fase pós-remédio
            periodosTreino: treino ? [treino.projeto, ...(treino.placarPos ? [{ inicio: treino.inicio, fim: treino.fim }] : [])] : undefined,
          }),
          !!treino,
        )
      : null;

    if (ini) {
      const v = (c: Composicao | null, k: keyof Composicao) => (c ? (c[k] as number | null) : null);
      const linha = (r: string, k: keyof Composicao, fmt: (n: number | null) => string, suf: string) => {
        const a = v(ini, k);
        const b = v(atu, k);
        return [r, fmt(a), fmt(b), a !== null && b !== null ? sinal(b - a, 1, suf) : '–'];
      };
      tabelas.push({
        titulo: 'Medidas: início x agora',
        cabecalho: ['', formatarData(ini.data, true), atu ? formatarData(atu.data, true) : 'Atual', 'Variação'],
        linhas: [
          linha('Cintura', 'cintura_cm', cm, ' cm'),
          linha('% de gordura', 'bf', pp, ' p.p.'),
          linha('Massa gorda', 'massa_gorda_kg', kg, ' kg'),
          linha('Massa magra', 'massa_magra_kg', kg, ' kg'),
          linha('Peso', 'peso_kg', kg, ' kg'),
          linha('Pescoço', 'pescoco_cm', cm, ' cm'),
          // Na fórmula feminina, o quadril entra no % de gordura
          ...(ini.quadril_cm !== null ? [linha('Quadril', 'quadril_cm', cm, ' cm')] : []),
        ],
        nota: 'Método da Marinha dos EUA (fita métrica), medido em jejum às segundas.',
      });
    }
    tabelas.push(tabelaTendencias(composicoes));
    tabelas.push({
      titulo: 'Composição por fase',
      cabecalho: ['Fase', 'Cintura', 'Massa gorda', 'Massa magra', 'Gordura/sem.', ...(treino ? ['Treino', 'Cardio'] : [])],
      linhas: fases.map((f, i) => {
        const c = compFases[i];
        return [
          rotuloBloco(f),
          sinal(c.cintura, 1, ' cm'),
          sinal(c.gorda, 1, ' kg'),
          sinal(c.magra, 1, ' kg'),
          sinal(c.gorda_semana, 2),
          ...(treino ? [c.treino === null ? '–' : pct(c.treino, 0), c.cardio === null ? '–' : pct(c.cardio, 0)] : []),
        ];
      }),
      nota: fases.length
        ? 'Cada linha é um bloco de doses seguidas iguais (dose realmente aplicada). Última medição até o início do bloco x última antes do seguinte.'
        : undefined,
    });
    tabelas.push({
      titulo: 'Peso e náusea por fase',
      cabecalho: ['Fase', 'Doses', 'Período', 'Peso início -> fim', 'kg/sem. (faixa 95%)', 'Náusea méd./máx.'],
      linhas: fases.map((f, i) => [
        `${rotuloBloco(f)}${f.em_andamento ? ' (atual)' : ''}`,
        `${f.doses} x ${num(f.dose_mg)} mg`,
        // Bloco que não é o último termina na véspera do seguinte (o dia da troca fica com o novo)
        `${formatarData(f.inicio, true)} – ${formatarData(i === fases.length - 1 ? f.fim : somarDias(f.fim, -1), true)}`,
        `${num(f.peso_inicio, 1)} -> ${num(f.peso_fim, 1)}`,
        ritmoDoBloco(serie, f, i === fases.length - 1),
        `${num(f.nausea_media, 1)} / ${f.nausea_max ?? '–'}`,
      ]),
      nota: !fases.length ? undefined : 'kg/sem. pela regressão das pesagens do bloco (dose realmente aplicada), com a faixa provável de 95%. Blocos seguidos também mudam tempo de uso, dieta e treino: a diferença entre eles não se atribui só à dose.',
    });
    if (!sintomas.every((x) => x.nausea_por_dia.every((n) => n === null)) || temSintomas) {
      tabelas.push({
        titulo: 'Náusea por dia depois da dose',
        cabecalho: ['Fase', ...colNausea.map((c) => c.rotulo), ...(temSintomas ? ['Vômito', 'Diarreia', 'Intest. preso'] : [])],
        linhas: sintomas.map((x, i) => [
          rotuloBloco(fases[i]),
          ...x.nausea_por_dia.map((n) => (n === null ? '–' : num(n, 1))),
          ...(temSintomas
            ? [x.vomito, x.diarreia, x.intestino_preso].map((t) => (t === null ? '–' : pct(t, 0)))
            : []),
        ]),
        nota: `D0 = dia da dose.${colNausea.length < 7 ? ` Doses a cada ${ciclo?.intervalo_dias} dias: as faixas mostram a média dos dias.` : ''} Náusea média (0 a 3). Sintomas: % dos dias registrados no Diário na fase.`,
      });
    }
    const listaOcorrencias = ocorrencias(diario, aplicacoes, remedioConcluido ? fimRemedio : null);
    if (listaOcorrencias.length) tabelas.push(tabelaOcorrencias(listaOcorrencias));
    tabelas.push({
      titulo: 'Aplicações',
      cabecalho: ['Nº', 'Data', 'Dose', 'Fase', 'Atraso', 'Náusea máx. · sintomas'],
      linhas: resumo!.linhas.map((l, i) => [
        String(l.numero),
        formatarData(l.aplicacao.data, true),
        mg(l.aplicacao.dose_mg),
        l.fase ? String(l.fase.indice + 1) : 'fora',
        l.atraso_dias === 0 ? '–' : `${l.atraso_dias > 0 ? '+' : ''}${l.atraso_dias} d`,
        textoTolerancia(toleranciaIntervalo(diario, l.aplicacao.data, resumo!.linhas[i + 1]?.aplicacao.data ?? null, fimFases)),
      ]),
      nota: resumo!.linhas.length ? 'Náusea máxima (0 a 3) e dias com sintoma no Diário entre esta dose e a seguinte.' : undefined,
    });
    // Eventos: alertas de segurança que dispararam no período e as anotações para o médico
    const alertas = aplicacoes.length ? historicoAlertas({ diario, composicoes, aplicacoes }, inicioCiclo, hoje) : [];
    const anotacoes = decisoes.filter((d) => d.escolha === 'anotacao');
    if (alertas.length || anotacoes.length) tabelas.push(tabelaEventos(alertas, anotacoes));
    if (registroDecisoes.length) tabelas.push(tabelaDecisoes(registroDecisoes));
    const deFase = decisoes.filter((d) => d.escolha !== 'anotacao');
    if (deFase.length) {
      tabelas.push({
        titulo: 'Fim de fase: decisões',
        cabecalho: ['Data', 'Após a dose', 'Escolha', 'Detalhe'],
        linhas: deFase.map((d) => [formatarData(d.data, true), `${d.apos_aplicacao}ª`, ESCOLHAS[d.escolha], detalheDecisao(d)]),
        nota: 'Registradas pelo paciente no app. A dose só sobe quando ele escolhe Subir.',
      });
    }
    if (metasDieta && dieta) {
      tabelas.push({
        titulo: 'Plano alimentar',
        cabecalho: ['Refeição', 'kcal', 'Ptn animal', 'Carb', 'Gord'],
        linhas: refeicoes.map(({ r, m }) => [
          `${r.nome}${r.horario ? ` · ${r.horario}` : ''}`,
          num(m.kcal, 0),
          `${num(m.ptn_animal, 0)} g`,
          `${num(m.carb, 0)} g`,
          `${num(m.gord, 0)} g`,
        ]),
        nota: `Meta ${num(metasDieta.meta_kcal, 0)} kcal/dia (gasto estimado ${num(metasDieta.gasto_total, 0)} kcal; basal Katch-McArdle ${num(
          metasDieta.tmb,
          0,
        )} kcal) · proteína animal ${curto(dieta.config.ptn_gkg)} g/kg de massa magra (${num(metasDieta.ptn_animal_g, 0)} g) · gordura ${curto(dieta.config.gord_gkg)} g/kg (${num(metasDieta.gord_g, 0)} g) · carboidrato fecha a conta.${baseMetas}${
          refeicoesSemBanco ? ` ${avisoSemBanco}` : ''
        }`,
      });
    }
    if (blocosTreino.length) {
      tabelas.push({
        titulo: 'Treino',
        cabecalho: [...(doisBlocosTreino ? ['Período'] : []), 'Treinos', 'Cardios', 'Corridas', 'Melhor pace'],
        linhas: blocosTreino.map((b) => [...(doisBlocosTreino ? [b.rotulo] : []), ...b.valores]),
      });
    }
    return {
      titulo: `Relatório do ciclo · ${perfil?.nome ?? ''}`,
      subtitulo: `Gerado em ${dataPorExtenso(hoje)}. Dados registrados pelo próprio paciente no app Ciclo.`,
      cabecalho,
      quadro,
      semanal,
      resumo: [
        ['Início', formatarData(geral.inicio_ciclo)],
        ['Tempo de ciclo', `${num(geral.semanas_ciclo, 1)} semanas`],
        ['Aplicações', `${resumo!.aplicacoes_realizadas} · ${pct(resumo!.percentual_usado, 0)} do frasco`],
        ['Fase atual', faseAtual],
        ['Cintura', dif('cintura_cm') === null ? cm(ini?.cintura_cm) : sinal(dif('cintura_cm'), 1, ' cm')],
        ['Massa gorda', dif('massa_gorda_kg') === null ? kg(ini?.massa_gorda_kg) : sinal(dif('massa_gorda_kg'), 1, ' kg')],
        ['Massa magra', dif('massa_magra_kg') === null ? kg(ini?.massa_magra_kg) : sinal(dif('massa_magra_kg'), 1, ' kg')],
        ['Peso', `${sinal(geral.variacao_kg, 1, ' kg')}${geral.variacao_percentual !== null ? ` (${sinal(geral.variacao_percentual * 100, 1, '%')})` : ''}`],
        ...(qualidade ? [['Qualidade da perda', `${textoQualidade(qualidade)} (últimas ${qualidade.medicoes} medições)`] as [string, string]] : []),
        ...(seguidoResumo && seguidoResumo.respondidos
          ? [['Dieta seguida', `${textoPlanoSeguido(seguidoResumo).replace('Plano seguido: ', '')} · ${textoDietaSemana(seguidoResumo)}`] as [string, string]]
          : []),
      ],
      ritmo: ritmo
        ? `Ritmo atual: ${ritmo.faixa === 'ganho' ? 'peso subindo' : `${num(ritmo.pct, 2)}% do peso por semana`} (${sinal(tend!.kg_semana, 2, ' kg')}/sem, tendência de ${tend!.pontos} ${pesagens} nas últimas 4 semanas). Para quem treina, 0,5 a 1% por semana preserva melhor a massa magra.`
        : 'Ritmo de perda: aparece com 3 pesagens em 2 semanas.',
      grafico: {
        pesos: serie.map((p) => ({ dia: dia(p.data), kg: p.peso_kg, ...(p.atipica ? { atipica: true } : {}) })),
        doses: resumo!.linhas.map((l) => ({ dia: dia(l.aplicacao.data), mg: l.aplicacao.dose_mg })),
        diaFinal: dia(hoje),
        // Remédio concluído: o degrau da última dose termina no fim do período do remédio
        ...(fimRemedio && fimRemedio < hoje ? { fimDoses: dia(fimRemedio) } : {}),
        rotulo,
        marcos: decisoesPorDia(registroDecisoes).map((d) => dia(d.data)),
      },
      tabelas,
      fotos: imagens
        ? {
            ...montarFotosPdf(fotos, composicoes, perfil?.sexo === 'Feminino'),
            imagens,
            nota: `Pares por pose: a primeira foto do Antes e a mais recente do Depois. Números da medição mais próxima da data de cada foto (até 7 dias). Variação: Depois menos Antes. Fotos registradas pelo próprio paciente.`,
          }
        : null,
      rodape: 'Este relatório registra e calcula; as decisões de dose são tomadas com acompanhamento médico.',
    };
  }

  async function compartilhar(arquivo: File) {
    if (navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: 'Relatório do ciclo' });
        setMsgPdf({ tipo: 'info', texto: 'PDF pronto. Use “Compartilhar PDF” para enviar de novo.' });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        // O iPhone pede um toque novo: o botão "Compartilhar PDF" fica disponível
        setMsgPdf({ tipo: 'info', texto: 'PDF pronto. Toque em “Compartilhar PDF” para salvar, imprimir ou enviar.' });
        return;
      }
    }
    // Sem o menu Compartilhar (computador): baixa o arquivo
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = arquivo.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setMsgPdf({ tipo: 'info', texto: 'PDF baixado.' });
  }

  async function gerarPdf() {
    setMsgPdf(null);
    setGerando(true);
    try {
      gerador.current ??= import('../lib/relatorioPdf');
      const mod = await gerador.current;
      const imagens = incluirFotos && !semFotos ? await (fotosPdf.current ??= prepararFotosPdf(fotos)) : null;
      const blob = mod.gerarRelatorioPdf(montarModelo(imagens));
      const arquivo = new File([blob], `relatorio-ciclo-${hoje}.pdf`, { type: 'application/pdf' });
      setPdf(arquivo);
      await compartilhar(arquivo);
    } catch (e) {
      gerador.current = null;
      fotosPdf.current = null;
      setMsgPdf({ tipo: 'erro', texto: `Não deu para gerar o PDF: ${(e as Error).message}` });
    } finally {
      setGerando(false);
    }
  }

  // ---------- Painel (abas) ----------
  const periodoCiclo = proj?.periodo ?? null;
  const totalDias = periodoCiclo ? diferencaDias(periodoCiclo.inicio, periodoCiclo.fim) + 1 : null;
  const diaCiclo = periodoCiclo && totalDias ? Math.min(Math.max(diferencaDias(periodoCiclo.inicio, hoje) + 1, 0), totalDias) : null;
  const semanasTotal = totalDias ? Math.ceil(totalDias / 7) : null;
  const semanaCiclo = diaCiclo ? Math.min(Math.ceil(diaCiclo / 7), semanasTotal ?? Infinity) : null;
  const p0 = resumo.proxima;

  // Filtro de período (o PDF não é filtrado): no "Ciclo", as mesmas contas de sempre
  const ontem = somarDias(hoje, -1);
  const primeiraDose = datasAplic[0] ?? null;
  const opcoesPer = opcoesPeriodo({ hoje, inicio: primeiraDose ?? ciclo?.data_inicio ?? hoje, fases });
  const per = lerPeriodo(params.get('periodo'), opcoesPer);
  const emCiclo = per.chave === 'ciclo';
  const janela = emCiclo ? null : { de: per.de, ate: per.ate };
  const setPeriodo = (chave: string) => mudarParams(aba, chave);
  const rp = emCiclo ? null : resumoPeriodo({ serie, composicoes, de: per.de, ate: per.ate });
  /** Medição de referência e a do fim do período (no ciclo: início e agora) */
  const iniP: Composicao | null = emCiclo ? ini : rp!.comp.ini;
  const atuP: Composicao | null = emCiclo ? atu : rp!.comp.comVariacao ? rp!.comp.fim : null;
  const agoraP: Composicao | null = emCiclo ? (atu ?? ini) : (rp!.comp.fim ?? rp!.comp.ini);
  const difP = (k: 'cintura_cm' | 'massa_gorda_kg' | 'massa_magra_kg' | 'bf') =>
    iniP && atuP && iniP[k] !== null && atuP[k] !== null ? (atuP[k] as number) - (iniP[k] as number) : null;
  const pesoAgoraP = emCiclo ? (geral.peso_atual?.peso_kg ?? null) : (rp!.peso.fim?.peso_kg ?? null);
  const varPesoP = emCiclo ? geral.variacao_kg : rp!.variacao_kg;
  const varPesoPctP = emCiclo ? geral.variacao_percentual : rp!.variacao_percentual;
  const tendP = emCiclo ? tend : rp!.tendencia;
  const ritmoP = emCiclo ? ritmo : tendP && pesoAgoraP ? ritmoPercentual(tendP.kg_semana, pesoAgoraP) : null;
  const pesagensP = emCiclo ? pesagens : rp!.fonte;
  const qualidadeP = emCiclo ? qualidade : qualidadePerda(noPeriodo(composicoes, per.de, per.ate, true), 99);
  const fasesP = emCiclo ? fases.map((_, i) => i) : fasesNoPeriodo(fases, per.de, per.ate);
  const diarioP = emCiclo ? diario : diario.filter((r) => r.data >= per.de && r.data <= per.ate);
  const sintomasP = emCiclo ? sintomas : sintomasPorFase(fases, datasAplic, diarioP, fimFases, ciclo?.intervalo_dias);
  const destaqueP = destaque ? { de: destaque.de, ate: destaque.ate } : null;

  // Indicadores: valor no fim do período, variação no período e a linha das medições
  const difBf = difP('bf');
  const ultimosValores = (k: ChavePainel) => (emCiclo ? serieMetrica(composicoes, k).slice(-10) : noPeriodo(serieMetrica(composicoes, k), per.de, per.ate, true)).map((x) => x.valor);
  const pesosNormais = serie.filter((x) => !x.atipica);
  const valoresPeso = (emCiclo ? pesosNormais.slice(-14) : noPeriodo(pesosNormais, per.de, per.ate, true)).map((x) => x.peso_kg);
  const FAIXA_RITMO = { ideal: 'na faixa de 0,5 a 1%/sem', rapido: 'acima de 1%/sem', lento: 'abaixo de 0,5%/sem', ganho: 'peso subindo' } as const;

  // Metas do projeto (definidas na aba Treino): do início do projeto até o fim do período
  const metas = perfil?.metas_projeto ?? null;
  const metaGorda = metas?.peso_kg && metas?.bf ? (metas.peso_kg * metas.bf) / 100 : null;
  const metaMagra = metas?.peso_kg && metas?.bf ? metas.peso_kg * (1 - metas.bf / 100) : null;
  const pesoInicio = geral.peso_inicial?.peso_kg ?? ini?.peso_kg ?? null;
  const progressos = [
    { nome: 'Peso', p: progressoMeta(pesoInicio, pesoAgoraP, metas?.peso_kg), fmt: (n: number) => kg(n) },
    { nome: 'Cintura', p: progressoMeta(ini?.cintura_cm, agoraP?.cintura_cm, metas?.cintura_cm), fmt: (n: number) => cm(n) },
    { nome: '% de gordura', p: progressoMeta(ini?.bf, agoraP?.bf, metas?.bf), fmt: (n: number) => pp(n) },
    { nome: 'Massa gorda', p: progressoMeta(ini?.massa_gorda_kg, agoraP?.massa_gorda_kg, metaGorda), fmt: (n: number) => kg(n) },
    ...(perfil?.sexo === 'Feminino' ? [{ nome: 'Quadril', p: progressoMeta(ini?.quadril_cm, agoraP?.quadril_cm, metas?.quadril_cm), fmt: (n: number) => cm(n) }] : []),
  ].filter((x): x is { nome: string; p: ProgressoMeta; fmt: (n: number) => string } => x.p !== null);
  const maisAdiantada = [...progressos].sort((a, b) => b.p.fracao - a.p.fracao)[0];

  // Previsão até a meta (peso e cintura): a tendência de hoje, sem filtro; some com o projeto encerrado
  const fimProjeto = periodoCiclo && periodoCiclo.fim >= hoje ? periodoCiclo.fim : null;
  const pontosPesoKpi = composicoes.filter((c) => !c.atipica).length >= 2 ? composicoes.map((c) => ({ data: c.data, valor: c.peso_kg, atipico: !!c.atipica })) : serie.map((p) => ({ data: p.data, valor: p.peso_kg, atipico: !!p.atipica }));
  const normaisDe = (l: { data: string; valor: number | null; atipico?: boolean }[]) => l.filter((p) => !p.atipico && p.valor !== null).map((p) => ({ data: p.data, valor: p.valor as number }));
  const pontosCintura = composicoes.map((c) => ({ data: c.data, valor: c.cintura_cm, atipico: !!c.atipica }));
  const prevPeso = fimProjeto && metas?.peso_kg ? preverMeta(normaisDe(pontosPesoKpi), { meta: metas.peso_kg, hoje, fim: fimProjeto, piso: 0.5 }) : null;
  const prevCintura = fimProjeto && metas?.cintura_cm ? preverMeta(normaisDe(pontosCintura), { meta: metas.cintura_cm, hoje, fim: fimProjeto, piso: 0.5 }) : null;
  const previsoes = [
    ...(prevCintura && !prevCintura.alcancada ? [{ chave: 'cintura' as const, rotulo: 'Cintura', p: prevCintura, pontos: pontosCintura, unidade: 'cm' }] : []),
    ...(prevPeso && !prevPeso.alcancada ? [{ chave: 'peso' as const, rotulo: 'Peso', p: prevPeso, pontos: pontosPesoKpi, unidade: 'kg' }] : []),
  ];
  const previsaoSel = previsoes.find((x) => x.chave === metaPrev) ?? previsoes[0] ?? null;

  // Adesão aos hábitos: até ontem (hoje ainda está em aberto), a partir da 1ª dose
  const adesao = (dias: number | null) => {
    if (!primeiraDose) return null;
    const de0 = dias === null ? primeiraDose : somarDias(hoje, -dias);
    return adesaoPeriodo({ diario, treinos: treino ? treinos : null, de: de0 < primeiraDose ? primeiraDose : de0, ate: ontem, metaAgua: (d) => metaAguaDe(d).meta });
  };
  const curtoCiclo = !!primeiraDose && diferencaDias(primeiraDose, hoje) <= 28;
  const adesao28 = adesao(28);
  // Adesão no período do filtro (o ciclo: desde a 1ª dose)
  const adesaoP = (() => {
    if (!primeiraDose) return null;
    if (emCiclo) return adesao(null);
    const de0 = per.de < primeiraDose ? primeiraDose : per.de;
    const ate0 = per.ate < ontem ? per.ate : ontem;
    return adesaoPeriodo({ diario, treinos: treino ? treinos : null, de: de0, ate: ate0, metaAgua: (d) => metaAguaDe(d).meta });
  })();
  // Hábitos › Treino: no ciclo, o placar do projeto; noutro período, os números do período do filtro
  const blocosTreinoTela =
    emCiclo || !treino || !adesaoP?.treino
      ? blocosTreino
      : (() => {
          const de0 = per.de;
          const ate0 = per.ate;
          const corridasP = treino.corridas.filter((c) => c.data >= de0 && c.data <= ate0);
          const comKm = treinos.filter((t) => t.data >= de0 && t.data <= ate0 && t.cardio && (t.corrida_km ?? 0) > 0);
          const km = comKm.reduce((x, t) => x + (t.corrida_km ?? 0), 0);
          const t = adesaoP.treino!;
          const c = adesaoP.cardio!;
          return [
            {
              rotulo: '',
              valores: [
                `${t.feito} de ${t.total} · ${pct(t.fracao, 0)}`,
                `${c.feito} de ${c.total} · ${pct(c.fracao, 0)}`,
                comKm.length ? `${comKm.length} · ${num(km, 1)} km` : '–',
                corridasP.length ? `${formatarTempo(Math.min(...corridasP.map((x) => x.pace)))} /km` : '–',
              ],
            },
          ];
        })();
  const listaDestaques = destaques({
    cintura: difP('cintura_cm'),
    gorda: difP('massa_gorda_kg'),
    magra: difP('massa_magra_kg'),
    peso: varPesoP,
    pesoPct: varPesoPctP,
    ritmo: ritmoP,
    gorduraDaPerda: qualidadeP && !qualidadeP.sem_perda ? qualidadeP.gordura : null,
    nausea: picoNausea(sintomasP, colNausea),
    // No ciclo, os hábitos das últimas 4 semanas (como sempre); com filtro, os do período
    adesao: emCiclo ? adesao28 : adesaoP,
    periodoAdesao: emCiclo ? (curtoCiclo ? 'desde o início' : 'nas últimas 4 semanas') : per.quando,
    meta: maisAdiantada ? { nome: maisAdiantada.nome.toLowerCase(), fracao: maisAdiantada.p.fracao, alcancada: maisAdiantada.p.alcancada } : null,
    ...(emCiclo ? {} : { desde: per.quando, periodoRitmo: 'do período' }),
  });

  // Semana a semana (as mesmas linhas do PDF)
  const linhasSemana = datasAplic.length
    ? semanasDoCiclo({
        inicio: primeiraDose ?? ciclo?.data_inicio ?? hoje,
        hoje,
        aplicacoes: resumo.linhas.map((l) => l.aplicacao),
        serie,
        composicoes,
        diario,
        treinos: treino ? treinos : null,
        periodosTreino: treino ? [treino.projeto, ...(treino.placarPos ? [{ inicio: treino.inicio, fim: treino.fim }] : [])] : undefined,
      })
    : [];
  const rotuloSemana = (s: string) => formatarData(s, true).slice(0, 5);
  // Semanas que tocam o período do filtro
  const naJanela = (segunda: string) => emCiclo || (segunda <= per.ate && somarDias(segunda, 6) >= per.de);
  const treinoSemanas = linhasSemana.filter((l) => l.treino !== null && l.dias > 0 && naJanela(l.segunda));
  const habitos = habitosPorSemana(
    diario,
    linhasSemana.map((l) => l.segunda),
    hoje,
    (d) => metaAguaDe(d).meta,
  ).filter((h) => naJanela(h.segunda));
  const temBemEstar = habitos.some((h) => h.agua_l !== null || h.sono_h !== null);
  const temSonoSemana = habitos.some((h) => h.sono_h !== null);
  const temAguaSemana = habitos.some((h) => h.agua_l !== null);
  const destacarSemana = (segunda: string | null) =>
    setDestaque(segunda ? { chave: segunda, rotulo: `semana de ${rotuloSemana(segunda)}`, de: segunda, ate: somarDias(segunda, 6) } : null);
  const semanaSel = destaque && linhasSemana.some((l) => l.segunda === destaque.chave) ? destaque.chave : null;

  // Blocos de dose: rótulo curto, período e destaque ao tocar
  const faseInfo = fases.map((f, i) => ({ chave: `f${i + 1}`, rotulo: rotuloFaseCurto(fases, i), de: f.inicio, ate: fimDoBloco(fases, i), doses: f.doses }));
  const destacarFase = (chave: string | null) => {
    const f = faseInfo.find((x) => x.chave === chave);
    setDestaque(f ? { chave: f.chave, rotulo: `fase ${f.rotulo}`, de: f.de, ate: f.ate } : null);
  };
  const faseSel = destaque && faseInfo.some((f) => f.chave === destaque.chave) ? destaque.chave : null;
  // Linha de tabela de fase tocável (o botão do rótulo dá o acesso pelo teclado)
  const linhaFase = (i: number) => ({
    className: `linha-tocavel${faseSel === faseInfo[i].chave ? ' selecionada' : ''}`,
    onClick: () => destacarFase(faseSel === faseInfo[i].chave ? null : faseInfo[i].chave),
  });
  const botaoFase = (i: number, rotulo: ReactNode) => (
    <button type="button" className="linha-fase-botao" aria-pressed={faseSel === faseInfo[i].chave} aria-label={`Destacar a fase ${faseInfo[i].rotulo} nos gráficos`}>
      {rotulo}
    </button>
  );

  // Séries dos gráficos de tempo e os marcos (doses, decisões, anotações, medições)
  const marcos: Marco[] = marcosAnalise({
    doses: resumo.linhas.map((l) => ({ data: l.aplicacao.data, dose_mg: l.aplicacao.dose_mg })),
    decisoes: ciclo?.decisoes ?? undefined,
    registros: registroDecisoes,
    medicoes: composicoes,
  });
  const pontosPeso: PontoSerie[] = serie.map((p) => ({ data: p.data, valor: p.peso_kg, ...(p.atipica ? { atipico: true } : {}) }));
  const pontosDose: PontoSerie[] = resumo.linhas.length
    ? [
        ...resumo.linhas.map((l) => ({ data: l.aplicacao.data, valor: l.aplicacao.dose_mg })),
        // O degrau vai até hoje (ou até o fim do período do remédio)
        { data: fimRemedio && fimRemedio < hoje ? fimRemedio : hoje, valor: resumo.linhas[resumo.linhas.length - 1].aplicacao.dose_mg },
      ]
    : [];
  const seriesPesoDose: Serie[] = [
    { id: 'peso', nome: 'Peso', tipo: 'area', pontos: pontosPeso, cor: 'texto', unidade: 'kg', casas: 1 },
    ...(pontosDose.length ? [{ id: 'dose', nome: 'Dose', tipo: 'degrau' as const, pontos: pontosDose, cor: 'aviso' as const, eixo: 'dir' as const, unidade: 'mg', casas: 2 }] : []),
  ];
  const diasDiario = [...diario].filter((r) => r.data <= hoje).sort((a, b) => a.data.localeCompare(b.data));
  const pontosNausea: PontoSerie[] = diasDiario.filter((r) => r.nausea !== null).map((r) => ({ data: r.data, valor: r.nausea }));
  const pontosSono: PontoSerie[] = diasDiario.filter((r) => typeof r.sono_h === 'number').map((r) => ({ data: r.data, valor: r.sono_h as number }));

  // Correlações (Padrões, em Hábitos) no período do filtro
  const dadosPadroes = (() => {
    if (!primeiraDose) return null;
    const d = dadosCorrelacao({
      inicio: primeiraDose,
      hoje,
      aplicacoes: resumo.linhas.map((l) => l.aplicacao),
      serie,
      composicoes,
      diario,
      treinos: treino ? treinos : null,
      periodosTreino: treino ? [treino.projeto, ...(treino.placarPos ? [{ inicio: treino.inicio, fim: treino.fim }] : [])] : undefined,
      metaAgua: (dd) => metaAguaDe(dd).meta,
    });
    return emCiclo ? d : filtrarPeriodo(d, per.de, per.ate);
  })();

  // Gráfico de uma medida (aba Corpo)
  const OPCOES_METRICA: [ChavePainel, string][] = [
    ['cintura_cm', 'Cintura'],
    ['peso_kg', 'Peso'],
    ['bf', '% gordura'],
    ['massa_gorda_kg', 'Gorda'],
    ['massa_magra_kg', 'Magra'],
  ];
  const INFO_METRICA: Record<ChavePainel, { nome: string; unidade: string; meta: number | null | undefined; inicio: number | null | undefined; mdc: number; menorMelhor: boolean }> = {
    cintura_cm: { nome: 'Cintura', unidade: 'cm', meta: metas?.cintura_cm, inicio: ini?.cintura_cm, mdc: MDC.cintura_cm, menorMelhor: true },
    peso_kg: { nome: 'Peso', unidade: 'kg', meta: metas?.peso_kg, inicio: pesoInicio, mdc: MDC.peso_kg, menorMelhor: true },
    bf: { nome: '% de gordura', unidade: '%', meta: metas?.bf, inicio: ini?.bf, mdc: MDC.bf, menorMelhor: true },
    massa_gorda_kg: { nome: 'Massa gorda', unidade: 'kg', meta: metaGorda, inicio: ini?.massa_gorda_kg, mdc: MDC.massa_gorda_kg, menorMelhor: true },
    massa_magra_kg: { nome: 'Massa magra', unidade: 'kg', meta: metaMagra, inicio: ini?.massa_magra_kg, mdc: MDC.massa_magra_kg, menorMelhor: false },
  };
  /** Histórico de uma medida (atípicas como círculo vazado) */
  const pontosDe = (k: ChavePainel): PontoSerie[] =>
    k === 'peso_kg' ? pontosPesoKpi : composicoes.filter((c) => c[k] !== null).map((c) => ({ data: c.data, valor: c[k] as number, ...(c.atipica ? { atipico: true } : {}) }));
  const pontosMetrica = metrica === 'peso_kg' ? pontosPeso : pontosDe(metrica);
  const comMassas = composicoes.filter((c) => !c.atipica && c.massa_magra_kg !== null && c.massa_gorda_kg !== null).length >= 2;
  const seriesMassas: Serie[] = [
    { id: 'peso', nome: 'Peso', tipo: 'area', pontos: composicoes.filter((c) => !c.atipica && c.massa_magra_kg !== null).map((c) => ({ data: c.data, valor: c.peso_kg })), cor: 'texto', unidade: 'kg', casas: 1 },
    { id: 'magra', nome: 'Massa magra', tipo: 'area', pontos: composicoes.filter((c) => !c.atipica && c.massa_magra_kg !== null).map((c) => ({ data: c.data, valor: c.massa_magra_kg })), cor: 'bom', unidade: 'kg', casas: 1 },
    { id: 'gorda', nome: 'Massa gorda (eixo dir.)', tipo: 'linha', tracejado: true, pontos: composicoes.filter((c) => !c.atipica && c.massa_gorda_kg !== null).map((c) => ({ data: c.data, valor: c.massa_gorda_kg })), cor: 'aviso', eixo: 'dir', unidade: 'kg', casas: 1 },
  ];

  const variacoes = iniP
    ? [
        { nome: 'Cintura', delta: difP('cintura_cm'), texto: sinal(difP('cintura_cm'), 1, ' cm'), classe: corVariacao(difP('cintura_cm'), true, MDC.cintura_cm), escala: 4 * MDC.cintura_cm },
        { nome: '% gordura', delta: difBf, texto: sinal(difBf, 1, ' p.p.'), classe: corVariacao(difBf, true, MDC.bf), escala: 4 * MDC.bf },
        { nome: 'Massa gorda', delta: difP('massa_gorda_kg'), texto: sinal(difP('massa_gorda_kg'), 1, ' kg'), classe: corVariacao(difP('massa_gorda_kg'), true, MDC.massa_gorda_kg), escala: 4 * MDC.massa_gorda_kg },
        { nome: 'Massa magra', delta: difP('massa_magra_kg'), texto: sinal(difP('massa_magra_kg'), 1, ' kg'), classe: corVariacao(difP('massa_magra_kg'), false, MDC.massa_magra_kg), escala: 4 * MDC.massa_magra_kg },
        { nome: 'Peso', delta: varPesoP, texto: sinal(varPesoP, 1, ' kg'), classe: corVariacao(varPesoP, true, MDC.peso_kg), escala: 4 * MDC.peso_kg },
      ]
    : [];

  const nauseaVazia = sintomasP.every((s) => s.nausea_por_dia.every((n) => n === null)) && !temSintomas;
  const rotuloFaseCurto2 = (i: number) => `${num(fases[i].dose_mg, 2)} mg${fases[i].fase_indice !== null ? ` · F${fases[i].fase_indice! + 1}` : ''}`;

  // Detalhe do KPI tocado
  const fasesDetalhe = faseInfo.map((f) => ({ rotulo: f.rotulo, de: f.de, ate: f.ate }));
  const detalhe: DetalheMetrica | null = (() => {
    if (!folha) return null;
    const comoLerPeso = 'Com 2 medições ou mais, o peso vem das medições (em jejum, às segundas), como no resumo; senão, das pesagens do Diário.';
    if (folha === 'ritmo' || folha === 'peso_kg') {
      return {
        titulo: folha === 'ritmo' ? 'Ritmo do peso' : 'Peso',
        nome: 'peso',
        pontos: pontosPesoKpi,
        unidade: 'kg',
        casas: 1,
        menorMelhor: true,
        mdc: MDC.peso_kg,
        inicio: pesoInicio,
        meta: metas?.peso_kg,
        previsao: prevPeso,
        comoLer:
          folha === 'ritmo'
            ? `Ritmo: tendência (regressão) das ${pesagensP} ${emCiclo ? 'das últimas 4 semanas' : 'do período'}, em % do peso por semana; 0,5 a 1% preserva melhor a massa magra. ${comoLerPeso}`
            : comoLerPeso,
        extra: folha === 'ritmo' ? <BarrasRitmo pontos={normaisDe(pontosPesoKpi)} /> : undefined,
      };
    }
    const info = INFO_METRICA[folha];
    return {
      titulo: info.nome,
      nome: info.nome.toLowerCase(),
      pontos: pontosDe(folha),
      unidade: info.unidade,
      casas: 1,
      menorMelhor: info.menorMelhor,
      mdc: info.mdc,
      inicio: info.inicio,
      meta: info.meta,
      previsao: folha === 'cintura_cm' ? prevCintura : null,
      comoLer: `Medições com fita, em jejum, às segundas (método da Marinha dos EUA para % de gordura e massas).`,
    };
  })();
  const anelDe = (rotulo: string, t: Taxa | null, unidade: string) =>
    t ? <Anel key={rotulo} rotulo={rotulo} fracao={t.fracao} tom={tomAdesao(t.fracao)} detalhe={t.total ? `${num(t.feito, t.feito % 1 ? 1 : 0)} de ${t.total} ${unidade}` : 'sem registro'} /> : null;
  const aneis = (a: AdesaoPeriodo | null) =>
    a ? (
      <div className="aneis">
        {anelDe('Treino', a.treino, 'dias')}
        {anelDe('Cardio', a.cardio, 'dias')}
        {(temPlanoDieta || a.dieta.total > 0) && anelDe('Dieta', a.dieta, 'dias')}
        {anelDe('Água', a.agua, 'dias')}
        {anelDe('Sono 7 h+', a.sono, 'noites')}
        {anelDe('Diário', a.registro, 'dias')}
      </div>
    ) : (
      <EstadoVazio icone="calendario" cor="rosa" titulo="Ainda sem aplicação" compacto>
        A adesão aparece depois da primeira aplicação.
      </EstadoVazio>
    );

  const cartaoPdf = (
    <section className="cartao nao-imprimir">
      <div className="linha entre">
        <span className="texto-2 cresce">Relatório em PDF para levar ao médico ou nutricionista.</span>
        <button className="botao pequeno primario" disabled={gerando} onClick={() => void gerarPdf()}>
          {gerando ? 'Gerando…' : 'Gerar PDF'}
        </button>
      </div>
      <label className={`marcar ${semFotos ? 'desligado' : ''}`} style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={incluirFotos && !semFotos}
          disabled={semFotos}
          onChange={(e) => {
            setIncluirFotos(e.target.checked);
            // O PDF já gerado era da outra escolha: gera de novo
            setPdf(null);
            setMsgPdf(null);
          }}
        />
        <span>
          Incluir fotos de antes e depois
          <small className="texto-2" style={{ display: 'block' }}>
            {carregandoFotos ? (
              'Carregando as fotos…'
            ) : semFotos ? (
              <>
                Adicione as fotos em <Link to="/medidas">Medidas</Link>.
              </>
            ) : (
              <>
                Os pares Antes × Depois por pose e as outras fotos em grade, com a data e os números. Desmarque para compartilhar sem as fotos.
                {tamanhoPdf !== null && ` Com as ${fotos.length} fotos, o PDF fica com ~${textoTamanho(tamanhoPdf)}.`}
              </>
            )}
          </small>
        </span>
      </label>
      <p className="texto-2" style={{ margin: '10px 0 0', fontSize: '0.8rem' }}>
        Para o relatório final do ciclo, colorido e com capa: <Link to="/relatorio-final">Relatório final</Link>.
      </p>
      {pdf && (
        <button className="botao bloco-largo" style={{ marginTop: 10 }} onClick={() => void compartilhar(pdf)}>
          Compartilhar PDF (salvar, imprimir, enviar)
        </button>
      )}
      {msgPdf && (
        <div className={`alerta ${msgPdf.tipo}`} style={{ marginTop: 10 }}>
          {msgPdf.texto}
        </div>
      )}
    </section>
  );

  const kpiDe = (rotulo: string, chave: ChavePainel, valor: number | null | undefined, fmt: (n: number) => string, variacao: string, classe: string, valores: number[]) => (
    <KpiToque
      rotulo={rotulo}
      valor={valor == null ? '–' : fmt(valor)}
      {...(valor != null ? { numero: { valor, formato: fmt } } : {})}
      variacao={variacao}
      classe={classe}
      valores={valores}
      aoAbrir={() => setFolha(chave)}
    />
  );
  const intervaloIniAtu = iniP ? `${formatarData(iniP.data, true)} → ${atuP ? formatarData(atuP.data, true) : 'sem nova medição'}` : 'Medições com fita, em jejum';

  return (
    <div className="pilha relatorio analise" ref={deslizar}>
      <div className="so-impressao">
        <h1>Relatório do ciclo · {perfil?.nome}</h1>
        <p>Gerado em {formatarData(hoje)}. Dados registrados pelo próprio paciente no app Ciclo.</p>
      </div>

      <div className="abas abas-painel nao-imprimir" role="tablist" aria-label="Seções da análise">
        {ABAS_ANALISE.map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>
            {r}
          </button>
        ))}
      </div>

      {aba !== 'relatorio' && (
        <BarraPeriodo opcoes={opcoesPer} atual={per} aoMudar={setPeriodo} destaque={destaque} aoLimparDestaque={() => setDestaque(null)} hoje={hoje} />
      )}

      {aba === 'geral' && (
        <ProvedorSincronia>
          <section className="cartao hero">
            <div className="hero-cab">
              <div className="cresce">
                <div className="sobretitulo">{semanaCiclo ? `Semana ${semanaCiclo} de ${semanasTotal} do ciclo` : 'Ciclo'}</div>
                <div className="hero-titulo">{p0 ? `${num(p0.dose_mg)} mg · ${p0.fase ? p0.fase.fase.nome : 'fora do plano'}` : faseDepois ? 'Fase pós-remédio' : 'Ciclo concluído'}</div>
                <div className="hero-sub">{faseAtual}</div>
              </div>
              <div className="hero-acoes">
                {/* Cartão de progresso (imagem) do período escolhido no filtro; sem a dose por padrão */}
                <BotaoCompartilharProgresso variante="pequeno" periodo={janela} />
                <button className="botao pequeno" onClick={() => setAba('relatorio')}>
                  PDF
                </button>
              </div>
            </div>
            {diaCiclo !== null && totalDias !== null && (
              <div className="hero-progresso">
                <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={totalDias} aria-valuenow={diaCiclo} aria-label="Progresso do ciclo">
                  <div style={{ width: `${(diaCiclo / totalDias) * 100}%` }} />
                </div>
                <div className="hero-progresso-rotulos numero">
                  <span>
                    Dia {diaCiclo} de {totalDias}
                  </span>
                  <span>{pct(diaCiclo / totalDias, 0)}</span>
                </div>
              </div>
            )}
            <div className="hero-stats">
              <div className="hero-stat">
                <div className="rotulo">Próxima</div>
                <div className="valor">{p0 ? diaCurto(p0.data) : '–'}</div>
                {p0 && <div className="hero-stat-sub">{num(p0.dose_mg)} mg</div>}
              </div>
              <div className="hero-stat">
                <div className="rotulo">Frasco</div>
                <div className="valor">{pct(resumo.percentual_usado, 0)}</div>
                <div className="hero-stat-sub">usado</div>
              </div>
              <div className="hero-stat">
                <div className="rotulo">Termina</div>
                <div className="valor">{periodoCiclo ? formatarData(periodoCiclo.fim, true).slice(0, 5) : '–'}</div>
                {periodoCiclo && <div className="hero-stat-sub">{periodoCiclo.fim.slice(0, 4)}</div>}
              </div>
            </div>
          </section>

          <CartaoRelatorioFinal onde="analise" />

          <ResumoInsights onde="analise" />

          <div className="secao-sub analise-kpis-sub">
            {emCiclo
              ? `Agora e a variação desde o início${ini ? ` (${formatarData(ini.data, true).slice(0, 5)})` : ''}`
              : `Fim do período e a variação ${per.quando}`}{' '}
            · toque para ver o detalhe
          </div>
          <div className="kpis">
            {kpiDe(
              'Peso',
              'peso_kg',
              pesoAgoraP,
              (n) => kg(n),
              varPesoP === null ? '–' : `${sinal(varPesoP, 1, ' kg')}${varPesoPctP !== null ? ` · ${sinal(varPesoPctP * 100, 1, '%')}` : ''}`,
              corVariacao(varPesoP, true, MDC.peso_kg),
              valoresPeso,
            )}
            {kpiDe('Cintura', 'cintura_cm', agoraP?.cintura_cm, (n) => cm(n), difP('cintura_cm') === null ? '–' : sinal(difP('cintura_cm'), 1, ' cm'), corVariacao(difP('cintura_cm'), true, MDC.cintura_cm), ultimosValores('cintura_cm'))}
            {kpiDe('% de gordura', 'bf', agoraP?.bf, (n) => pp(n), difBf === null ? '–' : sinal(difBf, 1, ' p.p.'), corVariacao(difBf, true, MDC.bf), ultimosValores('bf'))}
            {kpiDe(
              'Massa magra',
              'massa_magra_kg',
              agoraP?.massa_magra_kg,
              (n) => kg(n),
              difP('massa_magra_kg') === null ? '–' : sinal(difP('massa_magra_kg'), 1, ' kg'),
              corVariacao(difP('massa_magra_kg'), false, MDC.massa_magra_kg),
              ultimosValores('massa_magra_kg'),
            )}
            {kpiDe(
              'Massa gorda',
              'massa_gorda_kg',
              agoraP?.massa_gorda_kg,
              (n) => kg(n),
              difP('massa_gorda_kg') === null ? '–' : sinal(difP('massa_gorda_kg'), 1, ' kg'),
              corVariacao(difP('massa_gorda_kg'), true, MDC.massa_gorda_kg),
              ultimosValores('massa_gorda_kg'),
            )}
            <KpiToque
              rotulo="Ritmo"
              valor={ritmoP ? `${num(ritmoP.pct, 2)}%` : '–'}
              {...(ritmoP ? { numero: { valor: ritmoP.pct, formato: (n: number) => `${num(n, 2)}%` } } : {})}
              variacao={ritmoP ? `${sinal(tendP!.kg_semana, 2, ' kg')}/sem` : 'por semana'}
              classe={ritmoP ? COR_FAIXA[ritmoP.faixa] : ''}
              legenda={ritmoP ? FAIXA_RITMO[ritmoP.faixa] : emCiclo ? 'aparece com 3 pesagens em 2 semanas' : 'precisa de 3 pesagens em 2 semanas no período'}
              aoAbrir={() => setFolha('ritmo')}
            />
          </div>

          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="brilho" cor="rosa" />
              <div>
                <h2>Destaques</h2>
                <div className="secao-sub">{emCiclo ? 'O que os seus registros mostram agora' : `O que os registros mostram ${per.quando}`}</div>
              </div>
            </div>
            {listaDestaques.length ? (
              <div className="destaques">
                {listaDestaques.map((d) => (
                  <div key={d.texto} className={`destaque destaque-${d.tom}`}>
                    <span className="destaque-icone" aria-hidden="true">
                      {d.tom === 'bom' ? '✓' : d.tom === 'atencao' ? '!' : 'i'}
                    </span>
                    <span>{d.texto}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EstadoVazio icone="brilho" cor="rosa" titulo={emCiclo ? 'Os destaques estão a caminho' : 'Nada de diferente neste período'} compacto>
                {emCiclo
                  ? 'Os destaques aparecem conforme você registra medidas, pesos e o Diário. Variações menores que o erro da fita não entram.'
                  : 'Nada que passe do erro da fita neste período. Tente um período maior.'}
              </EstadoVazio>
            )}
          </section>

          {progressos.length > 0 && (
            <section className="cartao">
              <div className="secao-cab">
                <IconeChip nome="alvo" cor="rosa" />
                <div>
                  <h2>Metas do projeto</h2>
                  <div className="secao-sub">{emCiclo ? 'Do início até a meta, pela medição mais recente' : `Do início até a meta, pela medição até ${formatarData(per.ate).slice(0, 5)}`}</div>
                </div>
              </div>
              <div className="metas">
                {progressos.map((x) => (
                  <BarraMeta key={x.nome} nome={x.nome} p={x.p} fmt={x.fmt} />
                ))}
              </div>
              {previsaoSel && (
                <div className="analise-metas-previsao">
                  <div className="secao-cab" style={{ marginBottom: 6 }}>
                    <div>
                      <h3>No ritmo atual</h3>
                      <div className="secao-sub">Tendência de hoje até a meta (não muda com o filtro)</div>
                    </div>
                    {previsoes.length > 1 && (
                      <Pilulas
                        rotulo="Medida da previsão"
                        opcoes={previsoes.map((x) => [x.chave, x.rotulo] as ['peso' | 'cintura', string])}
                        valor={previsaoSel.chave}
                        aoMudar={setMetaPrev}
                      />
                    )}
                  </div>
                  <GraficoPrevisao key={previsaoSel.chave} nome={previsaoSel.chave} pontos={previsaoSel.pontos} previsao={previsaoSel.p} unidade={previsaoSel.unidade} marcos={marcos} destaque={destaqueP} />
                </div>
              )}
            </section>
          )}

          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="grafico" cor="indigo" />
              <div>
                <h2>Peso × dose</h2>
                <div className="secao-sub">Arraste para ler · pinça ou faixa para ampliar · toque nos marcos</div>
              </div>
            </div>
            {serie.length > 0 || resumo.linhas.length > 0 ? (
              <>
                <GraficoJanela
                  titulo="Peso × dose"
                  series={seriesPesoDose}
                  marcos={marcos}
                  destaque={destaqueP}
                  janela={janela}
                  permitirZoom
                  expandivel
                  altura={230}
                  formatoDir={(v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`}
                />
                <details className="tabela-detalhe">
                  <summary>Como ler</summary>
                  <p className="mudo">
                    Área: pesagens (Diário e medições); círculo vazado = medição atípica, fora das tendências. Degrau: dose aplicada (eixo da direita, mg).
                    Marcos no eixo do tempo: ● troca de dose, ◆ decisão, □ anotação, ○ medição atípica, · medição de segunda.
                  </p>
                </details>
              </>
            ) : (
              <EstadoVazio icone="grafico" cor="indigo" titulo="Sem pesos ainda" compacto>
                Registre pesos no Diário ou nas Medidas para ver o gráfico.
              </EstadoVazio>
            )}
          </section>

          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="calendario" cor="verde" />
              <div>
                <h2>Hábitos</h2>
                <div className="secao-sub">{emCiclo ? (curtoCiclo ? 'Desde a 1ª dose, até ontem' : 'Últimas 4 semanas, até ontem') : `${per.quando[0].toUpperCase()}${per.quando.slice(1)}, até ontem`}</div>
              </div>
              <button className="botao pequeno" onClick={() => setAba('habitos')}>
                Detalhes
              </button>
            </div>
            {aneis(emCiclo ? adesao28 : adesaoP)}
          </section>
        </ProvedorSincronia>
      )}

      {aba === 'corpo' && (
        <ProvedorSincronia>
          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="medidas" cor="ciano" />
              <div>
                <h2>{emCiclo ? 'Início × agora' : 'Início × fim do período'}</h2>
                <div className="secao-sub">{intervaloIniAtu}</div>
              </div>
            </div>
            {iniP ? (
              <>
                <Variacoes itens={variacoes} />
                {!atuP && <p className="mudo" style={{ marginTop: 8 }}>{emCiclo ? 'Faça uma nova medição para comparar com a inicial.' : 'Só uma medição neste período: escolha um período maior para comparar.'}</p>}
                <details className="tabela-detalhe">
                  <summary>Ver tabela</summary>
                  <Comparacao ini={iniP} atu={atuP} />
                </details>
                <p className="mudo" style={{ marginTop: 8 }}>
                  Verde: melhorou além do erro da fita. Variações menores que o erro ficam cinza.
                  {!emCiclo && ' Referência: a última medição até 7 dias antes do início do período.'}
                </p>
              </>
            ) : (
              <Vazio>
                Nenhuma medição registrada. <Link to="/medidas">Registrar medidas</Link>
              </Vazio>
            )}
          </section>

          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="grafico" cor="ciano" />
              <h2>Evolução</h2>
              <div className="pilulas-rolagem">
                <Pilulas rotulo="Medida do gráfico" opcoes={OPCOES_METRICA} valor={metrica} aoMudar={setMetrica} />
              </div>
            </div>
            {pontosMetrica.filter((x) => x.valor !== null && !x.atipico).length >= 2 ? (
              <>
                <GraficoJanela
                  key={metrica}
                  titulo={`Evolução: ${INFO_METRICA[metrica].nome}`}
                  series={[{ id: metrica, nome: INFO_METRICA[metrica].nome, tipo: 'area', pontos: pontosMetrica, cor: 'texto', unidade: INFO_METRICA[metrica].unidade, casas: 1 }]}
                  referencias={[
                    ...(INFO_METRICA[metrica].inicio != null ? [{ valor: INFO_METRICA[metrica].inicio!, rotulo: 'início', cor: 'neutro' as const }] : []),
                    ...(INFO_METRICA[metrica].meta != null ? [{ valor: INFO_METRICA[metrica].meta!, rotulo: 'meta', cor: 'bom' as const }] : []),
                  ]}
                  marcos={marcos}
                  destaque={destaqueP}
                  janela={janela}
                  sincronia="analise-corpo"
                  permitirZoom
                  expandivel
                  altura={210}
                />
                <button type="button" className="botao pequeno analise-ver-detalhe" onClick={() => setFolha(metrica)}>
                  Detalhe de {INFO_METRICA[metrica].nome.toLowerCase()}: semanas, fases e previsão
                </button>
              </>
            ) : (
              <Vazio>Com 2 medições, aparece a evolução de {INFO_METRICA[metrica].nome.toLowerCase()}.</Vazio>
            )}
          </section>

          {comMassas && (
            <section className="cartao">
              <div className="secao-cab">
                <IconeChip nome="camadas" cor="ciano" />
                <div>
                  <h2>Composição do peso</h2>
                  <div className="secao-sub">Peso, massa magra e massa gorda (eixo da direita) a cada medição</div>
                </div>
              </div>
              <GraficoJanela titulo="Composição do peso" series={seriesMassas} destaque={destaqueP} janela={janela} sincronia="analise-corpo" permitirZoom expandivel altura={210} />
              <p className="mudo" style={{ marginTop: 6 }}>
                A faixa entre o peso e a massa magra é a massa gorda.
              </p>
            </section>
          )}

          <section className="cartao">
            <h2 className="titulo-com-icone">
              <IconeChip nome="camadas" cor="ciano" />
              Qualidade da perda</h2>
            <LinhaQualidade q={qualidadeP} />
          </section>

          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="lista" cor="rosa" />
              <div>
                <h2>Por fase</h2>
                <div className="secao-sub">Cintura, massa gorda e massa magra em cada bloco de dose · toque para destacar</div>
              </div>
            </div>
            {fases.length === 0 ? (
              <Vazio>Os resultados aparecem depois da primeira aplicação.</Vazio>
            ) : (
              <>
                <div className="tabela-rolagem">
                  <table>
                    <thead>
                      <tr>
                        <th>Fase</th>
                        <th>Cintura</th>
                        <th>Massa gorda</th>
                        <th>Massa magra</th>
                        <th>% magra</th>
                        <th>Gordura/sem.</th>
                        {temSono && <th>Sono</th>}
                        {treino && <th>Treino</th>}
                        {treino && <th>Cardio</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {fasesP.map((i) => {
                        const f = fases[i];
                        const c = compFases[i];
                        return (
                          <tr key={f.indice} {...linhaFase(i)}>
                            <td>{botaoFase(i, rotuloBloco(f))}</td>
                            <td className={corVariacao(c.cintura, true, MDC.cintura_cm)}>{sinal(c.cintura, 1, ' cm')}</td>
                            <td className={corVariacao(c.gorda, true, MDC.massa_gorda_kg)}>{sinal(c.gorda, 1, ' kg')}</td>
                            <td className={corVariacao(c.magra, false, MDC.massa_magra_kg)}>{sinal(c.magra, 1, ' kg')}</td>
                            <td className={c.magra_pct !== null && c.magra_pct > 0.25 ? 'aviso-txt' : undefined}>
                              {c.magra_pct === null ? (c.poucos_dados && c.de ? <span className="texto-2">poucos dados</span> : '–') : pct(Math.max(c.magra_pct, 0), 0)}
                            </td>
                            <td className={c.gorda_semana === null ? undefined : corVariacao(c.gorda_semana, true)}>
                              {c.gorda_semana === null ? (c.poucos_dados && c.de ? <span className="texto-2">poucos dados</span> : '–') : sinal(c.gorda_semana, 2)}
                            </td>
                            {temSono && (
                              <td className={sonoFases[i] !== null && sonoFases[i]! < SONO_MINIMO_H ? 'aviso-txt' : undefined}>
                                {sonoFases[i] === null ? '–' : `${num(sonoFases[i], 1)} h`}
                              </td>
                            )}
                            {treino && <td>{c.treino === null ? '–' : pct(c.treino, 0)}</td>}
                            {treino && <td>{c.cardio === null ? '–' : pct(c.cardio, 0)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!emCiclo && fasesP.length < fases.length && <p className="mudo" style={{ marginTop: 6 }}>Só as fases que tocam o período escolhido.</p>}
                <details className="tabela-detalhe">
                  <summary>Como ler</summary>
                  <p className="mudo">
                    Cada linha é um bloco de doses seguidas iguais, rotulado pela dose realmente aplicada. Última medição até o início do bloco (ou a primeira
                    dentro dele) × última antes do bloco seguinte. % magra e gordura/sem.: regressão com todas as medições do bloco (3 ou mais cobrindo 14
                    dias); % magra = parte da perda de peso que saiu de massa magra (acima de 25% fica em destaque). Medições atípicas ficam de fora.
                    {treino && ' Uma fase com pouca perda e baixa aderência ao treino pede ajuste de rotina, não necessariamente de dose.'}
                    {temSono && ' Sono: média das noites registradas na fase (4 ou mais); é associação, não causa.'}
                  </p>
                </details>
              </>
            )}
          </section>
        </ProvedorSincronia>
      )}

      {aba === 'remedio' && (
        <ProvedorSincronia>
          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="frasco" cor="indigo" />
              <div>
                <h2>Frasco</h2>
                <div className="secao-sub">{ciclo?.nome}</div>
              </div>
            </div>
            <div className="linha" style={{ alignItems: 'center', flexWrap: 'nowrap', gap: 14 }}>
              <Anel fracao={resumo.percentual_usado} rotulo="usado" />
              <div className="grade cresce">
                <Bloco rotulo="Saldo" valor={mg(resumo.saldo_mg)} />
                <Bloco rotulo="Aplicações feitas" valor={String(resumo.aplicacoes_realizadas)} />
                <Bloco rotulo="Doses no plano" valor={String(resumo.doses_plano_restantes)} />
                <Bloco rotulo="Última dose prevista" valor={resumo.data_fim_prevista ? formatarData(resumo.data_fim_prevista, true) : '–'} />
              </div>
            </div>
          </section>

          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="ciclo" cor="indigo" />
              <div>
                <h2>Doses do ciclo</h2>
                <div className="secao-sub">Altura da barra = dose em mg · toque num bloco para destacá-lo nos gráficos</div>
              </div>
            </div>
            {resumo.linhas.length || resumo.projecao.length ? (
              <>
                <LinhaDoses
                  feitas={resumo.linhas.map((l) => ({ numero: l.numero, dose: l.aplicacao.dose_mg, data: l.aplicacao.data }))}
                  previstas={resumo.projecao.map((d) => ({ numero: d.numero, dose: d.dose_mg, data: d.data, hipotese: d.hipotese }))}
                />
                {fases.length > 0 && <FaixaFases fases={faseInfo} selecionada={faseSel} aoSelecionar={destacarFase} />}
              </>
            ) : (
              <Vazio>Nenhuma aplicação registrada.</Vazio>
            )}
          </section>

          {(serie.length > 0 || pontosNausea.length > 0 || pontosSono.length > 0) && (
            <section className="cartao">
              <div className="secao-cab">
                <IconeChip nome="historico" cor="indigo" />
                <div>
                  <h2>Linha do tempo</h2>
                  <div className="secao-sub">Arraste num gráfico: a mesma data aparece nos três</div>
                </div>
              </div>
              <LinhaDoTempo
                peso={pontosPeso}
                cintura={pontosCintura}
                nausea={pontosNausea}
                sono={pontosSono}
                marcos={marcos}
                destaque={destaqueP}
                janela={janela}
              />
              <details className="tabela-detalhe">
                <summary>Como ler</summary>
                <p className="mudo">
                  Peso (pesagens e medições), cintura (fita) e, por dia, a náusea do Diário (barras, 0 a 3) e o sono da noite anterior (linha, eixo da direita,
                  com a referência de 7 h). Toque num bloco de dose acima para sombrear o período dele. Ver junto não prova causa.
                </p>
              </details>
            </section>
          )}

          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="gota" cor="indigo" />
              <div>
                <h2>Náusea depois da dose</h2>
                <div className="secao-sub">Média de 0 a 3 por dia depois da aplicação (D0 = dia da dose){emCiclo ? '' : ` · ${per.quando}`}</div>
              </div>
            </div>
            {nauseaVazia ? (
              <Vazio>{emCiclo ? 'Registre a náusea no Diário (0 a 3) para ver em que dia depois da dose ela aparece.' : 'Sem náusea registrada neste período.'}</Vazio>
            ) : (
              <>
                <MapaCalor
                  colunas={colNausea.map((c) => c.rotulo)}
                  linhas={fasesP.map((i) => ({ rotulo: rotuloFaseCurto2(i), valores: sintomasP[i].nausea_por_dia }))}
                />
                <div className="calor-escala">
                  <span>0</span>
                  <i />
                  <span>3</span>
                </div>
                {temSintomas && (
                  <details className="tabela-detalhe">
                    <summary>Vômito, diarreia e intestino preso por fase</summary>
                    <div className="tabela-rolagem">
                      <table>
                        <thead>
                          <tr>
                            <th>Fase</th>
                            <th>Vômito</th>
                            <th>Diarreia</th>
                            <th>Intest. preso</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fasesP.map((i) => {
                            const s = sintomasP[i];
                            return (
                              <tr key={s.indice}>
                                <td>{rotuloBloco(fases[i])}</td>
                                <td>{s.vomito === null ? '–' : pct(s.vomito, 0)}</td>
                                <td>{s.diarreia === null ? '–' : pct(s.diarreia, 0)}</td>
                                <td>{s.intestino_preso === null ? '–' : pct(s.intestino_preso, 0)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mudo" style={{ marginTop: 6 }}>% dos dias registrados no Diário naquela fase (dia sem marcar conta como &quot;não teve&quot;).</p>
                  </details>
                )}
              </>
            )}
            {colNausea.length < 7 && <p className="mudo" style={{ marginTop: 8 }}>Doses a cada {ciclo?.intervalo_dias} dias: as últimas colunas mostram a média dos dias.</p>}
          </section>

          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="lista" cor="indigo" />
              <div>
                <h2>Peso e náusea por fase</h2>
                <div className="secao-sub">Ritmo de peso de cada bloco de dose · toque para destacar</div>
              </div>
            </div>
            {fases.length === 0 ? (
              <Vazio>Os resultados aparecem depois da primeira aplicação.</Vazio>
            ) : (
              <>
                <div className="tabela-rolagem">
                  <table>
                    <thead>
                      <tr>
                        <th>Fase</th>
                        <th>Doses</th>
                        <th>Período</th>
                        <th>Peso início → fim</th>
                        <th>kg/sem.</th>
                        <th>vs fase anterior</th>
                        <th>Náusea méd. / máx.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fasesP.map((i) => {
                        const f = fases[i];
                        return (
                          <tr key={f.indice} {...linhaFase(i)}>
                            <td>
                              {botaoFase(i, rotuloBloco(f))} {f.em_andamento && <span className="etiqueta bom">atual</span>}
                            </td>
                            <td>
                              {f.doses} × {num(f.dose_mg)} mg
                            </td>
                            <td>
                              {formatarData(f.inicio, true)} –{' '}
                              {i < fases.length - 1 ? formatarData(somarDias(f.fim, -1), true) : f.fim === hoje ? 'hoje' : formatarData(f.fim, true)}
                            </td>
                            <td>
                              {num(f.peso_inicio, 1)} → {num(f.peso_fim, 1)}
                            </td>
                            <td className={f.poucos_dados ? undefined : corVariacao(f.kg_por_semana, true)}>
                              {f.poucos_dados ? (
                                <span className="texto-2">
                                  {f.variacao_kg !== null ? `${sinal(f.variacao_kg, 1, ' kg')} · ` : ''}
                                  {f.em_andamento && f.variacao_kg === null ? 'aguardando 2ª semana' : 'poucos dados'}
                                </span>
                              ) : (
                                sinal(f.kg_por_semana, 2)
                              )}
                            </td>
                            <td className={f.vs_anterior && f.vs_anterior.estado !== 'parecida' ? (f.vs_anterior.estado === 'mais_rapida' ? 'bom' : 'aviso-txt') : 'texto-2'}>
                              {i === 0
                                ? '–'
                                : !f.vs_anterior
                                  ? 'poucos dados'
                                  : f.vs_anterior.estado === 'parecida'
                                    ? 'parecida (dentro do ruído)'
                                    : `${f.vs_anterior.estado === 'mais_rapida' ? 'mais rápida' : 'mais lenta'} (${sinal(f.vs_anterior.diferenca, 2)})`}
                            </td>
                            <td>
                              {num(f.nausea_media, 1)} / {f.nausea_max ?? '–'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!emCiclo && fasesP.length < fases.length && <p className="mudo" style={{ marginTop: 6 }}>Só as fases que tocam o período escolhido.</p>}
                <details className="tabela-detalhe">
                  <summary>Como ler</summary>
                  <p className="mudo">
                    kg/sem.: regressão com todas as pesagens da fase e a de referência (até 7 dias antes), com 3 ou mais pontos cobrindo 14 dias. A
                    comparação entre fases usa a diferença mínima detectável (1,96 × o erro das duas retas): abaixo dela, “parecida”. Fases seguidas também
                    mudam tempo de dieta, aderência e época do ano; a diferença entre elas não prova efeito da dose.
                  </p>
                </details>
              </>
            )}
          </section>

          {decisoes.length > 0 && (
            <section className="cartao">
              <h2 className="titulo-com-icone">
                <IconeChip nome="lista" cor="marca" />
                Fim de fase: decisões e anotações</h2>
              <div className="lista">
                {decisoes.map((d) => (
                  <div className="item" key={d.id}>
                    <div className="cresce">
                      <div className="titulo">
                        {ESCOLHAS[d.escolha]} <span className="mudo">· {formatarData(d.data, true)} · após a {d.apos_aplicacao}ª dose</span>
                      </div>
                      <div className="detalhe">{detalheDecisao(d).replace('->', '→')}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mudo" style={{ marginTop: 8 }}>Também vão para o PDF.</p>
            </section>
          )}
        </ProvedorSincronia>
      )}

      {aba === 'habitos' && (
        <>
          <section className="cartao">
            <div className="secao-cab">
              <IconeChip nome="calendario" cor="rosa" />
              <div>
                <h2>Adesão</h2>
                <div className="secao-sub">{emCiclo ? 'Desde a 1ª dose' : `${per.quando[0].toUpperCase()}${per.quando.slice(1)}`}, até ontem (hoje ainda está em aberto)</div>
              </div>
            </div>
            {aneis(adesaoP)}
            <p className="mudo" style={{ marginTop: 10 }}>
              Dieta: &quot;em parte&quot; vale meio dia, entre os dias respondidos. Água: dias na meta entre os dias anotados. Sono: noites com 7 h ou mais.
              Diário: dias com algum registro. Troque o período no alto (7 dias, 4 semanas, ciclo ou uma fase).
            </p>
          </section>

          {treinoSemanas.length > 0 && (
            <section className="cartao">
              <div className="secao-cab">
                <IconeChip nome="treino" cor="laranja" />
                <div>
                  <h2>Treino por semana</h2>
                  <div className="secao-sub">Dias com treino e com cardio, de segunda a domingo · toque numa semana para destacá-la</div>
                </div>
              </div>
              <GraficoBarrasSemana
                titulo="Treino por semana"
                barras={treinoSemanas.map((l) => ({ chave: l.segunda, rotulo: rotuloSemana(l.segunda), valores: [{ serie: 'treino', valor: l.treino }, { serie: 'cardio', valor: l.cardio }] }))}
                series={[
                  { id: 'treino', nome: 'Treino', cor: 'texto' },
                  { id: 'cardio', nome: 'Cardio', cor: 'bom' },
                ]}
                selecionada={semanaSel}
                aoSelecionar={destacarSemana}
                max={7}
                formato={(v) => `${num(v, 0)} d`}
              />
              {blocosTreinoTela.map((b) => (
                <div key={b.rotulo} className="pilha" style={{ gap: 6, marginTop: 10 }}>
                  {b.rotulo && <span className="rotulo">{b.rotulo}</span>}
                  <div className="grade grade-4">
                    <Bloco rotulo="Treinos" valor={b.valores[0]} />
                    <Bloco rotulo="Cardios" valor={b.valores[1]} />
                    <Bloco rotulo="Corridas" valor={b.valores[2]} />
                    <Bloco rotulo="Melhor pace" valor={b.valores[3]} />
                  </div>
                </div>
              ))}
            </section>
          )}

          {(temBemEstar || sono7.noites > 0 || agua.dias > 0 || temUrina) && (
            <section className="cartao">
              <div className="secao-cab">
                <IconeChip nome="lua" cor="roxo" />
                <div>
                  <h2>Sono e hidratação</h2>
                  <div className="secao-sub">Médias por semana e dos últimos 7 dias · toque numa semana para destacá-la</div>
                </div>
              </div>
              {temSonoSemana && (
                <>
                  <div className="rotulo analise-rotulo-grafico">Sono médio (meta: 7 h ou mais)</div>
                  <GraficoBarrasSemana
                    titulo="Sono médio por semana"
                    barras={habitos.map((h) => ({ chave: h.segunda, rotulo: rotuloSemana(h.segunda), valores: [{ serie: 'sono', valor: h.sono_h === null ? null : Math.round(h.sono_h * 10) / 10 }] }))}
                    series={[{ id: 'sono', nome: 'Sono', cor: 'aviso' }]}
                    selecionada={semanaSel}
                    aoSelecionar={destacarSemana}
                    altura={150}
                    formato={(v) => `${num(v, 1)} h`}
                  />
                </>
              )}
              {temAguaSemana && (
                <>
                  <div className="rotulo analise-rotulo-grafico">Água: média e meta (L por dia)</div>
                  <GraficoBarrasSemana
                    titulo="Água por semana"
                    barras={habitos.map((h) => ({
                      chave: h.segunda,
                      rotulo: rotuloSemana(h.segunda),
                      valores: [
                        { serie: 'agua', valor: h.agua_l === null ? null : Math.round(h.agua_l * 10) / 10 },
                        { serie: 'meta', valor: h.agua_meta_l === null ? null : Math.round(h.agua_meta_l * 10) / 10 },
                      ],
                    }))}
                    series={[
                      { id: 'agua', nome: 'Água', cor: 'destaque' },
                      { id: 'meta', nome: 'Meta', cor: 'neutro' },
                    ]}
                    selecionada={semanaSel}
                    aoSelecionar={destacarSemana}
                    altura={160}
                    formato={(v) => `${num(v, 1)} L`}
                  />
                </>
              )}
              <div className="grade" style={{ marginTop: 10 }}>
                <Bloco
                  rotulo="Sono · média de 7 dias"
                  valor={sono7.media === null ? `${sono7.noites} de 4 noites` : `${num(sono7.media, 1)} h`}
                  classe={sono7.baixo ? 'aviso-txt' : undefined}
                />
                <Bloco
                  rotulo="Água · média da semana"
                  valor={agua.media === null ? '–' : `${num(agua.media, 1)} de ${num(agua.meta_media, 1)} L`}
                  classe={agua.media !== null && agua.meta_media !== null && agua.media < agua.meta_media - 0.25 ? 'aviso-txt' : undefined}
                />
              </div>
              {sono7.baixo && (
                <div className="alerta" style={{ marginTop: 10 }}>
                  {TEXTO_SONO_BAIXO}
                </div>
              )}
              {temUrina && (
                <p className="texto-2" style={{ marginTop: 8 }}>
                  Cor da urina nos últimos 7 dias: {agua.urina.clara} clara · {agua.urina.amarela} amarela · {agua.urina.escura} escura.
                </p>
              )}
              <details className="tabela-detalhe">
                <summary>Como ler</summary>
                <p className="mudo">
                  Sono: média só com 4 noites ou mais registradas; 7 h ou mais é o recomendado para adultos. Água: dias com registro; meta de partida de 2 L
                  de bebidas por dia{treino ? ' + 0,7 L por hora de treino e cardio' : ''}. Beber muito além da meta não ajuda.
                </p>
              </details>
            </section>
          )}

          {dadosPadroes && (
            <section className="cartao">
              <div className="secao-cab">
                <IconeChip nome="brilho" cor="rosa" />
                <div>
                  <h2>Padrões</h2>
                  <div className="secao-sub">Hábitos × resultados {emCiclo ? 'no ciclo' : per.quando} · associação, não causa</div>
                </div>
              </div>
              <Padroes dados={dadosPadroes} destaque={destaque?.chave ?? null} aoDestacar={setDestaque} emCiclo={emCiclo} />
            </section>
          )}

          {metasDieta && dieta && (
            <section className="cartao">
              <h2 className="titulo-com-icone">
                <IconeChip nome="dieta" cor="verde" />
                Plano alimentar</h2>
              <div className="grade grade-4">
                <Bloco rotulo="Meta" valor={`${num(metasDieta.meta_kcal, 0)} kcal`} />
                <Bloco rotulo="Gasto estimado" valor={`${num(metasDieta.gasto_total, 0)} kcal`} />
                <Bloco rotulo="Proteína animal" valor={`${num(metasDieta.ptn_animal_g, 0)} g`} />
                <Bloco rotulo="Gordura" valor={`${num(metasDieta.gord_g, 0)} g`} />
              </div>
              <p className="texto-2" style={{ marginTop: 8 }}>
                Basal Katch-McArdle {num(metasDieta.tmb, 0)} kcal · proteína animal {curto(dieta.config.ptn_gkg)} g/kg de massa magra · gordura{' '}
                {curto(dieta.config.gord_gkg)} g/kg · carboidrato fecha a conta.{baseMetas}
              </p>
              {seguido && tendMedidas && (
                <div className="pilha" style={{ gap: 4, marginTop: 8 }}>
                  <p>
                    <b>{textoPlanoSeguido(seguido)}</b>
                    <span className="texto-2">
                      {' '}
                      · {textoDietaSemana(seguido)}, de {formatarData(tendMedidas.de)} à véspera de {formatarData(tendMedidas.ate)} (janela da tendência das medidas)
                    </span>
                  </p>
                  {conselho && (
                    <p className={conselho.tipo === 'bate' || conselho.tipo === 'impreciso' ? 'texto-2' : 'alerta'} style={conselho.tipo === 'bate' || conselho.tipo === 'impreciso' ? undefined : { display: 'block' }}>
                      {conselho.texto}
                    </p>
                  )}
                </div>
              )}
              {refeicoesSemBanco && <div className="alerta" style={{ marginTop: 8 }}>{avisoSemBanco}</div>}
              {refeicoes.length > 0 && (
                <details className="tabela-detalhe">
                  <summary>Refeições do plano</summary>
                  <div className="tabela-rolagem">
                    <table>
                      <thead>
                        <tr>
                          <th>Refeição</th>
                          <th>kcal</th>
                          <th>Ptn A</th>
                          <th>Carb</th>
                          <th>Gord</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refeicoes.map(({ r, m }) => (
                          <tr key={r.id}>
                            <td>
                              {r.nome}
                              {r.horario ? ` · ${r.horario}` : ''}
                            </td>
                            <td>{num(m.kcal, 0)}</td>
                            <td>{num(m.ptn_animal, 0)} g</td>
                            <td>{num(m.carb, 0)} g</td>
                            <td>{num(m.gord, 0)} g</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </section>
          )}
        </>
      )}

      {aba === 'relatorio' && (
        <>
          {cartaoPdf}

          <section className="cartao">
            <h2 className="titulo-com-icone">
              <IconeChip nome="ciclo" cor="indigo" />
              Aplicações</h2>
            {resumo.linhas.length === 0 ? (
              <Vazio>Nenhuma aplicação registrada.</Vazio>
            ) : (
              <div className="tabela-rolagem">
                <table>
                  <thead>
                    <tr>
                      <th>Nº</th>
                      <th>Data</th>
                      <th>Dose</th>
                      <th>Fase</th>
                      <th>Atraso</th>
                      <th>Local</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.linhas.map((l) => (
                      <tr key={l.aplicacao.id}>
                        <td>{l.numero}</td>
                        <td>{formatarData(l.aplicacao.data, true)}</td>
                        <td>{mg(l.aplicacao.dose_mg)}</td>
                        <td>{l.fase ? l.fase.indice + 1 : <span className="aviso-txt">fora</span>}</td>
                        <td className={l.atraso_dias > 0 ? 'aviso-txt' : undefined}>{l.atraso_dias === 0 ? '–' : `${l.atraso_dias > 0 ? '+' : ''}${l.atraso_dias} d`}</td>
                        <td>{l.aplicacao.local ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <ListaDecisoes />
        </>
      )}

      {detalhe && <FolhaMetrica d={detalhe} marcos={marcos} fases={fasesDetalhe} hoje={hoje} destaque={destaqueP} aoFechar={fecharFolha} />}

      <p className="mudo so-impressao">Este relatório registra e calcula; as decisões de dose são tomadas com acompanhamento médico.</p>
    </div>
  );
}
