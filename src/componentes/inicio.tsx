import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useTreino } from '../dados/useTreino';
import { diferencaDias, formatarData, hojeLocal } from '../lib/datas';
import { calcularMetas, calcularSaldo, gramasDoItem, macrosDaRefeicao, somar, type Refeicao } from '../lib/dieta';
import { num } from '../lib/formato';
import { aderenciaRecente, segundaDaSemana } from '../lib/treino';
import { gr, kcal } from './dieta';
import { Escolhas } from './ui';

function minutosAgora(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function minutos(h: string | null): number | null {
  if (!h) return null;
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
}

/** Próxima refeição pelo horário; sem horários, a primeira com alimentos. */
function proximaRefeicao(refeicoes: Refeicao[]): Refeicao | null {
  const comItens = refeicoes.filter((r) => r.itens.length);
  if (!comItens.length) return null;
  const agora = minutosAgora();
  // Pela hora, não pela ordem da lista
  const comHora = comItens.filter((r) => minutos(r.horario) !== null).sort((a, b) => minutos(a.horario)! - minutos(b.horario)!);
  return comHora.find((r) => minutos(r.horario)! >= agora - 30) ?? (comHora.length ? null : comItens[0]) ?? null;
}

const OPCOES_PLANO = [
  { valor: 'sim' as const, rotulo: 'Sim' },
  { valor: 'parcial' as const, rotulo: 'Em parte' },
  { valor: 'nao' as const, rotulo: 'Não' },
];

/** Cartão do Início: meta do dia, próxima refeição e "segui o plano?" */
export function CartaoDietaHoje() {
  const { dieta, diario, treinos, gravar } = useDados();
  const { composicoes, hoje } = useCalculos();
  const treino = useTreino();
  const { banco } = useAlimentos();
  if (!dieta || !dieta.refeicoes.some((r) => r.itens.length)) return null;
  const ultima = [...composicoes].reverse().find((c) => c.massa_magra_kg !== null) ?? null;
  const aderencia = treino ? aderenciaRecente(treinos, treino.inicio, hoje, 28, treino.fim) : null;
  const metas = ultima ? calcularMetas(dieta.config, { peso_kg: ultima.peso_kg, massa_magra_kg: ultima.massa_magra_kg! }, aderencia) : null;
  const total = banco ? somar(dieta.refeicoes.map((r) => macrosDaRefeicao(r, banco.mapa))) : null;
  const saldo = metas && total ? calcularSaldo(metas, total) : null;
  const prox = proximaRefeicao(dieta.refeicoes);
  const regHoje = diario.find((r) => r.data === hoje);

  function marcar(v: 'sim' | 'parcial' | 'nao' | null) {
    // O dia virou com o app aberto: só atualiza a tela, não grava no dia de ontem
    if (hojeLocal() !== hoje) return void window.dispatchEvent(new Event('focus'));
    const vazio =
      regHoje &&
      regHoje.peso_kg === null &&
      regHoje.nausea === null &&
      !regHoje.observacoes &&
      regHoje.vomito == null &&
      regHoje.diarreia == null &&
      regHoje.intestino_preso == null &&
      regHoje.sono_h == null &&
      regHoje.agua_l == null &&
      regHoje.cor_urina == null;
    // Desmarcar num dia sem mais nada não deixa registro vazio no Diário
    if (v === null && vazio) return gravar({ tipo: 'excluir', dado: { alvo: 'diario', id: regHoje.id, data: hoje } });
    gravar({
      tipo: 'diario',
      dado: {
        data: hoje,
        peso_kg: regHoje?.peso_kg ?? null,
        nausea: regHoje?.nausea ?? null,
        observacoes: regHoje?.observacoes ?? null,
        vomito: regHoje?.vomito ?? null,
        diarreia: regHoje?.diarreia ?? null,
        intestino_preso: regHoje?.intestino_preso ?? null,
        sono_h: regHoje?.sono_h ?? null,
        agua_l: regHoje?.agua_l ?? null,
        cor_urina: regHoje?.cor_urina ?? null,
        dieta_seguida: v,
      },
    });
  }

  return (
    <section className="cartao">
      <div className="cartao-cab">
        <h2>Dieta de hoje</h2>
        <Link to="/dieta" className="botao pequeno">
          Abrir
        </Link>
      </div>
      {metas && saldo ? (
        <div className="macros" style={{ fontSize: '0.85rem', marginBottom: 8 }}>
          <span className="m-k">{kcal(metas.meta_kcal)}</span>
          <span className="m-pa">Ptn A {gr(saldo.meta.ptn_animal)} g</span>
          <span className="m-c">Carb {gr(Math.max(0, saldo.meta.carb))} g</span>
          <span className="m-g">Gord {gr(saldo.meta.gord)} g</span>
        </div>
      ) : null}
      {metas && saldo && saldo.meta.carb < 0 && (
        <div className="alerta" style={{ display: 'block', marginBottom: 8 }}>
          A proteína e a gordura já passam da meta de kcal. Reduza o g/kg delas ou o déficit em Ajustar, na aba Dieta.
        </div>
      )}
      {metas && saldo ? null : (
        <p className="texto-2" style={{ marginBottom: 8 }}>
          Registre uma medição para calcular a meta.
        </p>
      )}
      {ultima && diferencaDias(ultima.data, hoje) > 10 && (
        <p className="texto-2" style={{ marginBottom: 8 }}>
          Meta calculada com a medição de {formatarData(ultima.data)}.
        </p>
      )}
      {prox && banco && (
        <p className="texto-2" style={{ marginBottom: 10 }}>
          <b>
            {prox.nome}
            {prox.horario ? ` · ${prox.horario}` : ''}:
          </b>{' '}
          {prox.itens
            .map((i) => {
              const a = banco.mapa.get(i.alimento_id);
              return `${a?.nome.split(',')[0] ?? '?'} ${num(gramasDoItem(i, a), 0)} g`;
            })
            .join(' · ')}
        </p>
      )}
      <div className="linha entre">
        <span className="rotulo">Segui o plano hoje?</span>
        <Escolhas opcoes={OPCOES_PLANO} valor={regHoje?.dieta_seguida ?? null} aoMudar={marcar} permitirVazio />
      </div>
    </section>
  );
}

/** Às segundas, enquanto não houver medição na semana: lembrete da medição em jejum. */
export function CartaoMedicaoSegunda({ aoMedir }: { aoMedir: () => void }) {
  const { medidas } = useDados();
  const { hoje } = useCalculos();
  if (!medidas.length) return null;
  const segunda = segundaDaSemana(hoje);
  if (hoje !== segunda) return null;
  if (medidas.some((m) => m.data >= segunda)) return null;
  return (
    <section className="cartao proxima hoje">
      <div className="cartao-cab">
        <h2>Medição de segunda</h2>
        <span className="etiqueta destaque">Hoje</span>
      </div>
      <p className="texto-2" style={{ marginBottom: 10 }}>
        Em jejum, depois de ir ao banheiro e antes de beber água. Mesma fita e mesmo horário de sempre.
      </p>
      <button className="botao primario bloco-largo" onClick={aoMedir}>
        Fazer a medição
      </button>
    </section>
  );
}
