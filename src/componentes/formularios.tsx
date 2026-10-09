import { useState, type FormEvent } from 'react';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { faseDaDose, guiaSeringa, marcacao } from '../lib/ciclo';
import { diaDaSemana, hojeLocal } from '../lib/datas';
import { cm, kg, num, paraNumero, paraTexto, pp, ui } from '../lib/formato';
import { composicao } from '../lib/gordura';
import { LOCAIS_APLICACAO, NIVEIS_NAUSEA, type Aplicacao, type Medida, type RegistroDiario } from '../lib/tipos';
import { BotaoExcluir, Campo, CampoNumero, Escolhas, Folha } from './ui';

const OPCOES_NAUSEA = NIVEIS_NAUSEA.map((r, i) => ({ valor: i, rotulo: `${i} · ${r}` }));

function Erro({ msg }: { msg: string | null }) {
  return msg ? <div className="alerta erro">{msg}</div> : null;
}

// ---------- Aplicação ----------

export function FormAplicacao({ aplicacao, aoFechar }: { aplicacao?: Aplicacao; aoFechar: () => void }) {
  const { ciclo, diario, executar } = useDados();
  const { resumo, hoje } = useCalculos();
  const [data, setData] = useState(aplicacao?.data ?? hoje);
  const numero = aplicacao ? resumo!.linhas.find((l) => l.aplicacao.id === aplicacao.id)!.numero : resumo!.aplicacoes_realizadas + 1;
  const fase = faseDaDose(ciclo!.fases, numero);
  const [dose, setDose] = useState(paraTexto(aplicacao?.dose_mg ?? fase.fase.dose_mg));
  const [local, setLocal] = useState(aplicacao?.local ?? resumo!.sugestao_local);
  const [obs, setObs] = useState(aplicacao?.observacoes ?? '');
  const regDia = diario.find((r) => r.data === data);
  const [peso, setPeso] = useState(paraTexto(regDia?.peso_kg));
  const [nausea, setNausea] = useState<number | null>(regDia?.nausea ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const doseNum = paraNumero(dose);
  const m = doseNum ? marcacao(doseNum, ciclo!) : null;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!doseNum || doseNum <= 0) return setErro('Informe a dose em mg.');
    if (!data) return setErro('Informe a data.');
    setSalvando(true);
    try {
      await executar(async (repo) => {
        await repo.salvarAplicacao({ id: aplicacao?.id, ciclo_id: ciclo!.id, data, dose_mg: doseNum, local: local || null, observacoes: obs.trim() || null });
        const pesoNum = paraNumero(peso);
        if (pesoNum !== null || nausea !== null) {
          await repo.salvarDiario({ data, peso_kg: pesoNum ?? regDia?.peso_kg ?? null, nausea: nausea ?? regDia?.nausea ?? null, observacoes: regDia?.observacoes ?? null });
        }
      });
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!aplicacao) return;
    await executar((repo) => repo.excluirAplicacao(aplicacao.id));
    aoFechar();
  }

  return (
    <Folha titulo={aplicacao ? `Editar ${numero}ª aplicação` : `Registrar ${numero}ª aplicação`} aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <div className="linha">
          <span className="etiqueta destaque">Fase {fase.indice + 1} · {fase.fase.nome}</span>
          <span className="etiqueta">Prevista: {num(fase.fase.dose_mg)} mg</span>
        </div>
        <Campo rotulo="Data da aplicação" dica={data ? diaDaSemana(data) : undefined}>
          <input type="date" value={data} max={hojeLocal()} onChange={(e) => setData(e.target.value)} required />
        </Campo>
        <CampoNumero
          rotulo="Dose aplicada"
          sufixo="mg"
          valor={dose}
          aoMudar={setDose}
          obrigatorio
          dica={m ? `Puxar até ${ui(m.ui_pratica)} na seringa U-100 (${guiaSeringa(m.ui_pratica)}) · entrega ${num(m.mg_pratica)} mg` : undefined}
        />
        <Campo rotulo="Local da aplicação" dica={!aplicacao ? 'Sugestão pelo rodízio: diferente do último local usado.' : undefined}>
          <select value={local} onChange={(e) => setLocal(e.target.value)}>
            <option value="">—</option>
            {LOCAIS_APLICACAO.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Campo>
        <CampoNumero rotulo="Peso no dia" sufixo="kg" valor={peso} aoMudar={setPeso} dica="Opcional, vai para o Diário." />
        <Campo rotulo="Náusea no dia (opcional)" grupo>
          <Escolhas opcoes={OPCOES_NAUSEA} valor={nausea} aoMudar={setNausea} permitirVazio />
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

export function FormDiario({ registro, aoFechar }: { registro?: RegistroDiario; aoFechar: () => void }) {
  const { diario, executar } = useDados();
  const [data, setData] = useState(registro?.data ?? hojeLocal());
  const existente = registro ?? diario.find((r) => r.data === data);
  const [peso, setPeso] = useState(paraTexto(existente?.peso_kg));
  const [nausea, setNausea] = useState<number | null>(existente?.nausea ?? null);
  const [obs, setObs] = useState(existente?.observacoes ?? '');
  const [erro, setErro] = useState<string | null>(null);

  function trocarData(nova: string) {
    setData(nova);
    const r = diario.find((x) => x.data === nova);
    setPeso(paraTexto(r?.peso_kg));
    setNausea(r?.nausea ?? null);
    setObs(r?.observacoes ?? '');
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const pesoNum = paraNumero(peso);
    if (pesoNum === null && nausea === null && !obs.trim()) return setErro('Preencha ao menos um campo.');
    try {
      await executar((repo) => repo.salvarDiario({ data, peso_kg: pesoNum, nausea, observacoes: obs.trim() || null }));
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function excluir() {
    const r = diario.find((x) => x.data === data);
    if (!r) return;
    await executar((repo) => repo.excluirDiario(r.id));
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
        <Campo rotulo="Observações / efeitos">
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
        <Erro msg={erro} />
        <button className="botao primario">Salvar</button>
        {diario.some((x) => x.data === data) && (
          <BotaoExcluir rotulo="Excluir registro do dia" aviso="Excluir peso, náusea e observações deste dia?" aoConfirmar={excluir} />
        )}
      </form>
    </Folha>
  );
}

// ---------- Medidas ----------

export function FormMedida({ medida, aoFechar }: { medida?: Medida; aoFechar: () => void }) {
  const { perfil, medidas, executar } = useDados();
  const ultima = [...medidas].sort((a, b) => b.data.localeCompare(a.data))[0];
  const sexo = perfil?.sexo ?? 'Masculino';
  const [data, setData] = useState(medida?.data ?? hojeLocal());
  const [altura, setAltura] = useState(paraTexto(medida?.altura_cm ?? ultima?.altura_cm ?? perfil?.altura_cm));
  const [pescoco, setPescoco] = useState(paraTexto(medida?.pescoco_cm));
  const [cintura, setCintura] = useState(paraTexto(medida?.cintura_cm));
  const [quadril, setQuadril] = useState(paraTexto(medida?.quadril_cm));
  const [peso, setPeso] = useState(paraTexto(medida?.peso_kg));
  const [erro, setErro] = useState<string | null>(null);

  const valores = {
    altura_cm: paraNumero(altura),
    pescoco_cm: paraNumero(pescoco),
    cintura_cm: paraNumero(cintura),
    quadril_cm: paraNumero(quadril),
    peso_kg: paraNumero(peso),
  };
  const completo =
    valores.altura_cm && valores.pescoco_cm && valores.cintura_cm && valores.peso_kg && (sexo === 'Masculino' || valores.quadril_cm);
  const previa = completo ? composicao({ id: '', data, ...(valores as Omit<Medida, 'id' | 'data'>) }, sexo) : null;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!completo) return setErro(sexo === 'Feminino' ? 'Preencha altura, pescoço, cintura, quadril e peso.' : 'Preencha altura, pescoço, cintura e peso.');
    if (valores.altura_cm! < 100) return setErro('A altura é em centímetros (ex.: 182).');
    try {
      await executar((repo) =>
        repo.salvarMedida({
          id: medida?.id,
          data,
          altura_cm: valores.altura_cm!,
          pescoco_cm: valores.pescoco_cm!,
          cintura_cm: valores.cintura_cm!,
          quadril_cm: sexo === 'Feminino' ? valores.quadril_cm : null,
          peso_kg: valores.peso_kg!,
        }),
      );
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function excluir() {
    if (!medida) return;
    await executar((repo) => repo.excluirMedida(medida.id));
    aoFechar();
  }

  return (
    <Folha titulo={medida ? 'Editar medição' : 'Nova medição'} aoFechar={aoFechar}>
      <form className="pilha" onSubmit={salvar}>
        <Campo rotulo="Data">
          <input type="date" value={data} max={hojeLocal()} onChange={(e) => setData(e.target.value)} required />
        </Campo>
        <div className="grade">
          <CampoNumero rotulo="Altura" sufixo="cm" valor={altura} aoMudar={setAltura} dica="Em centímetros, ex.: 182" />
          <CampoNumero rotulo="Peso" sufixo="kg" valor={peso} aoMudar={setPeso} />
          <CampoNumero rotulo="Pescoço" sufixo="cm" valor={pescoco} aoMudar={setPescoco} />
          <CampoNumero rotulo="Cintura" sufixo="cm" valor={cintura} aoMudar={setCintura} />
          {sexo === 'Feminino' && <CampoNumero rotulo="Quadril" sufixo="cm" valor={quadril} aoMudar={setQuadril} />}
        </div>
        <details className="ajuda">
          <summary>Como medir</summary>
          <div className="pilha mudo">
            <p><b>Pescoço:</b> logo acima do trapézio, no maior diâmetro possível (cuidado para não medir o próprio trapézio).</p>
            <p><b>Cintura:</b> na altura do umbigo. Solte todo o ar antes de medir, sem murchar a barriga. De preferência logo pela manhã.</p>
            {sexo === 'Feminino' && <p><b>Quadril:</b> na maior circunferência dos glúteos.</p>}
          </div>
        </details>
        {previa && (
          <div className="grade grade-3">
            <div className="bloco"><div className="rotulo">% gordura</div><div className="valor">{pp(previa.bf)}</div></div>
            <div className="bloco"><div className="rotulo">Massa magra</div><div className="valor">{kg(previa.massa_magra_kg)}</div></div>
            <div className="bloco"><div className="rotulo">Massa gorda</div><div className="valor">{kg(previa.massa_gorda_kg)}</div></div>
          </div>
        )}
        {previa && previa.bf === null && <div className="alerta">Não foi possível calcular: a cintura precisa ser maior que o pescoço ({cm(valores.pescoco_cm)}).</div>}
        <Erro msg={erro} />
        <button className="botao primario">Salvar medição</button>
        {medida && (
          <BotaoExcluir rotulo="Excluir medição" aviso="Excluir esta medição?" aoConfirmar={excluir} />
        )}
      </form>
    </Folha>
  );
}
