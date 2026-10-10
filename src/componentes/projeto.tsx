import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useProjeto } from '../dados/useProjeto';
import { useTreino } from '../dados/useTreino';
import { formatarData, somarDias } from '../lib/datas';
import { cm, kg, mg, num, pct, pp, sinal } from '../lib/formato';
import { avisoReganho, linhasBalanco, SEMANAS_POS, SEMANAS_SAIDA, type FasePos } from '../lib/projeto';
import type { DecisaoFase } from '../lib/tipos';
import { formatarTempo, medidaInicial } from '../lib/treino';
import { Bloco } from './ui';

const fmtUnidade = (unidade: string) => (unidade === ' cm' ? cm : unidade === ' p.p.' ? pp : kg);

/** Medidas, treino e doses do período do remédio, com as metas atingidas ou quanto faltou. */
function Balanco() {
  const { perfil } = useDados();
  const { resumo, composicoes, sexo } = useCalculos();
  const proj = useProjeto();
  const t = useTreino();
  if (!resumo || !proj) return null;
  const { periodo } = proj;
  // Medição atípica fica só no histórico: não vira o início nem o resultado
  const normais = composicoes.filter((c) => !c.atipica);
  const inicial = medidaInicial(normais, periodo.inicio);
  const ate = normais.filter((c) => c.data <= periodo.fim);
  const final = ate.length && ate[ate.length - 1].data !== inicial?.data ? ate[ate.length - 1] : null;
  const metas = perfil?.modulo_treino ? perfil.metas_projeto ?? null : null;
  const linhas = linhasBalanco(inicial, final, metas, sexo);
  const placar = t?.projeto.placar;
  const corridas = t ? t.corridas.filter((c) => c.data >= periodo.inicio && c.data <= periodo.fim) : [];
  const melhor = corridas.length ? Math.min(...corridas.map((c) => c.pace)) : null;

  return (
    <div className="pilha" style={{ gap: 10 }}>
      {inicial ? (
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>
                  Início<div className="mudo" style={{ fontWeight: 400 }}>{formatarData(inicial.data, true)}</div>
                </th>
                <th>
                  Final<div className="mudo" style={{ fontWeight: 400 }}>{final ? formatarData(final.data, true) : '–'}</div>
                </th>
                {metas && <th>Meta</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const f = fmtUnidade(l.unidade);
                return (
                  <tr key={l.nome}>
                    <td>{l.nome}</td>
                    <td>{f(l.inicio)}</td>
                    <td>
                      {f(l.final)}
                      {l.variacao !== null && (
                        <div className={`sub-valor ${Math.abs(l.variacao) < 1e-6 ? '' : (l.variacao < 0) === l.menorMelhor ? 'bom' : 'ruim'}`}>
                          {sinal(l.variacao, 1, l.unidade)}
                        </div>
                      )}
                    </td>
                    {metas && (
                      <td>
                        {l.meta === null ? '–' : f(l.meta)}
                        {l.atingida !== null && (
                          <div className={`sub-valor ${l.atingida ? 'bom' : 'mudo'}`}>{l.atingida ? '✓ atingida' : `faltou ${num(l.faltou, 1)}${l.unidade}`}</div>
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
        <p className="mudo">Sem medições no período do remédio.</p>
      )}
      <div className="grade">
        {placar && (
          <>
            <Bloco rotulo="Treinos" valor={`${placar.treino.feito} de ${placar.treino.meta}${placar.treino.aderencia !== null ? ` · ${pct(placar.treino.aderencia, 0)}` : ''}`} />
            <Bloco rotulo="Cardios" valor={`${placar.cardio.feito} de ${placar.cardio.meta}${placar.cardio.aderencia !== null ? ` · ${pct(placar.cardio.aderencia, 0)}` : ''}`} />
            <Bloco
              rotulo="Pace da corrida"
              valor={corridas.length ? `${formatarTempo(corridas[0].pace)} → ${formatarTempo(corridas[corridas.length - 1].pace)} /km` : '–'}
            />
            <Bloco rotulo="Melhor pace" valor={melhor !== null ? `${formatarTempo(melhor)} /km` : '–'} />
          </>
        )}
        <Bloco rotulo="Doses" valor={`${resumo.aplicacoes_realizadas} · ${mg(resumo.total_aplicado_mg)}`} />
        <Bloco rotulo="Sobra no frasco" valor={mg(Math.max(resumo.saldo_mg, 0))} />
      </div>
    </div>
  );
}

function SaidaDoRemedio({ pos }: { pos: FasePos }) {
  if (!pos.saida) return null;
  return (
    <p className="texto-2">
      <span className="etiqueta aviso">saída do remédio</span> Semanas 1 a {SEMANAS_SAIDA + 1} depois da última dose ({formatarData(pos.inicio)}): o remédio ainda está
      saindo do corpo e o apetite volta aos poucos.
    </p>
  );
}

/**
 * No fim do remédio, no lugar de "Ciclo concluído": o balanço do projeto e os
 * botões do PDF final e da fase pós-remédio. Com a fase iniciada, mostra a
 * semana dela e o aviso de reganho (só informação: sem sugestão de meta).
 */
export function CartaoFimProjeto({ aoRegistrar }: { aoRegistrar: () => void }) {
  const { ciclo, gravar, hoje } = useDados();
  const { resumo, composicoes } = useCalculos();
  const proj = useProjeto();
  const t = useTreino();
  if (!ciclo || !resumo || !proj) return null;
  const decisoes = ciclo.decisoes ?? [];
  const ultima = resumo.linhas.at(-1)?.aplicacao ?? null;
  const salvar = (lista: DecisaoFase[]) => gravar({ tipo: 'decisoes', dado: { ciclo_id: ciclo.id, decisoes: lista, fases: ciclo.fases } });

  function iniciarPos() {
    if (!ultima) return;
    salvar([
      ...decisoes,
      {
        id: crypto.randomUUID(),
        data: hoje,
        escolha: 'pos_remedio',
        apos_aplicacao: resumo!.aplicacoes_realizadas,
        dose_mg: ultima.dose_mg,
        fase_indice: null,
        bloco_inicio: ultima.data,
      },
    ]);
  }

  const { pos, decisao } = proj;
  if (pos && decisao) {
    const aviso = avisoReganho(composicoes, pos.inicio);
    return (
      <section className="cartao pilha" style={{ gap: 10 }}>
        <div className="cartao-cab" style={{ marginBottom: 0 }}>
          <h2>Fase pós-remédio</h2>
          <span className="etiqueta">{pos.encerrada ? 'concluída' : pos.semana === null ? 'a começar' : `semana ${pos.semana + 1} de ${SEMANAS_POS}`}</span>
        </div>
        <SaidaDoRemedio pos={pos} />
        {aviso && <div className="alerta info">{aviso.texto}</div>}
        {t && (
          <p className="texto-2">
            {t.placarPos
              ? 'O check diário de treino e cardio continua num placar novo, na aba Treino.'
              : `A partir de ${formatarData(somarDias(t.projeto.fim, 1))}, o check diário de treino e cardio continua num placar novo, na aba Treino.`}
          </p>
        )}
        <details className="ajuda">
          <summary>Balanço do projeto</summary>
          <Balanco />
        </details>
        <div className="linha botoes-fase">
          <Link to="/analise" className="botao pequeno">
            PDF final
          </Link>
          <button className="botao pequeno" onClick={() => salvar(decisoes.filter((d) => d.id !== decisao.id))}>
            Desfazer início da fase
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="cartao pilha" style={{ gap: 10 }}>
      <div className="cartao-cab" style={{ marginBottom: 0 }}>
        <h2>Balanço do projeto</h2>
        <span className="mudo">
          {formatarData(proj.periodo.inicio, true)} → {formatarData(proj.periodo.fim, true)}
        </span>
      </div>
      <p className="texto-2">
        {resumo.proxima
          ? `Plano concluído. Sobram ${mg(resumo.saldo_mg)} no frasco.`
          : `Sua parte de ${mg(ciclo.quantidade_total_mg)} foi usada em ${resumo.aplicacoes_realizadas} aplicações.`}{' '}
        Metas e resultados do período do remédio, na ordem: medidas antes do peso.
      </p>
      <Balanco />
      <div className="linha botoes-fase">
        <Link to="/analise" className="botao pequeno primario">
          PDF final
        </Link>
        {ultima && (
          <button className="botao pequeno" onClick={iniciarPos}>
            Fase pós-remédio
          </button>
        )}
      </div>
      {ultima && (
        <p className="mudo">
          A fase pós-remédio começa na data da última dose ({formatarData(ultima.data)}) e dura {SEMANAS_POS} semanas.
          {t ? ' O check de treino e cardio continua num placar novo.' : ''} A meta da Dieta continua a que você definir.
        </p>
      )}
      {!resumo.proxima && (
        <button className="botao pequeno" onClick={aoRegistrar}>
          Registrar aplicação extra
        </button>
      )}
    </section>
  );
}

/**
 * Dieta na fase pós-remédio: só informação (semana da fase, saída do remédio
 * e aviso de reganho). Sem sugestão de mudar a meta: ela continua a que o
 * usuário definir em Ajustar.
 */
export function FasePosDieta() {
  const { composicoes } = useCalculos();
  const proj = useProjeto();
  const pos = proj?.pos;
  if (!pos || pos.encerrada) return null;
  const aviso = avisoReganho(composicoes, pos.inicio);
  if (!pos.saida && !aviso) return null;
  return (
    <section className="cartao pilha" style={{ gap: 10 }}>
      <div className="cartao-cab" style={{ marginBottom: 0 }}>
        <h2>Fase pós-remédio</h2>
        <span className="etiqueta">{pos.semana === null ? 'a começar' : `semana ${pos.semana + 1} de ${SEMANAS_POS}`}</span>
      </div>
      <SaidaDoRemedio pos={pos} />
      {aviso && (
        <div className="alerta info" style={{ display: 'block' }}>
          {aviso.texto}
        </div>
      )}
    </section>
  );
}
