import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LinhaQualidade, useQualidade } from '../componentes/composicao';
import { Bloco, SemGrafico, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useTreino } from '../dados/useTreino';
import { composicaoPorFase, sintomasPorFase } from '../lib/analise';
import { ritmoPercentual, tendenciaPeso, textoQualidade } from '../lib/conferencia';
import { diferencaDias, formatarData } from '../lib/datas';
import type { ModeloRelatorio } from '../lib/relatorioPdf';
import { calcularMetas, macrosDaRefeicao } from '../lib/dieta';
import { cm, corVariacao, kg, mg, num, pct, pp, sinal } from '../lib/formato';
import { MDC, type ChaveMdc, type Composicao } from '../lib/gordura';
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
  const { perfil, diario, treinos, dieta } = useDados();
  const { resumo, geral, fases, serie, hoje, composicoes } = useCalculos();
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
  const [msgPdf, setMsgPdf] = useState<{ tipo: string; texto: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const qualidade = useQualidade();
  if (!resumo) return null;

  const datasAplic = resumo.linhas.map((l) => l.aplicacao.data);
  const compFases = composicaoPorFase(fases, composicoes, treino ? treinos : null, hoje);
  const sintomas = sintomasPorFase(fases, datasAplic, diario, hoje);
  const temSintomas = sintomas.some((s) => s.vomito !== null || s.diarreia !== null || s.intestino_preso !== null);
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
  const ultimaComp = [...composicoes].reverse().find((c) => c.massa_magra_kg !== null);
  const metasDieta = dieta && ultimaComp ? calcularMetas(dieta.config, { peso_kg: ultimaComp.peso_kg, massa_magra_kg: ultimaComp.massa_magra_kg! }, treino ? aderenciaRecente(treinos, treino.inicio, hoje, 28, treino.fim) : null) : null;
  const refeicoes = dieta && banco ? dieta.refeicoes.filter((r) => r.itens.length).map((r) => ({ r, m: macrosDaRefeicao(r, banco.mapa) })) : [];

  function montarModelo(): ModeloRelatorio {
    const dia = (d: string) => diferencaDias('1970-01-01', d);
    const rotulo = (n: number) => {
      const d = new Date(n * 86400000);
      return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const tabelas: ModeloRelatorio['tabelas'] = [];
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
    tabelas.push({
      titulo: 'Composição por fase',
      cabecalho: ['Fase', 'Cintura', 'Massa gorda', 'Massa magra', 'Gordura/sem.', ...(treino ? ['Treino', 'Cardio'] : [])],
      linhas: fases.map((f, i) => {
        const c = compFases[i];
        return [
          `${f.indice + 1} · ${num(f.dose_mg)} mg`,
          sinal(c.cintura, 1, ' cm'),
          sinal(c.gorda, 1, ' kg'),
          sinal(c.magra, 1, ' kg'),
          sinal(c.gorda_semana, 2),
          ...(treino ? [c.treino === null ? '–' : pct(c.treino, 0), c.cardio === null ? '–' : pct(c.cardio, 0)] : []),
        ];
      }),
      nota: 'Última medição até o início da fase x última antes da fase seguinte.',
    });
    tabelas.push({
      titulo: 'Peso e náusea por fase',
      cabecalho: ['Fase', 'Doses', 'Período', 'Peso início -> fim', 'kg/sem.', 'Náusea méd./máx.'],
      linhas: fases.map((f) => [
        `${f.indice + 1} · ${f.nome}${f.em_andamento ? ' (atual)' : ''}`,
        `${f.doses} x ${num(f.dose_mg)} mg`,
        `${formatarData(f.inicio, true)} – ${f.fim === hoje ? 'hoje' : formatarData(f.fim, true)}`,
        `${num(f.peso_inicio, 1)} -> ${num(f.peso_fim, 1)}`,
        f.poucos_dados ? 'poucos dados' : sinal(f.kg_por_semana, 2),
        `${num(f.nausea_media, 1)} / ${f.nausea_max ?? '–'}`,
      ]),
    });
    if (!sintomas.every((x) => x.nausea_por_dia.every((n) => n === null)) || temSintomas) {
      tabelas.push({
        titulo: 'Náusea por dia depois da dose',
        cabecalho: ['Fase', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', ...(temSintomas ? ['Vômito', 'Diarreia', 'Intest. preso'] : [])],
        linhas: sintomas.map((x) => [
          String(x.indice + 1),
          ...x.nausea_por_dia.map((n) => (n === null ? '–' : num(n, 1))),
          ...(temSintomas
            ? [x.vomito, x.diarreia, x.intestino_preso].map((t) => (t === null ? '–' : pct(t, 0)))
            : []),
        ]),
        nota: 'D0 = dia da dose. Náusea média (0 a 3). Sintomas: % dos dias registrados no Diário na fase.',
      });
    }
    tabelas.push({
      titulo: 'Aplicações',
      cabecalho: ['Nº', 'Data', 'Dose', 'Fase', 'Atraso', 'Local'],
      linhas: resumo!.linhas.map((l) => [
        String(l.numero),
        formatarData(l.aplicacao.data, true),
        mg(l.aplicacao.dose_mg),
        String(l.fase.indice + 1),
        l.atraso_dias === 0 ? '–' : `${l.atraso_dias > 0 ? '+' : ''}${l.atraso_dias} d`,
        l.aplicacao.local ?? '–',
      ]),
    });
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
        )} kcal) · proteína animal ${num(dieta.config.ptn_gkg, 1)} g/kg de massa magra (${num(metasDieta.ptn_animal_g, 0)} g) · gordura ${num(
          dieta.config.gord_gkg,
          1,
        )} g/kg (${num(metasDieta.gord_g, 0)} g) · carboidrato fecha a conta.`,
      });
    }
    if (treino && treino.placar.iniciado) {
      tabelas.push({
        titulo: 'Treino',
        cabecalho: ['Treinos', 'Cardios', 'Corridas', 'Melhor pace'],
        linhas: [
          [
            `${treino.placar.treino.feito} de ${treino.placar.treino.meta} · ${pct(treino.placar.treino.aderencia, 0)}`,
            `${treino.placar.cardio.feito} de ${treino.placar.cardio.meta} · ${pct(treino.placar.cardio.aderencia, 0)}`,
            `${treino.placar.corrida.feito} · ${num(treino.placar.corrida.km, 1)} km`,
            treino.corridas.length ? `${formatarTempo(Math.min(...treino.corridas.map((c) => c.pace)))} /km` : '–',
          ],
        ],
      });
    }
    return {
      titulo: `Relatório do ciclo · ${perfil?.nome ?? ''}`,
      subtitulo: `Gerado em ${formatarData(hoje)}. Dados registrados pelo próprio paciente no app Ciclo.`,
      resumo: [
        ['Início', formatarData(geral.inicio_ciclo)],
        ['Tempo de ciclo', `${num(geral.semanas_ciclo, 1)} semanas`],
        ['Aplicações', `${resumo!.aplicacoes_realizadas} · ${pct(resumo!.percentual_usado, 0)} do frasco`],
        ['Fase atual', resumo!.proxima ? `${resumo!.proxima.fase.indice + 1} · ${resumo!.proxima.fase.fase.nome}` : 'Concluído'],
        ['Cintura', dif('cintura_cm') === null ? cm(ini?.cintura_cm) : sinal(dif('cintura_cm'), 1, ' cm')],
        ['Massa gorda', dif('massa_gorda_kg') === null ? kg(ini?.massa_gorda_kg) : sinal(dif('massa_gorda_kg'), 1, ' kg')],
        ['Massa magra', dif('massa_magra_kg') === null ? kg(ini?.massa_magra_kg) : sinal(dif('massa_magra_kg'), 1, ' kg')],
        ['Peso', `${sinal(geral.variacao_kg, 1, ' kg')}${geral.variacao_percentual !== null ? ` (${sinal(geral.variacao_percentual * 100, 1, '%')})` : ''}`],
        ...(qualidade ? [['Qualidade da perda', `${textoQualidade(qualidade)} (últimas ${qualidade.medicoes} medições)`] as [string, string]] : []),
      ],
      ritmo: ritmo
        ? `Ritmo atual: ${ritmo.faixa === 'ganho' ? 'peso subindo' : `${num(ritmo.pct, 2)}% do peso por semana`} (${sinal(tend!.kg_semana, 2, ' kg')}/sem, tendência de ${tend!.pontos} ${pesagens} nas últimas 4 semanas). Para quem treina, 0,5 a 1% por semana preserva melhor a massa magra.`
        : 'Ritmo de perda: aparece com 3 pesagens em 2 semanas.',
      grafico: {
        pesos: serie.map((p) => ({ dia: dia(p.data), kg: p.peso_kg })),
        doses: resumo!.linhas.map((l) => ({ dia: dia(l.aplicacao.data), mg: l.aplicacao.dose_mg })),
        diaFinal: dia(hoje),
        rotulo,
      },
      tabelas,
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
      const blob = mod.gerarRelatorioPdf(montarModelo());
      const arquivo = new File([blob], `relatorio-ciclo-${hoje}.pdf`, { type: 'application/pdf' });
      setPdf(arquivo);
      await compartilhar(arquivo);
    } catch (e) {
      gerador.current = null;
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
          <Bloco rotulo="Fase atual" valor={resumo.proxima ? `${resumo.proxima.fase.indice + 1} · ${resumo.proxima.fase.fase.nome}` : 'Concluído'} />
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
            <GraficoPesoDose serie={serie} linhas={resumo.linhas} hoje={hoje} />
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
                  {treino && <th>Treino</th>}
                  {treino && <th>Cardio</th>}
                </tr>
              </thead>
              <tbody>
                {fases.map((f, i) => {
                  const c = compFases[i];
                  return (
                    <tr key={f.indice}>
                      <td>
                        {f.indice + 1} · {num(f.dose_mg)} mg
                      </td>
                      <td className={corVariacao(c.cintura, true, MDC.cintura_cm)}>{sinal(c.cintura, 1, ' cm')}</td>
                      <td className={corVariacao(c.gorda, true, MDC.massa_gorda_kg)}>{sinal(c.gorda, 1, ' kg')}</td>
                      <td className={corVariacao(c.magra, false, MDC.massa_magra_kg)}>{sinal(c.magra, 1, ' kg')}</td>
                      <td className={c.magra_pct !== null && c.magra_pct > 0.25 ? 'aviso-txt' : undefined}>
                        {c.magra_pct === null ? (c.poucos_dados && c.de ? <span className="texto-2">poucos dados</span> : '–') : pct(Math.max(c.magra_pct, 0), 0)}
                      </td>
                      <td className={c.gorda_semana === null ? undefined : corVariacao(c.gorda_semana, true)}>
                        {c.gorda_semana === null ? (c.poucos_dados && c.de ? <span className="texto-2">poucos dados</span> : '–') : sinal(c.gorda_semana, 2)}
                      </td>
                      {treino && <td>{c.treino === null ? '–' : pct(c.treino, 0)}</td>}
                      {treino && <td>{c.cardio === null ? '–' : pct(c.cardio, 0)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mudo" style={{ marginTop: 8 }}>
          Última medição até o início da fase (ou a primeira dentro dela) × última antes da fase seguinte. % magra e gordura/sem.: regressão com todas as
          medições da fase (3 ou mais cobrindo 14 dias); % magra = parte da perda de peso que saiu de massa magra (acima de 25% fica em destaque). Medições
          atípicas ficam de fora.
          {treino && ' Uma fase com pouca perda e baixa aderência ao treino pede ajuste de rotina, não necessariamente de dose.'}
        </p>
      </section>

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
                      {f.indice + 1} · {f.nome} {f.em_andamento && <span className="etiqueta bom">atual</span>}
                    </td>
                    <td>
                      {f.doses} × {num(f.dose_mg)} mg
                    </td>
                    <td>
                      {formatarData(f.inicio, true)} – {f.fim === hoje ? 'hoje' : formatarData(f.fim, true)}
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
                {sintomas.map((s) => (
                  <tr key={s.indice}>
                    <td>{s.indice + 1}</td>
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
                    <td>{l.fase.indice + 1}</td>
                    <td className={l.atraso_dias > 0 ? 'aviso-txt' : undefined}>{l.atraso_dias === 0 ? '–' : `${l.atraso_dias > 0 ? '+' : ''}${l.atraso_dias} d`}</td>
                    <td>{l.aplicacao.local ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {metasDieta && dieta && (
        <section className="cartao">
          <h2>Plano alimentar</h2>
          <p className="texto-2">
            Meta {num(metasDieta.meta_kcal, 0)} kcal/dia (gasto estimado {num(metasDieta.gasto_total, 0)} kcal; basal Katch-McArdle {num(metasDieta.tmb, 0)}{' '}
            kcal) · proteína animal {num(dieta.config.ptn_gkg, 1)} g/kg de massa magra ({num(metasDieta.ptn_animal_g, 0)} g) · gordura{' '}
            {num(dieta.config.gord_gkg, 1)} g/kg ({num(metasDieta.gord_g, 0)} g) · carboidrato fecha a conta.
          </p>
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

      {treino && treino.placar.iniciado && (
        <section className="cartao">
          <h2>Treino</h2>
          <div className="grade grade-4">
            <Bloco rotulo="Treinos" valor={`${treino.placar.treino.feito} de ${treino.placar.treino.meta} · ${pct(treino.placar.treino.aderencia, 0)}`} />
            <Bloco rotulo="Cardios" valor={`${treino.placar.cardio.feito} de ${treino.placar.cardio.meta} · ${pct(treino.placar.cardio.aderencia, 0)}`} />
            <Bloco rotulo="Corridas" valor={`${treino.placar.corrida.feito} · ${num(treino.placar.corrida.km, 1)} km`} />
            <Bloco rotulo="Melhor pace" valor={treino.corridas.length ? `${formatarTempo(Math.min(...treino.corridas.map((c) => c.pace)))} /km` : '–'} />
          </div>
        </section>
      )}

      <p className="mudo so-impressao">Este relatório registra e calcula; as decisões de dose são tomadas com acompanhamento médico.</p>
    </div>
  );
}
