import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Bloco, Vazio } from '../componentes/ui';
import { useCalculos } from '../dados/useCalculos';
import { formatarData } from '../lib/datas';
import { cm, corVariacao, kg, num, pct, pp, sinal } from '../lib/formato';
import type { Composicao } from '../lib/gordura';

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
          {linhaComparacao('Peso', ini.peso_kg, v(atu, 'peso_kg'), kg, (n) => sinal(n, 1, ' kg'), true)}
          {linhaComparacao('% de gordura', ini.bf, v(atu, 'bf'), pp, (n) => sinal(n, 1, ' p.p.'), true)}
          {linhaComparacao('Massa magra', ini.massa_magra_kg, v(atu, 'massa_magra_kg'), kg, (n) => sinal(n, 1, ' kg'), false)}
          {linhaComparacao('Massa gorda', ini.massa_gorda_kg, v(atu, 'massa_gorda_kg'), kg, (n) => sinal(n, 1, ' kg'), true)}
          {linhaComparacao('Cintura', ini.cintura_cm, v(atu, 'cintura_cm'), cm, (n) => sinal(n, 1, ' cm'), true)}
          {linhaComparacao('Pescoço', ini.pescoco_cm, v(atu, 'pescoco_cm'), cm, (n) => sinal(n, 1, ' cm'), true)}
          {ini.quadril_cm !== null && linhaComparacao('Quadril', ini.quadril_cm, v(atu, 'quadril_cm'), cm, (n) => sinal(n, 1, ' cm'), true)}
        </tbody>
      </table>
    </div>
  );
}

export function Analise() {
  const { resumo, geral, fases, serie, hoje } = useCalculos();
  if (!resumo) return null;

  return (
    <div className="pilha">
      <section className="cartao">
        <h2>Resumo do ciclo</h2>
        <div className="grade grade-4">
          <Bloco rotulo="Início" valor={formatarData(geral.inicio_ciclo)} />
          <Bloco rotulo="Tempo de ciclo" valor={`${num(geral.semanas_ciclo, 1)} semanas`} />
          <Bloco rotulo="Aplicações" valor={`${resumo.aplicacoes_realizadas} · ${pct(resumo.percentual_usado, 0)} do frasco`} />
          <Bloco rotulo="Fase atual" valor={resumo.proxima ? `${resumo.proxima.fase.indice + 1} · ${resumo.proxima.fase.fase.nome}` : 'Concluído'} />
          <Bloco rotulo="Peso inicial" valor={kg(geral.peso_inicial?.peso_kg)} />
          <Bloco rotulo="Peso atual" valor={kg(geral.peso_atual?.peso_kg)} />
          <Bloco rotulo={`Variação${geral.variacao_percentual !== null ? ` (${sinal(geral.variacao_percentual * 100, 1, '%')})` : ''}`} valor={sinal(geral.variacao_kg, 1, ' kg')} classe={corVariacao(geral.variacao_kg, true)} />
          <Bloco rotulo="Média por semana" valor={geral.kg_por_semana === null ? '–' : sinal(geral.kg_por_semana, 2, ' kg')} classe={corVariacao(geral.kg_por_semana, true)} />
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
        {geral.medida_inicial ? (
          <>
            <Comparacao ini={geral.medida_inicial} atu={geral.medida_atual} />
            {!geral.medida_atual && <p className="mudo" style={{ marginTop: 8 }}>Faça uma nova medição para comparar com a inicial.</p>}
          </>
        ) : (
          <Vazio>
            Nenhuma medição registrada. <Link to="/medidas">Registrar medidas</Link>
          </Vazio>
        )}
      </section>

      <section className="cartao">
        <h2>Resultado por fase</h2>
        {fases.length === 0 ? (
          <Vazio>Os resultados aparecem depois da primeira aplicação.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Fase</th>
                  <th>Dose</th>
                  <th>Doses</th>
                  <th>Período</th>
                  <th>Peso início → fim</th>
                  <th>Variação</th>
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
                    <td>{num(f.dose_mg)} mg</td>
                    <td>{f.doses}</td>
                    <td>
                      {formatarData(f.inicio, true)} – {f.fim === hoje ? 'hoje' : formatarData(f.fim, true)}
                    </td>
                    <td>
                      {num(f.peso_inicio, 1)} → {num(f.peso_fim, 1)}
                    </td>
                    <td className={corVariacao(f.variacao_kg, true)}>{sinal(f.variacao_kg, 1, ' kg')}</td>
                    <td className={corVariacao(f.kg_por_semana, true)}>{sinal(f.kg_por_semana, 2)}</td>
                    <td>
                      {num(f.nausea_media, 1)} / {f.nausea_max ?? '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mudo" style={{ marginTop: 8 }}>
          Peso do Diário e das Medidas. Use a náusea por fase para decidir, com seu médico, se sobe de dose ou repete a fase.
        </p>
      </section>
    </div>
  );
}
