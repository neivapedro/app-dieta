import '../estilos/treino.css';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CartaoForca } from '../componentes/forca';
import { Numero } from '../componentes/movimento';
import { Anel, BarraMeta, Kpi, Pilulas } from '../componentes/painel';
import { CartaoTreinoHoje, FormDiaTreino, FormMetas } from '../componentes/treino';
import { CalendarioTreino, LegendaCalendario } from '../componentes/treino-calendario';
import { AderenciaMedidas, GraficoPaceCorridas } from '../componentes/treino-graficos';
import { chanceMeta, PROJECAO, projecaoNoRitmo, type ChanceMeta, type ChaveProjecao, type ValorProjetado } from '../lib/conferencia';
import { diaDaSemana, diferencaDias } from '../lib/datas';
import { Bloco, Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useTreino } from '../dados/useTreino';
import { formatarData, somarDias } from '../lib/datas';
import { cm, corVariacao, kg, num, pct, pp, sinal } from '../lib/formato';
import { ajusteVigente, cenariosPesoMeta, cinturaNecessaria, MDC, type ChaveMdc, type Composicao } from '../lib/gordura';
import { progressoMeta } from '../lib/painel';
import { SEMANAS_POS } from '../lib/projeto';
import { formatarKm, formatarTempo, segundaDaSemana, SUBIDA_ESFORCO, textoKmCorridos, type ComparacaoEsforco, type Contagem } from '../lib/treino';
import { ABAS_TREINO, abaTreino, barraPlacar, resumoCorridas, textoHoje, tomPlacar, type AbaTreino } from '../lib/treino-painel';
import type { MetricaSemanal } from '../lib/treino-grafico';

function corAderencia(a: number | null): string {
  if (a === null) return '';
  return a >= 0.9 ? 'bom' : a >= 0.7 ? 'aviso-txt' : 'ruim';
}

/** Cada parte ("6,2 km corridos", "1 sem distância") quebra inteira */
function Partes({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(' · ').map((parte, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          <span className="sem-quebra">{parte}</span>
        </span>
      ))}
    </>
  );
}

function LinhaPlacar({ nome, c, extra }: { nome: string; c: Contagem; extra?: string }) {
  return (
    <tr>
      <td>
        {nome}
        {extra && (
          <div className="mudo placar-extra">
            <Partes texto={extra} />
          </div>
        )}
      </td>
      <td>{c.meta}</td>
      <td>{c.feito}</td>
      <td className={corAderencia(c.aderencia)}>{c.aderencia === null ? '–' : pct(c.aderencia, 0)}</td>
      <td>
        {c.projecao} <span className="mudo">/ {c.total}</span>
      </td>
    </tr>
  );
}

/** Barra do placar: feito até hoje, a marca da meta até hoje e a projeção no fim, sobre o total do período. */
function BarraPlacar({ nome, c, extra }: { nome: string; c: Contagem; extra?: string }) {
  const b = barraPlacar(c);
  return (
    <div className="placar-linha">
      <div className="placar-linha-cab">
        <span className="placar-linha-nome">{nome}</span>
        <span className="placar-linha-proj numero">
          projeção <b>{c.projecao}</b> / {c.total}
        </span>
      </div>
      <div className="placar-trilho" role="img" aria-label={`${nome}: ${c.feito} feitos de ${c.meta} até hoje; projeção ${c.projecao} de ${c.total} no fim`}>
        <span className="placar-proj" style={{ width: `${b.projecao * 100}%` }} />
        <span className={`placar-feito ${tomPlacar(c.aderencia)}`} style={{ width: `${b.feito * 100}%` }} />
        {c.meta > 0 && <span className="placar-meta" style={{ left: `calc(${b.meta * 100}% - 1px)` }} />}
      </div>
      <div className="placar-linha-pes numero">
        <span className="sem-quebra">
          {c.feito} de {c.meta} até hoje
        </span>
        {extra && (
          <>
            {' · '}
            <Partes texto={extra} />
          </>
        )}
      </div>
    </div>
  );
}

type LinhaMedida = {
  nome: string;
  chave: keyof Composicao & ChaveMdc;
  fmt: (n: number | null | undefined) => string;
  unidade: string;
  menorMelhor: boolean;
  meta: number | null;
};

const TEXTO_CHANCE: Record<ChanceMeta, string> = {
  provavel: 'provável',
  possivel: 'possível',
  improvavel: 'improvável',
};
const COR_CHANCE: Record<ChanceMeta, string> = {
  provavel: 'bom',
  possivel: 'mudo',
  improvavel: 'aviso-txt',
};
const OPCOES_METRICA: [MetricaSemanal, string][] = [
  ['cintura_cm', 'Cintura'],
  ['bf', 'Gordura'],
  ['massa_magra_kg', 'Magra'],
  ['peso_kg', 'Peso'],
];

export function Treino() {
  const t = useTreino();
  const { perfil, medidas } = useDados();
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [metasAbertas, setMetasAbertas] = useState(false);
  const [metrica, setMetrica] = useState<MetricaSemanal>('cintura_cm');
  const [todasSemanas, setTodasSemanas] = useState(false);
  const [todasCorridas, setTodasCorridas] = useState(false);
  // A aba fica no endereço (?aba=placar); /treino sem aba (links antigos) abre "Hoje"
  const [params, setParams] = useSearchParams();
  const aba = abaTreino(params.get('aba'));
  const setAba = (a: AbaTreino) => {
    setParams(a === 'hoje' ? {} : { aba: a }, { replace: true });
    window.scrollTo({ top: 0 });
  };
  if (!t) return null;
  const { placar: p, hoje, inicial, atual, metas } = t;
  const progresso = p.totalDias ? Math.min(p.diaAtual / p.totalDias, 1) : 0;
  // Medidas do projeto: na fase pós-remédio o placar é outro, mas o "final" é o do período do remédio
  const final = t.projeto.placar.encerrado;
  const temAtual = atual && inicial && atual.data !== inicial.data;
  const m = metas;
  const metaMagra = m?.peso_kg && m?.bf ? m.peso_kg * (1 - m.bf / 100) : null;
  const metaGorda = m?.peso_kg && m?.bf ? (m.peso_kg * m.bf) / 100 : null;
  const doPeriodo = t.placarPos ? 'da fase' : 'do projeto';

  const linhas: LinhaMedida[] = [
    {
      nome: 'Pescoço',
      chave: 'pescoco_cm',
      fmt: cm,
      unidade: ' cm',
      menorMelhor: true,
      meta: m?.pescoco_cm ?? null,
    },
    {
      nome: 'Cintura',
      chave: 'cintura_cm',
      fmt: cm,
      unidade: ' cm',
      menorMelhor: true,
      meta: m?.cintura_cm ?? null,
    },
    ...(perfil?.sexo === 'Feminino'
      ? [
          {
            nome: 'Quadril',
            chave: 'quadril_cm' as const,
            fmt: cm,
            unidade: ' cm',
            menorMelhor: true,
            meta: m?.quadril_cm ?? null,
          },
        ]
      : []),
    {
      nome: 'Peso',
      chave: 'peso_kg',
      fmt: kg,
      unidade: ' kg',
      menorMelhor: true,
      meta: m?.peso_kg ?? null,
    },
    {
      nome: '% de gordura',
      chave: 'bf',
      fmt: pp,
      unidade: ' p.p.',
      menorMelhor: true,
      meta: m?.bf ?? null,
    },
    {
      nome: 'Massa magra',
      chave: 'massa_magra_kg',
      fmt: kg,
      unidade: ' kg',
      menorMelhor: false,
      meta: metaMagra,
    },
    {
      nome: 'Massa gorda',
      chave: 'massa_gorda_kg',
      fmt: kg,
      unidade: ' kg',
      menorMelhor: true,
      meta: metaGorda,
    },
  ];
  const valor = (c: Composicao | null, k: keyof Composicao) => (c ? (c[k] as number | null) : null);
  // No ritmo das últimas 6 semanas: valor da reta no horizonte (fim ou hoje + 8 semanas) e a faixa de 95%
  const semanaProjeto = Math.floor(Math.max(diferencaDias(t.inicio, hoje), 0) / 7) + 1;
  const projecao = !final ? projecaoNoRitmo(t.composicoes, hoje, t.fim, semanaProjeto) : null;
  const ritmo = projecao?.valores ?? null;
  const projetado = (k: keyof Composicao): ValorProjetado | undefined => (ritmo && k in ritmo ? ritmo[k as ChaveProjecao] : undefined);
  // Metas traduzidas: cintura que dá o % da meta e o peso da meta conforme a massa magra perdida
  const altura = perfil?.altura_cm ?? [...medidas].sort((a, b) => b.data.localeCompare(a.data))[0]?.altura_cm ?? null;
  const ref = atual ?? inicial;
  const cinturaMeta =
    m?.bf && altura && ref
      ? cinturaNecessaria(
          perfil?.sexo ?? 'Masculino',
          altura,
          m.pescoco_cm ?? ref.pescoco_cm,
          m.bf,
          ajusteVigente(perfil, medidas),
          m.quadril_cm ?? ref.quadril_cm,
        )
      : null;
  const cenarios = m?.bf && ref?.massa_magra_kg ? cenariosPesoMeta(ref.massa_magra_kg, ref.peso_kg, m.bf) : [];
  // Grade: até a semana que vem; mostra as 6 mais recentes, com opção de ver tudo
  const SEMANAS_VISIVEIS = 6;
  const ateProxima = t.semanas.filter((s) => s.segunda <= somarDias(hoje, 7));
  const semanasGrade = todasSemanas ? t.semanas : ateProxima.slice(-SEMANAS_VISIVEIS);
  const semanaAtual = t.semanas.filter((s) => s.segunda === segundaDaSemana(hoje));
  const corridas = resumoCorridas(t.corridas);
  const semanasGrafico = t.semanas.filter((s) => s.segunda <= hoje);
  const statusHoje = textoHoje(t.doDia(hoje));
  const emAndamento = p.iniciado && !p.encerrado;

  // ---------- Hoje ----------
  const abaHoje = (
    <>
      <CartaoTreinoHoje />

      <section className="cartao hero treino-hero">
        <div className="hero-cab">
          <div className="cresce">
            <div className="sobretitulo">{t.placarPos ? 'Fase pós-remédio' : 'Projeto'}</div>
            <div className="hero-titulo numero">{p.iniciado ? `Dia ${p.diaAtual} de ${p.totalDias}` : `${p.totalDias} dias`}</div>
            <div className="hero-sub">
              {!p.iniciado
                ? 'Começa na 1ª aplicação'
                : p.encerrado
                  ? `${t.placarPos ? 'Fase encerrada' : 'Projeto encerrado'}`
                  : p.diasRestantes === 0
                    ? 'Hoje é o último'
                    : `Faltam ${p.diasRestantes} ${p.diasRestantes === 1 ? 'dia' : 'dias'}`}
            </div>
            <div className="hero-sub numero">
              {formatarData(p.inicio, true)} → {formatarData(p.fim, true)}
            </div>
          </div>
          {p.iniciado && (
            <div className="treino-hero-anel">
              <Anel fracao={progresso} rotulo="percorrido" />
            </div>
          )}
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="rotulo">Sequência</div>
            <div className="valor">
              🔥 <Numero valor={p.sequenciaAtual} formato={(n) => String(Math.round(n))} />
            </div>
            <div className="hero-stat-sub">{p.sequenciaAtual === 1 ? 'dia' : 'dias'}</div>
          </div>
          <div className="hero-stat">
            <div className="rotulo">Recorde</div>
            <div className="valor">
              <Numero valor={p.recorde} formato={(n) => String(Math.round(n))} />
            </div>
            <div className="hero-stat-sub">{p.recorde === 1 ? 'dia' : 'dias'}</div>
          </div>
          <div className="hero-stat">
            <div className="rotulo">Hoje</div>
            <div className={`valor treino-hoje-status ${statusHoje.completo ? 'completo' : ''}`}>{emAndamento ? statusHoje.texto : '–'}</div>
          </div>
        </div>
        {emAndamento && semanaAtual.length > 0 && (
          <div className="treino-semana">
            <div className="treino-semana-cab">
              <span className="sobretitulo">Esta semana</span>
              <button type="button" className="treino-link" onClick={() => setAba('placar')}>
                Calendário
              </button>
            </div>
            <CalendarioTreino semanas={semanaAtual} inicio={p.inicio} fim={p.fim} hoje={hoje} doDia={t.doDia} aoAbrir={setDiaAberto} />
          </div>
        )}
        {!p.iniciado && (
          <p className="mudo" style={{ marginTop: 12 }}>
            {/* Data planejada já passou sem dose registrada: o início vale a partir de quando a 1ª dose for registrada */}O projeto começa no dia da 1ª
            aplicação ({p.inicio === somarDias(hoje, 1) ? 'quando você a registrar' : formatarData(p.inicio)}
            ). Até lá, os dias não contam no placar.
          </p>
        )}
        {t.placarPos && t.pos && (
          <p className="mudo" style={{ marginTop: 12 }}>
            {t.pos.semana !== null && `Semana ${t.pos.semana + 1} de ${SEMANAS_POS} depois da última dose (${formatarData(t.pos.inicio)})`}
            {t.pos.saida ? ' · saída do remédio' : ''}. Placar novo, separado do período do remédio ({formatarData(t.projeto.inicio, true)} →{' '}
            {formatarData(t.projeto.fim, true)}: {t.projeto.placar.treino.feito} treinos e {t.projeto.placar.cardio.feito} cardios).
          </p>
        )}
      </section>

      <CartaoEsforco treino={t.esforco.treino} cardio={t.esforco.cardio} />
    </>
  );

  // ---------- Placar ----------
  const abaPlacar = (
    <>
      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>Placar</h2>
            <div className="secao-sub">Feito ÷ meta até hoje · 1 treino e 1 cardio por dia</div>
          </div>
        </div>
        {!p.iniciado && <Vazio>O placar começa a contar no dia da 1ª aplicação.</Vazio>}
        {p.iniciado && (
          <>
            <div className="aneis placar-aneis">
              <Anel rotulo="Treinos" fracao={p.treino.aderencia} tom={tomPlacar(p.treino.aderencia)} detalhe={`${p.treino.feito} de ${p.treino.meta}`} />
              <Anel rotulo="Cardios" fracao={p.cardio.aderencia} tom={tomPlacar(p.cardio.aderencia)} detalhe={`${p.cardio.feito} de ${p.cardio.meta}`} />
              <Anel rotulo="Corrida" fracao={p.corrida.aderencia} tom={tomPlacar(p.corrida.aderencia)} detalhe={`${p.corrida.feito} de ${p.corrida.meta}`} />
              <Anel rotulo="Bike" fracao={p.bike.aderencia} tom={tomPlacar(p.bike.aderencia)} detalhe={`${p.bike.feito} de ${p.bike.meta}`} />
            </div>
            <div className="placar-linhas">
              <BarraPlacar nome="Treinos" c={p.treino} />
              <BarraPlacar nome="Cardios" c={p.cardio} />
              <BarraPlacar nome="Corrida (2/sem.)" c={p.corrida} extra={textoKmCorridos(p.corrida)} />
              <BarraPlacar nome="Bike (5/sem.)" c={p.bike} extra={`${num(p.bike.minutos, 0)} min pedalados`} />
            </div>
            <div className="placar-legenda">
              <span>
                <i className="placar-amostra feito" /> feito (cor da %)
              </span>
              <span>
                <i className="placar-amostra proj" /> projeção no fim
              </span>
              <span>
                <i className="placar-amostra meta" /> meta até hoje
              </span>
            </div>
          </>
        )}
        <details className="tabela-detalhe">
          <summary>Ver tabela</summary>
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Meta</th>
                  <th>Feito</th>
                  <th>%</th>
                  <th>Projeção</th>
                </tr>
              </thead>
              <tbody>
                <LinhaPlacar nome="Treinos" c={p.treino} />
                <LinhaPlacar nome="Cardios" c={p.cardio} />
                <LinhaPlacar nome="· Corrida (2/sem.)" c={p.corrida} extra={textoKmCorridos(p.corrida)} />
                <LinhaPlacar nome="· Bike (5/sem.)" c={p.bike} extra={`${num(p.bike.minutos, 0)} min pedalados`} />
              </tbody>
            </table>
          </div>
        </details>
        <details className="tabela-detalhe">
          <summary>Como ler</summary>
          <p className="mudo">
            Meta até hoje: 1 treino e 1 cardio por dia, sem folga (o dia de hoje só conta depois de marcado). Projeção: quantos você terá feito no fim{' '}
            {doPeriodo}, mantendo a % atual, de um total possível. Corrida e bike: a meta segue a regra (quarta e domingo = corrida) e o feito conta o cardio
            real de cada dia, com a % limitada a 100%. Cores: 90% ou mais em verde, de 70% a 90% em atenção, abaixo de 70% em vermelho.
          </p>
        </details>
      </section>

      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>{t.placarPos ? 'Calendário' : 'Calendário do projeto'}</h2>
            <div className="secao-sub">Toque num dia para marcar ou corrigir</div>
          </div>
        </div>
        <CalendarioTreino semanas={semanasGrade} inicio={p.inicio} fim={p.fim} hoje={hoje} doDia={t.doDia} aoAbrir={setDiaAberto} />
        <LegendaCalendario />
        <p className="cal-nota">T = treino · C = cardio · letra apagada = não feito</p>
        {t.semanas.length > semanasGrade.length || todasSemanas ? (
          <button className="botao pequeno bloco-largo" style={{ marginTop: 10 }} onClick={() => setTodasSemanas(!todasSemanas)}>
            {todasSemanas ? 'Mostrar só as semanas recentes' : `Ver todas as semanas ${doPeriodo} (${t.semanas.length})`}
          </button>
        ) : null}
      </section>

      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>Aderência × medidas</h2>
            <div className="secao-sub">Por semana</div>
          </div>
          <div className="pilulas-rolagem">
            <Pilulas rotulo="Medida do gráfico" opcoes={OPCOES_METRICA} valor={metrica} aoMudar={setMetrica} />
          </div>
        </div>
        {semanasGrafico.some((s) => s.aderencia !== null || s.medida) ? (
          <AderenciaMedidas semanas={semanasGrafico} metrica={metrica} />
        ) : (
          <Vazio>O gráfico aparece depois da 1ª semana {doPeriodo}, com os dias marcados e a medição de segunda.</Vazio>
        )}
        <details className="tabela-detalhe">
          <summary>Como ler</summary>
          <p className="mudo">
            Barras: % de treinos e cardios cumpridos na semana. Linha: medição da segunda-feira seguinte (o resultado daquela semana). Toque numa barra (ou num
            ponto da linha) para destacar a semana e ver o resultado dela.
          </p>
        </details>
      </section>
    </>
  );

  // ---------- Corridas ----------
  const listaCorridas = [...t.corridas].reverse();
  const CORRIDAS_VISIVEIS = 8;
  const corridasMostradas = todasCorridas ? listaCorridas : listaCorridas.slice(0, CORRIDAS_VISIVEIS);
  const ultimaDelta = corridas?.ultima.delta ?? null;
  const abaCorridas = (
    <>
      {p.corrida.feito > 0 || corridas ? (
        <>
        {/* Na fase pós-remédio os km são só da fase; pace e corridas registradas, o histórico todo */}
        {t.placarPos && <div className="secao-sub">Pace e corridas registradas: desde o início · km: só a fase pós-remédio</div>}
        <div className="kpis">
          <Kpi
            rotulo="Último pace"
            valor={corridas ? `${formatarTempo(corridas.ultima.pace)} /km` : '–'}
            variacao={
              corridas
                ? ultimaDelta === null
                  ? formatarData(corridas.ultima.data, true).slice(0, 5)
                  : ultimaDelta === 0
                    ? 'igual à anterior'
                    : `${ultimaDelta < 0 ? '−' : '+'}${formatarTempo(Math.abs(ultimaDelta))} vs anterior`
                : 'sem tempo anotado'
            }
            classe={ultimaDelta === null || ultimaDelta === 0 ? '' : ultimaDelta < 0 ? 'bom' : 'ruim'}
            legenda={corridas && ultimaDelta !== null ? formatarData(corridas.ultima.data, true).slice(0, 5) : undefined}
          />
          <Kpi
            rotulo="Melhor pace"
            valor={corridas ? `${formatarTempo(corridas.melhor.pace)} /km` : '–'}
            variacao={corridas ? formatarData(corridas.melhor.data, true).slice(0, 5) : undefined}
          />
          <Kpi
            rotulo="Km totais"
            valor={p.corrida.km > 0 ? formatarKm(p.corrida.km) : '–'}
            numero={p.corrida.km > 0 ? { valor: p.corrida.km, formato: (n) => formatarKm(Math.round(n * 100) / 100) } : undefined}
            variacao={`${p.corrida.feito} ${p.corrida.feito === 1 ? 'corrida' : 'corridas'} ${t.placarPos ? 'na fase' : 'no projeto'}`}
            legenda={p.corrida.semDistancia > 0 ? `${p.corrida.semDistancia} sem distância` : undefined}
          />
          <Kpi
            rotulo="Corridas registradas"
            valor={t.corridas.length}
            numero={{ valor: t.corridas.length, formato: (n) => String(Math.round(n)) }}
            variacao="com distância e tempo"
            legenda={corridas ? `média de ${formatarKm(corridas.kmMedio)}` : undefined}
          />
        </div>
        </>
      ) : null}

      {t.corridas.length > 1 && (
        <section className="cartao">
          <div className="secao-cab">
            <div>
              <h2>Pace</h2>
              <div className="secao-sub">Minutos por km · mais baixo = mais rápido · marcos: recordes</div>
            </div>
          </div>
          <GraficoPaceCorridas corridas={t.corridas} />
        </section>
      )}

      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>Corridas</h2>
            <div className="secao-sub">{t.corridas.length ? 'Toque numa corrida para editar' : 'Distância, tempo e pace'}</div>
          </div>
        </div>
        {t.corridas.length === 0 ? (
          <Vazio>Depois de cada corrida, registre a distância e o tempo para acompanhar o pace.</Vazio>
        ) : (
          <>
            <div className="corridas-lista">
              {corridasMostradas.map((c) => (
                <button
                  key={c.data}
                  type="button"
                  className="corrida-item"
                  onClick={() => setDiaAberto(c.data)}
                  aria-label={`Corrida de ${formatarData(c.data)}: ${formatarKm(c.km)} em ${formatarTempo(c.segundos)}, pace ${formatarTempo(c.pace)} por km. Editar`}
                >
                  <span className="corrida-data numero">
                    <b>{formatarData(c.data, true).slice(0, 2)}</b>
                    <small>
                      {formatarData(c.data, true).slice(3, 5)}/{c.data.slice(2, 4)}
                    </small>
                  </span>
                  <span className="corrida-meio">
                    <span className="corrida-dist numero">
                      {formatarKm(c.km)} · {formatarTempo(c.segundos)}
                    </span>
                    <span className="corrida-dia">{diaDaSemana(c.data)}</span>
                  </span>
                  <span className="corrida-pace numero">
                    <span>
                      <b>{formatarTempo(c.pace)}</b>
                      <small> /km</small>
                    </span>
                    <span className={`corrida-delta ${c.delta === null ? 'mudo' : c.delta < 0 ? 'bom' : c.delta > 0 ? 'ruim' : ''}`}>
                      {c.delta === null ? '1ª corrida' : c.delta === 0 ? 'igual' : `${c.delta < 0 ? '−' : '+'}${formatarTempo(Math.abs(c.delta))}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {listaCorridas.length > CORRIDAS_VISIVEIS && (
              <button className="botao pequeno bloco-largo" style={{ marginTop: 8 }} onClick={() => setTodasCorridas(!todasCorridas)}>
                {todasCorridas ? 'Mostrar só as recentes' : `Ver todas as corridas (${listaCorridas.length})`}
              </button>
            )}
            <details className="tabela-detalhe">
              <summary>Como ler</summary>
              <p className="mudo">
                Entram as corridas com distância e tempo anotados (só elas têm pace). Verde: mais rápida que a corrida anterior; vermelho: mais lenta. Km totais
                somam as distâncias anotadas {doPeriodo}, inclusive de corridas sem tempo.
              </p>
            </details>
          </>
        )}
      </section>
    </>
  );

  // ---------- Metas ----------
  const linhasMetas = linhas.map((l) => {
    const ini = valor(inicial, l.chave);
    const agora = temAtual ? valor(atual, l.chave) : null;
    const dif = ini !== null && agora !== null ? agora - ini : null;
    const base = agora ?? ini;
    const falta = l.meta !== null && base !== null ? l.meta - base : null;
    const atingida = falta !== null && (l.menorMelhor ? falta >= 0 : falta <= 0);
    const prog = progressoMeta(ini, agora, l.meta, l.menorMelhor);
    const proj = projetado(l.chave);
    const chance = proj && l.meta !== null ? chanceMeta(proj, l.meta, l.menorMelhor) : null;
    return { l, ini, agora, dif, falta, atingida, prog, proj, chance };
  });
  const comBarra = linhasMetas.filter((x) => x.prog);
  const semBarra = linhasMetas.filter((x) => !x.prog);
  const quandoRitmo = projecao?.ate_o_fim ? 'no fim' : 'em 8 sem.';
  const textoRitmo = (x: (typeof linhasMetas)[number]) =>
    x.proj ? (
      <span className="meta-ritmo">
        No ritmo ({quandoRitmo}): <b className="numero">{x.l.fmt(x.proj.valor)}</b>{' '}
        <span className="numero">
          ({num(x.proj.min, 1)}–{num(x.proj.max, 1)})
        </span>
        {x.chance && (
          <>
            {' · '}
            <span className={`chance-${x.chance}`}>{TEXTO_CHANCE[x.chance]}</span>
          </>
        )}
      </span>
    ) : null;
  const textoDif = (x: (typeof linhasMetas)[number]) =>
    x.dif !== null ? (
      <span className={`meta-dif numero ${corVariacao(x.dif, x.l.menorMelhor, MDC[x.l.chave])}`}>{sinal(x.dif, 1, x.l.unidade)} desde o início</span>
    ) : null;

  const abaMetas = (
    <>
      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>Medidas: início × {final ? 'final' : 'agora'}</h2>
            <div className="secao-sub">
              {inicial
                ? `${formatarData(inicial.data, true).slice(0, 5)} → ${temAtual ? formatarData(atual!.data, true).slice(0, 5) : 'sem nova medição'}`
                : 'Medições do projeto'}
            </div>
          </div>
          {inicial && (
            <button className="botao pequeno" onClick={() => setMetasAbertas(true)}>
              {metas ? 'Editar metas' : 'Definir metas'}
            </button>
          )}
        </div>
        {inicial ? (
          <>
            {comBarra.length > 0 && (
              <div className="metas metas-treino">
                {comBarra.map((x) => (
                  <div key={x.l.nome} className="meta-item">
                    <BarraMeta nome={x.l.nome} p={x.prog!} fmt={(n) => x.l.fmt(n)} rotuloAtual={final ? 'Final' : 'Agora'} />
                    {(x.dif !== null || x.proj) && (
                      <div className="meta-extra">
                        {textoDif(x)}
                        {textoRitmo(x)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {semBarra.length > 0 && (
              <>
                {comBarra.length > 0 && <div className="sobretitulo metas-sem-titulo">{metas ? 'Sem meta ou já atingidas no início' : 'Medidas'}</div>}
                <div className="medidas-cards">
                  {semBarra.map((x) => (
                    <div key={x.l.nome} className="medida-card">
                      <div className="medida-card-nome">{x.l.nome}</div>
                      <div className="medida-card-valor numero">{x.l.fmt(x.agora ?? x.ini)}</div>
                      <div className="medida-card-sub numero">
                        Início {x.l.fmt(x.ini)}
                        {x.dif !== null && (
                          <>
                            {' · '}
                            <span className={corVariacao(x.dif, x.l.menorMelhor, MDC[x.l.chave])}>{sinal(x.dif, 1, x.l.unidade)}</span>
                          </>
                        )}
                      </div>
                      {x.l.meta !== null && (
                        <div className="medida-card-sub numero">
                          Meta {x.l.fmt(x.l.meta)}
                          {x.falta !== null && (x.atingida ? <span className="medida-ok"> · ✓ atingida</span> : ` · falta ${sinal(x.falta, 1, x.l.unidade)}`)}
                        </div>
                      )}
                      {x.proj && (
                        <div className="medida-card-sub numero">
                          No ritmo {x.l.fmt(x.proj.valor)}
                          {x.chance && (
                            <>
                              {' · '}
                              <span className={`chance-${x.chance}`}>{TEXTO_CHANCE[x.chance]}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {!metas && (
              <p className="mudo" style={{ marginTop: 12 }}>
                Defina as metas do fim do projeto para ver o caminho percorrido em cada medida.
              </p>
            )}
            <details className="tabela-detalhe">
              <summary>Ver tabela</summary>
              <div className="tabela-rolagem">
                <table className="tabela-medidas">
                  <thead>
                    <tr>
                      <th></th>
                      <th>
                        Início
                        <div className="mudo" style={{ fontWeight: 400 }}>
                          {formatarData(inicial.data, true)}
                        </div>
                      </th>
                      <th>
                        {final ? 'Final' : 'Agora'}
                        <div className="mudo" style={{ fontWeight: 400 }}>
                          {temAtual ? formatarData(atual!.data, true) : '–'}
                        </div>
                      </th>
                      <th>
                        Meta
                        <div className="mudo" style={{ fontWeight: 400 }}>
                          falta
                        </div>
                      </th>
                      {ritmo && (
                        <th>
                          No ritmo
                          <div className="mudo" style={{ fontWeight: 400 }}>
                            {quandoRitmo}
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {linhasMetas.map((x) => (
                      <tr key={x.l.nome}>
                        <td>{x.l.nome}</td>
                        <td>{x.l.fmt(x.ini)}</td>
                        <td>
                          {temAtual ? x.l.fmt(x.agora) : '–'}
                          {x.dif !== null && (
                            <div className={`sub-valor ${corVariacao(x.dif, x.l.menorMelhor, MDC[x.l.chave])}`}>{sinal(x.dif, 1, x.l.unidade)}</div>
                          )}
                        </td>
                        <td>
                          {x.l.meta === null ? '–' : x.l.fmt(x.l.meta)}
                          {x.falta !== null && (
                            <div className={`sub-valor ${x.atingida ? 'bom' : 'mudo'}`}>{x.atingida ? '✓ atingida' : sinal(x.falta, 1, x.l.unidade)}</div>
                          )}
                        </td>
                        {ritmo && (
                          <td>
                            {x.proj ? (
                              <>
                                {x.l.fmt(x.proj.valor)}
                                <div className="sub-valor mudo">
                                  {num(x.proj.min, 1)}–{num(x.proj.max, 1)}
                                </div>
                                {x.chance && <div className={`sub-valor ${COR_CHANCE[x.chance]}`}>{TEXTO_CHANCE[x.chance]}</div>}
                              </>
                            ) : (
                              '–'
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {!final && (
              <details className="tabela-detalhe">
                <summary>Como ler</summary>
                <p className="mudo">
                  {projecao
                    ? `No ritmo: reta das últimas ${projecao.medicoes} medições (6 semanas), projetada ${projecao.ate_o_fim ? 'até o fim do projeto' : 'por 8 semanas'}, com a faixa de 95% entre parênteses. Provável = a faixa inteira chega à meta; improvável = a faixa inteira fica aquém. A perda tende a desacelerar, então a reta costuma ser otimista no fim.`
                    : `A projeção "No ritmo" aparece a partir da semana ${PROJECAO.semana} do projeto, com ${PROJECAO.medicoes} medições cobrindo 4 semanas (o começo tem muita perda de água).`}{' '}
                  Barras: caminho percorrido do início até a meta. Variações menores que o erro da fita ficam cinza.
                </p>
              </details>
            )}
          </>
        ) : (
          <Vazio>
            Registre a 1ª medição do projeto em <Link to="/medidas">Medidas</Link> (segunda-feira, em jejum). Depois de salvar, você define as metas do fim do
            projeto.
          </Vazio>
        )}
      </section>

      {m?.bf && (cinturaMeta !== null || cenarios.length > 0) && (
        <section className="cartao">
          <div className="secao-cab">
            <div>
              <h2>Meta de {num(m.bf, 1)}% em cm e kg</h2>
              <div className="secao-sub">O que o % de gordura da meta significa na fita e na balança</div>
            </div>
          </div>
          <div className="grade">
            {cinturaMeta !== null && <Bloco rotulo="Cintura necessária" valor={`≈ ${cm(cinturaMeta)}`} />}
            {cenarios.length > 0 && (
              <Bloco
                rotulo="Peso da meta"
                valor={`${num(Math.min(...cenarios.map((c) => c.peso_kg)), 1)}–${kg(Math.max(...cenarios.map((c) => c.peso_kg)))}`}
              />
            )}
          </div>
          <details className="tabela-detalhe">
            <summary>Cenários</summary>
            <div className="alerta info" style={{ display: 'block' }}>
              <b>Meta de {num(m.bf, 1)}% em centímetros e quilos.</b>
              {cinturaMeta !== null && (
                <>
                  {' '}
                  Cintura necessária ≈ <b>{cm(cinturaMeta)}</b> (pescoço {cm(m.pescoco_cm ?? ref?.pescoco_cm)}
                  {perfil?.sexo === 'Feminino' ? `, quadril ${cm(m.quadril_cm ?? ref?.quadril_cm)}` : ''}
                  ).
                </>
              )}
              {cenarios.length > 0 && (
                <>
                  {' '}
                  Peso da meta:{' '}
                  {cenarios
                    .map(
                      (c) =>
                        `${c.fracao_magra === 0 ? 'mantendo a massa magra' : `perdendo ${Math.round(c.fracao_magra * 100)}% em massa magra`} ${kg(c.peso_kg)}`,
                    )
                    .join(' · ')}
                  .
                </>
              )}
              <div className="texto-2" style={{ marginTop: 4 }}>
                A massa magra do app é calculada, não medida: os cenários servem para planejar o peso-alvo. Nos estudos, cerca de 1/4 do peso perdido sai de
                massa magra; 40% é o pior caso.
              </div>
            </div>
          </details>
        </section>
      )}
    </>
  );

  return (
    <div className="pilha">
      <div className="abas abas-painel" role="tablist" aria-label="Seções do treino">
        {ABAS_TREINO.map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>
            {r}
          </button>
        ))}
      </div>

      {aba === 'hoje' && abaHoje}
      {aba === 'placar' && abaPlacar}
      {aba === 'corridas' && abaCorridas}
      {aba === 'forca' && <CartaoForca esforcoSubiu={t.esforco.treino.alerta} />}
      {aba === 'metas' && abaMetas}

      {diaAberto && <FormDiaTreino data={diaAberto} aoFechar={() => setDiaAberto(null)} />}
      {metasAbertas && <FormMetas base={atual ?? inicial} encerrado={t.projeto.placar.encerrado && !!atual} aoFechar={() => setMetasAbertas(false)} />}
    </div>
  );
}

function BlocoEsforco({ nome, c }: { nome: string; c: ComparacaoEsforco }) {
  return (
    <div className="bloco">
      <div className="rotulo">{nome} · 7 dias</div>
      <div className={`valor ${c.alerta ? 'aviso-txt' : ''}`}>{c.media7 === null ? '–' : num(c.media7, 1)}</div>
      <div className="sub-valor mudo">
        {c.referencia === null ? 'sem as 4 semanas anteriores' : `4 sem. antes: ${num(c.referencia, 1)}`}
        {c.subida !== null && ` (${sinal(c.subida, 1)})`}
      </div>
    </div>
  );
}

/** Esforço percebido (CR-10): a tendência mostra a fadiga acumulando, já que não há dia de folga. */
function CartaoEsforco({ treino, cardio }: { treino: ComparacaoEsforco; cardio: ComparacaoEsforco }) {
  const semDados = treino.n7 + treino.nReferencia + cardio.n7 + cardio.nReferencia === 0;
  const subiu = [treino.alerta && (['musculação', treino.subida!] as const), cardio.alerta && (['cardio', cardio.subida!] as const)].filter(
    (x): x is readonly ['musculação' | 'cardio', number] => !!x,
  );
  return (
    <section className="cartao">
      <div className="secao-cab">
        <div>
          <h2>Esforço percebido</h2>
          <div className="secao-sub">Escala de 1 a 10 · média da semana × 4 semanas antes</div>
        </div>
      </div>
      {semDados ? (
        <Vazio>
          Anote o esforço da sessão (1 a 10) ao marcar o treino e o cardio: toque em “Esforço do treino e do cardio” ou no dia no calendário. Com algumas
          semanas, dá para ver a fadiga acumulando.
        </Vazio>
      ) : (
        <div className="grade">
          <BlocoEsforco nome="Musculação" c={treino} />
          <BlocoEsforco nome="Cardio" c={cardio} />
        </div>
      )}
      {subiu.map(([nome, d]) => (
        <div key={nome} className="alerta" style={{ display: 'block', marginTop: 10 }}>
          Esforço {nome === 'cardio' ? 'do cardio' : 'da musculação'} subiu {num(d, 1)} ponto{d >= 2 ? 's' : ''} na última semana em relação às 4 anteriores.
          Pode ser fadiga acumulando; sono, dieta, náusea e a fase da dose também mexem no esforço.
        </div>
      ))}
      {!semDados && (
        <details className="tabela-detalhe">
          <summary>Como ler</summary>
          <p className="mudo">
            Média dos últimos 7 dias × as 4 semanas anteriores. O aviso aparece com {num(SUBIDA_ESFORCO, 1)} ponto ou mais de subida (critério do app, não um
            limite clínico), com 3 registros na semana e 6 nas semanas anteriores. Escala: 3 moderado · 5 pesado · 7 muito pesado · 10 máximo.
          </p>
        </details>
      )}
    </section>
  );
}
