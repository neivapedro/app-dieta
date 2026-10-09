import { useMemo, useState } from 'react';
import { FormConfigDieta, FormRefeicao, gr, kcal, LinhaItem, LinhaMacros, novoItem, SeletorAlimento } from '../componentes/dieta';
import { Bloco } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { formatarData } from '../lib/datas';
import {
  calcularMetas,
  calcularSaldo,
  idade,
  macrosDaRefeicao,
  novoId,
  somar,
  tmbHarris,
  tmbMifflin,
  type Alimento,
  type Corpo,
  type ItemRefeicao,
  type PlanoDieta,
  type Refeicao,
} from '../lib/dieta';
import { kg, num, pp } from '../lib/formato';

type Seletor = { refeicao: string; indice: number | null } | null;

/** Classe e texto da coluna "Falta": ✓ dentro da tolerância, "passou" acima da meta. */
function falta(valor: number, meta: number, sufixo: string, tolerancia: number) {
  if (Math.abs(valor) <= Math.max(tolerancia, Math.abs(meta) * 0.02)) return { classe: 'bom', texto: '✓' };
  if (valor < 0) return { classe: 'ruim', texto: `+${num(-valor, 0)}${sufixo}` };
  return { classe: '', texto: `${num(valor, 0)}${sufixo}` };
}

export function Dieta() {
  const { dieta, salvarDieta, estadoDieta, dietaIndisponivel, perfil, medidas } = useDados();
  const { composicoes, hoje, sexo } = useCalculos();
  const { banco, falhou: falhouAlimentos, tentarDeNovo } = useAlimentos();
  const [config, setConfig] = useState(false);
  const [seletor, setSeletor] = useState<Seletor>(null);
  const [editando, setEditando] = useState<string | null>(null);

  const ultima = [...composicoes].reverse().find((c) => c.massa_magra_kg !== null) ?? null;
  const corpo: Corpo | null = ultima ? { peso_kg: ultima.peso_kg, massa_magra_kg: ultima.massa_magra_kg! } : null;
  const altura = medidas.find((m) => m.data === ultima?.data)?.altura_cm ?? perfil?.altura_cm ?? null;
  const anos = idade(perfil?.data_nascimento, hoje);

  const plano = dieta;
  const mapa = banco?.mapa;
  const porRefeicao = useMemo(
    () => (plano && mapa ? plano.refeicoes.map((r) => macrosDaRefeicao(r, mapa)) : []),
    [plano, mapa],
  );
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

  const metas = corpo ? calcularMetas(plano.config, corpo) : null;
  const saldo = metas ? calcularSaldo(metas, total) : null;

  const atualizar = (p: Partial<PlanoDieta>) => salvarDieta({ ...plano, ...p });
  const mudarRefeicao = (id: string, fn: (r: Refeicao) => Refeicao) =>
    atualizar({ refeicoes: plano.refeicoes.map((r) => (r.id === id ? fn(r) : r)) });
  const mudarItem = (id: string, indice: number, item: ItemRefeicao) =>
    mudarRefeicao(id, (r) => ({ ...r, itens: r.itens.map((x, i) => (i === indice ? item : x)) }));

  function escolher(a: Alimento) {
    if (!seletor) return;
    const { refeicao, indice } = seletor;
    mudarRefeicao(refeicao, (r) =>
      indice === null ? { ...r, itens: [...r.itens, novoItem(a)] } : { ...r, itens: r.itens.map((x, i) => (i === indice ? novoItem(a) : x)) },
    );
    setSeletor(null);
  }

  const mover = (id: string, passo: -1 | 1) => {
    const lista = [...plano.refeicoes];
    const i = lista.findIndex((r) => r.id === id);
    const j = i + passo;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    atualizar({ refeicoes: lista });
  };

  const refeicaoEditando = plano.refeicoes.find((r) => r.id === editando);
  const ajuste = plano.config.ajuste_kcal;

  return (
    <div className="pilha">
      {/* Gasto calórico e meta */}
      <section className="cartao">
        <div className="cartao-cab">
          <h2>Meta do dia</h2>
          <button className="botao pequeno" onClick={() => setConfig(true)}>
            Ajustar
          </button>
        </div>
        {metas && corpo && ultima ? (
          <div className="pilha" style={{ gap: 10 }}>
            <div>
              <div className="grande">{kcal(metas.meta_kcal)}</div>
              <div className="mudo">
                {ajuste < 0 ? `Déficit de ${num(-ajuste, 0)} kcal` : ajuste > 0 ? `Superávit de ${num(ajuste, 0)} kcal` : 'Manutenção'} sobre o gasto
                total de {kcal(metas.gasto_total)}
              </div>
            </div>
            <div className="grade">
              <Bloco rotulo="Basal (TMB)" valor={kcal(metas.tmb)} />
              <Bloco rotulo={`Dia a dia (×${num(plano.config.fator_atividade, 2).replace(/,?0+$/, '')})`} valor={kcal(metas.dia_a_dia)} />
              <Bloco rotulo="Exercício (média/dia)" valor={`+ ${kcal(metas.exercicio)}`} />
              <Bloco rotulo="Gasto total" valor={kcal(metas.gasto_total)} />
            </div>
            <details className="ajuda">
              <summary>Como é calculado</summary>
              <div className="pilha" style={{ gap: 8 }}>
                <p className="mudo">
                  Medição de {formatarData(ultima.data)}: {kg(corpo.peso_kg)}, {pp(ultima.bf)} de gordura, massa magra {kg(corpo.massa_magra_kg)}.
                  Atualiza sozinho a cada nova medição.
                </p>
                <p className="mudo">
                  Basal pela <b>Katch-McArdle</b>: 370 + 21,6 × massa magra. Gasto total = basal × fator do dia a dia + média diária dos exercícios (soma
                  da semana ÷ 7).
                </p>
                {anos !== null && altura ? (
                  <p className="mudo">
                    Conferência com {anos} anos e {num(altura, 0)} cm: Mifflin-St Jeor {kcal(tmbMifflin(sexo, corpo.peso_kg, altura, anos))} · Harris-Benedict
                    (planilhas) {kcal(tmbHarris(sexo, corpo.peso_kg, altura, anos))}.
                  </p>
                ) : (
                  <p className="mudo">Informe a data de nascimento no Perfil para ver a conferência com outras fórmulas.</p>
                )}
              </div>
            </details>
          </div>
        ) : (
          <div className="alerta">Registre uma medição na aba Medidas: a meta usa seu peso e sua massa magra.</div>
        )}
      </section>

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
                      {num(total.ptn_vegetal * 4, 0)} kcal · {total.kcal ? num(((total.ptn_vegetal * 4) / total.kcal) * 100, 0) : 0}% · sai da
                      conta do carbo
                    </div>
                  </td>
                  <td>–</td>
                  <td>{gr(total.ptn_vegetal)} g</td>
                  <td>–</td>
                </tr>
                <tr className="total">
                  <td>Total</td>
                  <td>{num(saldo.meta.kcal, 0)}</td>
                  <td>{num(total.kcal, 0)}</td>
                  <td className={falta(saldo.falta.kcal, saldo.meta.kcal, '', 15).classe}>{falta(saldo.falta.kcal, saldo.meta.kcal, '', 15).texto}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {saldo.meta.carb < 0 && (
            <div className="alerta erro" style={{ marginTop: 10 }}>
              A proteína e a gordura já passam da meta de kcal. Reduza o g/kg delas ou o déficit em Ajustar.
            </div>
          )}
          <p className="mudo" style={{ marginTop: 8 }}>
            “Falta” é meta − plano; “+” em vermelho é o quanto passou. Tudo em kcal pelos macros (4/4/9).
          </p>
        </section>
      )}

      {/* Refeições */}
      <div className="linha entre">
        <h2>Refeições</h2>
        <span className="mudo">{estadoDieta === 'salvando' ? 'Salvando…' : estadoDieta === 'erro' ? 'Erro ao salvar' : 'Salvo'}</span>
      </div>
      {!banco && !falhouAlimentos && <p className="mudo">Carregando alimentos…</p>}
      {!banco && falhouAlimentos && (
        <div className="alerta erro" style={{ alignItems: 'center' }}>
          <span className="cresce">Não deu para baixar a lista de alimentos (sem sinal?).</span>
          <button className="botao pequeno" onClick={tentarDeNovo}>Tentar de novo</button>
        </div>
      )}
      {banco &&
        plano.refeicoes.map((r, ri) => (
          <section key={r.id} className="cartao refeicao">
            <div className="cartao-cab">
              <button type="button" className="refeicao-titulo" onClick={() => setEditando(r.id)}>
                <h2>
                  {r.nome}
                  {r.horario ? ` · ${r.horario}` : ''}
                </h2>
                <span className="mudo">editar</span>
              </button>
              <span className="etiqueta">{kcal(porRefeicao[ri]?.kcal ?? 0)}</span>
            </div>
            {r.itens.map((item, i) => (
              <LinhaItem
                key={`${i}-${item.alimento_id}`}
                item={item}
                alimento={banco.mapa.get(item.alimento_id)}
                aoMudar={(novo) => mudarItem(r.id, i, novo)}
                aoRemover={() => mudarRefeicao(r.id, (x) => ({ ...x, itens: x.itens.filter((_, j) => j !== i) }))}
                aoTrocar={() => setSeletor({ refeicao: r.id, indice: i })}
              />
            ))}
            <div className="refeicao-rodape">
              <button type="button" className="botao pequeno" onClick={() => setSeletor({ refeicao: r.id, indice: null })}>
                + Alimento
              </button>
              {r.itens.length > 0 && <LinhaMacros m={porRefeicao[ri]} kcalFinal={false} />}
            </div>
          </section>
        ))}
      <button
        type="button"
        className="botao"
        onClick={() => atualizar({ refeicoes: [...plano.refeicoes, { id: novoId(), nome: `Refeição ${plano.refeicoes.length + 1}`, horario: null, itens: [] }] })}
      >
        + Refeição
      </button>

      {/* Saldo fixo no rodapé enquanto monta o plano */}
      {saldo && (
        <div className="saldo-fixo" aria-label="Quanto falta para a meta" title="Quanto falta para a meta">
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
      )}

      {config && <FormConfigDieta config={plano.config} corpo={corpo} aoSalvar={(c) => atualizar({ config: c })} aoFechar={() => setConfig(false)} />}
      {seletor && banco && <SeletorAlimento lista={banco.lista} usados={usados} aoEscolher={escolher} aoFechar={() => setSeletor(null)} />}
      {refeicaoEditando && (
        <FormRefeicao
          refeicao={refeicaoEditando}
          primeira={plano.refeicoes[0]?.id === refeicaoEditando.id}
          ultima={plano.refeicoes[plano.refeicoes.length - 1]?.id === refeicaoEditando.id}
          aoSalvar={(nova) => mudarRefeicao(nova.id, () => nova)}
          aoMover={(passo) => mover(refeicaoEditando.id, passo)}
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
