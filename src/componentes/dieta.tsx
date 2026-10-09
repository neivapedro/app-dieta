import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  buscarAlimentos,
  calcularMetas,
  FATORES_ATIVIDADE,
  gramasDoItem,
  macrosDoItem,
  type Alimento,
  type Atividade,
  type ConfigDieta,
  type Corpo,
  type ItemRefeicao,
  type Macros,
  type Refeicao,
} from '../lib/dieta';
import { num, paraNumero, paraTexto } from '../lib/formato';
import { BotaoExcluir, Campo, CampoNumero, Escolhas, Folha } from './ui';

/** Gramas: 1 casa abaixo de 10, inteiro acima */
export function gr(n: number): string {
  return num(n, Math.abs(n) < 10 ? 1 : 0);
}

export function kcal(n: number): string {
  return `${num(n, 0)} kcal`;
}

export function LinhaMacros({ m, kcalFinal = true }: { m: Macros; kcalFinal?: boolean }) {
  return (
    <div className="macros">
      <span className="m-pa">Ptn A {gr(m.ptn_animal)}</span>
      <span className="m-pv">Ptn V {gr(m.ptn_vegetal)}</span>
      <span className="m-c">Carb {gr(m.carb)}</span>
      <span className="m-g">Gord {gr(m.gord)}</span>
      {kcalFinal && <span className="m-k">{kcal(m.kcal)}</span>}
    </div>
  );
}

function porcaoPadrao(a: Alimento): Pick<ItemRefeicao, 'quantidade' | 'unidade'> {
  return a.porcoes.length ? { quantidade: 1, unidade: a.porcoes[0].nome } : { quantidade: 100, unidade: 'g' };
}

export function novoItem(a: Alimento): ItemRefeicao {
  return { alimento_id: a.id, ...porcaoPadrao(a) };
}

function rotuloPorcao(a: Alimento, unidade: string): string {
  if (unidade === 'g') return 'g';
  const p = a.porcoes.find((x) => x.nome === unidade);
  return p ? `${p.nome} (${num(p.g, 0)} g)` : unidade;
}

/** Linha de um alimento: quantidade e unidade editáveis, macros na hora. */
export function LinhaItem({
  item,
  alimento,
  aoMudar,
  aoRemover,
  aoTrocar,
}: {
  item: ItemRefeicao;
  alimento: Alimento | undefined;
  aoMudar: (i: ItemRefeicao) => void;
  aoRemover: () => void;
  aoTrocar: () => void;
}) {
  const [texto, setTexto] = useState(paraTexto(item.quantidade));
  // Mantém o campo em sincronia quando a quantidade muda por fora (troca de unidade)
  useEffect(() => {
    if (paraNumero(texto) !== item.quantidade) setTexto(paraTexto(item.quantidade));
  }, [item.quantidade]);

  const m = macrosDoItem(item, alimento);
  const gramas = gramasDoItem(item, alimento);

  function mudarUnidade(unidade: string) {
    if (!alimento) return;
    const p = alimento.porcoes.find((x) => x.nome === unidade);
    // Converte para a nova unidade mantendo o mesmo peso
    const quantidade = unidade === 'g' ? Math.round(gramas) : Math.round((gramas / (p?.g ?? 1)) * 100) / 100;
    aoMudar({ ...item, unidade, quantidade });
  }

  return (
    <div className="item-dieta">
      <div className="item-dieta-topo">
        <button type="button" className="item-dieta-nome" onClick={aoTrocar}>
          {alimento?.nome ?? 'Alimento não encontrado'}
        </button>
        <button type="button" className="remover" onClick={aoRemover} aria-label="Remover alimento">
          ×
        </button>
      </div>
      <div className="item-dieta-qtd">
        <input
          inputMode="decimal"
          aria-label="Quantidade"
          value={texto}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.,]/g, '');
            setTexto(v);
            const n = paraNumero(v);
            if (n !== null) aoMudar({ ...item, quantidade: n });
          }}
        />
        <select aria-label="Unidade" value={item.unidade} onChange={(e) => mudarUnidade(e.target.value)}>
          <option value="g">g</option>
          {alimento?.porcoes.map((p) => (
            <option key={p.nome} value={p.nome}>
              {rotuloPorcao(alimento, p.nome)}
            </option>
          ))}
        </select>
        {item.unidade !== 'g' && <span className="mudo">= {num(gramas, 0)} g</span>}
      </div>
      <LinhaMacros m={m} />
    </div>
  );
}

/** Busca no banco de alimentos. */
export function SeletorAlimento({
  lista,
  usados,
  aoEscolher,
  aoFechar,
}: {
  lista: Alimento[];
  usados: Set<string>;
  aoEscolher: (a: Alimento) => void;
  aoFechar: () => void;
}) {
  const [termo, setTermo] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);
  const achados = useMemo(() => buscarAlimentos(lista, termo, usados), [lista, termo, usados]);

  return (
    <Folha titulo="Escolher alimento" aoFechar={aoFechar}>
      <div className="pilha">
        <Campo rotulo="Buscar">
          <input
            ref={campo}
            type="search"
            value={termo}
            placeholder="ex.: arroz cozido, frango grelhado, whey"
            onChange={(e) => setTermo(e.target.value)}
          />
        </Campo>
        {!termo.trim() && <p className="mudo">{usados.size ? 'Já usados no seu plano:' : `Digite para buscar entre ${lista.length} alimentos.`}</p>}
        {termo.trim() && !achados.length && <p className="mudo">Nada encontrado. Tente outra palavra (ex.: “carne patinho”).</p>}
        <div className="lista">
          {achados.map((a) => {
            const p = a.porcoes[0];
            const base = p ? p.g : 100;
            const m = macrosDoItem({ alimento_id: a.id, quantidade: base, unidade: 'g' }, a);
            return (
              <button type="button" key={a.id} className="item item-acao resultado" onClick={() => aoEscolher(a)}>
                <div className="cresce">
                  <div className="titulo">{a.nome}</div>
                  <div className="detalhe">
                    {p ? `1 ${p.nome} (${num(p.g, 0)} g)` : '100 g'}: {kcal(m.kcal)} · P {gr(m.ptn_animal + m.ptn_vegetal)} · C {gr(m.carb)} · G{' '}
                    {gr(m.gord)}
                    {a.animal ? ' · proteína animal' : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Folha>
  );
}

/** Nome, horário, ordem e exclusão de uma refeição. */
export function FormRefeicao({
  refeicao,
  primeira,
  ultima,
  aoSalvar,
  aoMover,
  aoExcluir,
  aoFechar,
}: {
  refeicao: Refeicao;
  primeira: boolean;
  ultima: boolean;
  aoSalvar: (r: Refeicao) => void;
  aoMover: (passo: -1 | 1) => void;
  aoExcluir: () => void;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(refeicao.nome);
  const [horario, setHorario] = useState(refeicao.horario ?? '');

  function salvar(e: FormEvent) {
    e.preventDefault();
    aoSalvar({ ...refeicao, nome: nome.trim() || refeicao.nome, horario: horario || null });
    aoFechar();
  }

  return (
    <Folha titulo="Refeição" aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <div className="grade">
          <Campo rotulo="Nome">
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <Campo rotulo="Horário (opcional)">
            <input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
          </Campo>
        </div>
        <button className="botao primario">Salvar</button>
        <div className="linha">
          <button type="button" className="botao pequeno cresce" disabled={primeira} onClick={() => aoMover(-1)}>
            ↑ Subir
          </button>
          <button type="button" className="botao pequeno cresce" disabled={ultima} onClick={() => aoMover(1)}>
            ↓ Descer
          </button>
        </div>
        <BotaoExcluir rotulo="Excluir refeição" aviso="Os alimentos dela também saem do plano." aoConfirmar={aoExcluir} />
      </form>
    </Folha>
  );
}

type Sentido = 'deficit' | 'manter' | 'superavit';

/** Gasto do dia a dia, exercícios, déficit/superávit e g/kg dos macros. */
export function FormConfigDieta({
  config,
  corpo,
  aoSalvar,
  aoFechar,
}: {
  config: ConfigDieta;
  corpo: Corpo | null;
  aoSalvar: (c: ConfigDieta) => void;
  aoFechar: () => void;
}) {
  const [fator, setFator] = useState(config.fator_atividade);
  const [atividades, setAtividades] = useState(
    config.atividades.map((a) => ({ nome: a.nome, kcal: paraTexto(a.kcal), vezes: paraTexto(a.vezes_semana) })),
  );
  const [sentido, setSentido] = useState<Sentido>(config.ajuste_kcal < 0 ? 'deficit' : config.ajuste_kcal > 0 ? 'superavit' : 'manter');
  const [ajuste, setAjuste] = useState(paraTexto(Math.abs(config.ajuste_kcal) || 300));
  const [ptn, setPtn] = useState(paraTexto(config.ptn_gkg));
  const [gord, setGord] = useState(paraTexto(config.gord_gkg));

  const montar = (): ConfigDieta => ({
    fator_atividade: fator,
    atividades: atividades
      .map<Atividade>((a) => ({ nome: a.nome.trim(), kcal: paraNumero(a.kcal) ?? 0, vezes_semana: paraNumero(a.vezes) ?? 0 }))
      .filter((a) => a.nome || a.kcal),
    ajuste_kcal: sentido === 'manter' ? 0 : (sentido === 'deficit' ? -1 : 1) * Math.abs(paraNumero(ajuste) ?? 0),
    ptn_gkg: paraNumero(ptn) ?? config.ptn_gkg,
    gord_gkg: paraNumero(gord) ?? config.gord_gkg,
  });
  const previa = corpo ? calcularMetas(montar(), corpo) : null;

  function salvar(e: FormEvent) {
    e.preventDefault();
    aoSalvar(montar());
    aoFechar();
  }

  const mudarAtividade = (i: number, campo: 'nome' | 'kcal' | 'vezes', v: string) =>
    setAtividades(atividades.map((a, j) => (j === i ? { ...a, [campo]: v } : a)));

  return (
    <Folha titulo="Ajustar gasto e metas" aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <Campo rotulo="Seu dia a dia, sem contar o exercício" grupo dica={FATORES_ATIVIDADE.find((f) => f.valor === fator)?.detalhe}>
          <Escolhas
            opcoes={FATORES_ATIVIDADE.map((f) => ({ valor: f.valor, rotulo: `${f.rotulo} ×${num(f.valor, f.valor === 1.45 ? 2 : 1)}` }))}
            valor={fator}
            aoMudar={(v) => v && setFator(v)}
          />
        </Campo>

        <div className="pilha" style={{ gap: 8 }}>
          <span className="rotulo">Exercícios da semana</span>
          {atividades.length > 0 && (
            <div className="atividade atividade-cab">
              <span>Atividade</span>
              <span>kcal/sessão</span>
              <span>×/semana</span>
              <span />
            </div>
          )}
          {atividades.map((a, i) => (
            <div key={i} className="atividade">
              <input aria-label="Atividade" placeholder="Atividade" value={a.nome} onChange={(e) => mudarAtividade(i, 'nome', e.target.value)} />
              <input
                aria-label="kcal por sessão"
                inputMode="numeric"
                placeholder="kcal"
                value={a.kcal}
                onChange={(e) => mudarAtividade(i, 'kcal', e.target.value.replace(/[^\d.,]/g, ''))}
              />
              <input
                aria-label="Vezes por semana"
                inputMode="numeric"
                placeholder="×/sem"
                value={a.vezes}
                onChange={(e) => mudarAtividade(i, 'vezes', e.target.value.replace(/[^\d.,]/g, ''))}
              />
              <button type="button" className="remover" aria-label="Remover atividade" onClick={() => setAtividades(atividades.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="botao pequeno" onClick={() => setAtividades([...atividades, { nome: '', kcal: '', vezes: '' }])}>
            + Atividade
          </button>
        </div>

        <Campo rotulo="Objetivo" grupo>
          <Escolhas
            opcoes={[
              { valor: 'deficit' as Sentido, rotulo: 'Déficit' },
              { valor: 'manter' as Sentido, rotulo: 'Manter' },
              { valor: 'superavit' as Sentido, rotulo: 'Superávit' },
            ]}
            valor={sentido}
            aoMudar={(v) => v && setSentido(v)}
          />
        </Campo>
        {sentido !== 'manter' && (
          <CampoNumero
            rotulo={sentido === 'deficit' ? 'Déficit por dia' : 'Superávit por dia'}
            sufixo="kcal"
            valor={ajuste}
            aoMudar={setAjuste}
            dica={previa ? `${num((Math.abs(paraNumero(ajuste) ?? 0) / previa.gasto_total) * 100, 0)}% do gasto total` : undefined}
          />
        )}
        <div className="grade">
          <CampoNumero rotulo="Proteína animal" sufixo="g/kg massa magra" valor={ptn} aoMudar={setPtn} />
          <CampoNumero rotulo="Gordura" sufixo="g/kg peso" valor={gord} aoMudar={setGord} />
        </div>
        <p className="mudo">O carboidrato não tem g/kg fixo: ele fecha a conta com o que sobra da meta de kcal.</p>
        {previa && (
          <div className="alerta info">
            Meta: {kcal(previa.meta_kcal)} · gasto total {kcal(previa.gasto_total)}
          </div>
        )}
        <button className="botao primario">Salvar</button>
      </form>
    </Folha>
  );
}
