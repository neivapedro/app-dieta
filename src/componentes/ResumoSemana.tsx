import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useTreino } from '../dados/useTreino';
import { ritmoPercentual, tendenciaMedidas } from '../lib/conferencia';
import { diferencaDias, formatarData, somarDias } from '../lib/datas';
import { cm, corVariacao, kg, mg, num, pp, sinal } from '../lib/formato';
import { MDC, type ChaveMdc } from '../lib/gordura';
import { diasCurtos, dietaNoPeriodo, efeitosNoPeriodo, faltasNoPeriodo, sugestaoSemana, textoDietaSemana, type TipoSugestao } from '../lib/semana';
import { LinhaQualidade, useQualidade } from './composicao';
import { Folha } from './ui';

const FAIXA = { lento: 'abaixo de 0,5%', ideal: 'na faixa de 0,5 a 1%', rapido: 'acima de 1%: atenção à massa magra', ganho: 'subindo' } as const;

const COR_SUGESTAO: Record<TipoSugestao, string> = { sem_dados: 'info', seguir_plano: '', reduzir: '', aumentar: 'info', manter: 'info' };

/** Aberto ao salvar a medição: como foi a semana, tudo numa tela só. */
export function ResumoSemana({ data, aoFechar }: { data?: string; aoFechar: () => void }) {
  const { aplicacoes, treinos, diario, ciclo, dieta } = useDados();
  const { composicoes, resumo } = useCalculos();
  const treino = useTreino();
  // A medição que acabou de ser salva (pode ser retroativa), comparada com a anterior a ela
  const i = data ? composicoes.findIndex((c) => c.data === data) : composicoes.length - 1;
  const idx = i >= 0 ? i : composicoes.length - 1;
  const atual = composicoes[idx];
  const qualidade = useQualidade(atual?.data);
  // Comparada com a última medição normal antes dela (a atípica fica fora da comparação)
  const ant = [...composicoes.slice(0, idx)].reverse().find((c) => !c.atipica);
  if (!atual) return null;
  const tend = tendenciaMedidas(composicoes.slice(0, idx + 1), 42);
  const inicio = resumo?.linhas[0]?.aplicacao.data ?? ciclo?.data_inicio ?? composicoes[0].data;
  const antesDoCiclo = atual.data < inicio;
  const semana = Math.max(Math.floor(diferencaDias(inicio, atual.data) / 7) + 1, 1);
  // Semana que esta medição fecha: os 7 dias antes dela
  const de = somarDias(atual.data, -7);
  const ate = somarDias(atual.data, -1);
  const naSemana = <T extends { data: string }>(l: T[]) => l.filter((x) => x.data >= de && x.data <= ate);
  const doses = naSemana(aplicacoes);
  const dias = naSemana(treinos);
  // Dias da semana que já eram do projeto (antes do início não contam como falta)
  const diasProjeto = treino ? Math.max(0, Math.min(7, diferencaDias(treino.inicio > de ? treino.inicio : de, ate) + 1)) : 7;
  const faltas = treino ? faltasNoPeriodo(treinos, de, ate, treino.inicio, treino.fim) : null;
  const planoDieta = dietaNoPeriodo(diario, de, ate);
  const usaDieta = planoDieta.respondidos > 0 || !!dieta?.refeicoes.some((r) => r.itens.length);
  const efeitos = efeitosNoPeriodo(diario, de, ate);
  const sugestao = sugestaoSemana(tend, atual.peso_kg, diario);

  const linhas: [string, number | null, number | null, (n: number | null | undefined) => string, string, boolean, ChaveMdc][] = [
    ['Cintura', ant?.cintura_cm ?? null, atual.cintura_cm, cm, ' cm', true, 'cintura_cm'],
    ['% de gordura', ant?.bf ?? null, atual.bf, pp, ' p.p.', true, 'bf'],
    ['Massa gorda', ant?.massa_gorda_kg ?? null, atual.massa_gorda_kg, kg, ' kg', true, 'massa_gorda_kg'],
    ['Massa magra', ant?.massa_magra_kg ?? null, atual.massa_magra_kg, kg, ' kg', false, 'massa_magra_kg'],
    ['Peso', ant?.peso_kg ?? null, atual.peso_kg, kg, ' kg', true, 'peso_kg'],
  ];

  return (
    <Folha titulo={antesDoCiclo ? `Medição · ${formatarData(atual.data)}` : `Semana ${semana} · ${formatarData(atual.data)}`} aoFechar={aoFechar}>
      <div className="pilha">
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>{ant ? formatarData(ant.data, true) : 'Anterior'}</th>
                <th>Agora</th>
                <th>Semana</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(([r, a, b, fmt, suf, menor, chave]) => {
                const d = a !== null && b !== null ? b - a : null;
                return (
                  <tr key={r}>
                    <td>{r}</td>
                    <td>{fmt(a)}</td>
                    <td>{fmt(b)}</td>
                    <td className={chave === 'peso_kg' && qualidade?.aviso ? '' : corVariacao(d, menor, MDC[chave])}>{d === null ? '–' : sinal(d, 1, suf)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {atual.atipica && (
          <p className="texto-2">
            <span className="etiqueta aviso">atípica</span> Esta medição fica no histórico, mas fora de tendências e projeções.
          </p>
        )}
        <p className="mudo">
          Variação menor que o erro da fita e da balança fica sem cor.{qualidade?.aviso ? ' Com a qualidade da perda em aviso, o peso também fica sem cor.' : ''}
        </p>
        <LinhaQualidade q={qualidade} />
        {tend ? (
          <div className="alerta info" style={{ display: 'block' }}>
            <b>Tendência das últimas {tend.medicoes} medições</b> (para não se enganar com o ruído da fita): cintura {sinal(tend.cintura_semana, 1, ' cm')}
            /sem, massa gorda {sinal(tend.gorda_semana, 2, ' kg')}/sem, massa magra {sinal(tend.magra_semana, 2, ' kg')}/sem. Peso{' '}
            {num(ritmoPercentual(tend.peso_semana, atual.peso_kg).pct, 2)}% por semana, {FAIXA[ritmoPercentual(tend.peso_semana, atual.peso_kg).faixa]}.
          </div>
        ) : (
          <p className="texto-2">Com 4 medições, aparece a tendência das últimas semanas.</p>
        )}
        <div className="grade">
          <div className="bloco">
            <div className="rotulo">Doses na semana</div>
            <div className="valor">{doses.length ? doses.map((d) => mg(d.dose_mg)).join(' · ') : '–'}</div>
          </div>
          {treino && (
            <div className="bloco">
              <div className="rotulo">Treino · cardio ({diasProjeto} dias)</div>
              <div className="valor">
                {dias.filter((d) => d.treino).length}/{diasProjeto} · {dias.filter((d) => d.cardio).length}/{diasProjeto}
              </div>
            </div>
          )}
        </div>
        {usaDieta && (
          <div className="bloco">
            <div className="rotulo">Seguiu a dieta</div>
            <div className="valor" style={{ fontSize: '0.95rem' }}>{textoDietaSemana(planoDieta)}</div>
          </div>
        )}
        {faltas && faltas.dias > 0 && (
          <p className="texto-2">
            {faltas.treino.length === 0 && faltas.cardio.length === 0 ? (
              'Treino e cardio feitos em todos os dias da semana.'
            ) : (
              <>
                {faltas.treino.length > 0 && (
                  <>
                    Faltou treino: <b>{diasCurtos(faltas.treino)}</b>.{' '}
                  </>
                )}
                {faltas.cardio.length > 0 && (
                  <>
                    Faltou cardio: <b>{diasCurtos(faltas.cardio)}</b>.
                  </>
                )}
              </>
            )}
          </p>
        )}
        <div>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 6 }}>Efeitos na semana</h3>
          {efeitos.registros === 0 ? (
            <p className="texto-2">Sem registros no Diário nestes 7 dias.</p>
          ) : (
            <div className="grade">
              <div className="bloco">
                <div className="rotulo">Náusea média · máx.</div>
                <div className="valor">
                  {efeitos.nausea_media === null ? '–' : `${num(efeitos.nausea_media, 1)} · ${efeitos.nausea_max}`}
                </div>
              </div>
              <div className="bloco">
                <div className="rotulo">Dias com vômito</div>
                <div className={`valor ${efeitos.vomito ? 'aviso-txt' : ''}`}>{efeitos.vomito}</div>
              </div>
              <div className="bloco">
                <div className="rotulo">Intestino preso</div>
                <div className="valor">{efeitos.intestino_preso} {efeitos.intestino_preso === 1 ? 'dia' : 'dias'}</div>
              </div>
              <div className="bloco">
                <div className="rotulo">Diarreia</div>
                <div className="valor">{efeitos.diarreia} {efeitos.diarreia === 1 ? 'dia' : 'dias'}</div>
              </div>
            </div>
          )}
          {efeitos.registros > 0 && (
            <p className="mudo" style={{ marginTop: 6 }}>
              {efeitos.registros} de 7 dias com registro no Diário. Náusea de 0 (nenhuma) a 3 (forte).
            </p>
          )}
        </div>
        <div className={`alerta ${COR_SUGESTAO[sugestao.tipo]}`} style={{ display: 'block' }}>
          <b>Sugestão da semana:</b> {sugestao.texto}
          <div className="texto-2" style={{ marginTop: 4 }}>{sugestao.motivo}</div>
          {(sugestao.tipo === 'reduzir' || sugestao.tipo === 'aumentar') && (
            <div className="linha entre" style={{ marginTop: 8 }}>
              <span className="texto-2 cresce">Quem decide e ajusta a meta é você, na aba Dieta.</span>
              <Link to="/dieta" className="botao pequeno" onClick={aoFechar}>
                Abrir Dieta
              </Link>
            </div>
          )}
          <details className="ajuda" style={{ marginTop: 6 }}>
            <summary>Como a sugestão é escolhida</summary>
            <div className="pilha mudo">
              <p>
                Só com a tendência das medidas e com “Segui o plano?” respondido em 80% ou mais dos dias da mesma janela. Depois, nesta ordem:
              </p>
              <p>1. Plano seguido em menos de 80% (sim = 1, em parte = ½) → siga o plano antes de mexer no déficit.</p>
              <p>2. Ritmo acima de 1% do peso por semana com a massa magra caindo → considere reduzir o déficit.</p>
              <p>3. Ritmo abaixo de 0,5% por semana, seguindo bem o plano → considere aumentar o déficit.</p>
              <p>4. Fora isso → manter.</p>
              <p>É só uma sugestão: nada muda sozinho. A meta de kcal e a dose ficam com você (e o médico).</p>
            </div>
          </details>
        </div>
        <button className="botao primario" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Folha>
  );
}
