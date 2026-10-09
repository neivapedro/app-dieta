import { useState, type FormEvent } from 'react';
import { Campo, CampoNumero, Escolhas } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { cicloPadrao } from '../lib/ciclo';
import { diaDaSemana, hojeLocal } from '../lib/datas';
import { paraNumero, paraTexto } from '../lib/formato';
import type { Sexo } from '../lib/tipos';

/** Primeiro acesso: dados pessoais + parâmetros do ciclo (aba Painel da planilha). */
export function Configurar() {
  const { perfil, usuario, executar, sair } = useDados();
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [sexo, setSexo] = useState<Sexo>(perfil?.sexo ?? 'Masculino');
  const [altura, setAltura] = useState(paraTexto(perfil?.altura_cm));
  const padrao = cicloPadrao(hojeLocal());
  const [inicio, setInicio] = useState(padrao.data_inicio);
  const [total, setTotal] = useState(paraTexto(padrao.quantidade_total_mg));
  const [conc, setConc] = useState(paraTexto(padrao.concentracao_mg_ml));
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const totalN = paraNumero(total);
    const concN = paraNumero(conc);
    const alturaN = paraNumero(altura);
    if (!nome.trim()) return setErro('Informe seu nome.');
    if (!totalN || !concN) return setErro('Informe a quantidade e a concentração.');
    try {
      await executar(async (r) => {
        await r.salvarPerfil({
          nome: nome.trim(),
          sexo,
          altura_cm: alturaN,
          lembretes_ativos: true,
          hora_lembrete: '08:00',
          fuso_horario: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        });
        await r.salvarCiclo({ ...padrao, data_inicio: inicio, quantidade_total_mg: totalN, concentracao_mg_ml: concN });
      });
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="app" style={{ paddingTop: 24 }}>
      <form className="pilha" onSubmit={salvar}>
        <div className="marca-heroi">
          <img src={`${import.meta.env.BASE_URL}braco.webp`} alt="" style={{ width: 'min(36vw, 140px)' }} />
        </div>
        <div>
          <h1>Vamos configurar</h1>
          <p className="mudo">Conta: {usuario?.email}</p>
        </div>
        <section className="cartao pilha">
          <h2>Seus dados</h2>
          <Campo rotulo="Nome">
            <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
          </Campo>
          <Campo rotulo="Sexo" dica="Define a fórmula de % de gordura." grupo>
            <Escolhas opcoes={[{ valor: 'Masculino' as Sexo, rotulo: 'Masculino' }, { valor: 'Feminino' as Sexo, rotulo: 'Feminino' }]} valor={sexo} aoMudar={(v) => v && setSexo(v)} />
          </Campo>
          <CampoNumero rotulo="Altura" sufixo="cm" valor={altura} aoMudar={setAltura} dica="Ex.: 182" />
        </section>
        <section className="cartao pilha">
          <h2>Ciclo de retatrutida</h2>
          <Campo rotulo="Data da 1ª aplicação" dica={`${diaDaSemana(inicio)}. As próximas datas partem daqui e se ajustam a cada aplicação real.`}>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </Campo>
          <div className="grade">
            <CampoNumero rotulo="Quantidade total da sua parte" sufixo="mg" valor={total} aoMudar={setTotal} />
            <CampoNumero rotulo="Concentração" sufixo="mg/ml" valor={conc} aoMudar={setConc} />
          </div>
          <p className="mudo">
            O plano de escalonamento da sua planilha (6 fases, de 1,25 mg a 2,5 mg em 30 semanas) já vem pronto e pode ser ajustado depois em Ciclo → Plano.
          </p>
        </section>
        {erro && <div className="alerta erro">{erro}</div>}
        <button className="botao primario">Começar</button>
        <button type="button" className="botao pequeno" onClick={() => void sair()}>Sair</button>
      </form>
    </div>
  );
}
