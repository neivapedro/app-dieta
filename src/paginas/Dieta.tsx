import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FormConfigDieta, FormRefeicao, gr, kcal, LinhaItem, LinhaMacros, novoItem, SeletorAlimento } from '../componentes/dieta';
import { Bloco } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useTreino } from '../dados/useTreino';
import { deficitNecessario, tendenciaMedidas } from '../lib/conferencia';
import { diferencaDias, formatarData } from '../lib/datas';
import {
  alvoProteinaRefeicao,
  calcularMetas,
  calcularSaldo,
  exercicioReal,
  idade,
  macrosDaRefeicao,
  metaFibra,
  novoId,
  somar,
  tmbHarris,
  tmbMifflin,
  trocarAlimento,
  type Alimento,
  type Corpo,
  type ItemRefeicao,
  type PlanoDieta,
  type Refeicao,
} from '../lib/dieta';
import { kg, num, pp } from '../lib/formato';
import { aderenciaRecente } from '../lib/treino';

type Seletor = { refeicao: string; indice: number | null } | null;
type Removido = { refeicao: string; indice: number; item: ItemRefeicao; nome: string } | null;

/** Classe e texto da coluna "Falta": ✓ dentro da tolerância, "+" em vermelho quando passou. */
function falta(valor: number, meta: number, sufixo: string, tolerancia: number) {
  if (Math.abs(valor) <= Math.max(tolerancia, Math.abs(meta) * 0.02)) return { classe: 'bom', texto: '✓' };
  if (valor < 0) return { classe: 'ruim', texto: `+${num(-valor, 0)}${sufixo}` };
  return { classe: '', texto: `${num(valor, 0)}${sufixo}` };
}

const TEXTO_ESTADO = { salvo: 'Salvo', salvando: 'Salvando…', pendente: 'Sem conexão · guardado no aparelho', erro: 'Não salvo' } as const;

export function Dieta() {
  const { dieta, salvarDieta, estadoDieta, dietaIndisponivel, perfil, medidas, treinos } = useDados();
  const { composicoes, hoje, sexo } = useCalculos();
  const treino = useTreino();
  const { banco, falhou: falhouAlimentos, tentarDeNovo } = useAlimentos();
  const [config, setConfig] = useState(false);
  const [seletor, setSeletor] = useState<Seletor>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [removido, setRemovido] = useState<Removido>(null);

  useEffect(() => {
    if (!removido) return;
    const t = setTimeout(() => setRemovido(null), 6000);
    return () => clearTimeout(t);
  }, [removido]);

  const ultima = [...composicoes].reverse().find((c) => c.massa_magra_kg !== null) ?? null;
  const corpo: Corpo | null = ultima ? { peso_kg: ultima.peso_kg, massa_magra_kg: ultima.massa_magra_kg! } : null;
  const altura = medidas.find((m) => m.data === ultima?.data)?.altura_cm ?? perfil?.altura_cm ?? null;
  const anos = idade(perfil?.data_nascimento, hoje);
  const aderencia = treino ? aderenciaRecente(treinos, treino.inicio, hoje) : null;
  const tendencia = useMemo(() => tendenciaMedidas(composicoes), [composicoes]);

  const plano = dieta;
  const mapa = banco?.mapa;
  const porRefeicao = useMemo(() => (plano && mapa ? plano.refeicoes.map((r) => macrosDaRefeicao(r, mapa)) : []), [plano, mapa]);
  const total = somar(porRefeicao);
  const usados = useMemo(() => new Set(plano?.refeicoes.flatMap((r) => r.itens.map((i) => i.alimento_id)) ?? []), [plano]);

  if (dietaIndisponivel) {
    return (
      <div className="alerta erro">
        A aba Dieta ainda não está ativa no banco de dados. Rode o SQL da Dieta no Supabase (passo a passo no README) e abra o app de novo.
      </div>
    );
  }
  if (!plano) return null;

  const metas = corpo ? calcularMetas(plano.config, corpo, aderencia) : null;
  const saldo = metas ? calcularSaldo(metas, total) : null;
  const alvoRefeicao = corpo ? alvoProteinaRefeicao(corpo.massa_magra_kg) : null;
  const refeicoesComItens = plano.refeicoes.filter((r) => r.itens.length);
  const refeicoesProteina = alvoRefeicao
    ? plano.refeicoes.filter((r, i) => r.itens.length && porRefeicao[i] && porRefeicao[i].ptn_animal >= alvoRefeicao * 0.9).length
    : 0;
  const diasMedicao = ultima ? diferencaDias(ultima.data, hoje) : 0;

  // Conferência com as medidas: déficit do plano × o que as medidas mostram × o necessário para a meta
  const deficitPlano = metas && total.kcal > 0 ? metas.gasto_total - total.kcal : metas ? -plano.config.ajuste_kcal : null;
  const metaProjeto = perfil?.metas_projeto;
  const gordaMeta = metaProjeto?.peso_kg && metaProjeto?.bf ? (metaProjeto.peso_kg * metaProjeto.bf) / 100 : null;
  const necessario = gordaMeta !== null && ultima?.massa_gorda_kg != null && treino ? deficitNecessario(ultima.massa_gorda_kg, gordaMeta, hoje, treino.fim) : null;

  const atualizar = (p: Partial<PlanoDieta>) => salvarDieta({ ...plano, ...p });
  const mudarRefeicao = (id: string, fn: (r: Refeicao) => Refeicao) => atualizar({ refeicoes: plano.refeicoes.map((r) => (r.id === id ? fn(r) : r)) });
  const mudarItem = (id: string, indice: number, item: ItemRefeicao) =>
    mudarRefeicao(id, (r) => ({ ...r, itens: r.itens.map((x, i) => (i === indice ? item : x)) }));

  function escolher(a: Alimento) {
    if (!seletor) return;
    const { refeicao, indice } = seletor;
    mudarRefeicao(refeicao, (r) =>
      indice === null
        ? { ...r, itens: [...r.itens, novoItem(a)] }
        : // Trocar o alimento mantém o peso que já estava no item
          { ...r, itens: r.itens.map((x, i) => (i === indice ? trocarAlimento(x, mapa?.get(x.alimento_id), a) : x)) },
    );
    setSeletor(null);
  }

  function remover(refeicao: string, indice: number) {
    const r = plano!.refeicoes.find((x) => x.id === refeicao);
    const item = r?.itens[indice];
    if (!item) return;
    setRemovido({ refeicao, indice, item, nome: mapa?.get(item.alimento_id)?.nome ?? 'Alimento' });
    mudarRefeicao(refeicao, (x) => ({ ...x, itens: x.itens.filter((_, j) => j !== indice) }));
  }

  function desfazer() {
    if (!removido) return;
    mudarRefeicao(removido.refeicao, (x) => {
      const itens = [...x.itens];
      itens.splice(Math.min(removido.indice, itens.length), 0, removido.item);
      return { ...x, itens };
    });
    setRemovido(null);
  }

  const mover = (id: string, passo: -1 | 1) => {
    const lista = [...plano.refeicoes];
    const i = lista.findIndex((r) => r.id === id);
    const j = i + passo;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    atualizar({ refeicoes: lista });
  };

  const duplicar = (id: string) => {
    const i = plano.refeicoes.findIndex((r) => r.id === id);
    const r = plano.refeicoes[i];
    const copia: Refeicao = { ...r, id: novoId(), nome: `${r.nome} (cópia)`, itens: r.itens.map((x) => ({ ...x })) };
    atualizar({ refeicoes: [...plano.refeicoes.slice(0, i + 1), copia, ...plano.refeicoes.slice(i + 1)] });
  };

  const refeicaoEditando = plano.refeicoes.find((r) => r.id === editando);
  const ajuste = plano.config.ajuste_kcal;

  const chipsFalta = (): ReactNode =>
    saldo && (
      <div className="falta-inline">
        <span className="rotulo">Falta</span>
        {(
          [
            ['m-pa', 'Ptn A', saldo.falta.ptn_animal, saldo.meta.ptn_animal, ' g', 1],
            ['m-c', 'Carb', saldo.falta.carb, saldo.meta.carb, ' g', 1],
            ['m-g', 'Gord', saldo.falta.gord, saldo.meta.gord, ' g', 1],
            ['m-k', 'kcal', saldo.falta.kcal, saldo.meta.kcal, '', 15],
          ] as const
        ).map(([cor, nome, valor, meta, suf, tol]) => {
          const f = falta(valor, meta, suf, tol);
          return (
            <span key={nome} className="saldo-item">
              {nome === 'kcal' ? (
                <>
                  <b className={f.classe}>{f.texto}</b> <span className={cor}>kcal</span>
                </>
              ) : (
                <>
                  <span className={cor}>{nome}</span> <b className={f.classe}>{f.texto}</b>
                </>
              )}
            </span>
          );
        })}
      </div>
    );

  return (
    <div className="pilha">
      {/* Meta do dia (compacta: o detalhe fica em "Como é calculado") */}
      <section className="cartao">
        <div className="cartao-cab" style={{ marginBottom: 6 }}>
          <h2>Meta do dia</h2>
          <button className="botao pequeno" onClick={() => setConfig(true)}>
            Ajustar
          </button>
        </div>
        {metas && corpo && ultima ? (
          <div className="pilha" style={{ gap: 8 }}>
            <div className="grande">{kcal(metas.meta_kcal)}</div>
            {/* De onde vem a meta: basal → gasto total → ajuste */}
            <div className="grade grade-3">
              <Bloco rotulo="Basal (TMB)" valor={num(metas.tmb, 0)} />
              <Bloco rotulo="Gasto total" valor={num(metas.gasto_total, 0)} />
              <Bloco rotulo={ajuste < 0 ? 'Déficit' : ajuste > 0 ? 'Superávit' : 'Ajuste'} valor={ajuste === 0 ? '0' : `${ajuste < 0 ? '−' : '+'} ${num(Math.abs(ajuste), 0)}`} />
            </div>
            <p className="texto-2">
              kcal por dia. Basal pela sua massa magra ({kg(corpo.massa_magra_kg)}, medição de {formatarData(ultima.data)}); gasto total = basal × dia a dia +
              exercícios; meta = gasto total {ajuste < 0 ? '−' : '+'} {ajuste < 0 ? 'déficit' : 'superávit'}.
            </p>
            {diasMedicao > 10 && (
              <div className="alerta">Meta calculada com a medição de {formatarData(ultima.data)}. Faça uma nova medição para atualizar.</div>
            )}
            <details className="ajuda">
              <summary>Como é calculado</summary>
              <div className="pilha" style={{ gap: 8 }}>
                <div className="grade">
                  <Bloco rotulo="Basal (TMB)" valor={kcal(metas.tmb)} />
                  <Bloco rotulo={`Dia a dia (×${num(plano.config.fator_atividade, 2).replace(/,?0+$/, '')})`} valor={kcal(metas.dia_a_dia)} />
                  <Bloco rotulo={metas.pela_aderencia ? 'Exercício real (média/dia)' : 'Exercício (média/dia)'} valor={`+ ${kcal(metas.exercicio)}`} />
                  <Bloco rotulo="Gasto total" valor={kcal(metas.gasto_total)} />
                </div>
                <p className="texto-2">
                  Medição de {formatarData(ultima.data)}: {kg(corpo.peso_kg)}, {pp(ultima.bf)} de gordura, massa magra {kg(corpo.massa_magra_kg)}. Atualiza
                  sozinho a cada nova medição.
                </p>
                <p className="texto-2">
                  Basal pela <b>Katch-McArdle</b>: 370 + 21,6 × massa magra. Gasto total = basal × fator do dia a dia + média diária dos exercícios (soma da
                  semana ÷ 7).
                </p>
                {aderencia && (
                  <p className="texto-2">
                    Pelo que você marcou no Treino ({num(aderencia.treino * 100, 0)}% dos treinos, {num(aderencia.cardio * 100, 0)}% dos cardios), o
                    exercício real é ≈ {kcal(exercicioReal(plano.config.atividades, aderencia))}
                    {metas.pela_aderencia
                      ? ` (planejado: ${kcal(metas.exercicio_planejado)}). A meta já usa o real.`
                      : '. Em Ajustar, dá para a meta usar o que você fez de verdade.'}
                  </p>
                )}
                {anos !== null && altura ? (
                  <p className="texto-2">
                    Conferência com {anos} anos e {num(altura, 0)} cm: Mifflin-St Jeor {kcal(tmbMifflin(sexo, corpo.peso_kg, altura, anos))} · Harris-Benedict
                    (planilhas) {kcal(tmbHarris(sexo, corpo.peso_kg, altura, anos))}.
                  </p>
                ) : (
                  <p className="texto-2">Informe a data de nascimento no Perfil para ver a conferência com outras fórmulas.</p>
                )}
              </div>
            </details>
            <details className="ajuda">
              <summary>Conferência com as suas medidas</summary>
              {tendencia ? (
                <div className="pilha" style={{ gap: 8 }}>
                  <div className="grade grade-3">
                    <Bloco rotulo="O plano prevê" valor={deficitPlano !== null ? `${num(deficitPlano, 0)}/dia` : '–'} />
                    <Bloco rotulo="As medidas mostram" valor={`${num(tendencia.deficit_dia, 0)} ± ${num(tendencia.margem_dia, 0)}`} />
                    <Bloco rotulo="Para a meta" valor={necessario !== null ? `${num(necessario, 0)}/dia` : '–'} />
                  </div>
                  <p className="texto-2">
                    Déficit em kcal por dia. "As medidas mostram" vem da tendência de {tendencia.medicoes} medições ({formatarData(tendencia.de)} a{' '}
                    {formatarData(tendencia.ate)}): massa gorda {num(tendencia.gorda_semana, 2)} kg/sem e massa magra {num(tendencia.magra_semana, 2)}{' '}
                    kg/sem, a ~9.400 kcal por kg de gordura e ~1.800 por kg de massa magra. Se ficar muito diferente do plano por semanas seguidas, o gasto
                    real é outro: ajuste o déficit.
                    {necessario !== null && ' "Para a meta" é o déficit que leva a massa gorda da meta até o fim do projeto.'}
                  </p>
                </div>
              ) : (
                <p className="texto-2">Com 4 medições em pelo menos 3 semanas, o app compara o déficit do plano com o que as suas medidas mostram.</p>
              )}
            </details>
          </div>
        ) : (
          <div className="alerta" style={{ display: 'block' }}>
            O basal (taxa metabólica basal) é calculado pela sua massa magra, que vem da medição de cintura, pescoço e peso. Registre uma medição na aba{' '}
            <b>Medidas</b> e aqui aparecem o basal, o gasto total e a meta do dia.
          </div>
        )}
      </section>

      {/* Refeições */}
      <div className="linha entre">
        <h2>Refeições</h2>
        <span className={estadoDieta === 'erro' ? 'ruim' : estadoDieta === 'pendente' ? 'aviso-txt' : 'texto-2'} style={{ fontSize: '0.85rem' }}>
          {TEXTO_ESTADO[estadoDieta]}
        </span>
      </div>
      {!banco && !falhouAlimentos && <p className="texto-2">Carregando alimentos…</p>}
      {!banco && falhouAlimentos && (
        <div className="alerta erro" style={{ alignItems: 'center' }}>
          <span className="cresce">Não deu para baixar a lista de alimentos (sem sinal?).</span>
          <button className="botao pequeno" onClick={tentarDeNovo}>
            Tentar de novo
          </button>
        </div>
      )}
      {banco &&
        plano.refeicoes.map((r, ri) => {
          const m = porRefeicao[ri];
          const ptnOk = alvoRefeicao !== null && m && m.ptn_animal >= alvoRefeicao * 0.9;
          return (
            <section key={r.id} className="cartao refeicao">
              <div className="cartao-cab">
                <button type="button" className="refeicao-titulo" onClick={() => setEditando(r.id)}>
                  <h2>
                    {r.nome}
                    {r.horario ? ` · ${r.horario}` : ''}
                  </h2>
                  <span className="texto-2">editar</span>
                </button>
                <span className="etiqueta">{kcal(m?.kcal ?? 0)}</span>
              </div>
              {r.itens.map((item, i) => (
                <LinhaItem
                  key={`${i}-${item.alimento_id}`}
                  item={item}
                  alimento={banco.mapa.get(item.alimento_id)}
                  aoMudar={(novo) => mudarItem(r.id, i, novo)}
                  aoRemover={() => remover(r.id, i)}
                  aoTrocar={() => setSeletor({ refeicao: r.id, indice: i })}
                  faltaNoFoco={chipsFalta()}
                />
              ))}
              <div className="refeicao-rodape">
                <button type="button" className="botao pequeno" onClick={() => setSeletor({ refeicao: r.id, indice: null })}>
                  + Alimento
                </button>
                {r.itens.length > 0 && m && (
                  <div className="pilha" style={{ gap: 2, alignItems: 'flex-end' }}>
                    <LinhaMacros m={m} kcalFinal={false} />
                    {alvoRefeicao !== null && (
                      <span className={`sub-valor ${ptnOk ? 'bom' : 'texto-2'}`}>
                        Ptn A {gr(m.ptn_animal)} de ~{num(alvoRefeicao, 0)} g {ptnOk ? '✓' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      <button
        type="button"
        className="botao"
        onClick={() => atualizar({ refeicoes: [...plano.refeicoes, { id: novoId(), nome: `Refeição ${plano.refeicoes.length + 1}`, horario: null, itens: [] }] })}
      >
        + Refeição
      </button>

      {/* Metas × plano, como a tabela "OFF" da planilha */}
      {saldo && metas && corpo && (
        <section className="cartao">
          <h2>Macros do dia</h2>
          <div className="tabela-rolagem">
            <table className="tabela-macros">
              <thead>
                <tr>
                  <th></th>
                  <th>Meta</th>
                  <th>Plano</th>
                  <th>Falta</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['m-pa', 'Proteína animal', saldo.meta.ptn_animal, total.ptn_animal, `${num(total.ptn_animal / corpo.massa_magra_kg, 1)} g/kg massa magra`],
                    ['m-c', 'Carboidrato', saldo.meta.carb, total.carb, `${num(total.carb / corpo.peso_kg, 1)} g/kg`],
                    ['m-g', 'Gordura', saldo.meta.gord, total.gord, `${num(total.gord / corpo.peso_kg, 1)} g/kg`],
                  ] as const
                ).map(([cor, nome, meta, feito, gkg]) => {
                  const f = falta(meta - feito, meta, ' g', 1);
                  const kc = cor === 'm-g' ? feito * 9 : feito * 4;
                  return (
                    <tr key={nome}>
                      <td>
                        <div className={cor}>{nome}</div>
                        <div className="sub-linha">
                          {gkg} · {num(kc, 0)} kcal · {total.kcal ? num((kc / total.kcal) * 100, 0) : 0}%
                        </div>
                      </td>
                      <td>{gr(meta)} g</td>
                      <td>{gr(feito)} g</td>
                      <td className={f.classe}>{f.texto}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td>
                    <div className="m-pv">Proteína vegetal</div>
                    <div className="sub-linha">
                      {num(total.ptn_vegetal * 4, 0)} kcal · {total.kcal ? num(((total.ptn_vegetal * 4) / total.kcal) * 100, 0) : 0}% · sai da conta do carbo
                    </div>
                  </td>
                  <td>–</td>
                  <td>{gr(total.ptn_vegetal)} g</td>
                  <td>–</td>
                </tr>
                <tr>
                  <td>
                    <div>Fibra</div>
                    <div className="sub-linha">referência: 14 g a cada 1.000 kcal · já conta no carboidrato</div>
                  </td>
                  <td>{gr(metaFibra(saldo.meta.kcal))} g</td>
                  <td>{gr(total.fibra)} g</td>
                  <td className={total.fibra >= metaFibra(saldo.meta.kcal) * 0.98 ? 'bom' : ''}>
                    {total.fibra >= metaFibra(saldo.meta.kcal) * 0.98 ? '✓' : `${num(metaFibra(saldo.meta.kcal) - total.fibra, 0)} g`}
                  </td>
                </tr>
                <tr className="total">
                  <td>Total kcal</td>
                  <td>{num(saldo.meta.kcal, 0)}</td>
                  <td>{num(total.kcal, 0)}</td>
                  <td className={falta(saldo.falta.kcal, saldo.meta.kcal, '', 15).classe}>{falta(saldo.falta.kcal, saldo.meta.kcal, '', 15).texto}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {alvoRefeicao !== null && refeicoesComItens.length > 0 && (
            <p className="texto-2" style={{ marginTop: 8 }}>
              Refeições com proteína suficiente (~{num(alvoRefeicao, 0)} g de proteína animal, 0,4 g/kg de massa magra): {refeicoesProteina} de{' '}
              {refeicoesComItens.length}. Distribuir a proteína ao longo do dia ajuda a preservar a massa magra.
            </p>
          )}
          {saldo.meta.carb < 0 && (
            <div className="alerta erro" style={{ marginTop: 10 }}>
              A proteína e a gordura já passam da meta de kcal. Reduza o g/kg delas ou o déficit em Ajustar.
            </div>
          )}
          <p className="texto-2" style={{ marginTop: 8 }}>
            “Falta” é meta − plano; “+” em vermelho é o quanto passou. Tudo em kcal pelos macros (4/4/9).
          </p>
        </section>
      )}

      {removido && (
        <div className="alerta info desfazer" role="status">
          <span className="cresce">{removido.nome} removido.</span>
          <button className="botao pequeno primario" onClick={desfazer}>
            Desfazer
          </button>
        </div>
      )}

      {/* Saldo fixo no rodapé enquanto monta o plano */}
      {saldo && (
        <div className="saldo-fixo" aria-label="Quanto falta para a meta">
          {chipsFalta()}
          {estadoDieta !== 'salvo' && (
            <span className={`estado-gravacao ${estadoDieta === 'erro' ? 'ruim' : estadoDieta === 'pendente' ? 'aviso-txt' : ''}`}>
              {TEXTO_ESTADO[estadoDieta]}
            </span>
          )}
        </div>
      )}

      {config && (
        <FormConfigDieta config={plano.config} corpo={corpo} aderencia={aderencia} aoSalvar={(c) => atualizar({ config: c })} aoFechar={() => setConfig(false)} />
      )}
      {seletor && banco && <SeletorAlimento lista={banco.lista} usados={usados} aoEscolher={escolher} aoFechar={() => setSeletor(null)} />}
      {refeicaoEditando && (
        <FormRefeicao
          refeicao={refeicaoEditando}
          primeira={plano.refeicoes[0]?.id === refeicaoEditando.id}
          ultima={plano.refeicoes[plano.refeicoes.length - 1]?.id === refeicaoEditando.id}
          aoSalvar={(nova) => mudarRefeicao(nova.id, () => nova)}
          aoMover={(passo) => mover(refeicaoEditando.id, passo)}
          aoDuplicar={() => duplicar(refeicaoEditando.id)}
          aoExcluir={() => {
            atualizar({ refeicoes: plano.refeicoes.filter((r) => r.id !== refeicaoEditando.id) });
            setEditando(null);
          }}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
