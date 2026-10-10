import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListaDecisoes } from '../componentes/decisoes';
import { prepararFotosPdf, useFotos } from '../componentes/fotos';
import { LinhaQualidade, useQualidade } from '../componentes/composicao';
import { Bloco, SemGrafico, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useMetaAgua, useTreino } from '../dados/useTreino';
import { analisarGeral, composicaoPorFase, rotuloBloco, sintomasPorFase } from '../lib/analise';
import { fasePos } from '../lib/projeto';
import { aguaSemana, mediaSono7, SONO_MINIMO_H, sonoPorFase, TEXTO_SONO_BAIXO } from '../lib/bemestar';
import { descreverFaseAtual } from '../lib/ciclo';
import { ritmoPercentual, tendenciaMedidas, tendenciaPeso, textoQualidade } from '../lib/conferencia';
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
import { curto, decisoesPorDia, marcosDasDecisoes } from '../lib/registroDecisoes';
import { historicoAlertas } from '../lib/seguranca';
import { chaveSlot, montarSecoesFotos } from '../lib/fotos';
import type { ImagemPdf, ModeloRelatorio } from '../lib/relatorioPdf';
import { calcularMetas, corpoParaMetas, idade, macrosDaRefeicao, textoBaseMetas } from '../lib/dieta';
import { cm, corVariacao, kg, mg, num, pct, pp, sinal } from '../lib/formato';
import { MDC, ultimaNormal, type ChaveMdc, type Composicao } from '../lib/gordura';
import { conselhoConferencia, dietaNaTendencia, textoDietaSemana, textoPlanoSeguido } from '../lib/semana';
import { aderenciaRecente, formatarTempo } from '../lib/treino';

const GraficoPesoDose = lazy(() => import('../componentes/graficos').then((m) => ({ default: m.GraficoPesoDose })).catch(() => ({ default: SemGrafico })));

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
  const { fotos } = useFotos();
  const semFotos = fotos.length === 0;
  // Com a opção marcada, as fotos já são reduzidas antes do toque: o PDF sai na hora
  const fotosPdf = useRef<Promise<Map<string, ImagemPdf>> | null>(null);
  useEffect(() => {
    fotosPdf.current = incluirFotos && fotos.length ? prepararFotosPdf(fotos) : null;
    fotosPdf.current?.catch(() => undefined);
  }, [incluirFotos, fotos]);
  const qualidade = useQualidade();
  const metaAguaDe = useMetaAgua();
  if (!resumo) return null;

  const datasAplic = resumo.linhas.map((l) => l.aplicacao.data);
  // Com o remédio concluído, as fases vão até o fim do período do remédio (fimFases), não até hoje
  const compFases = composicaoPorFase(fases, composicoes, treino ? treinos : null, fimFases, hoje);
  const sintomas = sintomasPorFase(fases, datasAplic, diario, fimFases);
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
  const pelaMedida = serieMedidas.length >= 3;
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
  const metasDieta = dieta && corpoMetas ? calcularMetas(dieta.config, corpoMetas, treino ? aderenciaRecente(treinos, treino.inicio, hoje, 28, treino.fim) : null) : null;
  const baseMetas = corpoMetas ? ` Peso e massa magra ${textoBaseMetas(corpoMetas)}.` : '';
  const refeicoes = dieta && banco ? dieta.refeicoes.filter((r) => r.itens.length).map((r) => ({ r, m: macrosDaRefeicao(r, banco.mapa) })) : [];
  // "Segui o plano?" na janela da tendência das medidas, com o mesmo conselho da Conferência da Dieta
  const tendMedidas = tendenciaMedidas(composicoes);
  const seguido = tendMedidas ? dietaNaTendencia(diario, tendMedidas) : null;
  const kcalPlano = refeicoes.reduce((s, x) => s + x.m.kcal, 0);
  const deficitPlano = metasDieta && dieta ? (kcalPlano > 0 ? metasDieta.gasto_total - kcalPlano : -dieta.config.ajuste_kcal) : null;
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
              `${b.placar.corrida.feito} · ${num(b.placar.corrida.km, 1)} km`,
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
    const s = resumo!.degrau;
    const proxima = faseDepois
      ? `Próxima dose prevista: nenhuma (remédio concluído; fase pós-remédio desde ${formatarData(faseDepois.inicio)}).`
      : p
      ? `Próxima dose prevista: ${formatarData(p.data)} · ${mg(p.dose_mg)}${
          p.estado === 'pendente' && s.fase_seguinte
            ? ` (a dose continua até a decisão; a fase seguinte do Plano é ${mg(s.fase_seguinte.fase.dose_mg)})`
            : p.estado === 'subir'
              ? ' (decidido subir)'
              : p.extra
                ? ' (dose extra com a sobra do frasco)'
                : ''
        }`
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
        cabecalho: ['Fase', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', ...(temSintomas ? ['Vômito', 'Diarreia', 'Intest. preso'] : [])],
        linhas: sintomas.map((x, i) => [
          rotuloBloco(fases[i]),
          ...x.nausea_por_dia.map((n) => (n === null ? '–' : num(n, 1))),
          ...(temSintomas
            ? [x.vomito, x.diarreia, x.intestino_preso].map((t) => (t === null ? '–' : pct(t, 0)))
            : []),
        ]),
        nota: 'D0 = dia da dose. Náusea média (0 a 3). Sintomas: % dos dias registrados no Diário na fase.',
      });
    }
    const listaOcorrencias = ocorrencias(diario, aplicacoes);
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
        )} kcal) · proteína animal ${curto(dieta.config.ptn_gkg)} g/kg de massa magra (${num(metasDieta.ptn_animal_g, 0)} g) · gordura ${curto(dieta.config.gord_gkg)} g/kg (${num(metasDieta.gord_g, 0)} g) · carboidrato fecha a conta.${baseMetas}`,
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
        ...(seguido && seguido.respondidos ? [['Dieta seguida', `${textoPlanoSeguido(seguido).replace('Plano seguido: ', '')} · ${textoDietaSemana(seguido)}`] as [string, string]] : []),
      ],
      ritmo: ritmo
        ? `Ritmo atual: ${ritmo.faixa === 'ganho' ? 'peso subindo' : `${num(ritmo.pct, 2)}% do peso por semana`} (${sinal(tend!.kg_semana, 2, ' kg')}/sem, tendência de ${tend!.pontos} ${pesagens} nas últimas 4 semanas). Para quem treina, 0,5 a 1% por semana preserva melhor a massa magra.`
        : 'Ritmo de perda: aparece com 3 pesagens em 2 semanas.',
      grafico: {
        pesos: serie.map((p) => ({ dia: dia(p.data), kg: p.peso_kg })),
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
            secoes: montarSecoesFotos(fotos, composicoes, perfil?.sexo === 'Feminino').map((sec) => ({
              ...sec,
              imgAntes: imagens.get(chaveSlot({ sessao: 'antes', pose: sec.pose })) ?? null,
              imgDepois: imagens.get(chaveSlot({ sessao: 'depois', pose: sec.pose })) ?? null,
            })),
            nota: `Números da medição mais próxima da data de cada foto (até 7 dias). Variação: Depois menos Antes. Fotos registradas pelo próprio paciente.`,
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

  return (
    <div className="pilha relatorio">
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
              {semFotos ? (
                <>
                  Adicione as fotos em <Link to="/medidas">Medidas</Link>.
                </>
              ) : (
                'Uma página com as fotos e os números de cada uma. Desmarque para compartilhar sem as fotos.'
              )}
            </small>
          </span>
        </label>
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
      <div className="so-impressao">
        <h1>Relatório do ciclo · {perfil?.nome}</h1>
        <p>Gerado em {formatarData(hoje)}. Dados registrados pelo próprio paciente no app Ciclo.</p>
      </div>

      <section className="cartao">
        <h2>Resumo do ciclo</h2>
        <div className="grade grade-4">
          <Bloco rotulo="Início" valor={formatarData(geral.inicio_ciclo)} />
          <Bloco rotulo="Tempo de ciclo" valor={`${num(geral.semanas_ciclo, 1)} semanas`} />
          <Bloco rotulo="Aplicações" valor={`${resumo.aplicacoes_realizadas} · ${pct(resumo.percentual_usado, 0)} do frasco`} />
          <Bloco rotulo="Fase atual" valor={faseAtual} />
          <Bloco rotulo="Cintura" valor={dif('cintura_cm') === null ? cm(ini?.cintura_cm) : sinal(dif('cintura_cm'), 1, ' cm')} classe={corVariacao(dif('cintura_cm'), true, MDC.cintura_cm)} />
          <Bloco rotulo="Massa gorda" valor={dif('massa_gorda_kg') === null ? kg(ini?.massa_gorda_kg) : sinal(dif('massa_gorda_kg'), 1, ' kg')} classe={corVariacao(dif('massa_gorda_kg'), true, MDC.massa_gorda_kg)} />
          <Bloco rotulo="Massa magra" valor={dif('massa_magra_kg') === null ? kg(ini?.massa_magra_kg) : sinal(dif('massa_magra_kg'), 1, ' kg')} classe={corVariacao(dif('massa_magra_kg'), false, MDC.massa_magra_kg)} />
          <Bloco
            rotulo={`Peso${geral.variacao_percentual !== null ? ` (${sinal(geral.variacao_percentual * 100, 1, '%')})` : ''}`}
            valor={sinal(geral.variacao_kg, 1, ' kg')}
            classe={corVariacao(geral.variacao_kg, true, MDC.peso_kg)}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <LinhaQualidade q={qualidade} />
        </div>
        <div className="alerta info" style={{ marginTop: 10, display: 'block' }}>
          {ritmo ? (
            <>
              <b>Ritmo atual:</b>{' '}
              <span className={COR_FAIXA[ritmo.faixa]}>
                {ritmo.faixa === 'ganho' ? 'peso subindo' : `${num(ritmo.pct, 2)}% do peso por semana`}
              </span>{' '}
              ({sinal(tend!.kg_semana, 2, ' kg')}/sem, tendência de {tend!.pontos} {pesagens} nas últimas 4 semanas). Para quem treina, 0,5 a 1% por semana
              preserva melhor a massa magra.
            </>
          ) : (
            'Com 3 pesagens em 2 semanas, aparece o ritmo de perda em % do peso por semana.'
          )}
        </div>
      </section>

      <section className="cartao">
        <h2>Peso × dose</h2>
        {serie.length > 0 || resumo.linhas.length > 0 ? (
          <Suspense fallback={<div className="grafico" />}>
            <GraficoPesoDose serie={serie} linhas={resumo.linhas} hoje={hoje} fimDose={fimRemedio && fimRemedio < hoje ? fimRemedio : undefined} marcos={marcosDasDecisoes(registroDecisoes)} />
          </Suspense>
        ) : (
          <Vazio>Registre pesos no Diário ou nas Medidas para ver o gráfico.</Vazio>
        )}
      </section>

      <section className="cartao">
        <h2>Medidas: início × agora</h2>
        {ini ? (
          <>
            <Comparacao ini={ini} atu={atu} />
            {!atu && <p className="mudo" style={{ marginTop: 8 }}>Faça uma nova medição para comparar com a inicial.</p>}
          </>
        ) : (
          <Vazio>
            Nenhuma medição registrada. <Link to="/medidas">Registrar medidas</Link>
          </Vazio>
        )}
      </section>

      <section className="cartao">
        <h2>Composição por fase</h2>
        {fases.length === 0 ? (
          <Vazio>Os resultados aparecem depois da primeira aplicação.</Vazio>
        ) : (
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
                {fases.map((f, i) => {
                  const c = compFases[i];
                  return (
                    <tr key={f.indice}>
                      <td>{rotuloBloco(f)}</td>
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
        )}
        {fases.length > 0 && (
          <p className="mudo" style={{ marginTop: 8 }}>
            Cada linha é um bloco de doses seguidas iguais, rotulado pela dose realmente aplicada. Última medição até o início do bloco (ou a primeira dentro
            dele) × última antes do bloco seguinte. % magra e gordura/sem.: regressão com todas as medições do bloco (3 ou mais cobrindo 14 dias); % magra =
            parte da perda de peso que saiu de massa magra (acima de 25% fica em destaque). Medições atípicas ficam de fora.
            {treino && ' Uma fase com pouca perda e baixa aderência ao treino pede ajuste de rotina, não necessariamente de dose.'}
            {temSono && ' Sono: média das noites registradas na fase (4 ou mais); é associação, não causa.'}
          </p>
        )}
      </section>

      {(sono7.noites > 0 || agua.dias > 0 || temUrina) && (
        <section className="cartao">
          <h2>Sono e hidratação</h2>
          <div className="grade">
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
          <p className="mudo" style={{ marginTop: 8 }}>
            Sono: média só com 4 noites ou mais registradas; 7 h ou mais é o recomendado para adultos. Água: dias com registro nos últimos 7; meta de
            partida de 2 L de bebidas por dia{treino ? ' + 0,7 L por hora de treino e cardio' : ''}. Beber muito além da meta não ajuda.
          </p>
        </section>
      )}

      <section className="cartao">
        <h2>Peso e náusea por fase</h2>
        {fases.length === 0 ? (
          <Vazio>Os resultados aparecem depois da primeira aplicação.</Vazio>
        ) : (
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
                {fases.map((f, i) => (
                  <tr key={f.indice}>
                    <td>
                      {rotuloBloco(f)} {f.em_andamento && <span className="etiqueta bom">atual</span>}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
        {fases.length > 0 && (
          <p className="mudo" style={{ marginTop: 8 }}>
            kg/sem.: regressão com todas as pesagens da fase e a de referência (até 7 dias antes), com 3 ou mais pontos cobrindo 14 dias. A comparação
            entre fases usa a diferença mínima detectável (1,96 × o erro das duas retas): abaixo dela, “parecida”. Fases seguidas também mudam tempo de
            dieta, aderência e época do ano; a diferença entre elas não prova efeito da dose.
          </p>
        )}
      </section>

      <section className="cartao">
        <h2>Náusea por dia depois da dose</h2>
        {sintomas.every((s) => s.nausea_por_dia.every((n) => n === null)) && !temSintomas ? (
          <Vazio>Registre a náusea no Diário (0 a 3) para ver em que dia depois da dose ela aparece.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Fase</th>
                  {['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6'].map((d) => (
                    <th key={d}>{d}</th>
                  ))}
                  {temSintomas && <th>Vômito</th>}
                  {temSintomas && <th>Diarreia</th>}
                  {temSintomas && <th>Intest. preso</th>}
                </tr>
              </thead>
              <tbody>
                {sintomas.map((s, i) => (
                  <tr key={s.indice}>
                    <td>{rotuloBloco(fases[i])}</td>
                    {s.nausea_por_dia.map((n, d) => (
                      <td key={d} className={n !== null && n >= 2 ? 'ruim' : undefined}>
                        {n === null ? '–' : num(n, 1)}
                      </td>
                    ))}
                    {temSintomas && <td>{s.vomito === null ? '–' : pct(s.vomito, 0)}</td>}
                    {temSintomas && <td>{s.diarreia === null ? '–' : pct(s.diarreia, 0)}</td>}
                    {temSintomas && <td>{s.intestino_preso === null ? '–' : pct(s.intestino_preso, 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mudo" style={{ marginTop: 8 }}>
          D0 = dia da dose. Náusea média (0 a 3). Vômito, diarreia e intestino preso: % dos dias registrados no Diário naquela fase (dia sem marcar conta como "não teve"). Use para decidir, com seu médico, se sobe de dose ou repete
          a fase.
        </p>
      </section>

      <section className="cartao">
        <h2>Aplicações</h2>
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

      {decisoes.length > 0 && (
        <section className="cartao">
          <h2>Fim de fase: decisões e anotações</h2>
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

      <ListaDecisoes />

      {metasDieta && dieta && (
        <section className="cartao">
          <h2>Plano alimentar</h2>
          <p className="texto-2">
            Meta {num(metasDieta.meta_kcal, 0)} kcal/dia (gasto estimado {num(metasDieta.gasto_total, 0)} kcal; basal Katch-McArdle {num(metasDieta.tmb, 0)}{' '}
            kcal) · proteína animal {curto(dieta.config.ptn_gkg)} g/kg de massa magra ({num(metasDieta.ptn_animal_g, 0)} g) · gordura{' '}
            {curto(dieta.config.gord_gkg)} g/kg ({num(metasDieta.gord_g, 0)} g) · carboidrato fecha a conta.{baseMetas}
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
          {refeicoes.length > 0 && (
            <div className="tabela-rolagem" style={{ marginTop: 8 }}>
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
          )}
        </section>
      )}

      {blocosTreino.length > 0 && (
        <section className="cartao pilha">
          <h2>Treino</h2>
          {blocosTreino.map((b) => (
            <div key={b.rotulo} className="pilha" style={{ gap: 6 }}>
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

      <p className="mudo so-impressao">Este relatório registra e calcula; as decisões de dose são tomadas com acompanhamento médico.</p>
    </div>
  );
}
