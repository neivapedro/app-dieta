import { useState } from 'react';
import { FormDiario } from '../componentes/formularios';
import { Vazio } from '../componentes/ui';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { diaDaSemana, formatarData } from '../lib/datas';
import { kg, mg } from '../lib/formato';
import { NIVEIS_NAUSEA, type RegistroDiario } from '../lib/tipos';

export function Diario() {
  const { diario } = useDados();
  const { resumo } = useCalculos();
  const [editando, setEditando] = useState<RegistroDiario | null>(null);
  const [novo, setNovo] = useState(false);

  // Une registros do dia com as aplicações para mostrar uma linha do tempo única
  const aplicacaoPorData = new Map((resumo?.linhas ?? []).map((l) => [l.aplicacao.data, l]));
  const datas = [...new Set([...diario.map((r) => r.data), ...aplicacaoPorData.keys()])].sort().reverse();
  const regPorData = new Map(diario.map((r) => [r.data, r]));

  return (
    <div className="pilha">
      <section className="cartao">
        <div className="cartao-cab">
          <h2>Diário</h2>
          <button className="botao pequeno primario" onClick={() => setNovo(true)}>Registrar dia</button>
        </div>
        <p className="mudo" style={{ marginBottom: 8 }}>Peso, náusea (0 a 3) e efeitos em qualquer dia. As aplicações aparecem aqui automaticamente.</p>
        {datas.length === 0 ? (
          <Vazio>Nenhum registro ainda.</Vazio>
        ) : (
          <div className="lista">
            {datas.map((d) => {
              const r = regPorData.get(d);
              const a = aplicacaoPorData.get(d);
              return (
                <div className="item item-acao" key={d} onClick={() => (r ? setEditando(r) : setNovo(true))}>
                  <div className={`marcador ${a ? 'feito' : ''}`}>{d.slice(8, 10)}</div>
                  <div className="cresce">
                    <div className="titulo">
                      {diaDaSemana(d)}, {formatarData(d, true)}
                      {a && <span className="etiqueta destaque" style={{ marginLeft: 6 }}>💉 {a.numero}ª · {mg(a.aplicacao.dose_mg)}</span>}
                    </div>
                    <div className="detalhe">
                      {[
                        r?.peso_kg != null && kg(r.peso_kg),
                        r?.nausea != null && `náusea ${r.nausea} (${NIVEIS_NAUSEA[r.nausea].toLowerCase()})`,
                        a?.aplicacao.local,
                        r?.observacoes,
                        a?.aplicacao.observacoes,
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
      {novo && <FormDiario aoFechar={() => setNovo(false)} />}
      {editando && <FormDiario registro={editando} aoFechar={() => setEditando(null)} />}
    </div>
  );
}
