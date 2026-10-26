import '../estilos/medidas.css';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConferenciaGordura, PainelQualidade, useQualidade } from '../componentes/composicao';
import { FormMedida } from '../componentes/formularios';
import { CartaoFotos } from '../componentes/fotos';
import { Kpi, Pilulas } from '../componentes/painel';
import { ResumoSemana } from '../componentes/ResumoSemana';
import { FormMetas } from '../componentes/treino';
import { SemGrafico, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { formatarData } from '../lib/datas';
import { cm, corVariacao, kg, num, pp, sinal } from '../lib/formato';
import { COR_RCA, faixaRca, ganhos, MDC, rca, rcaExibida, TEXTO_RCA, type ChaveMdc, type Composicao } from '../lib/gordura';
import { historicoComAnterior } from '../lib/medidas-comparar';
import { serieMetrica, type ChavePainel } from '../lib/painel';
import { marcosDasDecisoes } from '../lib/registroDecisoes';
import type { Medida } from '../lib/tipos';

const GraficoComposicao = lazy(() => import('../componentes/graficos').then((m) => ({ default: m.GraficoComposicao })).catch(() => ({ default: SemGrafico })));
const GraficoMetrica = lazy(() => import('../componentes/graficos').then((m) => ({ default: m.GraficoMetrica })).catch(() => ({ default: SemGrafico })));

const OPCOES_GRAFICO: [ChavePainel, string][] = [
  ['cintura_cm', 'Cintura'],
  ['peso_kg', 'Peso'],
  ['bf', '% gordura'],
  ['massa_gorda_kg', 'Gorda'],
  ['massa_magra_kg', 'Magra'],
];
// Medições que o histórico mostra antes de "Mostrar todas"
const HISTORICO_CURTO = 5;

/** Equivale à aba "% de Gordura" da Planilha Gorgonoidiana. */
export function Medidas() {
  const { medidas, perfil, registroDecisoes } = useDados();
  const { composicoes, geral } = useCalculos();
  const qualidade = useQualidade();
  const [editando, setEditando] = useState<Medida | null>(null);
  const [nova, setNova] = useState(false);
  const [pedirMetas, setPedirMetas] = useState(false);
  const [resumoAberto, setResumoAberto] = useState<string | null>(null);
  const [metrica, setMetrica] = useState<ChavePainel>('cintura_cm');
  const [juntos, setJuntos] = useState(false);
  const [todas, setTodas] = useState(false);

  // "Agora" = última medição normal (a mesma do Início e da Análise); a atípica fica só no histórico
  const ultimaDeTodas = composicoes[composicoes.length - 1];
  const normais = composicoes.filter((c) => !c.atipica);
  const atual = normais.length ? normais[normais.length - 1] : ultimaDeTodas;
  const anterior = normais.length >= 2 ? normais[normais.length - 2] : undefined;
  // "total" desde a medição de referência do início do ciclo (a mesma do Início e da Análise)
  // Sem medição antes desta no início do ciclo (ciclo sem data ou ainda não começado): desde a 1ª normal
  const doCiclo = geral.medida_inicial && atual && geral.medida_inicial.data < atual.data ? geral.medida_inicial : null;
  const ref = doCiclo ?? (normais.length >= 2 ? normais[0] : null);
  const g = ref && atual && atual.data > ref.data ? ganhos(ref, atual) : null;
  const ultimo = anterior && atual ? ganhos(anterior, atual) : null;
  const ordenadas = [...medidas].sort((a, b) => a.data.localeCompare(b.data));
  const feminino = perfil?.sexo === 'Feminino';
  const altura = perfil?.altura_cm ?? null;
  const alturaDe = (m: Medida) => altura ?? m.altura_cm;
  // Linha dos indicadores: as últimas 10 medições normais
  const ultimosValores = (k: ChavePainel) => serieMetrica(composicoes, k).slice(-10).map((x) => x.valor);

  // Medidas antes do peso; embaixo de cada número: variação desde a anterior ("últ.") e desde o início do ciclo ("total").
  // Variação menor que a mínima mudança detectável fica neutra (dentro do erro da fita e da balança).
  type Tile = { rotulo: string; atual: string; semana: number | null | undefined; ganho: number | null | undefined; fmt: (n: number) => string; menorMelhor: boolean; chave: ChaveMdc & ChavePainel };
  const tiles: Tile[] = [
    { rotulo: 'Cintura', atual: cm(atual?.cintura_cm), semana: ultimo?.cintura_cm, ganho: g?.cintura_cm, fmt: (n) => sinal(n, 1, ' cm'), menorMelhor: true, chave: 'cintura_cm' },
    { rotulo: '% de gordura', atual: pp(atual?.bf), semana: ultimo?.bf, ganho: g?.bf, fmt: (n) => sinal(n, 1, ' p.p.'), menorMelhor: true, chave: 'bf' },
    { rotulo: 'Massa gorda', atual: kg(atual?.massa_gorda_kg), semana: ultimo?.massa_gorda_kg, ganho: g?.massa_gorda_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: true, chave: 'massa_gorda_kg' },
    { rotulo: 'Massa magra', atual: kg(atual?.massa_magra_kg), semana: ultimo?.massa_magra_kg, ganho: g?.massa_magra_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: false, chave: 'massa_magra_kg' },
    { rotulo: 'Peso', atual: kg(atual?.peso_kg), semana: ultimo?.peso_kg, ganho: g?.peso_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: true, chave: 'peso_kg' },
  ];
  const medAtual = atual ? ordenadas.find((m) => m.data === atual.data) : undefined;
  const rcaAtual = atual && medAtual ? rca(atual.cintura_cm, alturaDe(medAtual)) : null;
  // Linha da cintura/altura: mesma altura usada no número (a do Perfil, ou a de cada medição)
  const serieRca = composicoes
    .map((c, i) => (c.atipica ? null : rca(c.cintura_cm, ordenadas[i] ? alturaDe(ordenadas[i]) : null)))
    .filter((r): r is number => r !== null)
    .slice(-10);

  const temDelta = (n: number | null | undefined): n is number => n !== null && n !== undefined;

  // Gráfico de uma medida (as normais), com início e meta do projeto
  const metas = perfil?.metas_projeto ?? null;
  const metaGorda = metas?.peso_kg && metas?.bf ? (metas.peso_kg * metas.bf) / 100 : null;
  const metaMagra = metas?.peso_kg && metas?.bf ? metas.peso_kg * (1 - metas.bf / 100) : null;
  const INFO: Record<ChavePainel, { nome: string; unidade: string; meta: number | null | undefined }> = {
    cintura_cm: { nome: 'Cintura', unidade: ' cm', meta: metas?.cintura_cm },
    peso_kg: { nome: 'Peso', unidade: ' kg', meta: metas?.peso_kg },
    bf: { nome: '% de gordura', unidade: '%', meta: metas?.bf },
    massa_gorda_kg: { nome: 'Massa gorda', unidade: ' kg', meta: metaGorda },
    massa_magra_kg: { nome: 'Massa magra', unidade: ' kg', meta: metaMagra },
  };
  const pontos = serieMetrica(composicoes, metrica);

  // Histórico: mais recente primeiro, com a medição normal anterior (Δ); a atípica fica sem Δ
  const historico = historicoComAnterior(composicoes);
  const visiveis = todas ? historico : historico.slice(0, HISTORICO_CURTO);
  const delta = (c: Composicao, a: Composicao | null, k: 'cintura_cm' | 'peso_kg' | 'bf') => {
    const v = c[k];
    const b = a?.[k];
    return v !== null && b !== null && b !== undefined ? v - b : null;
  };

  return (
    <div className="pilha">
      <section className="cartao hero med-hero">
        <div className="sobretitulo">Composição corporal</div>
        <div className="hero-titulo">{atual ? `Medição de ${formatarData(atual.data, true)}` : 'Nenhuma medição ainda'}</div>
        <div className="hero-sub">
          {atual
            ? `${composicoes.length} ${composicoes.length === 1 ? 'medição' : 'medições'} · fita métrica (US Navy)`
            : `Registre altura, pescoço, cintura${feminino ? ', quadril' : ''} e peso para calcular a % de gordura.`}
        </div>
        {atual && ultimaDeTodas.atipica && (
          <p className="med-atipica">
            <span className="etiqueta aviso">atípica</span>{' '}
            {atual === ultimaDeTodas
              ? `A medição de ${formatarData(ultimaDeTodas.data)} foi marcada como atípica, mas é a única: os números abaixo vêm dela até você registrar uma medição normal.`
              : `A medição de ${formatarData(ultimaDeTodas.data)} foi marcada como atípica: fica no histórico, fora destes números, das tendências e das projeções.`}
          </p>
        )}
        <div className="med-acoes">
          <button className="botao primario med-nova" onClick={() => setNova(true)}>
            <span aria-hidden="true" className="med-mais">
              +
            </span>
            Nova medição
          </button>
          {atual && (
            <button className="botao" onClick={() => setResumoAberto(ultimaDeTodas.data)}>
              Resumo da semana
            </button>
          )}
        </div>
      </section>

      {atual && (
        <>
          <div className="secao-sub med-kpis-sub">
            {g && ref ? `Agora · últ. = desde a anterior · total = desde ${doCiclo ? 'o início do ciclo' : 'a 1ª'} (${formatarData(ref.data, true).slice(0, 5)})` : 'Registre outra medição para ver os ganhos.'}
          </div>
          <div className="kpis med-kpis">
            {tiles.map((t) => {
              const corSemana = t.chave === 'peso_kg' && qualidade?.aviso ? '' : corVariacao(t.semana, t.menorMelhor, MDC[t.chave]);
              const corTotal = corVariacao(t.ganho, t.menorMelhor, MDC[t.chave]);
              const comVariacao = temDelta(t.semana) || temDelta(t.ganho);
              return (
                <Kpi
                  key={t.rotulo}
                  rotulo={t.rotulo}
                  valor={t.atual}
                  classe={corTotal}
                  valores={ultimosValores(t.chave)}
                  variacao={
                    comVariacao ? (
                      <span className="med-deltas">
                        {temDelta(t.semana) && (
                          <span className={`med-delta ${corSemana}`}>
                            {t.fmt(t.semana)} <small>últ.</small>
                          </span>
                        )}
                        {temDelta(t.ganho) && (
                          <span className={`med-delta ${corTotal}`}>
                            {t.fmt(t.ganho)} <small>total</small>
                          </span>
                        )}
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
            {rcaAtual !== null && medAtual && (
              <Kpi
                rotulo="Cintura/altura"
                valor={<span className={COR_RCA[faixaRca(rcaAtual)]}>{num(rcaExibida(rcaAtual), 2)}</span>}
                variacao={<span className="med-delta">{TEXTO_RCA[faixaRca(rcaAtual)]}</span>}
                valores={serieRca}
              />
            )}
          </div>
          <details className="tabela-detalhe med-como-ler">
            <summary>Como ler</summary>
            <div className="pilha mudo" style={{ gap: 6 }}>
              <p>
                {g && ref
                  ? `“últ.” = desde a medição anterior; “total” = desde ${doCiclo ? 'o início do ciclo' : 'a 1ª'} (${formatarData(ref.data)}). `
                  : 'Registre outra medição para ver os ganhos. '}
                A linha embaixo de cada número mostra as últimas medições normais.
              </p>
              <p>
                Cor só quando a variação passa do erro da fita e da balança (cintura 2,2 cm, massa magra 2,3 kg, massa gorda e % de gordura 1,5, peso 1,1
                kg); abaixo disso, fica neutra. Verde: melhorou; vermelho: piorou.
              </p>
              <p>
                Cintura/altura: abaixo de 0,50 é saudável; 0,50 a 0,59, adiposidade central aumentada; 0,60 ou mais, alta (medida no umbigo). Método da
                Marinha dos EUA (fita métrica).
              </p>
            </div>
          </details>

          <section className="cartao">
            <div className="secao-cab">
              <div>
                <h2>Qualidade da perda</h2>
                <div className="secao-sub">Quanto da perda foi gordura e quanto foi massa magra</div>
              </div>
            </div>
            <PainelQualidade q={qualidade} />
            <ConferenciaGordura c={atual} />
          </section>
        </>
      )}

      <CartaoFotos />

      {composicoes.length > 0 && (
        <section className="cartao">
          <div className="secao-cab">
            <h2>Evolução</h2>
            <div className="pilulas-rolagem">
              <Pilulas rotulo="Medida do gráfico" opcoes={OPCOES_GRAFICO} valor={metrica} aoMudar={setMetrica} />
            </div>
          </div>
          {pontos.length >= 2 ? (
            <Suspense fallback={<div className="grafico" style={{ height: 210 }} />}>
              <GraficoMetrica pontos={pontos} nome={INFO[metrica].nome} unidade={INFO[metrica].unidade} meta={INFO[metrica].meta} inicio={ref?.[metrica] ?? null} />
            </Suspense>
          ) : (
            <Vazio>Com 2 medições, aparece a evolução de {INFO[metrica].nome.toLowerCase()}.</Vazio>
          )}
          <div className="med-rodape">
            <span className="mudo">Medições normais · linhas: início e meta</span>
            <Link to="/analise?aba=corpo" className="botao pequeno">
              Ver análise completa
            </Link>
          </div>
          <details className="tabela-detalhe" onToggle={(e) => setJuntos(e.currentTarget.open)}>
            <summary>Gráfico combinado</summary>
            {juntos && (
              <Suspense fallback={<div className="grafico" />}>
                <GraficoComposicao dados={composicoes} marcos={marcosDasDecisoes(registroDecisoes)} />
              </Suspense>
            )}
            <p className="mudo" style={{ margin: '6px 0 0', fontSize: '0.78rem' }}>
              % de gordura, massa magra e peso juntos, com as medições atípicas (ponto vazio) e as decisões do ciclo.
            </p>
          </details>
        </section>
      )}

      {ordenadas.length > 0 && (
        <section className="cartao">
          <div className="secao-cab">
            <div>
              <h2>Histórico</h2>
              <div className="secao-sub">
                {ordenadas.length} {ordenadas.length === 1 ? 'medição' : 'medições'} · toque para editar
              </div>
            </div>
          </div>
          <div className="med-hist">
            {visiveis.map(({ item: c, indice, anterior: a }) => {
              const m = ordenadas[indice];
              const valores: { rotulo: string; valor: string; d: number | null; fmt: (n: number) => string; chave: 'cintura_cm' | 'peso_kg' | 'bf' }[] = [
                { rotulo: 'Cintura', valor: cm(c.cintura_cm), d: delta(c, a, 'cintura_cm'), fmt: (n) => sinal(n, 1, ' cm'), chave: 'cintura_cm' },
                { rotulo: 'Peso', valor: kg(c.peso_kg), d: delta(c, a, 'peso_kg'), fmt: (n) => sinal(n, 1, ' kg'), chave: 'peso_kg' },
                { rotulo: '% gordura', valor: pp(c.bf), d: delta(c, a, 'bf'), fmt: (n) => sinal(n, 1, ' p.p.'), chave: 'bf' },
              ];
              return (
                <button key={m.id} type="button" className="med-hist-item" onClick={() => setEditando(m)} aria-label={`Editar a medição de ${formatarData(c.data)}`}>
                  <span className="med-hist-cab">
                    <b className="numero">{formatarData(c.data, true)}</b>
                    {c.atipica && <span className="etiqueta aviso">atípica</span>}
                    <span className="med-hist-seta" aria-hidden="true">
                      ›
                    </span>
                  </span>
                  <span className="med-hist-valores">
                    {valores.map((v) => (
                      <span key={v.rotulo} className="med-hist-valor">
                        <span className="med-hist-rotulo">{v.rotulo}</span>
                        <span className="numero med-hist-num">{v.valor}</span>
                        {v.d !== null ? (
                          <span className={`med-chip numero ${corVariacao(v.d, true, MDC[v.chave])}`}>{v.fmt(v.d)}</span>
                        ) : (
                          <span className="med-chip vazio">{c.atipica ? '–' : '1ª'}</span>
                        )}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {historico.length > HISTORICO_CURTO && (
            <button type="button" className="botao pequeno bloco-largo" style={{ marginTop: 10 }} onClick={() => setTodas((t) => !t)}>
              {todas ? 'Mostrar só as recentes' : `Mostrar todas (${historico.length})`}
            </button>
          )}
          <details className="tabela-detalhe">
            <summary>Ver tabela</summary>
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Pescoço</th>
                    <th>Cintura</th>
                    {feminino && <th>Quadril</th>}
                    <th>Peso</th>
                    <th>% gordura</th>
                    <th>Massa magra</th>
                    <th>Massa gorda</th>
                    <th>Cint./alt.</th>
                    <th>Δ cintura</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map(({ item: c, indice, anterior: prev }) => {
                    const m = ordenadas[indice];
                    // Δ contra a última medição normal anterior; na atípica, sem Δ (fica fora das comparações)
                    const dc = prev ? c.cintura_cm - prev.cintura_cm : null;
                    const r = rca(c.cintura_cm, alturaDe(m));
                    return (
                      <tr key={m.id} className="item-acao" onClick={() => setEditando(m)}>
                        <td>
                          {formatarData(c.data, true)}
                          {c.atipica && <div className="sub-valor aviso-txt">atípica</div>}
                        </td>
                        <td>{cm(c.pescoco_cm)}</td>
                        <td>{cm(c.cintura_cm)}</td>
                        {feminino && <td>{cm(c.quadril_cm)}</td>}
                        <td>{kg(c.peso_kg)}</td>
                        <td>{pp(c.bf)}</td>
                        <td>{kg(c.massa_magra_kg)}</td>
                        <td>{kg(c.massa_gorda_kg)}</td>
                        <td className={r === null ? undefined : COR_RCA[faixaRca(r)]}>{r === null ? num(r, 2) : num(rcaExibida(r), 2)}</td>
                        <td className={corVariacao(dc, true, MDC.cintura_cm)}>{dc === null ? '–' : sinal(dc, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
          <p className="mudo" style={{ marginTop: 8 }}>
            Altura do Perfil{altura ? ` (${cm(altura)})` : ''}: corrigir lá corrige todo o histórico.
          </p>
        </section>
      )}

      {nova && (
        <FormMedida
          aoFechar={() => setNova(false)}
          aoSalvar={(data) => {
            // Metas só na 1ª medição; nas outras (ou se adiou as metas) abre o resumo da semana
            if (perfil?.modulo_treino && !perfil.metas_projeto && medidas.length === 0) setPedirMetas(true);
            else setResumoAberto(data);
          }}
        />
      )}
      {resumoAberto && <ResumoSemana data={resumoAberto} aoFechar={() => setResumoAberto(null)} />}
      {pedirMetas && <FormMetas primeiraVez base={composicoes[composicoes.length - 1] ?? null} aoFechar={() => setPedirMetas(false)} />}
      {editando && <FormMedida medida={editando} aoFechar={() => setEditando(null)} />}
    </div>
  );
}
