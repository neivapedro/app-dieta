import { lazy, Suspense, useState } from 'react';
import { ConferenciaGordura, LinhaQualidade, useQualidade } from '../componentes/composicao';
import { FormMedida } from '../componentes/formularios';
import { ResumoSemana } from '../componentes/ResumoSemana';
import { FormMetas } from '../componentes/treino';
import { SemGrafico, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { formatarData } from '../lib/datas';
import { cm, corVariacao, kg, num, pp, sinal } from '../lib/formato';
import { COR_RCA, faixaRca, ganhos, MDC, rca, TEXTO_RCA, type ChaveMdc } from '../lib/gordura';
import type { Medida } from '../lib/tipos';

const GraficoComposicao = lazy(() => import('../componentes/graficos').then((m) => ({ default: m.GraficoComposicao })).catch(() => ({ default: SemGrafico })));

/** Equivale à aba "% de Gordura" da Planilha Gorgonoidiana. */
export function Medidas() {
  const { medidas, perfil } = useDados();
  const { composicoes, geral } = useCalculos();
  const qualidade = useQualidade();
  const [editando, setEditando] = useState<Medida | null>(null);
  const [nova, setNova] = useState(false);
  const [pedirMetas, setPedirMetas] = useState(false);
  const [resumoAberto, setResumoAberto] = useState<string | null>(null);

  // "Agora" = última medição normal (a mesma do Início e da Análise); a atípica fica só no histórico
  const ultimaDeTodas = composicoes[composicoes.length - 1];
  const normais = composicoes.filter((c) => !c.atipica);
  const atual = normais.length ? normais[normais.length - 1] : ultimaDeTodas;
  const anterior = normais.length >= 2 ? normais[normais.length - 2] : undefined;
  // "total" desde a medição de referência do início do ciclo (a mesma do Início e da Análise)
  const ref = geral.medida_inicial;
  const g = ref && atual && atual.data > ref.data ? ganhos(ref, atual) : null;
  const ultimo = anterior && atual ? ganhos(anterior, atual) : null;
  const ordenadas = [...medidas].sort((a, b) => a.data.localeCompare(b.data));
  const feminino = perfil?.sexo === 'Feminino';
  const altura = perfil?.altura_cm ?? null;
  const alturaDe = (m: Medida) => altura ?? m.altura_cm;

  // Medidas antes do peso; embaixo de cada número: variação na semana (vs anterior) e desde o início do ciclo.
  // Variação menor que a mínima mudança detectável fica neutra (dentro do erro da fita e da balança).
  type Tile = { rotulo: string; atual: string; semana: number | null | undefined; ganho: number | null | undefined; fmt: (n: number) => string; menorMelhor: boolean; chave: ChaveMdc };
  const tiles: Tile[] = [
    { rotulo: 'Cintura', atual: cm(atual?.cintura_cm), semana: ultimo?.cintura_cm, ganho: g?.cintura_cm, fmt: (n) => sinal(n, 1, ' cm'), menorMelhor: true, chave: 'cintura_cm' },
    { rotulo: '% de gordura', atual: pp(atual?.bf), semana: ultimo?.bf, ganho: g?.bf, fmt: (n) => sinal(n, 1, ' p.p.'), menorMelhor: true, chave: 'bf' },
    { rotulo: 'Massa gorda', atual: kg(atual?.massa_gorda_kg), semana: ultimo?.massa_gorda_kg, ganho: g?.massa_gorda_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: true, chave: 'massa_gorda_kg' },
    { rotulo: 'Massa magra', atual: kg(atual?.massa_magra_kg), semana: ultimo?.massa_magra_kg, ganho: g?.massa_magra_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: false, chave: 'massa_magra_kg' },
    { rotulo: 'Peso', atual: kg(atual?.peso_kg), semana: ultimo?.peso_kg, ganho: g?.peso_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: true, chave: 'peso_kg' },
  ];
  const medAtual = atual ? ordenadas.find((m) => m.data === atual.data) : undefined;
  const rcaAtual = atual && medAtual ? rca(atual.cintura_cm, alturaDe(medAtual)) : null;

  return (
    <div className="pilha">
      <section className="cartao">
        <div className="cartao-cab">
          <h2>Composição corporal</h2>
          <button className="botao pequeno primario" onClick={() => setNova(true)}>Nova medição</button>
        </div>
        {atual ? (
          <>
            {ultimaDeTodas.atipica && (
              <p className="texto-2" style={{ marginBottom: 8 }}>
                <span className="etiqueta aviso">atípica</span> A medição de {formatarData(ultimaDeTodas.data)} foi marcada como atípica: fica no histórico,
                fora destes números, das tendências e das projeções.
              </p>
            )}
            <div className="grade grade-4">
              {tiles.map((t) => (
                <div className="bloco" key={t.rotulo}>
                  <div className="rotulo">{t.rotulo}</div>
                  <div className="valor">{t.atual}</div>
                  {t.semana !== null && t.semana !== undefined && (
                    <div
                      className={`numero ${t.chave === 'peso_kg' && qualidade?.aviso ? '' : corVariacao(t.semana, t.menorMelhor, MDC[t.chave])}`}
                      style={{ fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      {t.fmt(t.semana)} <span className="texto-2" style={{ fontWeight: 500, fontSize: '0.72rem' }}>últ.</span>
                    </div>
                  )}
                  {t.ganho !== null && t.ganho !== undefined && (
                    <div className={`numero ${corVariacao(t.ganho, t.menorMelhor, MDC[t.chave])}`} style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      {t.fmt(t.ganho)} <span className="texto-2" style={{ fontWeight: 500, fontSize: '0.72rem' }}>total</span>
                    </div>
                  )}
                </div>
              ))}
              {rcaAtual !== null && medAtual && (
                <div className="bloco">
                  <div className="rotulo">Cintura/altura</div>
                  <div className={`valor ${COR_RCA[faixaRca(rcaAtual)]}`}>{num(rcaAtual, 2)}</div>
                  <div className="texto-2" style={{ fontSize: '0.72rem' }}>{TEXTO_RCA[faixaRca(rcaAtual)]}</div>
                </div>
              )}
            </div>
            <p className="mudo" style={{ marginTop: 8 }}>
              {g && ref ? `“últ.” = desde a medição anterior; “total” = desde o início do ciclo (${formatarData(ref.data)}).` : 'Registre outra medição para ver os ganhos.'}{' '}
              Cor só quando a variação passa do erro da fita e da balança (cintura 2,2 cm, massa magra 2,3 kg, massa gorda e % de gordura 1,5, peso
              1,1 kg); abaixo disso, fica neutra. Cintura/altura: abaixo de 0,50 é saudável; 0,50 a 0,59, adiposidade central aumentada; 0,60 ou
              mais, alta (medida no umbigo). Método da Marinha dos EUA (fita métrica).
            </p>
            <div style={{ marginTop: 10 }}>
              <LinhaQualidade q={qualidade} />
            </div>
            <ConferenciaGordura c={atual} />
            <button className="botao pequeno bloco-largo" style={{ marginTop: 10 }} onClick={() => setResumoAberto(ultimaDeTodas.data)}>
              Resumo da semana
            </button>
          </>
        ) : (
          <Vazio>Nenhuma medição ainda. Registre altura, pescoço, cintura{feminino ? ', quadril' : ''} e peso para calcular a % de gordura.</Vazio>
        )}
      </section>

      {composicoes.length > 0 && (
        <section className="cartao">
          <h2>Evolução</h2>
          <Suspense fallback={<div className="grafico" />}>
            <GraficoComposicao dados={composicoes} />
          </Suspense>
        </section>
      )}

      {ordenadas.length > 0 && (
        <section className="cartao">
          <h2>Histórico</h2>
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
                {[...composicoes].reverse().map((c, i) => {
                  const m = ordenadas[ordenadas.length - 1 - i];
                  const prev = composicoes[composicoes.length - 2 - i];
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
                      <td className={r === null ? undefined : COR_RCA[faixaRca(r)]}>{num(r, 2)}</td>
                      <td className={corVariacao(dc, true, MDC.cintura_cm)}>{dc === null ? '–' : sinal(dc, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mudo" style={{ marginTop: 8 }}>
            Toque numa linha para editar. Altura do Perfil{altura ? ` (${cm(altura)})` : ''}: corrigir lá corrige todo o histórico.
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
