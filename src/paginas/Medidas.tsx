import { lazy, Suspense, useState } from 'react';
import { FormMedida } from '../componentes/formularios';
import { Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { formatarData } from '../lib/datas';
import { cm, corVariacao, kg, pp, sinal } from '../lib/formato';
import { ganhos } from '../lib/gordura';
import type { Medida } from '../lib/tipos';

const GraficoComposicao = lazy(() => import('../componentes/graficos').then((m) => ({ default: m.GraficoComposicao })));

/** Equivale à aba "% de Gordura" da Planilha Gorgonoidiana. */
export function Medidas() {
  const { medidas, perfil } = useDados();
  const { composicoes } = useCalculos();
  const [editando, setEditando] = useState<Medida | null>(null);
  const [nova, setNova] = useState(false);

  const g = composicoes.length >= 2 ? ganhos(composicoes[0], composicoes[composicoes.length - 1]) : null;
  const atual = composicoes[composicoes.length - 1];
  const ordenadas = [...medidas].sort((a, b) => a.data.localeCompare(b.data));
  const feminino = perfil?.sexo === 'Feminino';

  const tiles: { rotulo: string; atual: string; ganho: number | null | undefined; fmt: (n: number) => string; menorMelhor: boolean }[] = [
    { rotulo: 'Peso', atual: kg(atual?.peso_kg), ganho: g?.peso_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: true },
    { rotulo: '% de gordura', atual: pp(atual?.bf), ganho: g?.bf, fmt: (n) => sinal(n, 1, ' p.p.'), menorMelhor: true },
    { rotulo: 'Massa magra', atual: kg(atual?.massa_magra_kg), ganho: g?.massa_magra_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: false },
    { rotulo: 'Massa gorda', atual: kg(atual?.massa_gorda_kg), ganho: g?.massa_gorda_kg, fmt: (n) => sinal(n, 1, ' kg'), menorMelhor: true },
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
                  {t.ganho !== null && t.ganho !== undefined && (
                    <div className={`numero ${corVariacao(t.ganho, t.menorMelhor)}`} style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                      {t.fmt(t.ganho)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="mudo" style={{ marginTop: 8 }}>
              {g ? `Ganhos: da 1ª medição (${formatarData(composicoes[0].data)}) até a última.` : 'Registre outra medição para ver os ganhos.'} Método da Marinha dos EUA (fita métrica).
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
                </tr>
              </thead>
              <tbody>
                {[...composicoes].reverse().map((c, i) => {
                  const m = ordenadas[ordenadas.length - 1 - i];
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mudo" style={{ marginTop: 8 }}>Toque numa linha para editar.</p>
        </section>
      )}

      {nova && <FormMedida aoFechar={() => setNova(false)} />}
      {editando && <FormMedida medida={editando} aoFechar={() => setEditando(null)} />}
    </div>
  );
}
