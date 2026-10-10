import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FolhaTroca, FormConfigDieta, FormRefeicao, gr, kcal, LinhaItem, LinhaMacros, novoItem, SeletorAlimento, type Troca } from '../componentes/dieta';
import { FasePosDieta } from '../componentes/projeto';
import { Bloco } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useTreino } from '../dados/useTreino';
import { deficitNecessario, faixaImprecisa, fracaoMagraDaPerda, kcalPorKgPerdido, ritmoEstimado, ritmoPercentual, tendenciaMedidas } from '../lib/conferencia';
import { diferencaDias, formatarData } from '../lib/datas';
import { ultimaNormal } from '../lib/gordura';
import {
  alvoProteinaRefeicao,
  calcularMetas,
  calcularSaldo,
  corpoParaMetas,
  distribuicaoProteina,
  exercicioReal,
  fecharMacro,
  idade,
  macrosDaRefeicao,
  metaFibra,
  novoId,
  opcoesTroca,
  proteinaColageno,
  proteinaTotal,
  PTN_TOTAL_MIN_GKG_PESO,
  MINIMO_REFEICOES_ALVO,
  MEDICOES_METAS,
  somar,
  tmbHarris,
  tmbMifflin,
  textoBaseMetas,
  type Alimento,
  type ItemRefeicao,
  type PlanoDieta,
  type Refeicao,
} from '../lib/dieta';
import { kg, num, pp } from '../lib/formato';
import { conselhoConferencia, dietaNaTendencia, juntar, textoDietaSemana, textoPlanoSeguido } from '../lib/semana';
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

/** Próximo "Refeição N" livre, sempre depois do maior número em uso. */
function proximoNomeRefeicao(refeicoes: Refeicao[]): string {
  const n = 1 + Math.max(0, refeicoes.length, ...refeicoes.map((r) => Number(/^Refeição (\d+)$/.exec(r.nome)?.[1] ?? 0)));
  const usados = new Set(refeicoes.map((r) => r.nome));
  let k = n;
  while (usados.has(`Refeição ${k}`)) k++;
  return `Refeição ${k}`;
}

export function Dieta() {
  const { dieta, salvarDieta, estadoDieta, dietaIndisponivel, perfil, medidas, treinos, diario } = useDados();
  const { composicoes, hoje, sexo } = useCalculos();
  const treino = useTreino();
  const { banco, falhou: falhouAlimentos, tentarDeNovo } = useAlimentos();
  const [config, setConfig] = useState(false);
  const [seletor, setSeletor] = useState<Seletor>(null);
  const [editando, setEditando] = useState<string | null>(null);
  // Troca de alimento com duas opções (mesmo peso × mesmo macro principal)
  const [troca, setTroca] = useState<Troca | null>(null);
  // Pilha: remover vários seguidos e desfazer todos
  const [removidos, setRemovidos] = useState<NonNullable<Removido>[]>([]);

  useEffect(() => {
    if (!removidos.length) return;
    const t = setTimeout(() => setRemovidos([]), 6000);
    return () => clearTimeout(t);
  }, [removidos]);

  // Última medição: aviso de medição antiga, ritmo medido e "Para a meta"
  const ultima = ultimaNormal(composicoes);
  // Metas pela média das 3 últimas medições válidas (peso e massa magra)
  const corpo = useMemo(() => corpoParaMetas(composicoes), [composicoes]);
  const altura = medidas.find((m) => m.data === ultima?.data)?.altura_cm ?? perfil?.altura_cm ?? null;
  const anos = idade(perfil?.data_nascimento, hoje);
  const aderencia = treino ? aderenciaRecente(treinos, treino.inicio, hoje, 28, treino.fim) : null;
  const tendencia = useMemo(() => tendenciaMedidas(composicoes), [composicoes]);
  const impreciso = tendencia !== null && faixaImprecisa(tendencia);

  const plano = dieta;
  const mapa = banco?.mapa;
  const porRefeicao = useMemo(() => (plano && mapa ? plano.refeicoes.map((r) => macrosDaRefeicao(r, mapa)) : []), [plano, mapa]);
  const total = somar(porRefeicao);
  // Colágeno e gelatina entram como vegetal nas kcal, mas ficam fora da proteína total
  const colageno = useMemo(() => (plano && mapa ? proteinaColageno(plano.refeicoes, mapa) : 0), [plano, mapa]);
  // Vegetal "de verdade": a mesma do Ajustar e da proteína total
  const ptnVegetal = Math.max(0, total.ptn_vegetal - colageno);
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
  const distribuicao = corpo
    ? distribuicaoProteina(
        plano.refeicoes.map((r, i) => ({ nome: r.nome, ptn_animal: porRefeicao[i]?.ptn_animal ?? 0, itens: r.itens.length })),
        corpo.massa_magra_kg,
      )
    : null;
  const ptnTotal = corpo ? proteinaTotal(total, corpo, colageno) : null;
  const diasMedicao = ultima ? diferencaDias(ultima.data, hoje) : 0;

  // Conferência com as medidas: déficit do plano × o que as medidas mostram × o necessário para a meta
  const deficitPlano = metas && total.kcal > 0 ? metas.gasto_total - total.kcal : metas ? -plano.config.ajuste_kcal : null;
  const metaProjeto = perfil?.metas_projeto;
  const gordaMeta = metaProjeto?.peso_kg && metaProjeto?.bf ? (metaProjeto.peso_kg * metaProjeto.bf) / 100 : null;
  // Na fase pós-remédio não há mais prazo de meta do projeto: "Para a meta" some
  const necessario = gordaMeta !== null && ultima?.massa_gorda_kg != null && treino && !treino.pos ? deficitNecessario(ultima.massa_gorda_kg, gordaMeta, hoje, treino.fim) : null;
  // "Segui o plano?" na janela da tendência: muda o conselho (só texto)
  const seguido = tendencia ? dietaNaTendencia(diario, tendencia) : null;
  const conselho = tendencia && seguido && ultima ? conselhoConferencia(tendencia, ultima.peso_kg, seguido, deficitPlano, plano.config.ajuste_kcal) : null;
  // Ritmo previsto pelo déficit (ρ pela fração de massa magra da perda) × o medido pela tendência
  const fracaoMagra = corpo ? fracaoMagraDaPerda(tendencia, corpo.peso_kg - corpo.massa_magra_kg) : null;
  const ritmoMedido = tendencia && ultima ? ritmoPercentual(tendencia.peso_semana, ultima.peso_kg) : null;

  const atualizar = (p: Partial<PlanoDieta>) => salvarDieta({ ...plano, ...p });
  const mudarRefeicao = (id: string, fn: (r: Refeicao) => Refeicao) => atualizar({ refeicoes: plano.refeicoes.map((r) => (r.id === id ? fn(r) : r)) });
  const mudarItem = (id: string, indice: number, item: ItemRefeicao) =>
    mudarRefeicao(id, (r) => ({ ...r, itens: r.itens.map((x, i) => (i === indice ? item : x)) }));

  function escolher(a: Alimento) {
    if (!seletor) return;
    const { refeicao, indice } = seletor;
    setSeletor(null);
    if (indice === null) return mudarRefeicao(refeicao, (r) => ({ ...r, itens: [...r.itens, novoItem(a)] }));
    const atual = plano!.refeicoes.find((r) => r.id === refeicao)?.itens[indice];
    if (!atual) return;
    const antigo = mapa?.get(atual.alimento_id);
    const opcoes = opcoesTroca(atual, antigo, a);
    // Sem uma segunda opção que faça diferença, troca direto mantendo o peso
    if (!opcoes.mesmo_macro) return mudarItem(refeicao, indice, opcoes.mesmo_peso);
    setTroca({ refeicao, indice, antigo, novo: a, opcoes });
  }

  function remover(refeicao: string, indice: number) {
    const r = plano!.refeicoes.find((x) => x.id === refeicao);
    const item = r?.itens[indice];
    if (!item) return;
    setRemovidos((p) => [...p, { refeicao, indice, item, nome: mapa?.get(item.alimento_id)?.nome ?? 'Alimento' }]);
    mudarRefeicao(refeicao, (x) => ({ ...x, itens: x.itens.filter((_, j) => j !== indice) }));
  }

  function desfazer() {
    if (!removidos.length) return;
    // Do último para o primeiro: cada item volta à posição em que estava
    let refeicoes = plano!.refeicoes;
    for (const r of [...removidos].reverse()) {
      refeicoes = refeicoes.map((x) => {
        if (x.id !== r.refeicao) return x;
        const itens = [...x.itens];
        itens.splice(Math.min(r.indice, itens.length), 0, r.item);
        return { ...x, itens };
      });
    }
    atualizar({ refeicoes });
    setRemovidos([]);
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
      <FasePosDieta />

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
            {ajuste < 0 && fracaoMagra && (
              <p className="texto-2">
                Ritmo pelo déficit: <b>≈ {num(ritmoEstimado(-ajuste, corpo.peso_kg, fracaoMagra.p), 1)}% do peso por semana</b>
                {ritmoMedido && (
                  <>
                    {' '}
                    · medido: <b>{ritmoMedido.faixa === 'ganho' ? 'peso subindo' : `${num(ritmoMedido.pct, 1)}%/sem`}</b>
                  </>
                )}
              </p>
            )}
            <p className="texto-2">
              kcal por dia. Basal pela sua massa magra de {kg(corpo.massa_magra_kg)}, {textoBaseMetas(corpo)}; gasto total = basal × dia a dia +
              exercícios; meta = gasto total{ajuste === 0 ? ' (sem ajuste)' : ajuste < 0 ? ' − déficit' : ' + superávit'}.
            </p>
            {diasMedicao > 10 && (
              <div className="alerta">
                Última medição em {formatarData(ultima.data)}: meta calculada {textoBaseMetas(corpo)}. Faça uma nova medição para atualizar.
              </div>
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
                  {corpo.medicoes === 1
                    ? `Medição de ${formatarData(corpo.ate)}: ${kg(corpo.peso_kg)}${corpo.ate === ultima.data ? `, ${pp(ultima.bf)} de gordura` : ''}, massa magra ${kg(corpo.massa_magra_kg)}.`
                    : `Média das últimas ${corpo.medicoes} medições válidas (${formatarData(corpo.de)} a ${formatarData(corpo.ate)}): peso ${kg(corpo.peso_kg)}, massa magra ${kg(corpo.massa_magra_kg)}.`}{' '}
                  Basal, proteína animal e gordura usam a média do peso e da massa magra das {MEDICOES_METAS} últimas medições (atípicas ficam fora), o que
                  suaviza o ruído da fita e da balança. Atualiza sozinho a cada nova medição.
                </p>
                <p className="texto-2">
                  Basal pela <b>Katch-McArdle</b>: 370 + 21,6 × massa magra. Gasto total = basal × fator do dia a dia + média diária dos exercícios (soma da
                  semana ÷ 7).
                </p>
                {ajuste < 0 && fracaoMagra && (
                  <p className="texto-2">
                    Ritmo pelo déficit = déficit × 7 ÷ (ρ × peso), com ρ = (1 − p) × 9.400 + p × 1.800 kcal por kg perdido ({num(kcalPorKgPerdido(fracaoMagra.p), 0)}{' '}
                    kcal/kg) e p = {num(fracaoMagra.p * 100, 0)}% da perda saindo de massa magra
                    {fracaoMagra.fonte === 'tendencia' ? ', pela tendência das suas medidas' : ', estimado pela massa gorda (Forbes: 10,4 ÷ (10,4 + massa gorda))'}.
                    {ritmoMedido ? ' "Medido" vem da tendência das medições.' : ' O ritmo medido aparece com 4 medições em 3 semanas.'} Você continua
                    definindo o déficit em Ajustar.
                  </p>
                )}
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
                    <Bloco rotulo="As medidas mostram" valor={`≈ ${num(tendencia.deficit_dia, 0)}/dia`} />
                    <Bloco rotulo="Para a meta" valor={necessario !== null ? `${num(necessario, 0)}/dia` : '–'} />
                  </div>
                  <p className={impreciso ? 'alerta' : 'texto-2'} style={impreciso ? { display: 'block' } : undefined}>
                    {impreciso ? 'Ainda impreciso: ' : 'Faixa provável (95%): '}entre {num(tendencia.deficit_dia - tendencia.ic95_dia, 0)} e{' '}
                    {num(tendencia.deficit_dia + tendencia.ic95_dia, 0)} kcal/dia. A fita e a balança têm ruído; com mais medições a faixa estreita.
                    {impreciso && ' Não mude o plano por esse número ainda.'}
                  </p>
                  <p className="texto-2">
                    Déficit em kcal por dia. "As medidas mostram" vem da tendência de {tendencia.medicoes} medições ({formatarData(tendencia.de)} a{' '}
                    {formatarData(tendencia.ate)}): massa gorda {num(tendencia.gorda_semana, 2)} kg/sem e massa magra {num(tendencia.magra_semana, 2)}{' '}
                    kg/sem, a ~9.400 kcal por kg de gordura e ~1.800 por kg de massa magra.
                    {necessario !== null && ' "Para a meta" é o déficit que leva a massa gorda da meta até o fim do projeto.'}
                  </p>
                  {seguido && conselho && (
                    <div className="pilha" style={{ gap: 4 }}>
                      <p>
                        <b>{textoPlanoSeguido(seguido)}</b>
                        <span className="texto-2"> · {textoDietaSemana(seguido)}, "em parte" vale meio dia</span>
                      </p>
                      <p className={conselho.tipo === 'bate' || conselho.tipo === 'impreciso' ? 'texto-2' : 'alerta'} style={conselho.tipo === 'bate' || conselho.tipo === 'impreciso' ? undefined : { display: 'block' }}>
                        {conselho.texto}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="texto-2">Com 4 medições em pelo menos 3 semanas, o app compara o déficit do plano com o que as suas medidas mostram.</p>
              )}
            </details>
          </div>
        ) : (
          <div className="alerta" style={{ display: 'block' }}>
            O basal (taxa metabólica basal) é calculado pela sua massa magra, que vem da medição de cintura, pescoço{perfil?.sexo === 'Feminino' ? ', quadril' : ''} e peso. Registre uma medição na aba{' '}
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
                  fechar={saldo ? fecharMacro(item, banco.mapa.get(item.alimento_id), saldo) : null}
                />
              ))}
              <div className="refeicao-rodape">
                <button type="button" className="botao pequeno" onClick={() => setSeletor({ refeicao: r.id, indice: null })}>
                  + Alimento
                </button>
                {r.itens.length > 0 && m && (
                  <div className="pilha" style={{ gap: 2, alignItems: 'flex-end' }}>
                    <LinhaMacros m={m} kcalFinal={false} colageno={proteinaColageno([r], banco.mapa)} />
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
        onClick={() => atualizar({ refeicoes: [...plano.refeicoes, { id: novoId(), nome: proximoNomeRefeicao(plano.refeicoes), horario: null, itens: [] }] })}
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
                      {num(ptnVegetal * 4, 0)} kcal · {total.kcal ? num(((ptnVegetal * 4) / total.kcal) * 100, 0) : 0}% · sai da conta do carbo
                      {colageno >= 0.05 && ` · colágeno e gelatina (${gr(colageno)} g) à parte`}
                    </div>
                  </td>
                  <td>–</td>
                  <td>{gr(ptnVegetal)} g</td>
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
          {ptnTotal && total.kcal > 0 && (
            <>
              <p className="texto-2" style={{ marginTop: 8 }}>
                <b>Proteína total (animal + vegetal): {gr(ptnTotal.g)} g</b> = {num(ptnTotal.gkg_magra, 1)} g/kg de massa magra · {num(ptnTotal.gkg_peso, 1)} g/kg
                de peso. A meta continua só a animal.{colageno >= 1 && ` Colágeno e gelatina (${gr(colageno)} g) ficam fora.`}
              </p>
              {ptnTotal.abaixo && (
                <div className="alerta" style={{ marginTop: 8 }}>
                  A proteína total do plano está abaixo de {num(PTN_TOTAL_MIN_GKG_PESO, 1)} g/kg de peso ({gr(PTN_TOTAL_MIN_GKG_PESO * corpo.peso_kg)} g).
                </div>
              )}
            </>
          )}
          {distribuicao && distribuicao.com_itens > 0 && (
            <div className={distribuicao.concentracao || distribuicao.no_alvo < MINIMO_REFEICOES_ALVO ? 'alerta' : 'texto-2'} style={{ marginTop: 8, display: 'block' }}>
              <b>
                Refeições no alvo:{' '}
                {distribuicao.no_alvo >= MINIMO_REFEICOES_ALVO
                  ? `${distribuicao.no_alvo} (mínimo ${MINIMO_REFEICOES_ALVO}) ✓`
                  : `${distribuicao.no_alvo} de ${MINIMO_REFEICOES_ALVO} (mínimo)`}
              </b>
              {distribuicao.com_itens !== MINIMO_REFEICOES_ALVO && ` · ${distribuicao.com_itens} com alimentos no plano`}
              {distribuicao.concentracao && (
                <>
                  {' '}
                  · {distribuicao.concentracao.nome} tem {gr(distribuicao.concentracao.g)} g ({num(distribuicao.concentracao.fracao_dia * 100, 0)}% do dia): passar ~
                  {num(distribuicao.concentracao.mover, 0)} g para {juntar(distribuicao.concentracao.para)}.
                </>
              )}
              <div className="sub-linha" style={{ marginTop: 4 }}>
                No alvo = {gr(distribuicao.corte)} g ou mais de proteína animal (90% de ~{gr(distribuicao.alvo)} g, 0,4 g/kg de massa magra). Refeição sem
                alimentos fica fora da contagem.
              </div>
            </div>
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

      {removidos.length > 0 && (
        <div className="alerta info desfazer" role="status">
          <span className="cresce">{removidos.length === 1 ? `${removidos[0].nome} removido.` : `${removidos.length} alimentos removidos.`}</span>
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
        <FormConfigDieta
          config={plano.config}
          corpo={corpo}
          aderencia={aderencia}
          fracaoMagra={fracaoMagra?.p ?? null}
          ritmoMedido={ritmoMedido && ritmoMedido.faixa !== 'ganho' ? ritmoMedido.pct : null}
          ptnVegetalPlano={ptnVegetal}
          aoSalvar={(c) => atualizar({ config: c })}
          aoFechar={() => setConfig(false)}
        />
      )}
      {troca && (
        <FolhaTroca
          troca={troca}
          aoEscolher={(item) => {
            mudarItem(troca.refeicao, troca.indice, item);
            setTroca(null);
          }}
          aoFechar={() => setTroca(null)}
        />
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
