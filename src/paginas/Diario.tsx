import { useState } from 'react';
import { FormDiario } from '../componentes/formularios';
import { Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { diaDaSemana, formatarData, hojeLocal } from '../lib/datas';
import { diaAposDose } from '../lib/analise';
import { kg, mg, num } from '../lib/formato';
import { mediaSono7, textosSintomas, TEXTO_SONO_BAIXO } from '../lib/bemestar';
import { NIVEIS_NAUSEA, type RegistroDiario } from '../lib/tipos';

export function Diario() {
  const { diario, medidas } = useDados();
  const { resumo, hoje } = useCalculos();
  const sono = mediaSono7(diario, hoje);
  const [editando, setEditando] = useState<RegistroDiario | null>(null);
  // Data da linha tocada: o formulário abre nela, não em hoje
  const [novo, setNovo] = useState<string | null>(null);

  // Une registros do dia com as aplicações para mostrar uma linha do tempo única
  // Pode haver duas aplicações no mesmo dia (dose complementar): guarda todas
  const aplicacaoPorData = new Map<string, NonNullable<typeof resumo>['linhas']>();
  for (const l of resumo?.linhas ?? []) aplicacaoPorData.set(l.aplicacao.data, [...(aplicacaoPorData.get(l.aplicacao.data) ?? []), l]);
  const datas = [...new Set([...diario.map((r) => r.data), ...aplicacaoPorData.keys()])].sort().reverse();
  const regPorData = new Map(diario.map((r) => [r.data, r]));
  const pesoMedicao = new Map(medidas.filter((m) => m.peso_kg > 0).map((m) => [m.data, m.peso_kg]));
  const datasAplic = [...aplicacaoPorData.keys()].sort();

  return (
    <div className="pilha">
      <section className="cartao">
        <div className="cartao-cab">
          <h2>Diário</h2>
          <button className="botao pequeno primario" onClick={() => setNovo(hojeLocal())}>Registrar dia</button>
        </div>
        <p className="mudo" style={{ marginBottom: 8 }}>
          Peso, náusea (0 a 3), efeitos, sono e água em qualquer dia. As aplicações aparecem aqui automaticamente.
        </p>
        {sono.media !== null && (
          <p className="texto-2" style={{ marginBottom: 8 }}>
            Sono (média de 7 dias): <b className={sono.baixo ? 'aviso-txt' : undefined}>{num(sono.media, 1)} h</b> em {sono.noites} noites.
          </p>
        )}
        {sono.baixo && (
          <div className="alerta" style={{ marginBottom: 8 }}>
            {TEXTO_SONO_BAIXO}
          </div>
        )}
        {datas.length === 0 ? (
          <Vazio>Nenhum registro ainda.</Vazio>
        ) : (
          <div className="lista">
            {datas.map((d) => {
              const r = regPorData.get(d);
              const aps = aplicacaoPorData.get(d) ?? [];
              const a = aps[0];
              return (
                <div className="item item-acao" key={d} onClick={() => (r ? setEditando(r) : setNovo(d))}>
                  <div className={`marcador ${a ? 'feito' : ''}`}>{d.slice(8, 10)}</div>
                  <div className="cresce">
                    <div className="titulo">
                      {diaDaSemana(d)}, {formatarData(d, true)}
                      {aps.map((x) => (
                        <span key={x.aplicacao.id} className="etiqueta destaque" style={{ marginLeft: 6 }}>
                          💉 {x.numero}ª · {mg(x.aplicacao.dose_mg)}
                        </span>
                      ))}
                      {!a && diaAposDose(d, datasAplic) !== null && diaAposDose(d, datasAplic)! <= 6 && (
                        <span className="etiqueta" style={{ marginLeft: 6 }} title="Dias depois da última dose">
                          D+{diaAposDose(d, datasAplic)}
                        </span>
                      )}
                    </div>
                    <div className="detalhe">
                      {[
                        // Dia com medição: vale o peso da medição (o mesmo das outras telas)
                        pesoMedicao.has(d) ? `${kg(pesoMedicao.get(d)!)} (medição)` : r?.peso_kg != null && kg(r.peso_kg),
                        r?.nausea != null && `náusea ${r.nausea} (${NIVEIS_NAUSEA[r.nausea].toLowerCase()})`,
                        ...textosSintomas(r),
                        r?.sono_h != null && `sono ${num(r.sono_h, 1)} h`,
                        r?.agua_l != null && `água ${num(r.agua_l, 1)} L`,
                        r?.cor_urina && `urina ${r.cor_urina}`,
                        r?.dieta_seguida && `dieta: ${r.dieta_seguida === 'sim' ? 'seguida' : r.dieta_seguida === 'parcial' ? 'em parte' : 'não seguida'}`,
                        ...aps.map((x) => x.aplicacao.local),
                        r?.observacoes,
                        ...aps.map((x) => x.aplicacao.observacoes),
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Sem registro do dia'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {novo && <FormDiario dataInicial={novo} aoFechar={() => setNovo(null)} />}
      {editando && <FormDiario registro={editando} aoFechar={() => setEditando(null)} />}
    </div>
  );
}
