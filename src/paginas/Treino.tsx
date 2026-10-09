import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartaoTreinoHoje, FormDiaTreino, FormMetas } from '../componentes/treino';
import { tendenciaMedidas } from '../lib/conferencia';
import { diferencaDias } from '../lib/datas';
import { Bloco, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useTreino } from '../dados/useTreino';
import { formatarData, somarDias } from '../lib/datas';
import { cm, corVariacao, kg, num, pct, pp, sinal } from '../lib/formato';
import type { Composicao } from '../lib/gordura';
import { formatarTempo, type Contagem } from '../lib/treino';
import type { MetricaSemanal } from '../componentes/graficos';

const GraficoAderencia = lazy(() => import('../componentes/graficos').then((m) => ({ default: m.GraficoAderencia })));
const GraficoPace = lazy(() => import('../componentes/graficos').then((m) => ({ default: m.GraficoPace })));

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function corAderencia(a: number | null): string {
  if (a === null) return '';
  return a >= 0.9 ? 'bom' : a >= 0.7 ? 'aviso-txt' : 'ruim';
}

function LinhaPlacar({ nome, c, extra }: { nome: string; c: Contagem; extra?: string }) {
  return (
    <tr>
      <td>
        {nome}
        {extra && <div className="mudo" style={{ fontSize: '0.75rem' }}>{extra}</div>}
      </td>
      <td>{c.meta}</td>
      <td>{c.feito}</td>
      <td className={corAderencia(c.aderencia)}>{c.aderencia === null ? '–' : pct(c.aderencia, 0)}</td>
      <td>
        {c.projecao} <span className="mudo">/ {c.total}</span>
      </td>
    </tr>
  );
}

type LinhaMedida = { nome: string; chave: keyof Composicao; fmt: (n: number | null | undefined) => string; unidade: string; menorMelhor: boolean; meta: number | null };

export function Treino() {
  const t = useTreino();
  const { perfil } = useDados();
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [metasAbertas, setMetasAbertas] = useState(false);
  const [metrica, setMetrica] = useState<MetricaSemanal>('cintura_cm');
  const [todasSemanas, setTodasSemanas] = useState(false);
  if (!t) return null;
  const { placar: p, hoje, inicial, atual, metas } = t;
  const progresso = p.totalDias ? Math.min(p.diasDecorridos / p.totalDias, 1) : 0;
  const final = p.encerrado;
  const temAtual = atual && inicial && atual.data !== inicial.data;
  const m = metas;
  const metaMagra = m?.peso_kg && m?.bf ? m.peso_kg * (1 - m.bf / 100) : null;
  const metaGorda = m?.peso_kg && m?.bf ? (m.peso_kg * m.bf) / 100 : null;

  const linhas: LinhaMedida[] = [
    { nome: 'Pescoço', chave: 'pescoco_cm', fmt: cm, unidade: ' cm', menorMelhor: true, meta: m?.pescoco_cm ?? null },
    { nome: 'Cintura', chave: 'cintura_cm', fmt: cm, unidade: ' cm', menorMelhor: true, meta: m?.cintura_cm ?? null },
    ...(perfil?.sexo === 'Feminino'
      ? [{ nome: 'Quadril', chave: 'quadril_cm' as const, fmt: cm, unidade: ' cm', menorMelhor: true, meta: m?.quadril_cm ?? null }]
      : []),
    { nome: 'Peso', chave: 'peso_kg', fmt: kg, unidade: ' kg', menorMelhor: true, meta: m?.peso_kg ?? null },
    { nome: '% de gordura', chave: 'bf', fmt: pp, unidade: ' p.p.', menorMelhor: true, meta: m?.bf ?? null },
    { nome: 'Massa magra', chave: 'massa_magra_kg', fmt: kg, unidade: ' kg', menorMelhor: false, meta: metaMagra },
    { nome: 'Massa gorda', chave: 'massa_gorda_kg', fmt: kg, unidade: ' kg', menorMelhor: true, meta: metaGorda },
  ];
  const valor = (c: Composicao | null, k: keyof Composicao) => (c ? (c[k] as number | null) : null);
  // No ritmo das últimas semanas, onde cada medida chega no fim do projeto
  const tend = tendenciaMedidas(t.composicoes, 28);
  const diasAteFim = atual ? Math.max(diferencaDias(atual.data, t.fim), 0) : 0;
  const ritmo: Partial<Record<keyof Composicao, number>> | null =
    tend && atual && !final
      ? {
          cintura_cm: atual.cintura_cm + (tend.cintura_semana / 7) * diasAteFim,
          peso_kg: atual.peso_kg + (tend.peso_semana / 7) * diasAteFim,
          bf: (atual.bf ?? 0) + (tend.bf_semana / 7) * diasAteFim,
          massa_magra_kg: (atual.massa_magra_kg ?? 0) + (tend.magra_semana / 7) * diasAteFim,
          massa_gorda_kg: (atual.massa_gorda_kg ?? 0) + (tend.gorda_semana / 7) * diasAteFim,
        }
      : null;
  // Grade: até a semana que vem; mostra as 6 mais recentes, com opção de ver tudo
  const SEMANAS_VISIVEIS = 6;
  const ateProxima = t.semanas.filter((s) => s.segunda <= somarDias(hoje, 7));
  const semanasGrade = todasSemanas ? t.semanas : ateProxima.slice(-SEMANAS_VISIVEIS);
  const melhorPace = t.corridas.length ? Math.min(...t.corridas.map((c) => c.pace)) : null;

  return (
    <div className="pilha">
      <CartaoTreinoHoje />

      <section className="cartao">
        <div className="cartao-cab">
          <h2>Projeto</h2>
          <span className="mudo">
            {formatarData(p.inicio, true)} → {formatarData(p.fim, true)}
          </span>
        </div>
        <div className="barra" aria-hidden="true">
          <div style={{ width: `${progresso * 100}%` }} />
        </div>
        <div className="grade grade-4" style={{ marginTop: 14 }}>
          <Bloco rotulo="Dias decorridos" valor={`${p.diasDecorridos} de ${p.totalDias}`} />
          <Bloco rotulo="Faltam" valor={`${p.diasRestantes} dias`} />
          <Bloco rotulo="Sequência atual" valor={`🔥 ${p.sequenciaAtual} ${p.sequenciaAtual === 1 ? 'dia' : 'dias'}`} />
          <Bloco rotulo="Recorde" valor={`${p.recorde} ${p.recorde === 1 ? 'dia' : 'dias'}`} />
        </div>
        {!p.iniciado && <p className="mudo" style={{ marginTop: 10 }}>O projeto começa no dia da 1ª aplicação ({formatarData(p.inicio)}).</p>}
      </section>

      <section className="cartao">
        <h2>Placar</h2>
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Meta</th>
                <th>Feito</th>
                <th>%</th>
                <th>Projeção</th>
              </tr>
            </thead>
            <tbody>
              <LinhaPlacar nome="Treinos" c={p.treino} />
              <LinhaPlacar nome="Cardios" c={p.cardio} />
              <LinhaPlacar nome="· Corrida (Qua/Dom)" c={p.corrida} extra={`${num(p.corrida.km, 1)} km corridos`} />
              <LinhaPlacar nome="· Bike (demais dias)" c={p.bike} extra={`${p.bike.minutos} min pedalados`} />
            </tbody>
          </table>
        </div>
        <p className="mudo" style={{ marginTop: 8 }}>
          Meta até hoje: 1 treino e 1 cardio por dia, sem folga (o dia de hoje só conta depois de marcado). Projeção: quantos você terá feito
          no fim do projeto, mantendo a % atual, de um total possível.
        </p>
      </section>

      <section className="cartao">
        <h2>Calendário do projeto</h2>
        <div className="grade-semanas" role="grid">
          {DIAS.map((d) => (
            <div key={d} className="grade-semanas-cab">{d}</div>
          ))}
          {semanasGrade.flatMap((s) =>
            s.dias.map((d) => {
              const fora = d < p.inicio || d > p.fim;
              if (fora) return <div key={d} className="dia-celula fora" />;
              const r = t.doDia(d);
              const estado = (feito: boolean | undefined) => (feito ? 'ok' : d < hoje ? 'falta' : 'futuro');
              return (
                <button key={d} type="button" className={`dia-celula ${d === hoje ? 'hoje' : ''}`} onClick={() => d <= hoje && setDiaAberto(d)} disabled={d > hoje}>
                  <span className="dia-data">{formatarData(d, true).slice(0, 5)}</span>
                  <span className="dia-checks">
                    <span className={`mini ${estado(r?.treino)}`}>T</span>
                    <span className={`mini ${estado(r?.cardio)}`}>C</span>
                  </span>
                </button>
              );
            }),
          )}
        </div>
        {t.semanas.length > semanasGrade.length || todasSemanas ? (
          <button className="botao pequeno bloco-largo" style={{ marginTop: 8 }} onClick={() => setTodasSemanas(!todasSemanas)}>
            {todasSemanas ? 'Mostrar só as semanas recentes' : `Ver todas as semanas do projeto (${t.semanas.length})`}
          </button>
        ) : null}
        <div className="linha mudo" style={{ marginTop: 10, fontSize: '0.8rem', gap: 14 }}>
          <span><span className="mini ok">T</span> feito</span>
          <span><span className="mini falta">T</span> não feito</span>
          <span><span className="mini futuro">T</span> ainda vai chegar</span>
          <span><span className="legenda-hoje" /> hoje</span>
        </div>
        <p className="mudo" style={{ marginTop: 6 }}>T = treino · C = cardio. Toque num dia para marcar ou corrigir.</p>
      </section>

      <section className="cartao">
        <div className="cartao-cab">
          <h2>Medidas: início × {final ? 'final' : 'agora'}</h2>
          {inicial && (
            <button className="botao pequeno" onClick={() => setMetasAbertas(true)}>
              {metas ? 'Editar metas' : 'Definir metas'}
            </button>
          )}
        </div>
        {inicial ? (
          <div className="tabela-rolagem">
            <table className="tabela-medidas">
              <thead>
                <tr>
                  <th></th>
                  <th>Início<div className="mudo" style={{ fontWeight: 400 }}>{formatarData(inicial.data, true)}</div></th>
                  <th>{final ? 'Final' : 'Agora'}<div className="mudo" style={{ fontWeight: 400 }}>{temAtual ? formatarData(atual!.data, true) : '–'}</div></th>
                  <th>Meta<div className="mudo" style={{ fontWeight: 400 }}>falta</div></th>
                  {ritmo && <th>No ritmo<div className="mudo" style={{ fontWeight: 400 }}>no fim</div></th>}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const ini = valor(inicial, l.chave);
                  const agora = temAtual ? valor(atual, l.chave) : null;
                  const dif = ini !== null && agora !== null ? agora - ini : null;
                  const ref = agora ?? ini;
                  const falta = l.meta !== null && ref !== null ? l.meta - ref : null;
                  const atingida = falta !== null && (l.menorMelhor ? falta >= 0 : falta <= 0);
                  return (
                    <tr key={l.nome}>
                      <td>{l.nome}</td>
                      <td>{l.fmt(ini)}</td>
                      <td>
                        {temAtual ? l.fmt(agora) : '–'}
                        {dif !== null && <div className={`sub-valor ${corVariacao(dif, l.menorMelhor)}`}>{sinal(dif, 1, l.unidade)}</div>}
                      </td>
                      <td>
                        {l.meta === null ? '–' : l.fmt(l.meta)}
                        {falta !== null && <div className={`sub-valor ${atingida ? 'bom' : 'mudo'}`}>{atingida ? '✓ atingida' : sinal(falta, 1, l.unidade)}</div>}
                      </td>
                      {ritmo && (
                        <td>
                          {ritmo[l.chave] === undefined ? '–' : l.fmt(ritmo[l.chave])}
                          {ritmo[l.chave] !== undefined && l.meta !== null && (
                            <div className={`sub-valor ${(l.menorMelhor ? ritmo[l.chave]! <= l.meta : ritmo[l.chave]! >= l.meta) ? 'bom' : 'aviso-txt'}`}>
                              {(l.menorMelhor ? ritmo[l.chave]! <= l.meta : ritmo[l.chave]! >= l.meta) ? 'chega' : 'não chega'}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio>
            Registre a 1ª medição do projeto em <Link to="/medidas">Medidas</Link> (segunda-feira, em jejum). Depois de salvar, você define as
            metas do fim do projeto.
          </Vazio>
        )}
      </section>

      <section className="cartao">
        <h2>Aderência × medidas, por semana</h2>
        <div className="escolhas" style={{ marginBottom: 8 }}>
          {(
            [
              ['cintura_cm', 'Cintura'],
              ['bf', 'Gordura'],
              ['massa_magra_kg', 'Magra'],
              ['peso_kg', 'Peso'],
            ] as [MetricaSemanal, string][]
          ).map(([k, r]) => (
            <button key={k} type="button" className={metrica === k ? 'ativo' : ''} onClick={() => setMetrica(k)}>
              {r}
            </button>
          ))}
        </div>
        <Suspense fallback={<div className="grafico" />}>
          <GraficoAderencia semanas={t.semanas.filter((s) => s.segunda <= hoje)} metrica={metrica} />
        </Suspense>
        <p className="mudo" style={{ marginTop: 6 }}>Barras: % de treinos e cardios cumpridos na semana. Linha: medição da segunda-feira seguinte (o resultado daquela semana).</p>
      </section>

      <section className="cartao">
        <h2>Corridas</h2>
        {t.corridas.length === 0 ? (
          <Vazio>Ao marcar a corrida de quarta ou domingo, anote o tempo para acompanhar o pace.</Vazio>
        ) : (
          <>
            <div className="grade grade-3">
              <Bloco rotulo="Último pace" valor={`${formatarTempo(t.corridas.at(-1)!.pace)} /km`} />
              <Bloco rotulo="Melhor pace" valor={`${formatarTempo(melhorPace!)} /km`} />
              <Bloco rotulo="Corridas com tempo" valor={t.corridas.length} />
            </div>
            {t.corridas.length > 1 && (
              <Suspense fallback={<div className="grafico" style={{ height: 200 }} />}>
                <GraficoPace corridas={t.corridas} />
              </Suspense>
            )}
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Distância</th>
                    <th>Tempo</th>
                    <th>Pace</th>
                    <th>vs anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {[...t.corridas].reverse().map((c) => (
                    <tr key={c.data} className="item-acao" onClick={() => setDiaAberto(c.data)}>
                      <td>{formatarData(c.data, true)}</td>
                      <td>{num(c.km, 1)} km</td>
                      <td>{formatarTempo(c.segundos)}</td>
                      <td>{formatarTempo(c.pace)}</td>
                      <td className={c.delta === null ? 'mudo' : c.delta < 0 ? 'bom' : c.delta > 0 ? 'ruim' : ''}>
                        {c.delta === null ? '–' : c.delta === 0 ? 'igual' : `${c.delta < 0 ? '−' : '+'}${formatarTempo(Math.abs(c.delta))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {diaAberto && <FormDiaTreino data={diaAberto} aoFechar={() => setDiaAberto(null)} />}
      {metasAbertas && <FormMetas base={atual ?? inicial} aoFechar={() => setMetasAbertas(false)} />}
    </div>
  );
}
