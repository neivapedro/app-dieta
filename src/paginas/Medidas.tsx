import { lazy, Suspense, useState } from 'react';
import { FormMedida } from '../componentes/formularios';
import { ResumoSemana } from '../componentes/ResumoSemana';
import { FormMetas } from '../componentes/treino';
import { SemGrafico, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { formatarData } from '../lib/datas';
import { cm, corVariacao, kg, pp, sinal } from '../lib/formato';
import { ganhos } from '../lib/gordura';
import type { Medida } from '../lib/tipos';

const GraficoComposicao = lazy(() => import('../componentes/graficos').then((m) => ({ default: m.GraficoComposicao })).catch(() => ({ default: SemGrafico })));

/** Equivale à aba "% de Gordura" da Planilha Gorgonoidiana. */
export function Medidas() {
  const { medidas, perfil } = useDados();
  const { composicoes } = useCalculos();
  const [editando, setEditando] = useState<Medida | null>(null);
  const [nova, setNova] = useState(false);
  const [pedirMetas, setPedirMetas] = useState(false);
  const [resumoAberto, setResumoAberto] = useState<string | null>(null);

  const g = composicoes.length >= 2 ? ganhos(composicoes[0], composicoes[composicoes.length - 1]) : null;
  const atual = composicoes[composicoes.length - 1];
  const anterior = composicoes[composicoes.length - 2];
  const ultimo = anterior && atual ? ganhos(anterior, atual) : null;
  const ordenadas = [...medidas].sort((a, b) => a.data.localeCompare(b.data));
  const feminino = perfil?.sexo === 'Feminino';

  // Medidas antes do peso; embaixo de cada número: variação na semana (vs anterior) e desde a 1ª
  type Tile = { rotulo: string; atual: string; semana: number | null | undefined; ganho: number | null | undefined; fmt: (n: number) => string; menorMelhor: boolean };
  const tiles: Tile[] = [
    { rotulo: 'Cintura', atual: cm(atual?.cintura_cm), semana: ultimo?.cintura_cm, ganho: g?.cintura_cm, fmt: (n) => sinal(n, 1, ' cm'), menorMelhor: true },
    { rotulo: '% de gordura', atual: pp(atual?.bf), semana: ultimo?.bf, ganho: g?.bf, fmt: (n) => sinal(n, 1, ' p.p.'), menorMelhor: true },
    { rotulo: 'Massa gorda', atual: kg(atual?.massa_gorda_kg), semana: ultimo?.massa_gorda_kg, ganho: g?.massa_gorda_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: true },
    { rotulo: 'Massa magra', atual: kg(atual?.massa_magra_kg), semana: ultimo?.massa_magra_kg, ganho: g?.massa_magra_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: false },
    { rotulo: 'Peso', atual: kg(atual?.peso_kg), semana: ultimo?.peso_kg, ganho: g?.peso_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: true },
  ];

  return (
    <div className="pilha">
      <section className="cartao">
        <div className="cartao-cab">
          <h2>Composição corporal</h2>
          <button className="botao pequeno primario" onClick={() => setNova(true)}>Nova medição</button>
        </div>
        {atual ? (
          <>
            <div className="grade grade-4">
              {tiles.map((t) => (
                <div className="bloco" key={t.rotulo}>
                  <div className="rotulo">{t.rotulo}</div>
                  <div className="valor">{t.atual}</div>
                  {t.semana !== null && t.semana !== undefined && (
                    <div className={`numero ${corVariacao(t.semana, t.menorMelhor)}`} style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      {t.fmt(t.semana)} <span className="texto-2" style={{ fontWeight: 500, fontSize: '0.72rem' }}>últ.</span>
                    </div>
                  )}
                  {t.ganho !== null && t.ganho !== undefined && (
                    <div className={`numero ${corVariacao(t.ganho, t.menorMelhor)}`} style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      {t.fmt(t.ganho)} <span className="texto-2" style={{ fontWeight: 500, fontSize: '0.72rem' }}>total</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="mudo" style={{ marginTop: 8 }}>
              {g ? `“últ.” = desde a medição anterior; “total” = desde a 1ª (${formatarData(composicoes[0].data)}).` : 'Registre outra medição para ver os ganhos.'}{' '}
              Método da Marinha dos EUA (fita métrica).
            </p>
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
                  <th>Altura</th>
                  <th>Pescoço</th>
                  <th>Cintura</th>
                  {feminino && <th>Quadril</th>}
                  <th>Peso</th>
                  <th>% gordura</th>
                  <th>Massa magra</th>
                  <th>Massa gorda</th>
                  <th>Δ cintura</th>
                </tr>
              </thead>
              <tbody>
                {[...composicoes].reverse().map((c, i) => {
                  const m = ordenadas[ordenadas.length - 1 - i];
                  const prev = composicoes[composicoes.length - 2 - i];
                  const dc = prev ? c.cintura_cm - prev.cintura_cm : null;
                  return (
                    <tr key={m.id} className="item-acao" onClick={() => setEditando(m)}>
                      <td>{formatarData(c.data, true)}</td>
                      <td>{cm(m.altura_cm)}</td>
                      <td>{cm(c.pescoco_cm)}</td>
                      <td>{cm(c.cintura_cm)}</td>
                      {feminino && <td>{cm(c.quadril_cm)}</td>}
                      <td>{kg(c.peso_kg)}</td>
                      <td>{pp(c.bf)}</td>
                      <td>{kg(c.massa_magra_kg)}</td>
                      <td>{kg(c.massa_gorda_kg)}</td>
                      <td className={corVariacao(dc, true)}>{dc === null ? '–' : sinal(dc, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mudo" style={{ marginTop: 8 }}>Toque numa linha para editar.</p>
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
