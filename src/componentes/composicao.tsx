import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import { useAlimentos } from '../dados/useAlimentos';
import { useCalculos } from '../dados/useCalculos';
import { useTreino } from '../dados/useTreino';
import { qualidadePerda, textoQualidade, type QualidadePerda } from '../lib/conferencia';
import { alvoProteinaRefeicao, calcularMetas, macrosDaRefeicao, somar } from '../lib/dieta';
import { formatarData } from '../lib/datas';
import { num, pp } from '../lib/formato';
import { ajusteDoPerfil, AJUSTE_PADRAO, COR_RCA, faixaRca, percentualGorduraBruto, rca, rfm, TEXTO_RCA, type Composicao } from '../lib/gordura';
import { acaoQualidade } from '../lib/semana';
import { aderenciaRecente } from '../lib/treino';
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

/** Ação tirada do app (proteína por refeição, proteína do dia, treino ou ritmo). Só baixa o banco de alimentos quando há aviso. */
function AcaoQualidadeLink({ q }: { q: QualidadePerda }) {
  const { dieta, treinos } = useDados();
  const { composicoes, hoje } = useCalculos();
  const treino = useTreino();
  const { banco } = useAlimentos();
  const ultima = [...composicoes].reverse().find((c) => c.massa_magra_kg !== null && !c.atipica) ?? null;
  const aderencia = treino ? aderenciaRecente(treinos, treino.inicio, hoje, 28, treino.fim) : null;
  const refeicoes = dieta && banco ? dieta.refeicoes.filter((r) => r.itens.length).map((r) => ({ r, m: macrosDaRefeicao(r, banco.mapa) })) : [];
  const alvo = ultima ? alvoProteinaRefeicao(ultima.massa_magra_kg!) : null;
  const metas = dieta && ultima ? calcularMetas(dieta.config, { peso_kg: ultima.peso_kg, massa_magra_kg: ultima.massa_magra_kg! }, aderencia) : null;
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
      <span className={COR_RCA[f]}>{num(r, 2)}</span> · {TEXTO_RCA[f]}
    </>
  );
}

/** Conferência do % de gordura por outros caminhos (não alimenta massa magra nem metas). */
export function ConferenciaGordura({ c }: { c: Composicao }) {
  const { perfil, medidas } = useDados();
  const altura = perfil?.altura_cm ?? medidas.find((m) => m.data === c.data)?.altura_cm ?? null;
  const sexo = perfil?.sexo ?? 'Masculino';
  const bruta = brutaDe(c, perfil, altura);
  const ajuste = ajusteDoPerfil(perfil);
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
              ? `calibrado por exame em ${formatarData(perfil.exame_gordura_data)}, a ${pp(perfil.exame_gordura_bf)}`
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
