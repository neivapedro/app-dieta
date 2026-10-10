import { useEffect, useState, type FormEvent } from 'react';
import { useDados } from '../dados/contexto';
import { useTreino } from '../dados/useTreino';
import { diaDaSemana, formatarData, hojeLocal } from '../lib/datas';
import { cm, kg, lerFaixa, num, paraNumero, paraTexto, pp } from '../lib/formato';
import { ajusteDoPerfil, cenariosPesoMeta, cinturaAlvoRca, cinturaNecessaria, percentualGordura, type Composicao } from '../lib/gordura';
import { compararMetas } from '../lib/registroDecisoes';
import {
  digitosParaTempo,
  ESCALA_ESFORCO,
  formatarTempo,
  KM_CORRIDA_PADRAO,
  lerTempo,
  paceValido,
  rotuloCardio,
  rotuloTipoCardio,
  tipoCardioEfetivo,
  type TipoCardio,
} from '../lib/treino';
import type { MetasProjeto } from '../lib/tipos';
import { Campo, CampoNumero, Escolhas, Folha } from './ui';

export function Marcador({ rotulo, detalhe, feito, aoTocar }: { rotulo: string; detalhe: string; feito: boolean; aoTocar: () => void }) {
  return (
    <button type="button" className={`check-dia ${feito ? 'feito' : ''}`} onClick={aoTocar} aria-pressed={feito}>
      <span className="check-dia-icone">{feito ? '✓' : ''}</span>
      <span className="check-dia-rotulo">{rotulo}</span>
      <span className="check-dia-detalhe">{detalhe}</span>
    </button>
  );
}

/** Cartão "Treino de hoje": marca o treino e o cardio com um toque (Início e topo da aba Treino). */
export function CartaoTreinoHoje() {
  const t = useTreino();
  const { gravar } = useDados();
  const [corridaAberta, setCorridaAberta] = useState(false);
  const [detalhes, setDetalhes] = useState(false);
  if (!t) return null;
  const { hoje, placar } = t;
  if (!placar.iniciado || placar.encerrado) return null;
  const reg = t.doDia(hoje);
  const corrida = tipoCardioEfetivo(hoje, reg) === 'corrida';
  const diaNumero = placar.diasDecorridos + 1;

  // Cada toque grava o dia a partir do estado mais recente (a fila aplica na hora),
  // então tocar Treino e logo depois Cardio nunca apaga o primeiro check
  const alternar = (campo: 'treino' | 'cardio') => {
    // O dia virou com o app aberto: só atualiza a tela, não grava no dia de ontem
    if (hojeLocal() !== hoje) return void window.dispatchEvent(new Event('focus'));
    const atual = t.doDia(hoje);
    gravar({
      tipo: 'treino',
      dado: {
        data: hoje,
        treino: campo === 'treino' ? !atual?.treino : !!atual?.treino,
        cardio: campo === 'cardio' ? !atual?.cardio : !!atual?.cardio,
        corrida_km: atual?.corrida_km ?? null,
        corrida_seg: atual?.corrida_seg ?? null,
        // Tipo do cardio e esforço já anotados continuam como estavam (desmarcar apaga o esforço daquela sessão)
        cardio_tipo: atual?.cardio_tipo ?? null,
        esforco_treino: campo === 'treino' && atual?.treino ? null : (atual?.esforco_treino ?? null),
        esforco_cardio: campo === 'cardio' && atual?.cardio ? null : (atual?.esforco_cardio ?? null),
      },
    });
  };

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
        <Marcador rotulo="Treino" detalhe="musculação" feito={!!reg?.treino} aoTocar={() => alternar('treino')} />
        <Marcador
          rotulo="Cardio"
          detalhe={rotuloCardio(hoje, reg)}
          feito={!!reg?.cardio}
          aoTocar={() => (corrida && !reg?.cardio ? setCorridaAberta(true) : alternar('cardio'))}
        />
      </div>
      <button type="button" className="botao pequeno bloco-largo" style={{ marginTop: 8 }} onClick={() => setDetalhes(true)}>
        Esforço e tipo de cardio
      </button>
      {corridaAberta && <FormDiaTreino data={hoje} marcarCardio aoFechar={() => setCorridaAberta(false)} />}
      {detalhes && <FormDiaTreino data={hoje} aoFechar={() => setDetalhes(false)} />}
    </section>
  );
}

const OPCOES_TIPO: { valor: TipoCardio; rotulo: string }[] = [
  { valor: 'corrida', rotulo: 'Corrida' },
  { valor: 'bike', rotulo: 'Bike' },
];
const OPCOES_ESFORCO = Array.from({ length: 10 }, (_, i) => ({ valor: i + 1, rotulo: String(i + 1) }));

/** Âncora da escala para o valor escolhido: 5 → "pesado"; 6 → "entre pesado e muito pesado". */
function textoEsforco(v: number | null): string {
  if (v === null) return '3 moderado · 5 pesado · 7 muito pesado · 10 máximo. Anote uns 30 min depois da sessão.';
  const ancoras = Object.keys(ESCALA_ESFORCO).map(Number);
  const abaixo = Math.max(...ancoras.filter((k) => k <= v));
  const acima = Math.min(...ancoras.filter((k) => k >= v));
  const texto = abaixo === acima ? ESCALA_ESFORCO[v] : `entre ${ESCALA_ESFORCO[abaixo]} e ${ESCALA_ESFORCO[acima]}`;
  return `${v} · ${texto}. Vale a sessão inteira, não a série mais dura.`;
}

/** Edição de um dia: treino, cardio (corrida ou bike, em qualquer dia), distância e tempo da corrida e esforço. */
export function FormDiaTreino({ data, marcarCardio, aoFechar }: { data: string; marcarCardio?: boolean; aoFechar: () => void }) {
  const t = useTreino();
  const { gravar, hoje } = useDados();
  const reg = t?.doDia(data);
  const [treino, setTreino] = useState(!!reg?.treino);
  // Cardio pré-marcado só quando o formulário vem do botão "Cardio" do dia
  const [cardio, setCardio] = useState(reg ? reg.cardio || !!marcarCardio : !!marcarCardio);
  // Pré-selecionado pelo que foi salvo; sem registro, pela regra (quarta e domingo = corrida)
  const [tipo, setTipo] = useState<TipoCardio>(tipoCardioEfetivo(data, reg));
  const [km, setKm] = useState(paraTexto(reg?.corrida_km ?? KM_CORRIDA_PADRAO));
  const [tempo, setTempo] = useState(reg?.corrida_seg ? formatarTempo(reg.corrida_seg) : '');
  const [esforcoTreino, setEsforcoTreino] = useState<number | null>(reg?.esforco_treino ?? null);
  const [esforcoCardio, setEsforcoCardio] = useState<number | null>(reg?.esforco_cardio ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const corrida = tipo === 'corrida';

  const kmN = paraNumero(km);
  const seg = tempo.trim() ? lerTempo(tempo) : null;
  // Distância vazia: as contas usam a padrão (5 km), então o pace é conferido com ela também
  const kmConta = km.trim() ? kmN : KM_CORRIDA_PADRAO;
  const pace = seg && kmConta ? seg / kmConta : null;

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (corrida && cardio && tempo.trim() && !seg) return setErro('Tempo inválido. Digite só os números, ex.: 2830 para 28:30.');
    if (corrida && cardio && km.trim() && !(kmN !== null && kmN > 0 && kmN <= 60)) return setErro('Informe a distância da corrida (maior que zero), em km.');
    if (corrida && cardio && pace && !paceValido(pace)) return setErro(`Confira o tempo: deu ${formatarTempo(pace)} por km.`);
    gravar({
      tipo: 'treino',
      dado: {
        data,
        treino,
        cardio,
        // Bike não tem distância: escolher Bike numa quarta apaga os km da corrida
        corrida_km: corrida && cardio ? kmN : null,
        corrida_seg: corrida && cardio ? seg : null,
        cardio_tipo: cardio ? tipo : null,
        esforco_treino: treino ? esforcoTreino : null,
        esforco_cardio: cardio ? esforcoCardio : null,
      },
    });
    aoFechar();
  }

  return (
    <Folha titulo={`${diaDaSemana(data)}, ${formatarData(data)}`} aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <div className="linha" style={{ flexWrap: 'nowrap' }}>
          <Marcador rotulo="Treino" detalhe="musculação" feito={treino} aoTocar={() => setTreino(!treino)} />
          <Marcador rotulo="Cardio" detalhe={rotuloTipoCardio(tipo)} feito={cardio} aoTocar={() => setCardio(!cardio)} />
        </div>
        {cardio && (
          <Campo rotulo={data === hoje ? 'Cardio de hoje' : 'Cardio do dia'} grupo dica="A corrida pode ser em qualquer dia; a meta continua 2 corridas e 5 bikes por semana.">
            <Escolhas opcoes={OPCOES_TIPO} valor={tipo} aoMudar={(v) => v && (setTipo(v), setErro(null))} />
          </Campo>
        )}
        {corrida && cardio && (
          <>
            <div className="grade">
              <CampoNumero rotulo="Distância" sufixo="km" valor={km} aoMudar={setKm} />
              <Campo rotulo="Tempo (opcional)" dica="Só os números: 2830 = 28:30">
                <input
                  inputMode="numeric"
                  value={tempo}
                  placeholder="28:30"
                  onChange={(e) => {
                    setTempo(digitosParaTempo(e.target.value));
                    setErro(null);
                  }}
                />
              </Campo>
            </div>
            {pace && (
              <div className={`alerta ${paceValido(pace) ? 'info' : 'erro'}`}>
                Pace: {formatarTempo(pace)} /km{!km.trim() ? ` (com ${KM_CORRIDA_PADRAO} km, a distância padrão)` : ''}
                {paceValido(pace) ? '' : ' — confira o tempo'}
              </div>
            )}
          </>
        )}
        {treino && (
          <Campo rotulo="Esforço da musculação (opcional)" grupo dica={textoEsforco(esforcoTreino)}>
            <div className="escolhas-compactas">
              <Escolhas opcoes={OPCOES_ESFORCO} valor={esforcoTreino} aoMudar={setEsforcoTreino} permitirVazio />
            </div>
          </Campo>
        )}
        {cardio && (
          <Campo rotulo="Esforço do cardio (opcional)" grupo dica={textoEsforco(esforcoCardio)}>
            <div className="escolhas-compactas">
              <Escolhas opcoes={OPCOES_ESFORCO} valor={esforcoCardio} aoMudar={setEsforcoCardio} permitirVazio />
            </div>
          </Campo>
        )}
        {erro && <div className="alerta erro">{erro}</div>}
        <button className="botao primario">Salvar</button>
      </form>
    </Folha>
  );
}

/** Metas para o fim do projeto, definidas depois de conhecer as medidas reais. */
export function FormMetas({
  base,
  aoFechar,
  primeiraVez,
  encerrado,
}: {
  base: Composicao | null;
  aoFechar: () => void;
  primeiraVez?: boolean;
  /** Projeto encerrado: a base é a medição final do projeto, não a de hoje */
  encerrado?: boolean;
}) {
  const { perfil, executar, medidas, registrarAlteracoes, limparErro } = useDados();
  const m = perfil?.metas_projeto;
  // Altura do perfil (fonte única); sem ela, a da última medição
  const altura = perfil?.altura_cm ?? [...medidas].sort((a, b) => b.data.localeCompare(a.data))[0]?.altura_cm ?? null;
  const feminino = perfil?.sexo === 'Feminino';
  const ajuste = ajusteDoPerfil(perfil);
  const cinturaRca = cinturaAlvoRca(altura);
  const [pescoco, setPescoco] = useState(paraTexto(m?.pescoco_cm));
  const [cintura, setCintura] = useState(paraTexto(m?.cintura_cm));
  const [quadril, setQuadril] = useState(paraTexto(m?.quadril_cm));
  const [peso, setPeso] = useState(paraTexto(m?.peso_kg));
  const [bf, setBf] = useState(paraTexto(m?.bf));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Fora da faixa não entra nas contas de prévia (cintura necessária, massa magra na meta)
  const naFaixa = (v: number | null, min: number, max: number) => (v !== null && v >= min && v <= max ? v : null);
  const pesoN = naFaixa(paraNumero(peso), 30, 300);
  const bfN = naFaixa(paraNumero(bf), 2, 75);
  // O aviso some assim que algum campo é preenchido
  useEffect(() => setErro(null), [pescoco, cintura, quadril, peso, bf]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    // Mesmas faixas da medição: medidas de 20 a 250 cm, % de 2 a 75, peso de 30 a 300 kg
    const lidos = {
      cintura_cm: lerFaixa(cintura, 20, 250, 'Cintura', 'cm'),
      pescoco_cm: lerFaixa(pescoco, 20, 250, 'Pescoço', 'cm'),
      quadril_cm: feminino ? lerFaixa(quadril, 20, 250, 'Quadril', 'cm') : { valor: null },
      bf: lerFaixa(bf, 2, 75, '% de gordura', '%'),
      peso_kg: lerFaixa(peso, 30, 300, 'Peso', 'kg'),
    };
    const ruim = Object.values(lidos).find((l) => l.erro);
    if (ruim?.erro) return setErro(ruim.erro);
    const metas: MetasProjeto = {
      pescoco_cm: lidos.pescoco_cm.valor,
      cintura_cm: lidos.cintura_cm.valor,
      quadril_cm: lidos.quadril_cm.valor,
      peso_kg: lidos.peso_kg.valor,
      bf: lidos.bf.valor,
    };
    if (Object.values(metas).every((v) => v === null)) return setErro('Preencha ao menos uma meta.');
    if (salvando) return;
    setSalvando(true);
    try {
      await executar((r) => r.salvarMetas(metas));
      registrarAlteracoes(compararMetas(m, metas));
      aoFechar();
    } catch (e) {
      // Uma mensagem só, no formulário (executar já tinha posto a mesma no aviso do topo)
      limparErro();
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  const quando = base && encerrado ? `Final do projeto (${formatarData(base.data).slice(0, 5)})` : 'Hoje';
  const atual = (v: number | null | undefined, f: (n: number | null | undefined) => string) => (base ? `${quando}: ${f(v)}` : undefined);

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
          <CampoNumero
            rotulo="Cintura"
            sufixo="cm"
            valor={cintura}
            aoMudar={setCintura}
            dica={
              <>
                {atual(base?.cintura_cm, cm)}
                {cinturaRca !== null && (
                  <>
                    {base ? <br /> : null}
                    Referência saudável: abaixo de {cm(cinturaRca)} (metade da altura)
                  </>
                )}
              </>
            }
          />
          <CampoNumero rotulo="Pescoço" sufixo="cm" valor={pescoco} aoMudar={setPescoco} dica={atual(base?.pescoco_cm, cm)} />
          {feminino && <CampoNumero rotulo="Quadril" sufixo="cm" valor={quadril} aoMudar={setQuadril} dica={atual(base?.quadril_cm, cm)} />}
          <CampoNumero rotulo="% de gordura" sufixo="%" valor={bf} aoMudar={setBf} dica={atual(base?.bf, pp)} />
          <CampoNumero rotulo="Peso" sufixo="kg" valor={peso} aoMudar={setPeso} dica={atual(base?.peso_kg, kg)} />
        </div>
        {(() => {
          // Coerência: no método US Navy o % de gordura sai da cintura, do pescoço e da altura
          const bfDasMedidas =
            altura && paraNumero(cintura) && paraNumero(pescoco)
              ? percentualGordura(perfil?.sexo ?? 'Masculino', altura, paraNumero(pescoco)!, paraNumero(cintura)!, feminino ? paraNumero(quadril) : null, ajuste)
              : null;
          const magraMeta = pesoN && bfN ? pesoN * (1 - bfN / 100) : null;
          const magraHoje = base?.massa_magra_kg ?? null;
          const pesoPreserva = bfN && magraHoje ? magraHoje / (1 - bfN / 100) : null;
          // A meta de % traduzida em cintura (pescoço da meta ou o de hoje; no feminino, o quadril da meta ou o de hoje)
          const pescocoRef = paraNumero(pescoco) ?? base?.pescoco_cm ?? null;
          const quadrilRef = (feminino ? paraNumero(quadril) : null) ?? base?.quadril_cm ?? null;
          const cinturaMeta = bfN && altura && pescocoRef ? cinturaNecessaria(perfil?.sexo ?? 'Masculino', altura, pescocoRef, bfN, ajuste, quadrilRef) : null;
          const cenarios = bfN && base?.massa_magra_kg ? cenariosPesoMeta(base.massa_magra_kg, base.peso_kg, bfN) : [];
          return (
            <>
              {cinturaMeta !== null && (
                <div className="alerta info">
                  Para {num(bfN, 1)}% a cintura precisa ficar em ≈ {cm(cinturaMeta)} (pescoço {cm(pescocoRef)}
                  {feminino ? `, quadril ${cm(quadrilRef)}` : ''}).
                </div>
              )}
              {cenarios.length > 0 && (
                <div className="alerta info" style={{ display: 'block' }}>
                  Peso para {num(bfN, 1)}%:{' '}
                  {cenarios
                    .map((c) => `${c.fracao_magra === 0 ? 'mantendo a massa magra' : `perdendo ${Math.round(c.fracao_magra * 100)}% em massa magra`} ${kg(c.peso_kg)}`)
                    .join(' · ')}
                  .
                </div>
              )}
              {bfDasMedidas !== null && (
                <div className={`alerta ${bfN !== null && Math.abs(bfDasMedidas - bfN) > 2 ? '' : 'info'}`}>
                  Cintura {cintura}{feminino ? `, quadril ${quadril}` : ''} e pescoço {pescoco} dão {num(bfDasMedidas, 1)}% de gordura (altura {num(altura, 0)} cm).
                  {bfN !== null && Math.abs(bfDasMedidas - bfN) > 2 ? ' Diferente do % da meta: ajuste um dos dois.' : ''}
                </div>
              )}
              {magraMeta !== null && magraHoje !== null && magraMeta < magraHoje - 0.5 && (
                <div className="alerta">
                  Peso {kg(pesoN)} com {num(bfN, 1)}% dá {kg(magraMeta)} de massa magra, abaixo dos {kg(magraHoje)} de hoje. Para manter a massa magra com{' '}
                  {num(bfN, 1)}%, o peso seria ≈ {kg(pesoPreserva)}.
                </div>
              )}
            </>
          );
        })()}
        {pesoN && bfN ? (
          <div className="grade">
            <div className="bloco"><div className="rotulo">Massa magra na meta</div><div className="valor">{kg(pesoN * (1 - bfN / 100))}</div></div>
            <div className="bloco"><div className="rotulo">Massa gorda na meta</div><div className="valor">{kg((pesoN * bfN) / 100)}</div></div>
          </div>
        ) : null}
        {base && (
          <p className="mudo">
            Referência: massa magra {encerrado ? `no final do projeto (${formatarData(base.data).slice(0, 5)})` : 'hoje'} {kg(base.massa_magra_kg)} · massa gorda {kg(base.massa_gorda_kg)} ({num(base.bf, 1)}%).
          </p>
        )}
        {erro && <div className="alerta erro">{erro}</div>}
        <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar metas'}</button>
        {primeiraVez && (
          <button type="button" className="botao pequeno" onClick={aoFechar}>
            Definir depois
          </button>
        )}
      </form>
    </Folha>
  );
}

