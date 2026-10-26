import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useTreino } from '../dados/useTreino';
import { qualidadePerda, textoQualidade, type QualidadePerda } from '../lib/conferencia';
import { alvoProteinaRefeicao, calcularMetas, corpoParaMetas, macrosDaRefeicao, somar } from '../lib/dieta';
import { formatarData } from '../lib/datas';
import { num, pp } from '../lib/formato';
import { ajusteVigente, AJUSTE_PADRAO, calibracaoAtual, COR_RCA, faixaRca, percentualGorduraBruto, rca, rcaExibida, rfm, TEXTO_RCA, type Composicao } from '../lib/gordura';
import { acaoQualidade } from '../lib/semana';
import { aderenciaDoTreino } from '../lib/treino';
import type { Perfil } from '../lib/tipos';

/** "US Navy 22,0% + ajuste 2,0 p.p. = 24,0%" */
export function textoAjuste(bruta: number, ajuste: number): string {
  const sinal = ajuste < 0 ? '−' : '+';
  return `US Navy ${num(bruta, 1)}% ${sinal} ajuste ${num(Math.abs(ajuste), 1)} p.p. = ${num(bruta + ajuste, 1)}%`;
}

/** % bruto (sem ajuste) de uma composição, com a altura do perfil. */
export function brutaDe(c: Composicao, perfil: Perfil | null, altura: number | null): number | null {
  if (!altura) return null;
  return percentualGorduraBruto(perfil?.sexo ?? 'Masculino', altura, c.pescoco_cm, c.cintura_cm, c.quadril_cm);
}

/** Qualidade da perda até a medição `ate` (padrão: a última). */
export function useQualidade(ate?: string): QualidadePerda | null {
  const { composicoes } = useCalculos();
  const lista = ate ? composicoes.filter((c) => c.data <= ate) : composicoes;
  return qualidadePerda(lista);
}

/** Linha "Qualidade da perda (últimas 4 medições): X% gordura · Y% massa magra", com cor de aviso e uma ação. */
export function LinhaQualidade({ q }: { q: QualidadePerda | null }) {
  if (!q) return <p className="texto-2">Com 3 medições em 2 semanas, aparece a qualidade da perda (quanto foi gordura e quanto foi massa magra).</p>;
  return (
    <div className={`alerta ${q.aviso ? '' : 'info'}`} style={{ display: 'block' }}>
      <b>Qualidade da perda</b> (últimas {q.medicoes} medições): <span className={q.aviso ? 'aviso-txt' : undefined}>{textoQualidade(q)}</span>
      {!q.sem_perda && <> · ritmo {num(q.ritmo_pct, 2)}% do peso/sem</>}.
      {q.aviso && (
        <span className="texto-2">
          {' '}
          {q.gordura < 0.75 ? 'Menos de 3/4 da perda veio de gordura.' : ''}
          {q.ritmo_pct > 1 ? ' Acima de 1% por semana a massa magra sofre mais.' : ''}
        </span>
      )}
      {q.aviso && <AcaoQualidadeLink q={q} />}
    </div>
  );
}

/**
 * Qualidade da perda em painel (aba Medidas): barra dividida entre gordura e
 * massa magra, o ritmo e, com aviso, a ação. Mesmos números da LinhaQualidade.
 */
export function PainelQualidade({ q }: { q: QualidadePerda | null }) {
  if (!q) return <p className="mudo">Com 3 medições em 2 semanas, aparece a qualidade da perda (quanto foi gordura e quanto foi massa magra).</p>;
  const gordura = Math.min(Math.max(q.gordura, 0), 1);
  const magra = Math.min(Math.max(q.magra, 0), 1);
  const soma = gordura + magra || 1;
  return (
    <div className="qualidade">
      <div className="qualidade-cab">
        <span className="secao-sub" style={{ margin: 0 }}>
          Últimas {q.medicoes} medições · {formatarData(q.de, true).slice(0, 5)} a {formatarData(q.ate, true).slice(0, 5)}
        </span>
        {q.aviso && <span className="etiqueta aviso">atenção</span>}
      </div>
      {!q.sem_perda && (
        <>
          <div className="qualidade-barra" role="img" aria-label={`Qualidade da perda: ${textoQualidade(q)}`}>
            {gordura > 0 && <span className="qualidade-gordura" style={{ width: `${(gordura / soma) * 100}%` }} />}
            {magra > 0 && <span className={`qualidade-magra ${q.aviso ? 'aviso' : ''}`} style={{ width: `${(magra / soma) * 100}%` }} />}
          </div>
          <div className="qualidade-legenda numero">
            <span>
              <i className="qualidade-gordura" /> Gordura <b>{Math.round(gordura * 100)}%</b>
            </span>
            <span>
              <i className={`qualidade-magra ${q.aviso ? 'aviso' : ''}`} /> Massa magra <b>{Math.round(magra * 100)}%</b>
            </span>
          </div>
        </>
      )}
      <p className={`qualidade-texto ${q.aviso ? 'aviso-txt' : ''}`}>
        {/* Com as duas partes na barra, o texto fica só com o ritmo */}
        {q.sem_perda || q.gordura <= 0 || q.magra <= 0 ? (
          <>
            {textoQualidade(q).replace(/^./, (c) => c.toUpperCase())}
            {!q.sem_perda && <> · ritmo {num(q.ritmo_pct, 2)}% do peso/sem</>}.
          </>
        ) : (
          <>Ritmo de {num(q.ritmo_pct, 2)}% do peso por semana.</>
        )}
      </p>
      {q.aviso && (
        <p className="mudo" style={{ margin: 0 }}>
          {q.gordura < 0.75 ? 'Menos de 3/4 da perda veio de gordura.' : ''}
          {q.ritmo_pct > 1 ? ' Acima de 1% por semana a massa magra sofre mais.' : ''}
        </p>
      )}
      {q.aviso && <AcaoQualidadeLink q={q} />}
    </div>
  );
}

/** Ação tirada do app (proteína por refeição, proteína do dia, treino ou ritmo). Só baixa o banco de alimentos quando há aviso. */
function AcaoQualidadeLink({ q }: { q: QualidadePerda }) {
  const { dieta, treinos } = useDados();
  const { composicoes, hoje } = useCalculos();
  const treino = useTreino();
  const { banco } = useAlimentos();
  // O mesmo corpo que a aba Dieta usa nas metas (média das últimas medições), para os números baterem ao abrir a Dieta
  const corpo = corpoParaMetas(composicoes);
  const aderencia = treino ? aderenciaDoTreino(treinos, treino, hoje) : null;
  const refeicoes = dieta && banco ? dieta.refeicoes.filter((r) => r.itens.length).map((r) => ({ r, m: macrosDaRefeicao(r, banco.mapa) })) : [];
  const alvo = corpo ? alvoProteinaRefeicao(corpo.massa_magra_kg) : null;
  const metas = dieta && corpo ? calcularMetas(dieta.config, corpo, aderencia) : null;
  const acao = acaoQualidade(q, {
    refeicoesAbaixo: alvo ? refeicoes.filter(({ m }) => m.ptn_animal < alvo * 0.9).map(({ r }) => r.nome) : [],
    alvoRefeicao: alvo,
    ptnPlano: refeicoes.length ? somar(refeicoes.map(({ m }) => m)).ptn_animal : null,
    ptnMeta: metas?.ptn_animal_g ?? null,
    treino: aderencia?.treino ?? null,
  });
  if (!acao) return null;
  return (
    <div className="linha entre" style={{ marginTop: 8 }}>
      <span className="cresce">{acao.texto}</span>
      <Link to={acao.para} className="botao pequeno">
        {acao.rotulo}
      </Link>
    </div>
  );
}

/** Relação cintura/altura com a faixa (texto curto). */
export function TextoRca({ cintura, altura }: { cintura: number | null | undefined; altura: number | null | undefined }) {
  const r = rca(cintura, altura);
  if (r === null) return null;
  const f = faixaRca(r);
  return (
    <>
      <span className={COR_RCA[f]}>{num(rcaExibida(r), 2)}</span> · {TEXTO_RCA[f]}
    </>
  );
}

/** Conferência do % de gordura por outros caminhos (não alimenta massa magra nem metas). */
export function ConferenciaGordura({ c }: { c: Composicao }) {
  const { perfil, medidas } = useDados();
  const altura = perfil?.altura_cm ?? medidas.find((m) => m.data === c.data)?.altura_cm ?? null;
  const sexo = perfil?.sexo ?? 'Masculino';
  const bruta = brutaDe(c, perfil, altura);
  const ajuste = ajusteVigente(perfil, medidas);
  const calib = calibracaoAtual(perfil, medidas);
  const r = altura ? rfm(sexo, altura, c.cintura_cm) : null;
  if (bruta === null) return null;
  const padrao = perfil?.ajuste_gordura === null || perfil?.ajuste_gordura === undefined;
  return (
    <details className="ajuda" style={{ marginTop: 8 }}>
      <summary>Conferência do % de gordura</summary>
      <div className="pilha mudo">
        <p>
          US Navy (oficial{ajuste !== 0 ? `, com ${ajuste < 0 ? '−' : '+'}${num(Math.abs(ajuste), 1)}` : ''}) <b>{pp(bruta + ajuste)}</b>
          {ajuste !== 0 && (
            <>
              {' '}
              · sem o {ajuste < 0 ? '−' : '+'}
              {num(Math.abs(ajuste), 1)} <b>{pp(bruta)}</b>
            </>
          )}
          {r !== null && (
            <>
              {' '}
              · RFM <b>{pp(r)}</b>
            </>
          )}
        </p>
        <p>
          {textoAjuste(bruta, ajuste)} (
          {padrao
            ? `padrão ${sexo === 'Masculino' ? 'da planilha' : 'do feminino'}: ${num(AJUSTE_PADRAO[sexo], 1)} p.p.`
            : perfil?.exame_gordura_data && perfil.exame_gordura_bf != null
              ? calib?.ok
                ? `calibrado por exame em ${formatarData(perfil.exame_gordura_data)}, a ${pp(perfil.exame_gordura_bf)}; refeito com a altura e a medição atuais`
                : `exame de ${formatarData(perfil.exame_gordura_data)} sem medição normal perto para refazer a conta: vale o último ajuste salvo. Refaça a calibração no Perfil`
              : 'ajuste definido no Perfil'}
          ). Medição de {formatarData(c.data)}.
        </p>
        <p>
          A RFM usa só cintura e altura ({sexo === 'Masculino' ? '64' : '76'} − 20 × altura/cintura). A diferença entre os métodos mostra o tamanho da
          incerteza do valor absoluto; a tendência ao longo das semanas é mais confiável que o número. Só a US Navy alimenta massa magra, metas e
          dieta. O ajuste muda no Perfil.
        </p>
      </div>
    </details>
  );
}
