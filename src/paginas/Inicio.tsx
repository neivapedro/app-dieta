import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AvisoRapido, FimDeFase, ForaDoPlano } from '../componentes/dose';
import { FormAplicacao, FormDiario, FormMedida } from '../componentes/formularios';
import { CartaoDietaHoje, CartaoMedicaoSegunda } from '../componentes/inicio';
import { ResumoSemana } from '../componentes/ResumoSemana';
import { CartaoTreinoHoje } from '../componentes/treino';
import { Bloco, Icone } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { guiaSeringa, marcasVizinhas, seringaDo, textoSeringa } from '../lib/ciclo';
import { diaDaSemana, diferencaDias, formatarData } from '../lib/datas';
import { cm, corVariacao, kg, mg, num, pct, pp, sinal, ui } from '../lib/formato';
import { estadoNotificacao, type EstadoNotificacao } from '../lib/notificacoes';
import { NIVEIS_NAUSEA } from '../lib/tipos';

export function Inicio() {
  const { ciclo, diario, perfil } = useDados();
  const { resumo, geral, hoje } = useCalculos();
  const [params, setParams] = useSearchParams();
  const [registrar, setRegistrar] = useState(params.get('registrar') === '1');
  const [diarioAberto, setDiarioAberto] = useState(false);
  const [medindo, setMedindo] = useState(false);
  const [resumoSemana, setResumo] = useState(false);
  const [notif, setNotif] = useState<EstadoNotificacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    estadoNotificacao().then(setNotif).catch(() => setNotif('sem-suporte'));
  }, []);

  if (!ciclo || !resumo) return null;
  const p = resumo.proxima;
  const regHoje = diario.find((r) => r.data === hoje);
  const deg = resumo.degrau;
  const seringa = seringaDo(ciclo);
  const vizinhas = p ? marcasVizinhas(p.ui_pratica, seringa.marca, ciclo.concentracao_mg_ml) : null;
  // "Fase 2 · dose 3 de 4" (a dose da fase conta pelas aplicações seguidas com a mesma dose)
  const posicao =
    deg.estado === 'em_curso' && deg.previstas
      ? ` · dose ${deg.feitas + 1} de ${deg.previstas}`
      : deg.estado === 'inicio' || deg.estado === 'subir'
        ? ` · dose 1 de ${p?.fase?.fase.semanas ?? '–'}`
        : deg.estado === 'pendente'
          ? ' · fim'
          : '';
  const diasFrasco = ciclo.frasco_aberto_em ? diferencaDias(ciclo.frasco_aberto_em, hoje) : null;

  function fecharRegistro() {
    setRegistrar(false);
    if (params.has('registrar')) setParams({}, { replace: true });
  }

  const ini = geral.medida_inicial;
  const atu = geral.medida_atual;
  const metas = perfil?.modulo_treino ? perfil.metas_projeto ?? null : null;
  const metaGorda = metas?.peso_kg && metas.bf ? (metas.peso_kg * metas.bf) / 100 : null;
  const metaMagra = metas?.peso_kg && metas.bf ? metas.peso_kg * (1 - metas.bf / 100) : null;

  // Medidas antes do peso (a regra do projeto: medidas valem mais que peso)
  const linha = (
    rotulo: string,
    a: number | null,
    b: number | null,
    meta: number | null,
    fmt: (n: number | null | undefined) => string,
    fmtDelta: (n: number) => string,
    menorMelhor: boolean,
  ) => {
    const d = a !== null && b !== null ? b - a : null;
    return (
      <tr key={rotulo}>
        <td>{rotulo}</td>
        <td>{fmt(a)}</td>
        <td>{fmt(b)}</td>
        <td className={corVariacao(d, menorMelhor)}>{d === null ? '–' : fmtDelta(d)}</td>
        {metas && <td>{meta === null ? '–' : fmt(meta)}</td>}
      </tr>
    );
  };

  return (
    <div className="pilha">
      {p ? (
        <section className={`cartao proxima ${p.situacao}`}>
          <div className="cartao-cab">
            <span className="rotulo">Próxima aplicação · {p.numero}ª dose</span>
            {p.extra && <span className="etiqueta aviso">Dose extra · sobra do frasco</span>}
            {p.estado === 'pendente' && <span className="etiqueta aviso">Fim da fase</span>}
            {p.estado === 'fora_do_plano' && <span className="etiqueta aviso">Fora do plano</span>}
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
              <div className="medio numero">{ui(p.ui)}</div>
              <div className="mudo">seringa U-100</div>
            </div>
          </div>
          {resumo.pausa_dias !== null && (
            <div className="alerta erro" style={{ marginTop: 12 }}>
              Pausa de {Math.floor(resumo.pausa_dias / 7)} semanas desde a última dose ({formatarData(resumo.linhas[resumo.linhas.length - 1].aplicacao.data)}):
              confirme a dose com o médico antes de aplicar.
            </div>
          )}
          <div className="grade" style={{ marginTop: 14 }}>
            <Bloco rotulo="Puxar até" valor={ui(p.ui_pratica)} />
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
            {p.fase ? <Bloco rotulo={`Fase ${p.fase.indice + 1}`} valor={`${p.fase.fase.nome}${posicao}`} /> : <Bloco rotulo="Fase" valor="Fora do plano" />}
            <Bloco rotulo="Local sugerido" valor={resumo.sugestao_local} />
          </div>
          <p className="mudo" style={{ marginTop: 10 }}>
            Na {textoSeringa(ciclo)}: {guiaSeringa(p.ui_pratica, seringa.marca)}.
          </p>
          {vizinhas && (
            <p className="mudo vizinhas" style={{ marginTop: 4 }}>
              Marcas vizinhas: {vizinhas.map((v) => `${ui(v.ui)} = ${mg(v.mg)}`).join(' · ')}.
            </p>
          )}
          <FimDeFase />
          <ForaDoPlano />
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

      <CartaoMedicaoSegunda aoMedir={() => setMedindo(true)} />

      <CartaoTreinoHoje />

      <CartaoDietaHoje />

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
          <Bloco
            rotulo="Doses restantes no plano"
            valor={
              resumo.doses_plano_restantes > resumo.projecao.length
                ? `${resumo.doses_plano_restantes} · frasco cobre ${resumo.projecao.length}`
                : `${resumo.projecao.length} ${resumo.projecao.length === 1 ? 'dose' : 'doses'}`
            }
          />
        </div>
        {resumo.data_fim_prevista && resumo.projecao.length > 0 && (
          <p className="mudo" style={{ marginTop: 10 }}>
            {resumo.doses_plano_restantes > resumo.projecao.length
              ? `O frasco acaba em ${formatarData(resumo.data_fim_prevista)}: faltarão ${resumo.doses_plano_restantes - resumo.projecao.length} dose(s) do plano.`
              : resumo.fim_hipotese
                ? `Se subir em cada fim de fase, a última dose fica para ${formatarData(resumo.data_fim_prevista)}.`
                : `Mantendo o plano, a última dose fica para ${formatarData(resumo.data_fim_prevista)}.`}
            {resumo.fim_hipotese && ' Hipótese: cada subida depende da sua decisão no fim da fase.'}
          </p>
        )}
        {diasFrasco !== null && diasFrasco >= 0 && (
          <p className="mudo" style={{ marginTop: 6 }}>
            Frasco aberto em {formatarData(ciclo.frasco_aberto_em!)} · há {diasFrasco} {diasFrasco === 1 ? 'dia' : 'dias'}.
          </p>
        )}
        {resumo.sobra_doses > 0 && (
          <p className="mudo" style={{ marginTop: 6 }}>
            Depois do plano sobram {mg(resumo.sobra_mg)} no frasco (≈ {resumo.sobra_doses} dose{resumo.sobra_doses > 1 ? 's' : ''} da última fase). Se o
            médico indicar continuar, use “Repetir fase” no Plano.
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
            <Bloco
              rotulo="Sintomas"
              valor={
                [regHoje.vomito && 'vômito', regHoje.diarreia && 'diarreia', regHoje.intestino_preso && 'intestino preso'].filter(Boolean).join(', ') || '–'
              }
            />
          </div>
        ) : null}
        {regHoje?.observacoes && (
          <p className="mudo obs-curta" style={{ marginTop: 8 }}>
            Obs.: {regHoje.observacoes}
          </p>
        )}
        {regHoje ? null : (
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
                  {metas && <th>Meta</th>}
                </tr>
              </thead>
              <tbody>
                {ini && (
                  <>
                    {linha('Cintura', ini.cintura_cm, atu?.cintura_cm ?? null, metas?.cintura_cm ?? null, cm, (n) => sinal(n, 1, ' cm'), true)}
                    {linha('% gordura', ini.bf, atu?.bf ?? null, metas?.bf ?? null, pp, (n) => sinal(n, 1, ' p.p.'), true)}
                    {linha('Massa gorda', ini.massa_gorda_kg, atu?.massa_gorda_kg ?? null, metaGorda, kg, (n) => sinal(n, 1, ' kg'), true)}
                    {linha('Massa magra', ini.massa_magra_kg, atu?.massa_magra_kg ?? null, metaMagra, kg, (n) => sinal(n, 1, ' kg'), false)}
                  </>
                )}
                {linha('Peso', geral.peso_inicial.peso_kg, geral.peso_atual?.peso_kg ?? null, metas?.peso_kg ?? null, kg, (n) => sinal(n, 1, ' kg'), true)}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mudo">
            Registre suas <Link to="/medidas">medidas</Link> para acompanhar a evolução desde o início do ciclo.
          </p>
        )}
      </section>

      {registrar && <FormAplicacao aoFechar={fecharRegistro} aoSalvar={setAviso} />}
      {aviso && <AvisoRapido texto={aviso} aoSumir={() => setAviso(null)} />}
      {diarioAberto && <FormDiario registro={regHoje} aoFechar={() => setDiarioAberto(false)} />}
      {medindo && <FormMedida aoFechar={() => setMedindo(false)} aoSalvar={() => setResumo(true)} />}
      {resumoSemana && <ResumoSemana aoFechar={() => setResumo(false)} />}
    </div>
  );
}
