import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Bloco, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useTreino } from '../dados/useTreino';
import { composicaoPorFase, sintomasPorFase } from '../lib/analise';
import { ritmoPercentual, tendenciaPeso } from '../lib/conferencia';
import { formatarData } from '../lib/datas';
import { calcularMetas, macrosDaRefeicao } from '../lib/dieta';
import { cm, corVariacao, kg, mg, num, pct, pp, sinal } from '../lib/formato';
import type { Composicao } from '../lib/gordura';
import { aderenciaRecente, formatarTempo } from '../lib/treino';

const GraficoPesoDose = lazy(() => import('../componentes/graficos').then((m) => ({ default: m.GraficoPesoDose })));

function linhaComparacao(rotulo: string, a: number | null, b: number | null, fmt: (n: number | null) => string, fmtDelta: (n: number) => string, menorMelhor: boolean) {
  const d = a !== null && b !== null ? b - a : null;
  return (
    <tr key={rotulo}>
      <td>{rotulo}</td>
      <td>{fmt(a)}</td>
      <td>{fmt(b)}</td>
      <td className={corVariacao(d, menorMelhor)}>{d === null ? '–' : fmtDelta(d)}</td>
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
          {linhaComparacao('Cintura', ini.cintura_cm, v(atu, 'cintura_cm'), cm, (n) => sinal(n, 1, ' cm'), true)}
          {linhaComparacao('% de gordura', ini.bf, v(atu, 'bf'), pp, (n) => sinal(n, 1, ' p.p.'), true)}
          {linhaComparacao('Massa gorda', ini.massa_gorda_kg, v(atu, 'massa_gorda_kg'), kg, (n) => sinal(n, 1, ' kg'), true)}
          {linhaComparacao('Massa magra', ini.massa_magra_kg, v(atu, 'massa_magra_kg'), kg, (n) => sinal(n, 1, ' kg'), false)}
          {linhaComparacao('Peso', ini.peso_kg, v(atu, 'peso_kg'), kg, (n) => sinal(n, 1, ' kg'), true)}
          {linhaComparacao('Pescoço', ini.pescoco_cm, v(atu, 'pescoco_cm'), cm, (n) => sinal(n, 1, ' cm'), true)}
          {ini.quadril_cm !== null && linhaComparacao('Quadril', ini.quadril_cm, v(atu, 'quadril_cm'), cm, (n) => sinal(n, 1, ' cm'), true)}
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
  if (!resumo) return null;

  const datasAplic = resumo.linhas.map((l) => l.aplicacao.data);
  const compFases = composicaoPorFase(fases, composicoes, treino ? treinos : null, hoje);
  const sintomas = sintomasPorFase(fases, datasAplic, diario, hoje);
  const temSintomas = sintomas.some((s) => s.vomito !== null || s.diarreia !== null || s.intestino_preso !== null);
  const tend = tendenciaPeso(serie, hoje);
  const pesoAtual = geral.peso_atual?.peso_kg ?? null;
  const ritmo = tend && pesoAtual ? ritmoPercentual(tend.kg_semana, pesoAtual) : null;
  const ini = geral.medida_inicial;
  const atu = geral.medida_atual;
  const dif = (k: 'cintura_cm' | 'massa_gorda_kg' | 'massa_magra_kg') => (ini && atu && ini[k] !== null && atu[k] !== null ? (atu[k] as number) - (ini[k] as number) : null);

  // Plano alimentar (para o relatório)
  const ultimaComp = [...composicoes].reverse().find((c) => c.massa_magra_kg !== null);
  const metasDieta = dieta && ultimaComp ? calcularMetas(dieta.config, { peso_kg: ultimaComp.peso_kg, massa_magra_kg: ultimaComp.massa_magra_kg! }, treino ? aderenciaRecente(treinos, treino.inicio, hoje) : null) : null;
  const refeicoes = dieta && banco ? dieta.refeicoes.filter((r) => r.itens.length).map((r) => ({ r, m: macrosDaRefeicao(r, banco.mapa) })) : [];

  return (
    <div className="pilha relatorio">
      <div className="linha entre nao-imprimir">
        <span className="texto-2">Relatório de uma página para levar ao médico ou nutricionista.</span>
        <button className="botao pequeno" onClick={() => window.print()}>
          Imprimir / PDF
        </button>
      </div>
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
          <Bloco rotulo="Cintura" valor={dif('cintura_cm') === null ? cm(ini?.cintura_cm) : sinal(dif('cintura_cm'), 1, ' cm')} classe={corVariacao(dif('cintura_cm'), true)} />
          <Bloco rotulo="Massa gorda" valor={dif('massa_gorda_kg') === null ? kg(ini?.massa_gorda_kg) : sinal(dif('massa_gorda_kg'), 1, ' kg')} classe={corVariacao(dif('massa_gorda_kg'), true)} />
          <Bloco rotulo="Massa magra" valor={dif('massa_magra_kg') === null ? kg(ini?.massa_magra_kg) : sinal(dif('massa_magra_kg'), 1, ' kg')} classe={corVariacao(dif('massa_magra_kg'), false)} />
          <Bloco
            rotulo={`Peso${geral.variacao_percentual !== null ? ` (${sinal(geral.variacao_percentual * 100, 1, '%')})` : ''}`}
            valor={sinal(geral.variacao_kg, 1, ' kg')}
            classe={corVariacao(geral.variacao_kg, true)}
          />
        </div>
        <div className="alerta info" style={{ marginTop: 10, display: 'block' }}>
          {ritmo ? (
            <>
              <b>Ritmo atual:</b>{' '}
              <span className={COR_FAIXA[ritmo.faixa]}>
                {ritmo.faixa === 'ganho' ? 'peso subindo' : `${num(ritmo.pct, 2)}% do peso por semana`}
              </span>{' '}
              ({sinal(tend!.kg_semana, 2, ' kg')}/sem, tendência de {tend!.pontos} pesagens nas últimas 4 semanas). Para quem treina, 0,5 a 1% por semana
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
                      <td className={corVariacao(c.cintura, true)}>{sinal(c.cintura, 1, ' cm')}</td>
                      <td className={corVariacao(c.gorda, true)}>{sinal(c.gorda, 1, ' kg')}</td>
                      <td className={corVariacao(c.magra, false)}>{sinal(c.magra, 1, ' kg')}</td>
                      <td className={corVariacao(c.gorda_semana, true)}>{sinal(c.gorda_semana, 2)}</td>
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
          Última medição até o início da fase × última antes da fase seguinte. Uma fase com pouca perda e baixa aderência ao treino pede ajuste de rotina,
          não necessariamente de dose.
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
                  <th>Náusea méd. / máx.</th>
                </tr>
              </thead>
              <tbody>
                {fases.map((f) => (
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
                    <td className={corVariacao(f.kg_por_semana, true)}>{f.poucos_dados ? <span className="texto-2">poucos dados</span> : sinal(f.kg_por_semana, 2)}</td>
                    <td>
                      {num(f.nausea_media, 1)} / {f.nausea_max ?? '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cartao">
        <h2>Náusea por dia depois da dose</h2>
        {sintomas.every((s) => s.nausea_por_dia.every((n) => n === null)) ? (
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
          D0 = dia da dose. Náusea média (0 a 3) e % dos dias com o sintoma marcado no Diário. Use para decidir, com seu médico, se sobe de dose ou repete
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
            <Bloco rotulo="Corridas" valor={`${treino.corridas.length} · ${num(treino.placar.corrida.km, 1)} km`} />
            <Bloco rotulo="Melhor pace" valor={treino.corridas.length ? `${formatarTempo(Math.min(...treino.corridas.map((c) => c.pace)))} /km` : '–'} />
          </div>
        </section>
      )}

      <p className="mudo so-impressao">Este relatório registra e calcula; as decisões de dose são tomadas com acompanhamento médico.</p>
    </div>
  );
}
