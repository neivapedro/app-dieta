import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FormAplicacao, FormDiario } from '../componentes/formularios';
import { Bloco, Icone } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { diaDaSemana, formatarData } from '../lib/datas';
import { corVariacao, kg, mg, num, pct, pp, sinal, cm } from '../lib/formato';
import { estadoNotificacao, type EstadoNotificacao } from '../lib/notificacoes';
import { NIVEIS_NAUSEA } from '../lib/tipos';

export function Inicio() {
  const { ciclo, diario, perfil } = useDados();
  const { resumo, geral, hoje } = useCalculos();
  const [params, setParams] = useSearchParams();
  const [registrar, setRegistrar] = useState(params.get('registrar') === '1');
  const [diarioAberto, setDiarioAberto] = useState(false);
  const [notif, setNotif] = useState<EstadoNotificacao | null>(null);

  useEffect(() => {
    estadoNotificacao().then(setNotif).catch(() => setNotif('sem-suporte'));
  }, []);

  if (!ciclo || !resumo) return null;
  const p = resumo.proxima;
  const regHoje = diario.find((r) => r.data === hoje);

  function fecharRegistro() {
    setRegistrar(false);
    if (params.has('registrar')) setParams({}, { replace: true });
  }

  const ini = geral.medida_inicial;
  const atu = geral.medida_atual;

  return (
    <div className="pilha">
      {p ? (
        <section className={`cartao proxima ${p.situacao}`}>
          <div className="cartao-cab">
            <span className="rotulo">Próxima aplicação · {p.numero}ª dose</span>
            {p.situacao === 'hoje' && <span className="etiqueta destaque">Hoje</span>}
            {p.situacao === 'atrasada' && <span className="etiqueta ruim">Atrasada {p.dias} dia(s)</span>}
            {p.situacao === 'futura' && <span className="etiqueta">em {p.dias} dia(s)</span>}
          </div>
          <div className="linha entre" style={{ alignItems: 'flex-end' }}>
            <div>
              <div className="grande numero">{num(p.dose_mg)} mg</div>
              <div className="mudo">
                {diaDaSemana(p.data)}, {formatarData(p.data)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="medio numero">{num(p.ui)} UI</div>
              <div className="mudo">seringa U-100</div>
            </div>
          </div>
          <div className="grade" style={{ marginTop: 14 }}>
            <Bloco rotulo={`Na seringa (marcas de ${num(ciclo.passo_ui, ciclo.passo_ui % 1 ? 2 : 0)} UI)`} valor={`${num(p.ui_pratica, 1)} UI`} />
            <Bloco
              rotulo="Isso entrega"
              valor={
                Math.abs(p.mg_pratica - p.dose_mg) < 0.0005 ? (
                  mg(p.mg_pratica)
                ) : (
                  <>
                    {mg(p.mg_pratica)} <span className="mudo">({sinal(p.mg_pratica - p.dose_mg, 2)})</span>
                  </>
                )
              }
            />
            <Bloco rotulo={`Fase ${p.fase.indice + 1}`} valor={p.fase.fase.nome} />
            <Bloco rotulo="Local sugerido" valor={resumo.sugestao_local} />
          </div>
          <button className="botao primario bloco-largo" style={{ marginTop: 14 }} onClick={() => setRegistrar(true)}>
            <Icone nome="mais" /> Registrar aplicação
          </button>
        </section>
      ) : (
        <section className="cartao pilha">
          <h2>Ciclo concluído</h2>
          <p className="mudo">Sua parte de {mg(ciclo.quantidade_total_mg)} foi totalmente utilizada em {resumo.aplicacoes_realizadas} aplicações.</p>
          <button className="botao" onClick={() => setRegistrar(true)}>Registrar aplicação extra</button>
        </section>
      )}

      {resumo.alertas.map((a) => (
        <div className="alerta" key={a}>{a}</div>
      ))}

      {perfil?.lembretes_ativos && notif && notif !== 'ativo' && notif !== 'ativo-sem-servidor' && (
        <Link to="/perfil" className="alerta info" style={{ color: 'inherit', textDecoration: 'none' }}>
          <Icone nome="sino" />
          <span>
            {notif === 'ios-instalar'
              ? 'Para receber o lembrete no iPhone, adicione o app à Tela de Início (Compartilhar → Adicionar à Tela de Início) e ative as notificações em Perfil.'
              : notif === 'negado'
                ? 'As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador.'
                : 'Ative os lembretes para ser avisado no dia de cada aplicação. Toque aqui.'}
          </span>
        </Link>
      )}

      <section className="cartao">
        <div className="cartao-cab">
          <h2>Saldo do frasco</h2>
          <span className="mudo">{pct(resumo.percentual_usado)} usado</span>
        </div>
        <div className="barra" aria-hidden="true">
          <div style={{ width: `${Math.min(resumo.percentual_usado, 1) * 100}%` }} />
        </div>
        <div className="grade grade-4" style={{ marginTop: 14 }}>
          <Bloco rotulo="Saldo" valor={mg(resumo.saldo_mg)} />
          <Bloco rotulo="Saldo (ml / UI)" valor={`${num(resumo.saldo_ml)} ml · ${num(resumo.saldo_ui, 0)} UI`} />
          <Bloco rotulo="Aplicações feitas" valor={`${resumo.aplicacoes_realizadas} · ${mg(resumo.total_aplicado_mg)}`} />
          <Bloco rotulo="Doses de manutenção no saldo" valor={`${resumo.doses_manutencao_restantes} × ${num(ciclo.fases[ciclo.fases.length - 1]?.dose_mg)} mg`} />
        </div>
        {resumo.data_fim_prevista && p && (
          <p className="mudo" style={{ marginTop: 10 }}>
            Mantendo o plano, a última dose fica para {formatarData(resumo.data_fim_prevista)}.
          </p>
        )}
      </section>

      <section className="cartao">
        <div className="cartao-cab">
          <h2>Hoje</h2>
          <button className="botao pequeno" onClick={() => setDiarioAberto(true)}>{regHoje ? 'Editar' : 'Registrar'}</button>
        </div>
        {regHoje ? (
          <div className="grade grade-3">
            <Bloco rotulo="Peso" valor={kg(regHoje.peso_kg)} />
            <Bloco rotulo="Náusea" valor={regHoje.nausea === null ? '–' : NIVEIS_NAUSEA[regHoje.nausea]} />
            <Bloco rotulo="Obs." valor={regHoje.observacoes ?? '–'} />
          </div>
        ) : (
          <p className="mudo">Anote peso, náusea e efeitos de hoje. Vale para qualquer dia, não só o da aplicação.</p>
        )}
      </section>

      <section className="cartao">
        <div className="cartao-cab">
          <h2>Antes × agora</h2>
          <Link to="/analise" className="botao pequeno">Análise</Link>
        </div>
        {geral.peso_inicial ? (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Início</th>
                  <th>Agora</th>
                  <th>Variação</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Peso</td>
                  <td>{kg(geral.peso_inicial.peso_kg)}</td>
                  <td>{kg(geral.peso_atual?.peso_kg)}</td>
                  <td className={corVariacao(geral.variacao_kg, true)}>{sinal(geral.variacao_kg, 1, ' kg')}</td>
                </tr>
                {ini && (
                  <>
                    <tr>
                      <td>% gordura</td>
                      <td>{pp(ini.bf)}</td>
                      <td>{pp(atu?.bf)}</td>
                      <td className={corVariacao(atu && ini.bf !== null && atu.bf !== null ? atu.bf - ini.bf : null, true)}>
                        {atu && ini.bf !== null && atu.bf !== null ? sinal(atu.bf - ini.bf, 1, ' p.p.') : '–'}
                      </td>
                    </tr>
                    <tr>
                      <td>Cintura</td>
                      <td>{cm(ini.cintura_cm)}</td>
                      <td>{cm(atu?.cintura_cm)}</td>
                      <td className={corVariacao(atu ? atu.cintura_cm - ini.cintura_cm : null, true)}>
                        {atu ? sinal(atu.cintura_cm - ini.cintura_cm, 1, ' cm') : '–'}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mudo">
            Registre suas <Link to="/medidas">medidas</Link> para acompanhar a evolução desde o início do ciclo.
          </p>
        )}
      </section>

      {registrar && <FormAplicacao aoFechar={fecharRegistro} />}
      {diarioAberto && <FormDiario registro={regHoje} aoFechar={() => setDiarioAberto(false)} />}
    </div>
  );
}
