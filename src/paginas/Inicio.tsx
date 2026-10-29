import { SEMANAS_POS } from '../lib/projeto';
import '../estilos/inicio.css';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TextoRca } from '../componentes/composicao';
import { AvisoRapido } from '../componentes/dose';
import { FormAplicacao, FormDiario, FormMedida } from '../componentes/formularios';
import { HistoricoAneis, useAneis } from '../componentes/aneis';
import { ResumoInsights } from '../componentes/insights';
import { DoseDetalhe, DoseRecolhida, DoseResumo, TopoAneis } from '../componentes/inicio-topo';
import { AlertasSeguranca, AnelHoje, ChecklistHoje, FaixaOntem, useTarefasHoje } from '../componentes/inicio';
import { Kpi } from '../componentes/painel';
import { CartaoFimProjeto } from '../componentes/projeto';
import { CartaoRelatorioFinal } from '../componentes/relatorio-final-entrada';
import { ResumoSemana } from '../componentes/ResumoSemana';
import { FormDiaTreino } from '../componentes/treino';
import { Icone, IconeChip } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useProjeto } from '../dados/useProjeto';
import { diaDaSemana, diferencaDias, formatarData } from '../lib/datas';
import { cm, corVariacao, kg, mg, num, pct, pp, sinal, ui } from '../lib/formato';
import { cinturaAlvoRca, MDC, type ChaveMdc } from '../lib/gordura';
import { estadoNotificacao, type EstadoNotificacao } from '../lib/notificacoes';
import { serieMetrica, type ChavePainel } from '../lib/painel';
import { DIAS_REGISTRO_DOSE, diaDesdeDose, doseEmDestaque, horaDeFecharODia } from '../lib/rotina';
import { mostrarAtalhoResumo } from '../lib/semana';
import { segundaDaSemana } from '../lib/treino';

const CHAVE_AVISO_NOTIF = 'inicio:aviso-notificacao-dispensado';

function lerDispensado(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_AVISO_NOTIF) === '1';
  } catch {
    return false;
  }
}

/** Lembretes ligados mas sem notificação no aparelho: uma linha fina, que dá para dispensar nesta sessão. */
function AvisoNotificacao({ notif }: { notif: EstadoNotificacao }) {
  const [dispensado, setDispensado] = useState(lerDispensado);
  if (dispensado) return null;
  function dispensar() {
    setDispensado(true);
    try {
      sessionStorage.setItem(CHAVE_AVISO_NOTIF, '1');
    } catch {
      /* sem armazenamento: some só até sair da tela */
    }
  }
  return (
    <div className="aviso-linha" role="note">
      <Link to="/perfil" className="aviso-linha-texto">
        <Icone nome="sino" />
        <span>
          {notif === 'ios-instalar'
            ? 'Para receber o lembrete no iPhone, adicione o app à Tela de Início (Compartilhar → Adicionar à Tela de Início) e ative as notificações em Perfil.'
            : notif === 'negado'
              ? 'As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador.'
              : 'Ative os lembretes para ser avisado no dia de cada aplicação. Toque aqui.'}
        </span>
      </Link>
      <button type="button" className="aviso-linha-fechar" onClick={dispensar} aria-label="Dispensar aviso das notificações">
        <Icone nome="fechar" />
      </button>
    </div>
  );
}

export function Inicio() {
  const { ciclo, diario, perfil, medidas } = useDados();
  const { resumo, geral, hoje, composicoes } = useCalculos();
  const proj = useProjeto();
  const [params, setParams] = useSearchParams();
  const [registrar, setRegistrar] = useState(params.get('registrar') === '1');
  const [diarioAberto, setDiarioAberto] = useState(false);
  const [medindo, setMedindo] = useState(false);
  const [resumoSemana, setResumo] = useState<string | null>(null);
  const [doseAberta, setDoseAberta] = useState(false);
  const [notif, setNotif] = useState<EstadoNotificacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    estadoNotificacao().then(setNotif).catch(() => setNotif('sem-suporte'));
  }, []);

  const p = resumo?.proxima ?? null;
  const pos = proj?.pos ?? null;
  // Dose no checklist: devida hoje ou atrasada; feita quando a aplicação de hoje foi registrada
  const tarefas = useTarefasHoje(
    resumo && proj && !pos
      ? {
          devida: !!p && (p.situacao === 'hoje' || p.situacao === 'atrasada'),
          feitaHoje: proj.ultimaDose === hoje,
          texto: p ? `${mg(p.dose_mg)} · ${ui(p.ui_pratica)}` : '',
        }
      : null,
  );
  const aneis = useAneis(tarefas);
  const [treinoAberto, setTreinoAberto] = useState(false);

  if (!ciclo || !resumo || !proj) return null;
  const regHoje = diario.find((r) => r.data === hoje);
  const diasFrasco = ciclo.frasco_aberto_em ? diferencaDias(ciclo.frasco_aberto_em, hoje) : null;
  // Ordem do que fazer agora: a dose em destaque só perto do dia; à noite, "Fechar o dia"
  const destaque = !!p && doseEmDestaque(p, resumo);
  const fecharDia = horaDeFecharODia(new Date().getHours());
  const dDose = pos ? null : diaDesdeDose(proj.ultimaDose, hoje);
  const pertoDaDose = dDose !== null && dDose <= DIAS_REGISTRO_DOSE;
  const etiquetaDose = pertoDaDose ? (dDose === 0 ? 'dia da dose' : `D${dDose} da dose`) : undefined;
  const mostrarFimProjeto = pos || !p || resumo.degrau.estado === 'fim_plano';

  function fecharRegistro() {
    setRegistrar(false);
    if (params.has('registrar')) setParams({}, { replace: true });
  }

  // Contexto do topo: fase e dia do ciclo (como na Análise)
  const periodo = proj.periodo;
  const totalDias = periodo ? diferencaDias(periodo.inicio, periodo.fim) + 1 : null;
  const diaCiclo = periodo && totalDias ? Math.min(Math.max(diferencaDias(periodo.inicio, hoje) + 1, 0), totalDias) : null;
  const ultimaFase = resumo.degrau.degrau?.ultima_fase ?? null;
  const tituloFase = pos
    ? 'Fase pós-remédio'
    : !p
      ? 'Ciclo concluído'
      : resumo.degrau.estado === 'fim_plano'
        ? 'Plano concluído'
        : resumo.degrau.estado === 'pendente' && ultimaFase !== null
          ? `Fase ${ultimaFase + 1} concluída`
          : p.fase
            ? `Fase ${p.fase.indice + 1} · ${p.fase.fase.nome}`
            : 'Dose fora do plano';

  // Linha da legenda dos anéis: leva ao controle do checklist (centraliza e pisca de leve)
  function rolarPara(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove('pulso-anel');
    void el.offsetWidth;
    el.classList.add('pulso-anel');
    window.setTimeout(() => el.classList.remove('pulso-anel'), 1600);
  }
  const acoesAneis = {
    // Treino: a folha de treino e cardio do dia; sem Treino: o registro do Diário
    externo: () => (tarefas.comTreino ? setTreinoAberto(true) : setDiarioAberto(true)),
    // Dieta: à noite, o "Segui o plano hoje?" do Fechar o dia; de dia, o Diário. Sem plano: o checklist
    meio: () => (tarefas.comDieta ? (fecharDia ? rolarPara('tarefa-plano') : setDiarioAberto(true)) : rolarPara('checklist-hoje')),
    interno: () => setDiarioAberto(true),
  };

  const ini = geral.medida_inicial;
  const atu = geral.medida_atual;
  const cinturaAgora = atu?.cintura_cm ?? ini?.cintura_cm ?? null;
  // Altura do Perfil; sem ela, a gravada na medição (como em Medidas)
  const alturaRca = perfil?.altura_cm || medidas.find((m) => m.data === (atu ?? ini)?.data)?.altura_cm || null;
  const ultimaMedicao = composicoes.length ? composicoes[composicoes.length - 1].data : null;
  const metas = perfil?.modulo_treino ? perfil.metas_projeto ?? null : null;
  const metaGorda = metas?.peso_kg && metas.bf ? (metas.peso_kg * metas.bf) / 100 : null;
  const metaMagra = metas?.peso_kg && metas.bf ? metas.peso_kg * (1 - metas.bf / 100) : null;
  const ultimos = (k: ChavePainel) => serieMetrica(composicoes, k).slice(-10).map((x) => x.valor);

  // Indicador do "Antes × agora": agora, variação desde o início, início e meta na legenda
  const kpi = (
    rotulo: string,
    a: number | null,
    b: number | null,
    meta: number | null,
    fmt: (n: number | null | undefined) => string,
    sufixo: string,
    menorMelhor: boolean,
    chave: ChaveMdc,
    valores?: number[],
  ) => {
    const d = a !== null && b !== null ? b - a : null;
    return (
      <Kpi
        key={rotulo}
        rotulo={rotulo}
        valor={fmt(b ?? a)}
        variacao={d === null ? 'sem nova medição' : sinal(d, 1, sufixo)}
        classe={corVariacao(d, menorMelhor, MDC[chave])}
        valores={valores}
        legenda={`início ${fmt(a)}${meta !== null ? ` · meta ${fmt(meta)}` : ''}`}
      />
    );
  };

  // Medidas antes do peso (a regra do projeto: medidas valem mais que peso)
  const linha = (
    rotulo: string,
    a: number | null,
    b: number | null,
    meta: number | null,
    fmt: (n: number | null | undefined) => string,
    fmtDelta: (n: number) => string,
    menorMelhor: boolean,
    chave: ChaveMdc,
  ) => {
    const d = a !== null && b !== null ? b - a : null;
    return (
      <tr key={rotulo}>
        <td>{rotulo}</td>
        <td>{fmt(a)}</td>
        <td>
          {fmt(b)}
          {d !== null && <div className={`sub-valor so-estreita ${corVariacao(d, menorMelhor, MDC[chave])}`}>{fmtDelta(d)}</div>}
        </td>
        <td className={`col-larga ${corVariacao(d, menorMelhor, MDC[chave])}`}>{d === null ? '–' : fmtDelta(d)}</td>
        {metas && <td>{meta === null ? '–' : fmt(meta)}</td>}
      </tr>
    );
  };

  const usado = Math.min(Math.max(resumo.percentual_usado, 0), 1);
  const restantes =
    resumo.doses_plano_restantes > resumo.projecao.length
      ? `${resumo.doses_plano_restantes} · frasco cobre ${resumo.projecao.length}`
      : `${resumo.projecao.length} ${resumo.projecao.length === 1 ? 'dose' : 'doses'}`;

  const comDose = !pos && !!p;
  const doseAbertaAgora = comDose && (destaque || doseAberta);
  const fracaoCiclo = diaCiclo !== null && totalDias ? Math.min(Math.max(diaCiclo / totalDias, 0), 1) : null;

  return (
    <div className="pilha pagina-inicio">
      <FaixaOntem />

      <section className={`cartao hero hoje-hero ${doseAbertaAgora ? `com-dose ${p!.situacao}` : ''}`} aria-label="Hoje">
        <div className="hoje-hero-cab">
          <div className="sobretitulo">
            {diaDaSemana(hoje)}, {formatarData(hoje).slice(0, 5)}
            {etiquetaDose ? ` · ${etiquetaDose}` : ''}
          </div>
          <div className="hoje-hero-titulo">{tituloFase}</div>
          {diaCiclo !== null && totalDias !== null && (
            <div className="hero-sub numero">
              {pos && pos.semana !== null
                ? `Fase pós-remédio · semana ${pos.semana + 1} de ${SEMANAS_POS}${pos.encerrada ? ' (concluída)' : ''}`
                : diaCiclo >= 1
                  ? `Dia ${diaCiclo} de ${totalDias} do ${pos ? 'projeto' : 'ciclo'}`
                  : `${totalDias} dias de ciclo pela frente`}
            </div>
          )}
          {fracaoCiclo !== null && !pos && (
            <div className="hoje-ciclo-barra" aria-hidden="true">
              <div style={{ width: `${fracaoCiclo * 100}%` }} />
            </div>
          )}
        </div>

        <TopoAneis aneis={aneis.hoje} acoes={acoesAneis}>
          {comDose ? doseAbertaAgora ? <DoseResumo /> : <DoseRecolhida aoAbrir={() => setDoseAberta(true)} /> : null}
        </TopoAneis>

        {doseAbertaAgora && (
          <DoseDetalhe
            aoRegistrar={() => setRegistrar(true)}
            aoRecolher={destaque ? undefined : () => setDoseAberta(false)}
            aoDecidir={() => setDoseAberta(true)}
          />
        )}
      </section>

      {/* Ciclo concluído: o relatório final fica pronto (só aparece depois do fim) */}
      <CartaoRelatorioFinal onde="inicio" />

      {/* Fim do remédio (ou plano concluído com sobra no frasco): o balanço do projeto */}
      {mostrarFimProjeto && <CartaoFimProjeto aoRegistrar={() => setRegistrar(true)} compacto />}

      {/* Remonta a cada dia: um peso digitado e não salvo ontem não vira o peso de hoje */}
      <ChecklistHoje
        key={hoje}
        h={tarefas}
        noite={fecharDia}
        etiqueta={etiquetaDose}
        aoDiario={() => setDiarioAberto(true)}
        aoMedir={() => setMedindo(true)}
        aoDose={() => setRegistrar(true)}
      />

      <AlertasSeguranca />

      {resumo.alertas.map((a) => (
        <div className="alerta" key={a}>
          {a}
        </div>
      ))}

      {perfil?.lembretes_ativos && notif && notif !== 'ativo' && notif !== 'ativo-sem-servidor' && <AvisoNotificacao notif={notif} />}

      {ultimaMedicao && mostrarAtalhoResumo(hoje, ultimaMedicao, segundaDaSemana(hoje)) && (
        <button type="button" className="atalho-linha" onClick={() => setResumo(ultimaMedicao)}>
          <IconeChip nome="diario" cor="ciano" />
          <span className="cresce atalho-linha-texto">
            <b>Resumo da semana</b>
            <span>Medição da semana feita. Reveja a semana: medidas, dieta, efeitos e a sugestão.</span>
          </span>
          <span className="atalho-linha-seta" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      <ResumoInsights onde="inicio" />

      <HistoricoAneis semanas={aneis.semanas} semanasPadrao={1} />

      <section className="cartao antes-agora">
        <div className="secao-cab">
          <div className="titulo-com-icone">
            <IconeChip nome="medidas" cor="ciano" />
            <div>
              <h2>Antes × agora</h2>
              <div className="secao-sub">{ini ? `Desde ${formatarData(ini.data, true).slice(0, 5)} · linha: últimas medições` : 'Desde o início do ciclo'}</div>
            </div>
          </div>
          <Link to="/analise" className="botao pequeno">
            Análise
          </Link>
        </div>
        {geral.peso_inicial ? (
          <>
            <div className="kpis kpis-carrossel" data-sem-puxar="" role="group" aria-label="Indicadores: deslize para o lado">
              {ini && (
                <>
                  {kpi('Cintura', ini.cintura_cm, atu?.cintura_cm ?? null, metas?.cintura_cm ?? null, cm, ' cm', true, 'cintura_cm', ultimos('cintura_cm'))}
                  {kpi('% gordura', ini.bf, atu?.bf ?? null, metas?.bf ?? null, pp, ' p.p.', true, 'bf', ultimos('bf'))}
                  {kpi('Massa magra', ini.massa_magra_kg, atu?.massa_magra_kg ?? null, metaMagra, kg, ' kg', false, 'massa_magra_kg', ultimos('massa_magra_kg'))}
                </>
              )}
              {kpi('Peso', geral.peso_inicial.peso_kg, geral.peso_atual?.peso_kg ?? null, metas?.peso_kg ?? null, kg, ' kg', true, 'peso_kg', ultimos('peso_kg'))}
              {cinturaAgora !== null && alturaRca ? (
                <div className="kpi kpi-rca">
                  <div className="kpi-rotulo">Cintura/altura</div>
                  <div className="kpi-rca-texto numero">
                    <TextoRca cintura={cinturaAgora} altura={alturaRca} />
                  </div>
                  <div className="kpi-legenda">(saudável abaixo de 0,50 · cintura abaixo de {cm(cinturaAlvoRca(alturaRca))})</div>
                </div>
              ) : null}
            </div>
            <details className="tabela-detalhe">
              <summary>Ver tabela (com massa gorda)</summary>
              <div className="tabela-rolagem">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Início</th>
                      <th>Agora</th>
                      <th className="col-larga">Variação</th>
                      {metas && <th>Meta</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {ini && (
                      <>
                        {linha('Cintura', ini.cintura_cm, atu?.cintura_cm ?? null, metas?.cintura_cm ?? null, cm, (n) => sinal(n, 1, ' cm'), true, 'cintura_cm')}
                        {linha('% gordura', ini.bf, atu?.bf ?? null, metas?.bf ?? null, pp, (n) => sinal(n, 1, ' p.p.'), true, 'bf')}
                        {linha('Massa gorda', ini.massa_gorda_kg, atu?.massa_gorda_kg ?? null, metaGorda, kg, (n) => sinal(n, 1, ' kg'), true, 'massa_gorda_kg')}
                        {linha('Massa magra', ini.massa_magra_kg, atu?.massa_magra_kg ?? null, metaMagra, kg, (n) => sinal(n, 1, ' kg'), false, 'massa_magra_kg')}
                      </>
                    )}
                    {linha('Peso', geral.peso_inicial.peso_kg, geral.peso_atual?.peso_kg ?? null, metas?.peso_kg ?? null, kg, (n) => sinal(n, 1, ' kg'), true, 'peso_kg')}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="mudo">
            Registre suas <Link to="/medidas">medidas</Link> para acompanhar a evolução desde o início do ciclo.
          </p>
        )}
      </section>

      <section className="cartao frasco" aria-label="Saldo do frasco">
        <div className="frasco-corpo">
          <AnelHoje fracao={usado} texto={pct(usado, 0)} sub="usado" rotulo={`Frasco: ${pct(resumo.percentual_usado)} usado`} />
          <div className="frasco-texto">
            <div className="frasco-cab">
              <h2>Saldo do frasco</h2>
              <span className="mudo numero">{pct(resumo.percentual_usado)} usado</span>
            </div>
            <div className="frasco-saldo numero">
              <b>{mg(resumo.saldo_mg)}</b>
              <span className="mudo">
                {' '}
                · {num(resumo.saldo_ml)} ml · {num(resumo.saldo_ui, 0)} UI
              </span>
            </div>
            <div className="frasco-doses mudo numero">
              Doses restantes no plano: <b>{restantes}</b> · {resumo.aplicacoes_realizadas} feitas · {mg(resumo.total_aplicado_mg)}
            </div>
          </div>
        </div>
        {((resumo.data_fim_prevista && resumo.projecao.length > 0) || (diasFrasco !== null && diasFrasco >= 0) || resumo.sobra_doses > 0) && (
          <details className="tabela-detalhe">
            <summary>Previsão do frasco</summary>
            <div className="pilha" style={{ gap: 6 }}>
              {resumo.data_fim_prevista && resumo.projecao.length > 0 && (
                <p className="mudo">
                  {resumo.doses_plano_restantes > resumo.projecao.length
                    ? `O frasco acaba em ${formatarData(resumo.data_fim_prevista)}: faltarão ${resumo.doses_plano_restantes - resumo.projecao.length} dose(s) do plano.`
                    : resumo.fim_hipotese
                      ? `Se subir em cada fim de fase, a última dose fica para ${formatarData(resumo.data_fim_prevista)}.`
                      : `Mantendo o plano, a última dose fica para ${formatarData(resumo.data_fim_prevista)}.`}
                  {resumo.fim_hipotese && ' Hipótese: cada subida depende da sua decisão no fim da fase.'}
                </p>
              )}
              {diasFrasco !== null && diasFrasco >= 0 && (
                <p className="mudo">
                  Frasco aberto em {formatarData(ciclo.frasco_aberto_em!)} · há {diasFrasco} {diasFrasco === 1 ? 'dia' : 'dias'}.
                </p>
              )}
              {resumo.sobra_doses > 0 && (
                <p className="mudo">
                  Depois do plano sobram {mg(resumo.sobra_mg)} no frasco (≈ {resumo.sobra_doses} dose{resumo.sobra_doses > 1 ? 's' : ''} da última fase). Se o
                  médico indicar continuar, use “Repetir fase” no Plano.
                </p>
              )}
            </div>
          </details>
        )}
      </section>

      {registrar && <FormAplicacao aoFechar={fecharRegistro} aoSalvar={setAviso} />}
      {aviso && <AvisoRapido texto={aviso} aoSumir={() => setAviso(null)} />}
      {treinoAberto && <FormDiaTreino data={hoje} aoFechar={() => setTreinoAberto(false)} />}
      {diarioAberto && <FormDiario registro={regHoje} aoFechar={() => setDiarioAberto(false)} />}
      {medindo && <FormMedida aoFechar={() => setMedindo(false)} aoSalvar={(data) => setResumo(data)} />}
      {resumoSemana && <ResumoSemana data={resumoSemana} aoFechar={() => setResumo(null)} />}
    </div>
  );
}
