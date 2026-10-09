import { useState, type FormEvent } from 'react';
import { useDados } from '../dados/contexto';
import { useTreino } from '../dados/useTreino';
import { diaDaSemana, formatarData } from '../lib/datas';
import { cm, kg, num, paraNumero, paraTexto, pp } from '../lib/formato';
import type { Composicao } from '../lib/gordura';
import { formatarTempo, KM_CORRIDA_PADRAO, lerTempo, rotuloCardio, tipoCardio } from '../lib/treino';
import type { MetasProjeto, TreinoDia } from '../lib/tipos';
import { Campo, CampoNumero, Folha } from './ui';

function Marcador({ rotulo, detalhe, feito, aoTocar }: { rotulo: string; detalhe: string; feito: boolean; aoTocar: () => void }) {
  return (
    <button type="button" className={`check-dia ${feito ? 'feito' : ''}`} onClick={aoTocar} aria-pressed={feito}>
      <span className="check-dia-icone">{feito ? '✓' : ''}</span>
      <span className="check-dia-rotulo">{rotulo}</span>
      <span className="check-dia-detalhe">{detalhe}</span>
    </button>
  );
}

/** Cartão da tela Início: marca o treino e o cardio de hoje com um toque. */
export function CartaoTreinoHoje() {
  const t = useTreino();
  const { executar } = useDados();
  const [corridaAberta, setCorridaAberta] = useState(false);
  if (!t) return null;
  const { hoje, placar } = t;
  if (!placar.iniciado || placar.encerrado) return null;
  const reg = t.doDia(hoje);
  const corrida = tipoCardio(hoje) === 'corrida';
  const diaNumero = placar.diasDecorridos + 1;

  const salvar = (mudanca: Partial<TreinoDia>) =>
    executar((r) =>
      r.salvarTreino({
        data: hoje,
        treino: reg?.treino ?? false,
        cardio: reg?.cardio ?? false,
        corrida_km: reg?.corrida_km ?? null,
        corrida_seg: reg?.corrida_seg ?? null,
        ...mudanca,
      }),
    ).catch(() => undefined);

  return (
    <section className="cartao">
      <div className="cartao-cab">
        <h2>Treino de hoje</h2>
        <span className="mudo">
          Dia {diaNumero} de {placar.totalDias}
          {placar.sequenciaAtual > 1 ? ` · 🔥 ${placar.sequenciaAtual} seguidos` : ''}
        </span>
      </div>
      <div className="linha" style={{ flexWrap: 'nowrap' }}>
        <Marcador rotulo="Treino" detalhe="musculação" feito={!!reg?.treino} aoTocar={() => salvar({ treino: !reg?.treino })} />
        <Marcador
          rotulo="Cardio"
          detalhe={rotuloCardio(hoje)}
          feito={!!reg?.cardio}
          aoTocar={() => (corrida ? setCorridaAberta(true) : salvar({ cardio: !reg?.cardio }))}
        />
      </div>
      {corridaAberta && <FormDiaTreino data={hoje} aoFechar={() => setCorridaAberta(false)} />}
    </section>
  );
}

/** Edição de um dia: treino, cardio e, na corrida, distância e tempo. */
export function FormDiaTreino({ data, aoFechar }: { data: string; aoFechar: () => void }) {
  const t = useTreino();
  const { executar } = useDados();
  const reg = t?.doDia(data);
  const corrida = tipoCardio(data) === 'corrida';
  const [treino, setTreino] = useState(!!reg?.treino);
  const [cardio, setCardio] = useState(reg ? reg.cardio : corrida);
  const [km, setKm] = useState(paraTexto(reg?.corrida_km ?? KM_CORRIDA_PADRAO));
  const [tempo, setTempo] = useState(reg?.corrida_seg ? formatarTempo(reg.corrida_seg) : '');
  const [erro, setErro] = useState<string | null>(null);

  const kmN = paraNumero(km);
  const seg = tempo.trim() ? lerTempo(tempo) : null;
  const pace = seg && kmN ? seg / kmN : null;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (tempo.trim() && !seg) return setErro('Tempo inválido. Use minutos:segundos, ex.: 28:30.');
    try {
      await executar((r) =>
        r.salvarTreino({
          data,
          treino,
          cardio,
          corrida_km: corrida && cardio ? kmN : null,
          corrida_seg: corrida && cardio ? seg : null,
        }),
      );
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <Folha titulo={`${diaDaSemana(data)}, ${formatarData(data)}`} aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <div className="linha" style={{ flexWrap: 'nowrap' }}>
          <Marcador rotulo="Treino" detalhe="musculação" feito={treino} aoTocar={() => setTreino(!treino)} />
          <Marcador rotulo="Cardio" detalhe={rotuloCardio(data)} feito={cardio} aoTocar={() => setCardio(!cardio)} />
        </div>
        {corrida && cardio && (
          <>
            <div className="grade">
              <CampoNumero rotulo="Distância" sufixo="km" valor={km} aoMudar={setKm} />
              <Campo rotulo="Tempo (opcional)" dica="minutos:segundos, ex.: 28:30">
                <input inputMode="numeric" value={tempo} placeholder="28:30" onChange={(e) => setTempo(e.target.value.replace(/[^\d:]/g, ''))} />
              </Campo>
            </div>
            {pace && <div className="alerta info">Pace: {formatarTempo(pace)} /km</div>}
          </>
        )}
        {erro && <div className="alerta erro">{erro}</div>}
        <button className="botao primario">Salvar</button>
      </form>
    </Folha>
  );
}

/** Metas para o fim do projeto, definidas depois de conhecer as medidas reais. */
export function FormMetas({ base, aoFechar, primeiraVez }: { base: Composicao | null; aoFechar: () => void; primeiraVez?: boolean }) {
  const { perfil, executar } = useDados();
  const m = perfil?.metas_projeto;
  const feminino = perfil?.sexo === 'Feminino';
  const [pescoco, setPescoco] = useState(paraTexto(m?.pescoco_cm));
  const [cintura, setCintura] = useState(paraTexto(m?.cintura_cm));
  const [quadril, setQuadril] = useState(paraTexto(m?.quadril_cm));
  const [peso, setPeso] = useState(paraTexto(m?.peso_kg));
  const [bf, setBf] = useState(paraTexto(m?.bf));
  const [erro, setErro] = useState<string | null>(null);

  const pesoN = paraNumero(peso);
  const bfN = paraNumero(bf);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const metas: MetasProjeto = {
      pescoco_cm: paraNumero(pescoco),
      cintura_cm: paraNumero(cintura),
      quadril_cm: feminino ? paraNumero(quadril) : null,
      peso_kg: pesoN,
      bf: bfN,
    };
    if (Object.values(metas).every((v) => v === null)) return setErro('Preencha ao menos uma meta.');
    try {
      await executar((r) => r.salvarMetas(metas));
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const atual = (v: number | null | undefined, f: (n: number | null | undefined) => string) => (base ? `Hoje: ${f(v)}` : undefined);

  return (
    <Folha titulo="Metas do fim do projeto" aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        {primeiraVez && (
          <p className="mudo">
            Agora que você conhece suas medidas reais, defina onde quer chegar no fim do projeto. Uma meta exequível e desafiadora. Dá para
            ajustar depois na aba Treino.
          </p>
        )}
        <div className="grade">
          <CampoNumero rotulo="Cintura" sufixo="cm" valor={cintura} aoMudar={setCintura} dica={atual(base?.cintura_cm, cm)} />
          <CampoNumero rotulo="Pescoço" sufixo="cm" valor={pescoco} aoMudar={setPescoco} dica={atual(base?.pescoco_cm, cm)} />
          {feminino && <CampoNumero rotulo="Quadril" sufixo="cm" valor={quadril} aoMudar={setQuadril} dica={atual(base?.quadril_cm, cm)} />}
          <CampoNumero rotulo="% de gordura" sufixo="%" valor={bf} aoMudar={setBf} dica={atual(base?.bf, pp)} />
          <CampoNumero rotulo="Peso" sufixo="kg" valor={peso} aoMudar={setPeso} dica={atual(base?.peso_kg, kg)} />
        </div>
        {pesoN && bfN ? (
          <div className="grade">
            <div className="bloco"><div className="rotulo">Massa magra na meta</div><div className="valor">{kg(pesoN * (1 - bfN / 100))}</div></div>
            <div className="bloco"><div className="rotulo">Massa gorda na meta</div><div className="valor">{kg((pesoN * bfN) / 100)}</div></div>
          </div>
        ) : null}
        {base && (
          <p className="mudo">
            Referência: massa magra hoje {kg(base.massa_magra_kg)} · massa gorda {kg(base.massa_gorda_kg)} ({num(base.bf, 1)}%).
          </p>
        )}
        {erro && <div className="alerta erro">{erro}</div>}
        <button className="botao primario">Salvar metas</button>
        {primeiraVez && (
          <button type="button" className="botao pequeno" onClick={aoFechar}>
            Definir depois
          </button>
        )}
      </form>
    </Folha>
  );
}

