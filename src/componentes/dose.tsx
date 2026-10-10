import { useEffect, useRef, useState } from 'react';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { composicaoPorFase, numerosDaFase } from '../lib/analise';
import { REGRAS_FASE, marcacao } from '../lib/ciclo';
import { formatarData } from '../lib/datas';
import { corVariacao, num, sinal, ui } from '../lib/formato';
import type { DecisaoFase, Fase } from '../lib/tipos';
import { Bloco, Campo } from './ui';

/** Grava as decisões do fim de fase pela fila (funciona sem internet). */
function useDecisoes() {
  const { ciclo, gravar, hoje } = useDados();
  const decisoes = ciclo?.decisoes ?? [];
  const salvar = (lista: DecisaoFase[], fases: Fase[] = ciclo!.fases) => gravar({ tipo: 'decisoes', dado: { ciclo_id: ciclo!.id, decisoes: lista, fases } });
  const nova = (d: Omit<DecisaoFase, 'id' | 'data'>): DecisaoFase => ({ id: crypto.randomUUID(), data: hoje, ...d });
  return { decisoes, salvar, nova };
}

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/**
 * Bloco "Fim da fase" do cartão da dose: aparece quando o degrau completou.
 * Mostra os números da fase e as regras do Plano; o app nunca sobe sozinho.
 */
export function FimDeFase() {
  const { ciclo, diario } = useDados();
  const { resumo, fases, composicoes, hoje } = useCalculos();
  const { decisoes, salvar, nova } = useDecisoes();
  const [modo, setModo] = useState<'repetir' | 'anotar' | null>(null);
  const [texto, setTexto] = useState('');
  if (!ciclo || !resumo?.proxima) return null;
  const s = resumo.degrau;
  const d = s.degrau;
  if ((s.estado !== 'pendente' && s.estado !== 'subir') || !d || d.ultima_fase === null || !s.fase_seguinte) return null;

  const n = resumo.aplicacoes_realizadas;
  const atual = ciclo.fases[d.ultima_fase];
  const doseAtual = d.bloco.dose_mg;
  const doseNova = s.fase_seguinte.fase.dose_mg;
  const mAtual = marcacao(doseAtual, ciclo);
  const mNova = marcacao(doseNova, ciclo);
  const numeros = numerosDaFase(diario, d.bloco.data_inicio, hoje);
  // O último bloco da Análise é este degrau
  const bloco = fases[fases.length - 1];
  const comp = bloco ? composicaoPorFase(fases, composicoes, null, hoje)[fases.length - 1] : null;
  const anotacoes = decisoes.filter((x) => x.escolha === 'anotacao' && x.apos_aplicacao === n);
  const regs = numeros.dias_registrados;

  function subir() {
    salvar([...decisoes, nova({ escolha: 'subir', apos_aplicacao: n, dose_mg: doseAtual, fase_indice: d!.ultima_fase! + 1, dose_nova_mg: doseNova })]);
  }

  function desfazer() {
    salvar(decisoes.filter((x) => x.id !== s.decisao?.id));
  }

  function repetir(semanas: number) {
    const i = d!.ultima_fase!;
    const fasesNovas = ciclo!.fases.map((f, j) => (j === i ? { ...f, semanas: f.semanas + semanas } : f));
    salvar([...decisoes, nova({ escolha: 'repetir', apos_aplicacao: n, dose_mg: doseAtual, fase_indice: i, semanas })], fasesNovas);
    setModo(null);
  }

  function anotar() {
    if (!texto.trim()) return;
    salvar([...decisoes, nova({ escolha: 'anotacao', apos_aplicacao: n, dose_mg: doseAtual, fase_indice: d!.ultima_fase, texto: texto.trim() })]);
    setTexto('');
    setModo(null);
  }

  return (
    <div className="fim-fase pilha">
      <div className="cartao-cab" style={{ marginBottom: 0 }}>
        <h3>
          Fim da fase {d.ultima_fase + 1} · {atual.nome}
        </h3>
        {s.estado === 'pendente' ? <span className="etiqueta aviso">a decidir</span> : <span className="etiqueta bom">decidido</span>}
      </div>
      <p className="texto-2">
        {d.bloco.aplicacoes} {d.bloco.aplicacoes === 1 ? 'dose' : 'doses'} de {num(doseAtual)} mg desde {formatarData(d.bloco.data_inicio)}. O app não sobe a dose
        sozinho: a próxima continua {num(doseAtual)} mg até você decidir.
      </p>
      <div className="grade">
        <Bloco rotulo="Náusea média · máx." valor={numeros.nausea_media === null ? '–' : `${num(numeros.nausea_media, 1)} · ${numeros.nausea_max}`} />
        <Bloco rotulo="Vômito" valor={`${numeros.vomito} de ${dias(regs)}`} classe={numeros.vomito ? 'ruim' : ''} />
        <Bloco rotulo="Diarreia" valor={`${numeros.diarreia} de ${dias(regs)}`} />
        <Bloco rotulo="Intestino preso" valor={`${numeros.intestino_preso} de ${dias(regs)}`} />
        <Bloco rotulo='"Segui o plano?" = não' valor={dias(numeros.dieta_nao)} />
        <Bloco
          rotulo="Ritmo de peso"
          valor={!bloco || bloco.poucos_dados ? 'poucos dados' : sinal(bloco.kg_por_semana, 2, ' kg/sem')}
          classe={bloco && !bloco.poucos_dados ? corVariacao(bloco.kg_por_semana, true) : ''}
        />
        <Bloco rotulo="Cintura" valor={sinal(comp?.cintura ?? null, 1, ' cm')} classe={corVariacao(comp?.cintura ?? null, true)} />
        <Bloco rotulo="Massa magra" valor={sinal(comp?.magra ?? null, 1, ' kg')} classe={corVariacao(comp?.magra ?? null, false)} />
      </div>
      {regs === 0 && <p className="mudo">Sem registros no Diário nesta fase: os sintomas aparecem quando você anota o dia.</p>}
      <details className="ajuda" open>
        <summary className="rotulo">Regras do seu Plano para o fim da fase</summary>
        <ul className="regras-fase">
          {REGRAS_FASE.map(([situacao, acao]) => (
            <li key={situacao}>
              {situacao} → <b>{acao}</b>
            </li>
          ))}
        </ul>
      </details>
      <div>
        <span className="etiqueta destaque">
          Dose nova: {num(doseAtual)} → {num(doseNova)} mg ({sinal(mNova.ui_pratica - mAtual.ui_pratica, 2, ' UI')})
        </span>
      </div>

      {s.estado === 'subir' ? (
        <div className="alerta info" style={{ alignItems: 'center' }}>
          <span className="cresce">
            Decidido em {formatarData(s.decisao!.data)}: subir para {num(doseNova)} mg ({ui(mNova.ui_pratica)}) na próxima dose.
          </span>
          <button className="botao pequeno" onClick={desfazer}>
            Desfazer
          </button>
        </div>
      ) : (
        <div className="linha botoes-fase">
          <button className="botao pequeno primario" onClick={subir}>
            Subir
          </button>
          <button className="botao pequeno" onClick={() => setModo(modo === 'repetir' ? null : 'repetir')} aria-expanded={modo === 'repetir'}>
            Repetir fase
          </button>
          <button className="botao pequeno" onClick={() => setModo(modo === 'anotar' ? null : 'anotar')} aria-expanded={modo === 'anotar'}>
            Anotar para o médico
          </button>
        </div>
      )}
      {s.estado === 'subir' && modo !== 'anotar' && (
        <button className="botao pequeno" onClick={() => setModo('anotar')}>
          Anotar para o médico
        </button>
      )}

      {modo === 'repetir' && (
        <div className="pilha">
          <p className="texto-2">Estende a fase {d.ultima_fase + 1} no Plano, mantendo {num(doseAtual)} mg:</p>
          <div className="linha">
            <button className="botao pequeno" onClick={() => repetir(1)}>
              +1 semana
            </button>
            <button className="botao pequeno" onClick={() => repetir(4)}>
              +4 semanas
            </button>
            <button className="botao pequeno" onClick={() => setModo(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {modo === 'anotar' && (
        <div className="pilha">
          <Campo rotulo="Anotação para o médico (vai para o PDF)">
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="ex.: náusea forte no D1 nas 2 últimas semanas" />
          </Campo>
          <div className="linha">
            <button className="botao pequeno primario" disabled={!texto.trim()} onClick={anotar}>
              Salvar anotação
            </button>
            <button className="botao pequeno" onClick={() => setModo(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {anotacoes.length > 0 && (
        <ul className="regras-fase">
          {anotacoes.map((a) => (
            <li key={a.id}>
              <span className="mudo">{formatarData(a.data, true)}:</span> {a.texto}
            </li>
          ))}
        </ul>
      )}
      <p className="mudo">Os números só descrevem a fase. A decisão de dose é sua, combinada com o seu médico.</p>
    </div>
  );
}

/** Última dose não bate com nenhuma fase do Plano: pergunta qual fase seguir. */
export function ForaDoPlano() {
  const { ciclo } = useDados();
  const { resumo } = useCalculos();
  const { decisoes, salvar, nova } = useDecisoes();
  const s = resumo?.degrau;
  const sugerida = Math.min((s?.ultima_fase_conhecida ?? -1) + 1, (ciclo?.fases.length ?? 1) - 1);
  const [fase, setFase] = useState(Math.max(sugerida, 0));
  if (!ciclo || !resumo?.proxima || s?.estado !== 'fora_do_plano' || !s.degrau) return null;
  const bloco = s.degrau.bloco;

  function confirmar() {
    salvar([
      ...decisoes,
      nova({ escolha: 'confirmar_fase', apos_aplicacao: resumo!.aplicacoes_realizadas, dose_mg: bloco.dose_mg, fase_indice: fase, bloco_inicio: bloco.data_inicio }),
    ]);
  }

  return (
    <div className="fim-fase pilha">
      <div className="cartao-cab" style={{ marginBottom: 0 }}>
        <h3>Dose fora do plano</h3>
        <span className="etiqueta aviso">confirme</span>
      </div>
      <p className="texto-2">
        Desde {formatarData(bloco.data_inicio)} você aplicou {num(bloco.dose_mg)} mg, que não bate com nenhuma fase do Plano. A próxima continua{' '}
        {num(bloco.dose_mg)} mg. Qual fase essas doses seguem? O tempo de fase passa a contar por ela.
      </p>
      <Campo rotulo="Seguir a fase">
        <select value={fase} onChange={(e) => setFase(Number(e.target.value))}>
          {ciclo.fases.map((f, i) => (
            <option key={i} value={i}>
              Fase {i + 1} · {f.nome} ({num(f.dose_mg)} mg, {f.semanas} sem.)
            </option>
          ))}
        </select>
      </Campo>
      <button className="botao pequeno primario" onClick={confirmar}>
        Confirmar fase
      </button>
      <p className="mudo">Se a dose foi digitada errado, corrija a aplicação na Agenda (Ciclo).</p>
    </div>
  );
}

/** Aviso curto que some sozinho (ex.: "Salvo · próxima: qui 22/10, 6,25 UI"). */
export function AvisoRapido({ texto, aoSumir }: { texto: string; aoSumir: () => void }) {
  const sumir = useRef(aoSumir);
  sumir.current = aoSumir;
  useEffect(() => {
    const t = setTimeout(() => sumir.current(), 7000);
    return () => clearTimeout(t);
  }, [texto]);
  return (
    <div className="alerta info desfazer" role="status">
      <span className="cresce">{texto}</span>
      <button className="botao pequeno" onClick={aoSumir}>
        OK
      </button>
    </div>
  );
}
