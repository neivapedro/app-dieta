import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useTreino } from '../dados/useTreino';
import { ritmoPercentual, tendenciaMedidas } from '../lib/conferencia';
import { diferencaDias, formatarData, somarDias } from '../lib/datas';
import { cm, corVariacao, kg, mg, num, pp, sinal } from '../lib/formato';
import { Folha } from './ui';

const FAIXA = { lento: 'abaixo de 0,5%', ideal: 'na faixa de 0,5 a 1%', rapido: 'acima de 1%: atenção à massa magra', ganho: 'subindo' } as const;

/** Aberto ao salvar a medição: como foi a semana, tudo numa tela só. */
export function ResumoSemana({ aoFechar }: { aoFechar: () => void }) {
  const { aplicacoes, treinos, diario } = useDados();
  const { composicoes, resumo } = useCalculos();
  const treino = useTreino();
  const atual = composicoes[composicoes.length - 1];
  const ant = composicoes[composicoes.length - 2];
  if (!atual) return null;
  const tend = tendenciaMedidas(composicoes, 28);
  const inicio = resumo?.linhas[0]?.aplicacao.data ?? composicoes[0].data;
  const semana = Math.max(Math.floor(diferencaDias(inicio, atual.data) / 7) + 1, 1);
  // Semana que esta medição fecha: os 7 dias antes dela
  const de = somarDias(atual.data, -7);
  const ate = somarDias(atual.data, -1);
  const naSemana = <T extends { data: string }>(l: T[]) => l.filter((x) => x.data >= de && x.data <= ate);
  const doses = naSemana(aplicacoes);
  const dias = naSemana(treinos);
  const planoDieta = naSemana(diario).filter((r) => r.dieta_seguida);

  const linhas: [string, number | null, number | null, (n: number | null | undefined) => string, string, boolean][] = [
    ['Cintura', ant?.cintura_cm ?? null, atual.cintura_cm, cm, ' cm', true],
    ['% de gordura', ant?.bf ?? null, atual.bf, pp, ' p.p.', true],
    ['Massa gorda', ant?.massa_gorda_kg ?? null, atual.massa_gorda_kg, kg, ' kg', true],
    ['Massa magra', ant?.massa_magra_kg ?? null, atual.massa_magra_kg, kg, ' kg', false],
    ['Peso', ant?.peso_kg ?? null, atual.peso_kg, kg, ' kg', true],
  ];

  return (
    <Folha titulo={`Semana ${semana} · ${formatarData(atual.data)}`} aoFechar={aoFechar}>
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
              {linhas.map(([r, a, b, fmt, suf, menor]) => {
                const d = a !== null && b !== null ? b - a : null;
                return (
                  <tr key={r}>
                    <td>{r}</td>
                    <td>{fmt(a)}</td>
                    <td>{fmt(b)}</td>
                    <td className={corVariacao(d, menor)}>{d === null ? '–' : sinal(d, 1, suf)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
              <div className="rotulo">Treino · cardio (7 dias)</div>
              <div className="valor">
                {dias.filter((d) => d.treino).length}/7 · {dias.filter((d) => d.cardio).length}/7
              </div>
            </div>
          )}
          {planoDieta.length > 0 && (
            <div className="bloco">
              <div className="rotulo">Seguiu a dieta</div>
              <div className="valor">
                {planoDieta.filter((r) => r.dieta_seguida === 'sim').length} sim · {planoDieta.filter((r) => r.dieta_seguida === 'parcial').length} em parte
              </div>
            </div>
          )}
        </div>
        <button className="botao primario" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Folha>
  );
}
