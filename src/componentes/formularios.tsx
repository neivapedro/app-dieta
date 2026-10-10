import { useState, type FormEvent } from 'react';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useMetaAgua } from '../dados/useTreino';
import { CORES_URINA, diaDeSintoma, TEXTO_SINTOMA_AGUA } from '../lib/bemestar';
import { calcularCiclo, capacidadeSeringa, concentracaoDe, guiaSeringa, marcacao, marcasVizinhas, seringaDo, situacaoDoDegrau } from '../lib/ciclo';
import { diaDaSemana, diferencaDias, formatarData, hojeLocal, somarDias } from '../lib/datas';
import { cm, kg, lerFaixa, lerPeso, num, paraNumero, paraTexto, pp, ui } from '../lib/formato';
import { ajusteDoPerfil, composicao } from '../lib/gordura';
import { LOCAIS_APLICACAO, NIVEIS_NAUSEA, type Aplicacao, type CorUrina, type Medida, type RegistroDiario } from '../lib/tipos';
import { AlertasSeguranca } from './inicio';
import { BotaoExcluir, Campo, CampoNumero, Escolhas, Folha } from './ui';

const OPCOES_NAUSEA = NIVEIS_NAUSEA.map((r, i) => ({ valor: i, rotulo: `${i} · ${r}` }));

function Erro({ msg }: { msg: string | null }) {
  return msg ? <div className="alerta erro">{msg}</div> : null;
}

// ---------- Aplicação ----------

export function FormAplicacao({ aplicacao, aoFechar, aoSalvar }: { aplicacao?: Aplicacao; aoFechar: () => void; aoSalvar?: (aviso: string) => void }) {
  const { ciclo, diario, aplicacoes, gravar } = useDados();
  const { resumo, hoje } = useCalculos();
  const [data, setData] = useState(aplicacao?.data ?? hoje);
  // Posição pela data escolhida: uma dose esquecida registrada depois entra no lugar certo
  const outras = resumo!.linhas.filter((l) => l.aplicacao.id !== aplicacao?.id);
  const antesDe = (d: string) => outras.filter((l) => !d || l.aplicacao.data <= d).map((l) => l.aplicacao);
  const numeroDe = (d: string) => antesDe(d).length + 1;
  const numero = numeroDe(data);
  // Dose indicada pela dose realmente aplicada antes (o app não sobe sem decisão)
  const situacaoEm = (d: string) => situacaoDoDegrau(ciclo!.fases, antesDe(d), ciclo!.decisoes ?? []);
  const sit = situacaoEm(data);
  const renumera = !!data && outras.some((l) => l.aplicacao.data > data);
  // Depois do fim do plano, a dose extra é a sobra do frasco (nunca mais que o saldo)
  const doseSugerida = (d: string) => {
    const x = situacaoEm(d);
    return x.estado === 'fim_plano' ? Math.min(x.dose_mg, Math.round(resumo!.saldo_mg * 100) / 100) : x.dose_mg;
  };
  const prevista = doseSugerida(data);
  const [dose, setDose] = useState(paraTexto(aplicacao?.dose_mg ?? prevista));
  const [mexeuDose, setMexeuDose] = useState(false);
  const [local, setLocal] = useState(aplicacao?.local ?? resumo!.sugestao_local);
  const [obs, setObs] = useState(aplicacao?.observacoes ?? '');
  const regDia = diario.find((r) => r.data === data);
  const [peso, setPeso] = useState(paraTexto(regDia?.peso_kg));
  const [nausea, setNausea] = useState<number | null>(regDia?.nausea ?? null);
  // O Diário só é tocado no campo que você mexeu aqui (peso e náusea separados)
  const [mexeuPeso, setMexeuPeso] = useState(false);
  const [mexeuNausea, setMexeuNausea] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function trocarData(nova: string) {
    setData(nova);
    setConfirmado(null);
    const r = diario.find((x) => x.data === nova);
    if (!mexeuPeso) setPeso(paraTexto(r?.peso_kg));
    if (!mexeuNausea) setNausea(r?.nausea ?? null);
    // Dose ainda não mexida acompanha a dose indicada na nova posição
    if (!mexeuDose && !aplicacao) setDose(paraTexto(doseSugerida(nova)));
  }

  const doseNum = paraNumero(dose);
  // Aplicação já registrada mantém a concentração do frasco daquele dia
  const conc = aplicacao ? concentracaoDe(aplicacao, ciclo!) : ciclo!.concentracao_mg_ml;
  const m = doseNum ? marcacao(doseNum, { concentracao_mg_ml: conc, passo_ui: ciclo!.passo_ui }) : null;
  const capacidade = capacidadeSeringa(ciclo!);
  const marca = seringaDo(ciclo!).marca;
  const vizinhas = m ? marcasVizinhas(m.ui_pratica, marca, conc) : null;
  // Data prevista para esta posição: anterior + intervalo (a 1ª, a data de início)
  const anterior = antesDe(data).at(-1);
  const dataPrevista = anterior ? somarDias(anterior.data, ciclo!.intervalo_dias > 0 ? ciclo!.intervalo_dias : 7) : ciclo!.data_inicio;
  const desvio = data ? diferencaDias(dataPrevista, data) : 0;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!doseNum || doseNum <= 0) return setErro('Informe a dose em mg.');
    if (!data) return setErro('Informe a data.');
    const p = lerPeso(peso);
    if (mexeuPeso && p.erro) return setErro(p.erro);
    // Pontos para conferir antes de gravar (segundo toque confirma)
    const avisosDose: string[] = [];
    const avisos: string[] = [];
    const saldo = resumo!.saldo_mg + (aplicacao?.dose_mg ?? 0);
    if (m && m.ui_pratica > capacidade) avisosDose.push(`passa da capacidade da seringa (${capacidade} UI)`);
    if (doseNum > saldo + 1e-9) avisosDose.push(`é maior que o saldo do frasco (${num(saldo)} mg)`);
    if (doseNum > prevista * 2) avisosDose.push(`é mais que o dobro da prevista (${num(prevista)} mg)`);
    if (avisosDose.length) avisos.push(`a dose de ${num(doseNum)} mg ${avisosDose.join('; ')}`);
    if (outras.some((l) => l.aplicacao.data === data)) avisos.push('já existe uma aplicação nesta data');
    // Data 2 dias ou mais fora da prevista desloca a agenda inteira
    if (Math.abs(desvio) >= 2 && aplicacao?.data !== data) {
      avisos.push(
        `a data fica ${Math.abs(desvio)} dias ${desvio > 0 ? 'depois' : 'antes'} da prevista (${diaDaSemana(dataPrevista).slice(0, 3).toLowerCase()}, ${formatarData(dataPrevista)}): isso muda todas as próximas datas`,
      );
    }
    const chave = `${data}|${doseNum}`;
    if (avisos.length && confirmado !== chave) {
      setConfirmado(chave);
      return setErro(`Confira: ${avisos.join('; ')}. Toque em Salvar de novo para confirmar.`);
    }
    setSalvando(true);
    const nova: Aplicacao = {
      id: aplicacao?.id ?? crypto.randomUUID(),
      ciclo_id: ciclo!.id,
      data,
      dose_mg: doseNum,
      local: local || null,
      observacoes: obs.trim() || null,
      // Concentração do frasco no momento do registro (editar não muda a de um registro antigo)
      concentracao_mg_ml: aplicacao ? (aplicacao.concentracao_mg_ml ?? null) : ciclo!.concentracao_mg_ml,
    };
    // Pela fila: aparece na hora e, sem sinal, é enviada quando a internet voltar
    gravar({ tipo: 'aplicacao', dado: nova });
    if (mexeuPeso || mexeuNausea) {
      const { id: _id, ...resto } = regDia ?? ({} as Partial<RegistroDiario>);
      const pesoFinal = mexeuPeso ? p.valor : regDia?.peso_kg ?? null;
      const nauseaFinal = mexeuNausea ? nausea : regDia?.nausea ?? null;
      // Apagar o peso ou a náusea aqui também apaga do Diário
      if (regDia || pesoFinal !== null || nauseaFinal !== null) {
        gravar({ tipo: 'diario', dado: { ...resto, data, peso_kg: pesoFinal, nausea: nauseaFinal, observacoes: regDia?.observacoes ?? null } });
      }
    }
    if (aoSalvar) {
      // Confirmação curta com a próxima dose já recalculada
      const depois = calcularCiclo(ciclo!, [...aplicacoes.filter((a) => a.id !== nova.id), nova], diario, hoje).proxima;
      aoSalvar(
        depois
          ? `Salvo · próxima: ${diaDaSemana(depois.data).slice(0, 3).toLowerCase()} ${formatarData(depois.data).slice(0, 5)}, ${ui(depois.ui_pratica)}${
              depois.estado === 'pendente' ? ' · fim da fase: decida no Início' : ''
            }`
          : 'Salvo · ciclo concluído',
      );
    }
    aoFechar();
  }

  function excluir() {
    if (!aplicacao) return;
    gravar({ tipo: 'excluir', dado: { alvo: 'aplicacao', id: aplicacao.id, data: aplicacao.data } });
    aoFechar();
  }

  return (
    <Folha titulo={aplicacao ? `Editar ${numero}ª aplicação` : `Registrar ${numero}ª aplicação`} aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <div className="linha">
          {sit.fase ? (
            <span className="etiqueta destaque">
              Fase {sit.fase.indice + 1} · {sit.fase.fase.nome}
            </span>
          ) : (
            <span className="etiqueta aviso">Dose fora do plano</span>
          )}
          <span className="etiqueta">Prevista: {num(prevista)} mg</span>
          {sit.estado === 'pendente' && <span className="etiqueta aviso">Fim da fase: decisão pendente</span>}
        </div>
        {/* Só ao registrar uma aplicação nova: os alertas da semana antes de aplicar */}
        {!aplicacao && <AlertasSeguranca compacto />}
        <Campo
          rotulo="Data da aplicação"
          dica={
            data
              ? `${diaDaSemana(data)}${renumera ? '. Fica antes de aplicações já registradas: a numeração das seguintes muda.' : ''}${
                  Math.abs(desvio) >= 2 && aplicacao?.data !== data ? `. Prevista: ${formatarData(dataPrevista)}.` : ''
                }`
              : undefined
          }
        >
          <input type="date" value={data} max={hojeLocal()} onChange={(e) => trocarData(e.target.value)} required />
        </Campo>
        <CampoNumero
          rotulo="Dose aplicada"
          sufixo="mg"
          valor={dose}
          aoMudar={(v) => {
            setDose(v);
            setMexeuDose(true);
            setConfirmado(null);
          }}
          obrigatorio
          dica={
            m && m.ui_pratica > capacidade
              ? `Passa da capacidade da seringa (${capacidade} UI): confira a dose.`
              : m
                ? `Puxar até ${ui(m.ui_pratica)} na seringa U-100 (${guiaSeringa(m.ui_pratica, marca)}) · entrega ${num(m.mg_pratica)} mg${
                    vizinhas ? `. Marcas vizinhas: ${vizinhas.map((v) => `${ui(v.ui)} = ${num(v.mg)} mg`).join(' · ')}` : ''
                  }`
                : undefined
          }
        />
        <Campo rotulo="Local da aplicação" dica={!aplicacao ? 'Sugestão pelo rodízio: diferente do último local usado.' : undefined}>
          <select value={local} onChange={(e) => setLocal(e.target.value)}>
            <option value="">—</option>
            {LOCAIS_APLICACAO.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Campo>
        <CampoNumero
          rotulo="Peso no dia"
          sufixo="kg"
          valor={peso}
          aoMudar={(v) => {
            setPeso(v);
            setMexeuPeso(true);
          }}
          dica={data ? `Opcional, vai para o Diário de ${formatarData(data)}.` : 'Opcional, vai para o Diário.'}
        />
        <Campo rotulo="Náusea no dia (opcional)" grupo>
          <Escolhas
            opcoes={OPCOES_NAUSEA}
            valor={nausea}
            aoMudar={(v) => {
              setNausea(v);
              setMexeuNausea(true);
            }}
            permitirVazio
          />
        </Campo>
        <Campo rotulo="Observações / efeitos">
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: leve enjoo à tarde" />
        </Campo>
        <Erro msg={erro} />
        <button className="botao primario" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar aplicação'}
        </button>
        {aplicacao && (
          <BotaoExcluir rotulo="Excluir aplicação" aviso="O saldo e a agenda serão recalculados." aoConfirmar={excluir} />
        )}
      </form>
    </Folha>
  );
}

// ---------- Diário ----------

type ChaveSintoma = 'vomito' | 'diarreia' | 'intestino_preso';
const SINTOMAS: [ChaveSintoma, string][] = [
  ['vomito', 'Vômito'],
  ['diarreia', 'Diarreia'],
  ['intestino_preso', 'Intestino preso'],
];

function sintomasDe(r?: RegistroDiario): Record<ChaveSintoma, boolean | null> {
  return { vomito: r?.vomito ?? null, diarreia: r?.diarreia ?? null, intestino_preso: r?.intestino_preso ?? null };
}

export function FormDiario({ registro, dataInicial, aoFechar }: { registro?: RegistroDiario; dataInicial?: string; aoFechar: () => void }) {
  const { diario, gravar } = useDados();
  const metaAguaDe = useMetaAgua();
  const [data, setData] = useState(registro?.data ?? dataInicial ?? hojeLocal());
  const existente = registro ?? diario.find((r) => r.data === data);
  const [peso, setPeso] = useState(paraTexto(existente?.peso_kg));
  const [nausea, setNausea] = useState<number | null>(existente?.nausea ?? null);
  const [obs, setObs] = useState(existente?.observacoes ?? '');
  const [sintomas, setSintomas] = useState(sintomasDe(existente));
  const [sono, setSono] = useState(paraTexto(existente?.sono_h));
  const [agua, setAgua] = useState(paraTexto(existente?.agua_l));
  const [urina, setUrina] = useState<CorUrina | null>(existente?.cor_urina ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { meta: metaAgua, horas } = metaAguaDe(data || hojeLocal());

  function trocarData(nova: string) {
    setData(nova);
    const r = diario.find((x) => x.data === nova);
    setPeso(paraTexto(r?.peso_kg));
    setNausea(r?.nausea ?? null);
    setObs(r?.observacoes ?? '');
    setSintomas(sintomasDe(r));
    setSono(paraTexto(r?.sono_h));
    setAgua(paraTexto(r?.agua_l));
    setUrina(r?.cor_urina ?? null);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!data) return setErro('Informe a data.');
    const p = lerPeso(peso);
    if (p.erro) return setErro(p.erro);
    const s = lerFaixa(sono, 0, 24, 'Sono', 'h');
    if (s.erro) return setErro(s.erro);
    const a = lerFaixa(agua, 0, 15, 'Água', 'L');
    if (a.erro) return setErro(a.erro);
    const pesoNum = p.valor;
    const algumSintoma = Object.values(sintomas).some((v) => v !== null);
    if (pesoNum === null && nausea === null && !obs.trim() && !algumSintoma && s.valor === null && a.valor === null && urina === null)
      return setErro('Preencha ao menos um campo.');
    if (salvando) return;
    setSalvando(true);
    const atual = diario.find((x) => x.data === data);
    // Pela fila: grava na hora e, sem internet, envia quando a conexão voltar
    gravar({
      tipo: 'diario',
      dado: {
        data,
        peso_kg: pesoNum,
        nausea,
        observacoes: obs.trim() || null,
        ...sintomas,
        dieta_seguida: atual?.dieta_seguida ?? null,
        sono_h: s.valor,
        agua_l: a.valor,
        cor_urina: urina,
      },
    });
    aoFechar();
  }

  function excluir() {
    const r = diario.find((x) => x.data === data);
    if (!r) return;
    gravar({ tipo: 'excluir', dado: { alvo: 'diario', id: r.id, data: r.data } });
    aoFechar();
  }

  return (
    <Folha titulo="Registro do dia" aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <Campo rotulo="Data" dica={diaDaSemana(data)}>
          <input type="date" value={data} max={hojeLocal()} onChange={(e) => trocarData(e.target.value)} required />
        </Campo>
        <CampoNumero rotulo="Peso" sufixo="kg" valor={peso} aoMudar={setPeso} />
        <Campo rotulo="Náusea (0 a 3)" grupo>
          <Escolhas opcoes={OPCOES_NAUSEA} valor={nausea} aoMudar={setNausea} permitirVazio />
        </Campo>
        <Campo rotulo="Sintomas do dia (opcional)" grupo dica="Toque para marcar Sim; de novo para Não; mais uma vez para limpar.">
          <div className="sintomas">
            {SINTOMAS.map(([k, rotulo]) => (
              <button
                type="button"
                key={k}
                className={`sintoma ${sintomas[k] === true ? 'sim' : sintomas[k] === false ? 'nao' : ''}`}
                onClick={() => setSintomas({ ...sintomas, [k]: sintomas[k] === null ? true : sintomas[k] ? false : null })}
              >
                {rotulo}: {sintomas[k] === true ? 'sim' : sintomas[k] === false ? 'não' : '–'}
              </button>
            ))}
          </div>
        </Campo>
        {diaDeSintoma(sintomas) && <div className="alerta info">{TEXTO_SINTOMA_AGUA}</div>}
        <div className="grade">
          <CampoNumero rotulo="Sono" sufixo="h" valor={sono} aoMudar={setSono} dica="Sono total da noite, do relógio (ex.: 6,5)." />
          <CampoNumero
            rotulo="Água"
            sufixo="L"
            valor={agua}
            aoMudar={setAgua}
            dica={`Meta ≈ ${num(metaAgua, 1)} L${horas > 0 ? ` (2 L + 0,7 L por hora de treino e cardio: ${num(horas, 1)} h)` : ''}.`}
          />
        </div>
        <Campo rotulo="Cor da urina (opcional)" grupo dica={urina === 'escura' ? 'Urina escura costuma indicar pouca água: beba mais.' : undefined}>
          <Escolhas opcoes={CORES_URINA} valor={urina} aoMudar={setUrina} permitirVazio />
        </Campo>
        <Campo rotulo="Observações / efeitos">
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
        <Erro msg={erro} />
        <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        {diario.some((x) => x.data === data) && (
          <BotaoExcluir rotulo="Excluir registro do dia" aviso="Excluir peso, náusea, sintomas, sono, água, observações e o 'segui o plano?' deste dia?" aoConfirmar={excluir} />
        )}
      </form>
    </Folha>
  );
}

// ---------- Medidas ----------

function DicaAnterior({ valor, anterior, data, unidade, limite }: { valor: number | null; anterior: number; data: string; unidade: string; limite: number }) {
  const dif = valor !== null ? valor - anterior : null;
  return (
    <span className={dif !== null && Math.abs(dif) > limite ? 'aviso-txt' : undefined}>
      Última: {num(anterior, 1)} {unidade} ({formatarData(data, true)})
      {dif !== null && Math.abs(dif) > limite ? ` · diferença de ${num(dif, 1)} ${unidade}: confira` : ''}
    </span>
  );
}

/** Campo de medida com até 3 leituras; vale a média. */
function Leituras({
  rotulo,
  valores,
  aoMudar,
  anterior,
  dataAnterior,
  limite,
}: {
  rotulo: string;
  valores: string[];
  aoMudar: (v: string[]) => void;
  anterior?: number;
  dataAnterior?: string;
  limite: number;
}) {
  const ns = valores.map(paraNumero).filter((n): n is number => n !== null);
  const m = ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
  const espalhamento = ns.length > 1 ? Math.max(...ns) - Math.min(...ns) : 0;
  return (
    <div className="pilha" style={{ gap: 6 }}>
      <div className="leituras">
        {valores.map((v, i) => (
          <CampoNumero
            key={i}
            rotulo={i === 0 ? rotulo : `${i + 1}ª leitura`}
            sufixo={i === 0 ? 'cm' : undefined}
            valor={v}
            aoMudar={(nv) => aoMudar(valores.map((x, j) => (j === i ? nv : x)))}
          />
        ))}
        {valores.length < 3 && (
          <button type="button" className="botao pequeno" style={{ alignSelf: 'flex-end' }} onClick={() => aoMudar([...valores, ''])}>
            + leitura
          </button>
        )}
      </div>
      {(anterior !== undefined || ns.length > 1) && (
        <small className="texto-2">
          {ns.length > 1 && <>Média: {num(m, 1)} cm{espalhamento > 1 ? ' · leituras com mais de 1 cm de diferença, meça de novo' : ''}. </>}
          {anterior !== undefined && <DicaAnterior valor={m} anterior={anterior} data={dataAnterior ?? ''} unidade="cm" limite={limite} />}
        </small>
      )}
    </div>
  );
}

export function FormMedida({ medida, aoFechar, aoSalvar }: { medida?: Medida; aoFechar: () => void; aoSalvar?: (data: string) => void }) {
  const { perfil, medidas, gravar } = useDados();
  const ultima = [...medidas].sort((a, b) => b.data.localeCompare(a.data))[0];
  const sexo = perfil?.sexo ?? 'Masculino';
  const [data, setData] = useState(medida?.data ?? hojeLocal());
  // Altura: campo único do Perfil (não é pedida a cada medição); sem altura no perfil, o formulário pede
  const alturaPerfil = perfil?.altura_cm && perfil.altura_cm > 0 ? perfil.altura_cm : null;
  const [altura, setAltura] = useState(paraTexto(alturaPerfil ?? medida?.altura_cm ?? ultima?.altura_cm));
  const [atipica, setAtipica] = useState(medida?.atipica === true);
  // Até 3 leituras de pescoço e cintura: vale a média
  const [pescocos, setPescocos] = useState<string[]>([paraTexto(medida?.pescoco_cm)]);
  const [cinturas, setCinturas] = useState<string[]>([paraTexto(medida?.cintura_cm)]);
  const media = (l: string[]) => {
    const ns = l.map(paraNumero).filter((n): n is number => n !== null);
    return ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : null;
  };
  const [quadril, setQuadril] = useState(paraTexto(medida?.quadril_cm));
  const [peso, setPeso] = useState(paraTexto(medida?.peso_kg));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const valores = {
    altura_cm: alturaPerfil ?? paraNumero(altura),
    pescoco_cm: media(pescocos),
    cintura_cm: media(cinturas),
    quadril_cm: paraNumero(quadril),
    peso_kg: paraNumero(peso),
  };
  const positivo = (v: number | null) => v !== null && v > 0;
  const completo =
    positivo(valores.altura_cm) && positivo(valores.pescoco_cm) && positivo(valores.cintura_cm) && positivo(valores.peso_kg) && (sexo === 'Masculino' || positivo(valores.quadril_cm));
  // Medição anterior a esta data, para comparar e pegar erro de digitação
  const anterior = [...medidas].filter((m) => m.data < data && m.id !== medida?.id).sort((a, b) => b.data.localeCompare(a.data))[0];
  const previa = completo ? composicao({ id: '', data, ...(valores as Omit<Medida, 'id' | 'data'>) }, sexo, { ajuste: ajusteDoPerfil(perfil) }) : null;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!data) return setErro('Informe a data.');
    if (!completo) return setErro(sexo === 'Feminino' ? 'Preencha altura, pescoço, cintura, quadril e peso.' : 'Preencha altura, pescoço, cintura e peso.');
    if (valores.altura_cm! < 100 || valores.altura_cm! > 250) return setErro('A altura é em centímetros (ex.: 182).');
    if (valores.peso_kg! < 30 || valores.peso_kg! > 300) return setErro('Peso fora da faixa (30 a 300 kg). Confira o número.');
    const forDaFaixa = [valores.pescoco_cm!, valores.cintura_cm!, ...(sexo === 'Feminino' ? [valores.quadril_cm!] : [])].some((v) => v < 20 || v > 250);
    if (forDaFaixa) return setErro('Medidas em centímetros, entre 20 e 250. Confira os números.');
    if (previa && previa.bf === null) return setErro('Com essas medidas não dá para calcular a % de gordura (a cintura precisa ser maior que o pescoço). Confira.');
    if (medidas.some((m) => m.data === data && m.id !== medida?.id)) return setErro('Já existe uma medição nesta data. Toque nela no histórico para editar.');
    if (salvando) return;
    setSalvando(true);
    // Pela fila: aparece na hora e, sem sinal, é enviada quando a internet voltar
    gravar({
      tipo: 'medida',
      dado: {
        id: medida?.id ?? crypto.randomUUID(),
        data,
        altura_cm: valores.altura_cm!,
        pescoco_cm: valores.pescoco_cm!,
        cintura_cm: valores.cintura_cm!,
        quadril_cm: sexo === 'Feminino' ? valores.quadril_cm : null,
        peso_kg: valores.peso_kg!,
        atipica,
      },
    });
    aoFechar();
    aoSalvar?.(data);
  }

  function excluir() {
    if (!medida) return;
    gravar({ tipo: 'excluir', dado: { alvo: 'medida', id: medida.id, data: medida.data } });
    aoFechar();
  }

  return (
    <Folha titulo={medida ? 'Editar medição' : 'Nova medição'} aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <Campo rotulo="Data">
          <input type="date" value={data} max={hojeLocal()} onChange={(e) => setData(e.target.value)} required />
        </Campo>
        <div className="grade">
          {alturaPerfil ? (
            <div className="campo">
              <span>Altura</span>
              <div className="texto-2" style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
                {cm(alturaPerfil)} · do Perfil
              </div>
            </div>
          ) : (
            <CampoNumero rotulo="Altura" sufixo="cm" valor={altura} aoMudar={setAltura} dica="Em centímetros, ex.: 175. Salve no Perfil para não precisar digitar." />
          )}
          <CampoNumero
            rotulo="Peso"
            sufixo="kg"
            valor={peso}
            aoMudar={setPeso}
            dica={anterior ? <DicaAnterior valor={valores.peso_kg} anterior={anterior.peso_kg} data={anterior.data} unidade="kg" limite={3} /> : undefined}
          />
        </div>
        <Leituras rotulo="Pescoço" valores={pescocos} aoMudar={setPescocos} anterior={anterior?.pescoco_cm} dataAnterior={anterior?.data} limite={2} />
        <Leituras rotulo="Cintura" valores={cinturas} aoMudar={setCinturas} anterior={anterior?.cintura_cm} dataAnterior={anterior?.data} limite={3} />
        <p className="texto-2" style={{ marginTop: -6 }}>
          Na altura do umbigo, fita paralela ao chão, justa sem afundar a pele. Meça ao fim de uma expiração normal, relaxado: não force o ar para
          fora, não murche nem estufe a barriga.
        </p>
        <div className="grade">
          {sexo === 'Feminino' && <CampoNumero rotulo="Quadril" sufixo="cm" valor={quadril} aoMudar={setQuadril} />}
        </div>
        <details className="ajuda">
          <summary>Como medir</summary>
          <div className="pilha mudo">
            <p><b>Quando:</b> toda segunda, em jejum, depois de ir ao banheiro e antes de beber água. Mesma fita e mesmo horário.</p>
            <p><b>Pescoço:</b> logo abaixo do pomo de Adão, com a fita levemente inclinada para a frente, sem medir o trapézio.</p>
            <p><b>Cintura:</b> na altura do umbigo, fita paralela ao chão, justa sem afundar a pele. Meça ao fim de uma expiração normal, relaxado: não force o ar para fora, não murche nem estufe a barriga.</p>
            <p><b>Leituras:</b> meça 2 ou 3 vezes; o app usa a média. Diferença maior que 1 cm entre leituras: meça de novo.</p>
            {sexo === 'Feminino' && <p><b>Quadril:</b> na maior circunferência dos glúteos.</p>}
            <p><b>Altura:</b> vem do Perfil; corrigir lá corrige todo o histórico.</p>
          </div>
        </details>
        <label className="linha" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={atipica} onChange={(e) => setAtipica(e.target.checked)} style={{ width: 20, height: 20, flex: 'none', marginTop: 2 }} />
          <span>
            Medição atípica (doente, inchado, viagem)
            <small className="texto-2" style={{ display: 'block' }}>Fica no histórico, mas fora de tendências e projeções.</small>
          </span>
        </label>
        {previa && (
          <div className="grade grade-3">
            <div className="bloco"><div className="rotulo">% gordura</div><div className="valor">{pp(previa.bf)}</div></div>
            <div className="bloco"><div className="rotulo">Massa magra</div><div className="valor">{kg(previa.massa_magra_kg)}</div></div>
            <div className="bloco"><div className="rotulo">Massa gorda</div><div className="valor">{kg(previa.massa_gorda_kg)}</div></div>
          </div>
        )}
        {previa && previa.bf === null && <div className="alerta">Não foi possível calcular: a cintura precisa ser maior que o pescoço ({cm(valores.pescoco_cm)}).</div>}
        <Erro msg={erro} />
        <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar medição'}</button>
        {medida && (
          <BotaoExcluir rotulo="Excluir medição" aviso="Excluir esta medição?" aoConfirmar={excluir} />
        )}
      </form>
    </Folha>
  );
}
