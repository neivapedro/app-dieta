import { useState } from 'react';
import { useDados } from '../dados/contexto';
import { diaDaSemana, formatarData } from '../lib/datas';
import { decisoesPorDia, descreverRegistro, mudancasMisturadas, ROTULO_TIPO } from '../lib/registroDecisoes';
import type { RegistroDecisao } from '../lib/tipos';
import { Vazio } from './ui';

const curta = (d: string) => formatarData(d, true).slice(0, 5);

/** Dias mostrados antes de "Mostrar todas" */
const DIAS_VISIVEIS = 8;

/** Uma linha do registro, com o motivo editável (uma linha) e a exclusão. */
function ItemDecisao({ r }: { r: RegistroDecisao }) {
  const { gravar } = useDados();
  const [editando, setEditando] = useState(false);
  const [motivo, setMotivo] = useState(r.motivo ?? '');

  function salvarMotivo() {
    gravar({ tipo: 'registro_decisao', dado: { ...r, motivo: motivo.trim() || null } });
    setEditando(false);
  }

  function excluir() {
    if (!confirm(`Apagar do registro: "${descreverRegistro(r)}"?`)) return;
    gravar({ tipo: 'excluir', dado: { alvo: 'registro_decisao', id: r.id, data: r.data } });
  }

  return (
    <div className="pilha" style={{ gap: 6 }}>
      <div className="detalhe">
        <span className="etiqueta">{ROTULO_TIPO[r.tipo]}</span> {descreverRegistro(r)}
      </div>
      {r.motivo && !editando && <div className="mudo">Motivo: {r.motivo}</div>}
      {!editando && (
        <div className="linha" style={{ gap: 6 }}>
          <button
            className="botao pequeno"
            onClick={() => {
              // Parte do motivo atual (a linha pode ter mudado depois de aberta a tela)
              setMotivo(r.motivo ?? '');
              setEditando(true);
            }}
          >
            {r.motivo ? 'Editar motivo' : 'Motivo'}
          </button>
          <button className="botao pequeno" onClick={excluir} aria-label="Apagar do registro">
            Apagar
          </button>
        </div>
      )}
      {editando && (
        <div className="pilha" style={{ gap: 8 }}>
          <input
            value={motivo}
            maxLength={160}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && salvarMotivo()}
            placeholder="ex.: ritmo abaixo de 0,5%/sem e cintura parada"
            aria-label="Motivo"
            autoFocus
          />
          <div className="linha">
            <button className="botao pequeno primario" onClick={salvarMotivo}>
              Salvar
            </button>
            <button className="botao pequeno" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Registro de decisões da Análise: o que mudou (déficit, fator, proteína e
 * gordura, exercício, fases, metas, dose) e quando. O app grava sozinho ao
 * salvar; aqui dá para escrever o motivo e anotar uma decisão de não mudar.
 */
export function ListaDecisoes() {
  const { registroDecisoes, registroIndisponivel, gravar, hoje } = useDados();
  const [todas, setTodas] = useState(false);
  const [anotando, setAnotando] = useState(false);
  const [texto, setTexto] = useState('');
  const dias = decisoesPorDia(registroDecisoes);
  const visiveis = todas ? dias : dias.slice(0, DIAS_VISIVEIS);
  const misturadas = mudancasMisturadas(registroDecisoes);

  function anotar() {
    if (!texto.trim()) return;
    gravar({
      tipo: 'registro_decisao',
      dado: { id: crypto.randomUUID(), data: hoje, tipo: 'nota', campo: texto.trim(), de: null, para: null, motivo: null, ref: null },
    });
    setTexto('');
    setAnotando(false);
  }

  return (
    <section className="cartao pilha">
      <div className="cartao-cab" style={{ marginBottom: 0 }}>
        <h2>Decisões</h2>
        {!anotando && !registroIndisponivel && (
          <button className="botao pequeno" onClick={() => setAnotando(true)}>
            Anotar decisão
          </button>
        )}
      </div>
      {registroIndisponivel && <div className="alerta">Para guardar o registro de decisões, falta rodar o SQL de evolução no Supabase.</div>}
      {anotando && (
        <div className="pilha" style={{ gap: 8 }}>
          <input
            value={texto}
            maxLength={160}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && anotar()}
            placeholder="ex.: meta mantida (ritmo baixo, mas cintura caindo)"
            aria-label="Decisão"
            autoFocus
          />
          <div className="linha">
            <button className="botao pequeno primario" disabled={!texto.trim()} onClick={anotar}>
              Salvar
            </button>
            <button className="botao pequeno" onClick={() => setAnotando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {misturadas.map((m) => (
        <div className="alerta info" key={m.dose}>
          Dose e dieta mudaram {m.dose === m.dieta ? `no mesmo dia (${curta(m.dose)})` : `com menos de 7 dias de diferença (dose em ${curta(m.dose)}, dieta em ${curta(m.dieta)})`}: o resultado
          das semanas seguintes não dá para atribuir a uma coisa só.
        </div>
      ))}
      {dias.length === 0 ? (
        !registroIndisponivel && (
          <Vazio>Quando você mudar o déficit, o fator, a proteína ou a gordura, as fases do Plano, as metas ou a dose, a mudança aparece aqui com a data.</Vazio>
        )
      ) : (
        <div className="lista">
          {visiveis.map((d) => (
            <div className="item" key={d.data} style={{ alignItems: 'flex-start' }}>
              <div className="cresce pilha" style={{ gap: 8, minWidth: 0 }}>
                <div className="titulo">
                  {diaDaSemana(d.data).slice(0, 3)} {formatarData(d.data, true)}
                </div>
                {d.registros.map((r) => (
                  <ItemDecisao key={r.id} r={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {dias.length > DIAS_VISIVEIS && (
        <button className="botao pequeno" onClick={() => setTodas(!todas)}>
          {todas ? 'Mostrar menos' : `Mostrar todas (${dias.length} dias)`}
        </button>
      )}
      {dias.length > 0 && <p className="mudo">Gravadas ao salvar. As linhas pontilhadas dos gráficos marcam estes dias. Também vão para o PDF.</p>}
    </section>
  );
}

