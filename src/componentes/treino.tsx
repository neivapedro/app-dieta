import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useDados } from '../dados/contexto';
import { useTreino } from '../dados/useTreino';
import { diaDaSemana, formatarData, hojeLocal } from '../lib/datas';
import { cm, kg, lerFaixa, num, paraNumero, paraTexto, pp } from '../lib/formato';
import { ajusteVigente, cenariosPesoMeta, cinturaAlvoRca, cinturaNecessaria, percentualGordura, type Composicao } from '../lib/gordura';
import { compararMetas } from '../lib/registroDecisoes';
import {
  digitosParaTempo,
  ESCALA_ESFORCO,
  formatarTempo,
  lerTempo,
  paceValido,
  detalheTipoCardio,
  resumoCorrida,
  ritmoCorrida,
  rotuloTipoCardio,
  tipoCardio,
  tipoCardioEfetivo,
  tocarCardio,
  type TipoCardio,
} from '../lib/treino';
import type { MetasProjeto, TreinoDia } from '../lib/tipos';
import { Bloco, Campo, CampoNumero, Escolhas, Folha } from './ui';

export function Marcador({
  rotulo,
  detalhe,
  feito,
  aoTocar,
  previsto,
}: {
  rotulo: string;
  detalhe: string;
  feito: boolean;
  aoTocar: () => void;
  /** Cardio previsto pela regra do dia (quarta e domingo = corrida): borda em destaque enquanto nada foi marcado */
  previsto?: boolean;
}) {
  return (
    <button type="button" className={`check-dia ${feito ? 'feito' : ''} ${previsto ? 'previsto' : ''}`} onClick={aoTocar} aria-pressed={feito}>
      <span className="check-dia-icone">{feito ? '✓' : ''}</span>
      <span className="check-dia-rotulo">{rotulo}</span>
      <span className="check-dia-detalhe">{detalhe}</span>
    </button>
  );
}

/** Treino, Bike e Corrida do dia: um toque marca ou desmarca; Bike e Corrida são o mesmo cardio (um por dia). */
export function MarcadoresDia({
  data,
  reg,
  aoTreino,
  aoCardio,
}: {
  data: string;
  reg?: TreinoDia | null;
  aoTreino: () => void;
  aoCardio: (tipo: TipoCardio) => void;
}) {
  const feito = reg?.cardio ? tipoCardioEfetivo(data, reg) : null;
  const previsto = feito ? null : tipoCardio(data);
  return (
    <div className="linha marcadores-dia">
      <Marcador rotulo="Treino" detalhe="musculação" feito={!!reg?.treino} aoTocar={aoTreino} />
      <Marcador rotulo="Bike" detalhe={detalheTipoCardio('bike')} feito={feito === 'bike'} previsto={previsto === 'bike'} aoTocar={() => aoCardio('bike')} />
      <Marcador
        rotulo="Corrida"
        detalhe={detalheTipoCardio('corrida', reg?.corrida_km)}
        feito={feito === 'corrida'}
        previsto={previsto === 'corrida'}
        aoTocar={() => aoCardio('corrida')}
      />
    </div>
  );
}

/**
 * Ação da corrida marcada (Fechar o dia e Treino de hoje): sem nada anotado, chama para
 * registrar distância e tempo; com algo anotado, mostra o resumo e abre para editar.
 */
export function BotaoCorrida({ reg, aoTocar, style }: { reg?: TreinoDia | null; aoTocar: () => void; style?: CSSProperties }) {
  const resumo = resumoCorrida(reg?.corrida_km, reg?.corrida_seg);
  if (!resumo)
    return (
      <button type="button" className="botao pequeno bloco-largo botao-corrida" style={style} onClick={aoTocar} aria-label="Registrar distância e tempo da corrida">
        Registrar distância e tempo
      </button>
    );
  // Só o tempo anotado: avisa que falta a distância (sem ela não há pace)
  const semDistancia = !(reg?.corrida_km && reg.corrida_km > 0);
  return (
    <button
      type="button"
      className="botao bloco-largo botao-corrida com-resumo"
      style={style}
      onClick={aoTocar}
      aria-label={`Corrida: ${resumo}${semDistancia ? ' · sem distância' : ''} · editar`}
    >
      <span className="botao-corrida-texto">
        {/* "Editar" na linha do rótulo: o resumo usa a largura toda (cabe em 320 px) */}
        <span className="botao-corrida-topo">
          <span className="botao-corrida-rotulo">Corrida</span>
          <span className="botao-corrida-editar">Editar</span>
        </span>
        {/* Cada parte (km, tempo, pace) inteira numa linha; o "·" fica no fim da linha ao quebrar */}
        <span className="botao-corrida-resumo">
          {resumo.split(' · ').map((parte, i, todas) => (
            <span key={i}>
              {i > 0 && ' '}
              <span className="sem-quebra">
                <b>{parte}</b>
                {(i < todas.length - 1 || semDistancia) && '\u00a0·'}
              </span>
            </span>
          ))}
          {semDistancia && <span className="botao-corrida-falta"> sem distância</span>}
        </span>
      </span>
    </button>
  );
}

/** Cartão "Treino de hoje": marca o treino e o cardio com um toque (Início e topo da aba Treino). */
export function CartaoTreinoHoje() {
  const t = useTreino();
  const { gravar } = useDados();
  const [detalhes, setDetalhes] = useState(false);
  if (!t) return null;
  const { hoje, placar } = t;
  if (!placar.iniciado || placar.encerrado) return null;
  const reg = t.doDia(hoje);
  const corridaFeita = !!reg?.cardio && tipoCardioEfetivo(hoje, reg) === 'corrida';
  const diaNumero = placar.diaAtual;

  // Cada toque grava o dia a partir do estado mais recente (a fila aplica na hora),
  // então tocar Treino e logo depois Bike/Corrida nunca apaga o primeiro check
  const tocar = (campo: 'treino' | TipoCardio) => {
    // O dia virou com o app aberto: só atualiza a tela, não grava no dia de ontem
    if (hojeLocal() !== hoje) return void window.dispatchEvent(new Event('focus'));
    const atual = t.doDia(hoje);
    const base = {
      data: hoje,
      treino: !!atual?.treino,
      cardio: !!atual?.cardio,
      corrida_km: atual?.corrida_km ?? null,
      corrida_seg: atual?.corrida_seg ?? null,
      cardio_tipo: atual?.cardio_tipo ?? null,
      esforco_treino: atual?.esforco_treino ?? null,
      esforco_cardio: atual?.esforco_cardio ?? null,
    };
    gravar({
      tipo: 'treino',
      dado:
        campo === 'treino'
          ? // Desmarcar o treino apaga o esforço daquela sessão
            { ...base, treino: !atual?.treino, esforco_treino: atual?.treino ? null : base.esforco_treino }
          : { ...base, ...tocarCardio(hoje, atual, campo) },
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
      <MarcadoresDia data={hoje} reg={reg} aoTreino={() => tocar('treino')} aoCardio={tocar} />
      {/* Corrida marcada: o botão da corrida (a folha dela tem também os esforços); senão, os esforços do dia */}
      {corridaFeita ? (
        <BotaoCorrida reg={reg} aoTocar={() => setDetalhes(true)} style={{ marginTop: 8 }} />
      ) : (
        <button type="button" className="botao pequeno bloco-largo" style={{ marginTop: 8 }} onClick={() => setDetalhes(true)}>
          Esforço do treino e do cardio
        </button>
      )}
      {detalhes && <FormDiaTreino data={hoje} foco={corridaFeita ? 'corrida' : undefined} aoFechar={() => setDetalhes(false)} />}
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

/**
 * Edição de um dia: treino, cardio (corrida ou bike, em qualquer dia), distância e tempo da corrida e esforço.
 * foco "corrida" (botão da corrida marcada): só a corrida e os esforços, sem os checks do dia.
 */
export function FormDiaTreino({ data, foco, aoFechar }: { data: string; foco?: 'corrida'; aoFechar: () => void }) {
  const t = useTreino();
  const { gravar, hoje } = useDados();
  const reg = t?.doDia(data);
  const focoCorrida = foco === 'corrida';
  const [treino, setTreino] = useState(!!reg?.treino);
  const [cardio, setCardio] = useState(focoCorrida || !!reg?.cardio);
  // Pré-selecionado pelo que foi salvo; sem registro, pela regra (quarta e domingo = corrida)
  const [tipo, setTipo] = useState<TipoCardio>(focoCorrida ? 'corrida' : tipoCardioEfetivo(data, reg));
  // Sem distância padrão: o campo começa vazio até a corrida ser registrada
  const [km, setKm] = useState(paraTexto(reg?.corrida_km));
  const [tempo, setTempo] = useState(reg?.corrida_seg ? formatarTempo(reg.corrida_seg) : '');
  const [esforcoTreino, setEsforcoTreino] = useState<number | null>(reg?.esforco_treino ?? null);
  const [esforcoCardio, setEsforcoCardio] = useState<number | null>(reg?.esforco_cardio ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const corrida = tipo === 'corrida';

  const kmN = paraNumero(km);
  // Distância é opcional; quando informada, de 0,1 a 60 km (o banco guarda 2 casas)
  const kmOk = kmN !== null && kmN >= 0.1 && kmN <= 60 ? Math.round(kmN * 100) / 100 : null;
  const seg = tempo.trim() ? lerTempo(tempo) : null;
  // Pace e velocidade só com distância e tempo válidos
  const ritmo = ritmoCorrida(kmOk, seg);

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (corrida && cardio && km.trim() && kmOk === null) return setErro('Informe uma distância entre 0,1 e 60 km.');
    if (corrida && cardio && tempo.trim() && !seg) return setErro('Tempo inválido. Digite só os números, ex.: 2830 para 28:30.');
    if (corrida && cardio && ritmo && !paceValido(ritmo.pace)) return setErro(`Confira a distância e o tempo: deu ${formatarTempo(ritmo.pace)}\u00a0/km.`);
    gravar({
      tipo: 'treino',
      dado: {
        data,
        treino,
        cardio,
        // Bike não tem distância: escolher Bike numa quarta apaga os km da corrida
        corrida_km: corrida && cardio ? kmOk : null,
        corrida_seg: corrida && cardio ? seg : null,
        cardio_tipo: cardio ? tipo : null,
        esforco_treino: treino ? esforcoTreino : null,
        esforco_cardio: cardio ? esforcoCardio : null,
      },
    });
    aoFechar();
  }

  return (
    <Folha
      titulo={
        focoCorrida
          ? // Com treino marcado, a folha também tem o esforço da musculação
            `${treino ? 'Corrida e treino' : 'Corrida'}${data === hoje ? ' de hoje' : ` · ${diaDaSemana(data).slice(0, 3).toLowerCase()}, ${formatarData(data).slice(0, 5)}`}`
          : `${diaDaSemana(data)}, ${formatarData(data)}`
      }
      aoFechar={aoFechar}
    >
      <form className="pilha" onSubmit={salvar}>
        {!focoCorrida && (
          <div className="linha" style={{ flexWrap: 'nowrap' }}>
            <Marcador rotulo="Treino" detalhe="musculação" feito={treino} aoTocar={() => setTreino(!treino)} />
            <Marcador rotulo="Cardio" detalhe={rotuloTipoCardio(tipo, kmOk)} feito={cardio} aoTocar={() => setCardio(!cardio)} />
          </div>
        )}
        {cardio && !focoCorrida && (
          <Campo rotulo={data === hoje ? 'Cardio de hoje' : 'Cardio do dia'} grupo dica="A corrida pode ser em qualquer dia; a meta continua 2 corridas e 5 bikes por semana.">
            <Escolhas opcoes={OPCOES_TIPO} valor={tipo} aoMudar={(v) => v && (setTipo(v), setErro(null))} />
          </Campo>
        )}
        {corrida && cardio && (
          <>
            <div className="grade">
              <CampoNumero
                rotulo="Distância"
                sufixo="km"
                valor={km}
                placeholder="0,0"
                aoMudar={(v) => {
                  setKm(v);
                  setErro(null);
                }}
              />
              <Campo rotulo="Tempo" dica="Ex.: 3210 = 32:10">
                <input
                  inputMode="numeric"
                  enterKeyHint="done"
                  value={tempo}
                  placeholder="0:00"
                  onChange={(e) => {
                    setTempo(digitosParaTempo(e.target.value));
                    setErro(null);
                  }}
                />
              </Campo>
            </div>
            {/* Erros (distância, tempo, pace) logo abaixo dos campos */}
            {erro && <div className="alerta erro">{erro}</div>}
            {ritmo ? (
              <>
                <div className="grade" aria-live="polite">
                  <Bloco rotulo="Pace" valor={`${formatarTempo(ritmo.pace)} /km`} classe={paceValido(ritmo.pace) ? '' : 'ruim'} />
                  <Bloco rotulo="Velocidade média" valor={`${num(ritmo.kmh, 1)} km/h`} />
                </div>
                {!paceValido(ritmo.pace) && <div className="alerta erro">Pace fora da faixa normal (2:30 a 15:00{'\u00a0'}/km). Confira a distância e o tempo.</div>}
              </>
            ) : seg && kmOk === null && !km.trim() ? (
              <p className="mudo">Informe a distância para calcular o pace.</p>
            ) : null}
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
          <Campo rotulo={`Esforço ${corrida ? 'da corrida' : 'do cardio'} (opcional)`} grupo dica={textoEsforco(esforcoCardio)}>
            <div className="escolhas-compactas">
              <Escolhas opcoes={OPCOES_ESFORCO} valor={esforcoCardio} aoMudar={setEsforcoCardio} permitirVazio />
            </div>
          </Campo>
        )}
        {erro && !(corrida && cardio) && <div className="alerta erro">{erro}</div>}
        <button className="botao primario">{focoCorrida ? 'Salvar corrida' : 'Salvar'}</button>
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
  const ajuste = ajusteVigente(perfil, medidas);
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

