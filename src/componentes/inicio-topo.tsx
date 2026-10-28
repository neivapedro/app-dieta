// Topo do Início ("Hoje"): os anéis do dia ao lado da próxima aplicação, e a dose aberta
// (fichas, seringa, fim de fase e o botão de registrar) logo abaixo.
import { useEffect, useState, type ReactNode } from 'react';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { POSICOES, type AneisDia, type PosicaoAnel } from '../lib/aneis-dia';
import { capacidadeSeringa, guiaSeringa, marcasVizinhas, semanasDoDegrau, seringaDo, textoSeringa } from '../lib/ciclo';
import { diaDaSemana, formatarData } from '../lib/datas';
import { mg, num, sinal, ui } from '../lib/formato';
import { diaCurto } from '../lib/rotina';
import { AneisSvg } from './aneis';
import { FaseConfirmada, FimDeFase, ForaDoPlano } from './dose';
import { Bloco, Icone } from './ui';

/** Desenha os anéis um quadro depois de montar (o anel vazio chega a ser pintado e a transição dá a volta). */
function useDesenhado() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let q = requestAnimationFrame(() => (q = requestAnimationFrame(() => setOk(true))));
    return () => cancelAnimationFrame(q);
  }, []);
  return ok;
}

/**
 * Anéis de hoje. Com `children` (a próxima aplicação), a figura fica ao lado dela e a legenda
 * vira três pílulas embaixo; sem, a legenda fica ao lado da figura. Cada item da legenda abre a ação do anel.
 */
export function TopoAneis({ aneis, acoes, children }: { aneis: AneisDia; acoes: Record<PosicaoAnel, () => void>; children?: ReactNode }) {
  const desenhado = useDesenhado();
  const resumo = POSICOES.map((p) => `${aneis[p].rotulo}: ${aneis[p].descricao}${aneis[p].fechado ? ', fechado' : ''}`).join('; ');
  const figura = (
    <div className="aneis-hoje-figura" role="img" aria-label={`Anéis de hoje. ${resumo}.`}>
      <AneisSvg aneis={aneis} desenhado={desenhado} />
    </div>
  );
  const item = (p: PosicaoAnel, pilula: boolean) => {
    const a = aneis[p];
    return (
      <li key={p}>
        <button
          type="button"
          className={`${pilula ? 'aneis-pilula' : 'aneis-legenda-linha'} anel-${p} ${a.fechado ? 'fechado' : ''} ${a.anotado ? '' : 'vazio'}`}
          onClick={acoes[p]}
        >
          <span className="aneis-ponto" aria-hidden="true" />
          <span className="aneis-legenda-rotulo">{a.rotulo}</span>
          <span className="aneis-legenda-valor numero">
            {a.texto}
            {a.fechado && (
              <span className="aneis-ok" aria-hidden="true">
                ✓
              </span>
            )}
          </span>
          {!pilula && (
            <span className="aneis-legenda-seta" aria-hidden="true">
              ›
            </span>
          )}
          <span className="oculto-visual">{` · ${a.descricao}${a.fechado ? ' · fechado' : ''}`}</span>
        </button>
      </li>
    );
  };
  if (!children)
    return (
      <div className="aneis-hoje">
        {figura}
        <ul className="aneis-legenda">{POSICOES.map((p) => item(p, false))}</ul>
      </div>
    );
  return (
    <div className="hoje-topo">
      <div className="hoje-topo-linha">
        {figura}
        <div className="hoje-topo-lado">{children}</div>
      </div>
      <ul className="aneis-pilulas" aria-label="Anéis de hoje">
        {POSICOES.map((p) => item(p, true))}
      </ul>
    </div>
  );
}

/** "Fase 2 · dose 3 de 4" (a dose da fase conta pelas aplicações seguidas com a mesma dose). */
function usePosicaoNaFase() {
  const { ciclo } = useDados();
  const { resumo } = useCalculos();
  if (!ciclo || !resumo?.proxima) return '';
  const p = resumo.proxima;
  const deg = resumo.degrau;
  return deg.estado === 'em_curso' && deg.previstas
    ? ` · dose ${deg.feitas + 1} de ${deg.previstas}`
    : deg.estado === 'inicio' || deg.estado === 'subir'
      ? ` · dose 1 de ${p.fase ? semanasDoDegrau(ciclo.fases, p.fase.indice) : '–'}`
      : deg.estado === 'pendente'
        ? ' · fim'
        : '';
}

/** Próxima aplicação aberta, ao lado dos anéis: "Puxar até" em destaque, a dose em mg e o dia. */
export function DoseResumo() {
  const { ciclo } = useDados();
  const { resumo } = useCalculos();
  if (!ciclo || !resumo?.proxima) return null;
  const p = resumo.proxima;
  const passa = p.ui_pratica > capacidadeSeringa(ciclo);
  return (
    <div className={`hoje-prox ${p.situacao}`}>
      <span className="hoje-prox-rotulo">Próxima aplicação · {p.numero}ª dose</span>
      <div className="hoje-prox-etiquetas">
        {p.situacao === 'hoje' && <span className="etiqueta destaque">Hoje</span>}
        {p.situacao === 'atrasada' && <span className="etiqueta ruim">Atrasada {p.dias} {p.dias === 1 ? 'dia' : 'dias'}</span>}
        {p.situacao === 'futura' && <span className="etiqueta">{p.dias === 1 ? 'amanhã' : `em ${p.dias} dias`}</span>}
        {p.extra && <span className="etiqueta aviso">Dose extra · sobra do frasco</span>}
        {p.estado === 'pendente' && <span className="etiqueta aviso">Fase concluída · decidir</span>}
        {p.estado === 'fora_do_plano' && <span className="etiqueta aviso">Fora do plano</span>}
      </div>
      <div className={`seringa-pilula ${passa ? 'passa' : ''}`}>
        <span>Puxar até</span>
        <b className="numero">{ui(p.ui_pratica)}</b>
      </div>
      <span className="hoje-prox-mg">
        <b className="numero">{num(p.dose_mg)} mg</b>
        <span>
          {diaDaSemana(p.data)}, {formatarData(p.data)}
        </span>
      </span>
    </div>
  );
}

/** Próxima aplicação recolhida (longe do dia): um toque abre a dose completa. */
export function DoseRecolhida({ aoAbrir }: { aoAbrir: () => void }) {
  const { ciclo } = useDados();
  const { resumo } = useCalculos();
  if (!ciclo || !resumo?.proxima) return null;
  const p = resumo.proxima;
  return (
    <button type="button" className="hoje-prox hoje-prox-recolhida" onClick={aoAbrir} aria-expanded="false">
      <span className="hoje-prox-rotulo">
        Próxima aplicação · {p.dias === 1 ? 'amanhã' : `em ${p.dias} dias`}
      </span>
      <span className="hoje-prox-dia">{diaCurto(p.data)}</span>
      <span className="hoje-prox-valor numero">
        <b>{mg(p.dose_mg)}</b> · <b>{ui(p.ui_pratica)}</b>
      </span>
      {p.ui_pratica > capacidadeSeringa(ciclo) + 1e-9 && <span className="etiqueta aviso">passa da seringa de {capacidadeSeringa(ciclo)} UI</span>}
      <span className="hoje-prox-abrir">
        Ver dose{' '}
        <span className="seta" aria-hidden="true">
          ▾
        </span>
      </span>
    </button>
  );
}

/**
 * O resto da dose aberta, embaixo dos anéis: fase e local (tocar abre seringa e marcas vizinhas),
 * alertas, a faixa do fim de fase (os números e a decisão abrem numa folha) e "Registrar aplicação".
 */
export function DoseDetalhe({ aoRegistrar, aoRecolher, aoDecidir }: { aoRegistrar: () => void; aoRecolher?: () => void; aoDecidir?: () => void }) {
  const { ciclo } = useDados();
  const { resumo } = useCalculos();
  const posicao = usePosicaoNaFase();
  if (!ciclo || !resumo?.proxima) return null;
  const p = resumo.proxima;
  const seringa = seringaDo(ciclo);
  const vizinhas = marcasVizinhas(p.ui_pratica, seringa.marca, ciclo.concentracao_mg_ml);
  const passa = p.ui_pratica > capacidadeSeringa(ciclo);
  const entregaDiferente = Math.abs(p.mg_pratica - p.dose_mg) >= 0.0005;
  return (
    <div className={`hoje-dose ${p.situacao}`}>
      <details className="hoje-dose-detalhe">
        <summary>
          <span className="hoje-dose-fichas">
            <span>{p.fase ? `Fase ${p.fase.indice + 1}${posicao}` : 'Fora do plano'}</span>
            <span>Local: {resumo.sugestao_local}</span>
            {entregaDiferente && (
              <span>
                Entrega {mg(p.mg_pratica)} ({sinal(p.mg_pratica - p.dose_mg, 2)})
              </span>
            )}
          </span>
          <span className="hoje-dose-mais">
            <span className="oculto-visual">Seringa, fase e local</span>
            <span aria-hidden="true">▾</span>
          </span>
        </summary>
        <div className="grade">
          <Bloco rotulo="Dose exata (seringa U-100)" valor={ui(p.ui)} />
          <Bloco
            rotulo="Puxando até a marca, entrega"
            valor={
              entregaDiferente ? (
                <>
                  {mg(p.mg_pratica)} <span className="mudo">({sinal(p.mg_pratica - p.dose_mg, 2)})</span>
                </>
              ) : (
                mg(p.mg_pratica)
              )
            }
          />
          {p.fase ? <Bloco rotulo={`Fase ${p.fase.indice + 1}`} valor={`${p.fase.fase.nome}${posicao}`} /> : <Bloco rotulo="Fase" valor="Fora do plano" />}
          <Bloco rotulo="Local sugerido" valor={resumo.sugestao_local} />
        </div>
        {!passa && (
          <p className="mudo" style={{ marginTop: 10 }}>
            Na {textoSeringa(ciclo)}: {guiaSeringa(p.ui_pratica, seringa.marca)}.
          </p>
        )}
        {vizinhas && !passa && (
          <p className="mudo vizinhas" style={{ marginTop: 4 }}>
            Marcas vizinhas: {vizinhas.map((v) => `${ui(v.ui)} = ${mg(v.mg)}`).join(' · ')}.
          </p>
        )}
      </details>
      {resumo.pausa_dias !== null && (
        <div className="alerta erro">
          Pausa de {Math.floor(resumo.pausa_dias / 7)} semanas desde a última dose ({formatarData(resumo.linhas[resumo.linhas.length - 1].aplicacao.data)}):
          confirme a dose com o médico antes de aplicar.
        </div>
      )}
      {passa && (
        <div className="alerta erro">
          {ui(p.ui_pratica)} passa da capacidade da sua seringa de {capacidadeSeringa(ciclo)} UI: confira a seringa (Ciclo › Ajustes) ou a dose antes de aplicar.
        </div>
      )}
      <FimDeFase aoDecidir={aoDecidir} />
      <ForaDoPlano />
      <FaseConfirmada />
      <div className="hoje-dose-acoes">
        <button className={`botao bloco-largo hoje-registrar ${p.situacao !== 'futura' ? 'primario' : ''}`} onClick={aoRegistrar}>
          <Icone nome="mais" /> Registrar aplicação
        </button>
        {aoRecolher && (
          <button className="botao pequeno hoje-recolher" onClick={aoRecolher} aria-expanded="true">
            Recolher
          </button>
        )}
      </div>
    </div>
  );
}
