// Peças da tela "Relatório final": capa, fotos, linha do tempo das fases, recordes,
// hábitos e metas. Só mostram o modelo pronto (lib/relatorio-final.ts).
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatarData } from '../lib/datas';
import { cm, corVariacao, kg, num, pct, pp, sinal } from '../lib/formato';
import { MDC, type Composicao } from '../lib/gordura';
import type { NumeroFoto } from '../lib/fotos';
import { duracaoCurta } from '../lib/relatorio-final';
import type { CategoriaRecorde, EventoRelatorio, FaseRelatorio, RelatorioFinal, VariacaoRelatorio } from '../lib/relatorio-final';
import type { FotoTela } from './fotos';
import { ComparadorFotos } from './medidas-comparador';
import { Numero } from './movimento';
import { Anel, BarraMeta, Pilulas, tomAdesao } from './painel';
import { Icone, Vazio } from './ui';

/** Acento de cada seção e de cada bloco de dose (tokens --c-*). */
export type CorRelatorio = 'azul' | 'roxo' | 'rosa' | 'ciano' | 'laranja' | 'verde' | 'indigo';
export const CORES_FASES: CorRelatorio[] = ['ciano', 'azul', 'indigo', 'roxo', 'rosa', 'laranja', 'verde'];
export const corDaFase = (i: number): CorRelatorio => CORES_FASES[i % CORES_FASES.length];
const estiloCor = (cor: CorRelatorio) => ({ '--rf-cor': `var(--c-${cor})` }) as CSSProperties;
const curta = (d: string) => formatarData(d, true);

// ---------- Estrutura ----------

export function Secao({ id, cor, titulo, sub, acao, children }: { id: string; cor: CorRelatorio; titulo: string; sub?: ReactNode; acao?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="cartao rf-secao" style={estiloCor(cor)} aria-labelledby={`${id}-titulo`}>
      <div className="secao-cab rf-secao-cab">
        <div className="cresce">
          <h2 id={`${id}-titulo`}>{titulo}</h2>
          {sub && <div className="secao-sub">{sub}</div>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Atalhos para as seções (rola até elas). */
export function IndiceSecoes({ itens }: { itens: { id: string; rotulo: string; cor: CorRelatorio }[] }) {
  const ir = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <nav className="rf-indice" aria-label="Seções do relatório">
      {itens.map((x) => (
        <button key={x.id} type="button" style={estiloCor(x.cor)} onClick={() => ir(x.id)}>
          <i aria-hidden="true" />
          {x.rotulo}
        </button>
      ))}
    </nav>
  );
}

// ---------- Capa ----------

export function Ladrilho({ cor, rotulo, valor, sub, classe }: { cor: CorRelatorio; rotulo: string; valor: ReactNode; sub?: ReactNode; classe?: string }) {
  return (
    <div className="rf-ladrilho" style={estiloCor(cor)}>
      <span className="rf-ladrilho-rotulo">
        <i aria-hidden="true" />
        {rotulo}
      </span>
      <span className={`rf-ladrilho-valor numero ${classe ?? ''}`}>{valor}</span>
      {sub && <span className="rf-ladrilho-sub numero">{sub}</span>}
    </div>
  );
}

const fmtDelta = (v: VariacaoRelatorio) => (n: number) => sinal(n, 1, v.unidade === 'kg' ? ' kg' : v.unidade === 'cm' ? ' cm' : ' p.p.');

/** Variação com contagem ao aparecer; sem as duas medições, o valor de início. */
function ValorVariacao({ v }: { v: VariacaoRelatorio }) {
  if (v.delta === null) return <>{v.inicio === null ? '–' : v.texto_inicio}</>;
  return <Numero valor={v.delta} formato={fmtDelta(v)} />;
}

function subVariacao(v: VariacaoRelatorio): string {
  if (v.delta !== null) return `${v.texto_inicio} → ${v.texto_fim}`;
  return v.inicio === null ? 'sem medição' : 'sem nova medição';
}

export function CapaRelatorio({ r, urlDe }: { r: RelatorioFinal; urlDe: (id: string) => string | undefined }) {
  const capa = r.fotos.capa;
  const antes = capa ? urlDe(capa.id_antes) : undefined;
  const depois = capa ? urlDe(capa.id_depois) : undefined;
  const p = r.numeros.peso;
  const semanas = r.periodo.semanas;
  const mm = r.massa_magra;
  return (
    <section className={`rf-capa ${r.estado}`} aria-label="Capa do relatório">
      <div className="rf-capa-topo">
        <span className={`rf-estado ${r.estado}`}>
          <i aria-hidden="true" />
          {r.rotulo_estado}
        </span>
        <span className="rf-capa-periodo numero">{r.periodo.texto}</span>
      </div>
      <h2 className="rf-capa-titulo">
        {r.pessoa.primeiro_nome && <span className="rf-capa-nome">{r.pessoa.primeiro_nome}, </span>}
        <span className="rf-grad">{duracaoCurta(r.periodo.dias)}</span> de ciclo
      </h2>
      <p className="rf-capa-resumo">{r.resumo_texto}</p>

      {capa && antes && depois && (
        <div className="rf-capa-fotos">
          <figure>
            <img src={antes} alt={`Antes, ${curta(capa.data_antes)}`} decoding="async" draggable={false} />
            <figcaption>
              <b>Antes</b> {curta(capa.data_antes)}
            </figcaption>
          </figure>
          <figure>
            <img src={depois} alt={`Depois, ${curta(capa.data_depois)}`} decoding="async" draggable={false} />
            <figcaption>
              <b>Depois</b> {curta(capa.data_depois)}
            </figcaption>
          </figure>
        </div>
      )}

      <div className="rf-capa-grande">
        <span className="rf-capa-grande-rotulo">Peso</span>
        <span className={`rf-capa-grande-valor numero ${p.tom}`}>
          <ValorVariacao v={p} />
        </span>
        <span className="rf-capa-grande-sub numero">
          {subVariacao(p)}
          {p.delta_pct !== null && ` · ${sinal(p.delta_pct * 100, 1, '%')}`}
        </span>
      </div>

      <div className="rf-ladrilhos">
        <Ladrilho cor="azul" rotulo="Cintura" valor={<ValorVariacao v={r.numeros.cintura} />} sub={subVariacao(r.numeros.cintura)} classe={r.numeros.cintura.tom} />
        <Ladrilho cor="rosa" rotulo="% gordura" valor={<ValorVariacao v={r.numeros.bf} />} sub={subVariacao(r.numeros.bf)} classe={r.numeros.bf.tom} />
        <Ladrilho
          cor="verde"
          rotulo="Massa magra"
          valor={mm.preservada === null ? <ValorVariacao v={r.numeros.massa_magra} /> : mm.preservada ? 'Preservada' : <ValorVariacao v={r.numeros.massa_magra} />}
          sub={mm.preservada ? `${r.numeros.massa_magra.texto_delta} (dentro do erro)` : subVariacao(r.numeros.massa_magra)}
          classe={mm.preservada ? 'bom' : r.numeros.massa_magra.tom}
        />
        <Ladrilho cor="laranja" rotulo="Massa gorda" valor={<ValorVariacao v={r.numeros.massa_gorda} />} sub={subVariacao(r.numeros.massa_gorda)} classe={r.numeros.massa_gorda.tom} />
        <Ladrilho cor="ciano" rotulo="Duração" valor={<Numero valor={r.periodo.dias} formato={(n) => `${Math.round(n)} dias`} />} sub={`${num(semanas, 1)} semanas`} />
        <Ladrilho
          cor="indigo"
          rotulo="Aplicações"
          valor={<Numero valor={r.remedio.aplicacoes} formato={(n) => String(Math.round(n))} />}
          sub={r.remedio.dose_inicial !== null ? `${num(r.remedio.dose_inicial)} → ${num(r.remedio.dose_final)} mg` : 'nenhuma ainda'}
        />
      </div>
    </section>
  );
}

/** "Tudo o que foi registrado": contagens. */
export function Registros({ r }: { r: RelatorioFinal }) {
  const g = r.registros;
  const itens: [string, number | null][] = [
    ['dias de Diário', g.dias_diario],
    ['pesagens', g.pesagens],
    ['medições', g.medicoes],
    ['aplicações', g.aplicacoes],
    ['dias de treino', g.dias_treino],
    ['fotos', g.fotos],
    ['decisões', g.decisoes],
  ];
  return (
    <div className="rf-registros">
      {itens
        .filter(([, n]) => n !== null)
        .map(([rotulo, n]) => (
          <span key={rotulo} className="rf-registro">
            <b className="numero">{n}</b> {rotulo}
          </span>
        ))}
    </div>
  );
}

// ---------- Fotos ----------

function NumerosLado({ numeros, comVariacao }: { numeros: NumeroFoto[]; comVariacao: boolean }) {
  if (!numeros.length) return <p className="mudo rf-par-sem">Sem medição até 7 dias da foto.</p>;
  return (
    <dl className="rf-par-numeros">
      {numeros.map((n) => (
        <div key={n.chave}>
          <dt>{n.rotulo === '% de gordura' ? 'Gordura' : n.rotulo}</dt>
          <dd className="numero">
            {n.valor}
            {comVariacao && n.variacao !== undefined && <span className={`rf-par-delta ${corVariacao(n.delta, true, MDC[n.chave])}`}>{n.variacao}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Antes × Depois: lado a lado (com data e números) ou na cortina deslizante. */
export function FotosRelatorio({ r, fotos, composicoes, carregando }: { r: RelatorioFinal; fotos: FotoTela[]; composicoes: Composicao[]; carregando: boolean }) {
  const [modo, setModo] = useState<'lado' | 'cortina'>('lado');
  const url = (id: string) => fotos.find((f) => f.id === id)?.url;
  if (carregando && !fotos.length) return <div className="esqueleto" style={{ height: 220 }} />;
  if (!r.fotos.pares.length)
    return (
      <Vazio>
        {r.fotos.total ? 'Falta foto numa das sessões (Antes ou Depois).' : 'Nenhuma foto neste aparelho.'} As fotos ficam só no aparelho: adicione em{' '}
        <Link to="/medidas">Medidas</Link> e o comparativo aparece aqui.
      </Vazio>
    );
  return (
    <div className="rf-fotos">
      <Pilulas
        rotulo="Como comparar as fotos"
        opcoes={[
          ['lado', 'Lado a lado'],
          ['cortina', 'Cortina'],
        ]}
        valor={modo}
        aoMudar={setModo}
      />
      {modo === 'cortina' ? (
        <ComparadorFotos fotos={fotos} composicoes={composicoes} feminino={r.pessoa.feminino} />
      ) : (
        r.fotos.pares.map((p) => {
          const a = url(p.id_antes);
          const d = url(p.id_depois);
          return (
            <div key={p.chave} className="rf-par">
              <div className="rf-par-cab">{p.chave === 'geral' ? 'Primeira do Antes × mais recente do Depois' : p.rotulo}</div>
              <div className="rf-par-grade">
                <figure className="rf-par-lado antes">
                  {a ? <img src={a} alt={`Antes, ${p.rotulo}, ${curta(p.data_antes)}`} loading="lazy" decoding="async" draggable={false} /> : <div className="rf-par-falta" />}
                  <figcaption>
                    <b>Antes</b> <span className="numero">{curta(p.data_antes)}</span>
                  </figcaption>
                  <NumerosLado numeros={p.numeros_antes} comVariacao={false} />
                </figure>
                <figure className="rf-par-lado depois">
                  {d ? <img src={d} alt={`Depois, ${p.rotulo}, ${curta(p.data_depois)}`} loading="lazy" decoding="async" draggable={false} /> : <div className="rf-par-falta" />}
                  <figcaption>
                    <b>Depois</b> <span className="numero">{curta(p.data_depois)}</span>
                  </figcaption>
                  <NumerosLado numeros={p.numeros_depois} comVariacao />
                </figure>
              </div>
            </div>
          )
        })
      )}
      <p className="mudo rf-nota">Primeira foto do Antes × mais recente do Depois, por pose. Números da medição mais próxima de cada foto (até 7 dias). As fotos não saem do aparelho.</p>
    </div>
  );
}

// ---------- Fases e decisões ----------

/** Escada das doses: largura pelos dias do bloco, altura pela dose. */
export function Degraus({ fases }: { fases: FaseRelatorio[] }) {
  if (!fases.length) return null;
  const max = Math.max(...fases.map((f) => f.dose_mg));
  return (
    <div className="rf-degraus" role="img" aria-label={`Doses do ciclo: ${fases.map((f) => `${num(f.dose_mg)} mg por ${f.doses} ${f.doses === 1 ? 'dose' : 'doses'}`).join(', ')}`}>
      <div className="rf-degraus-barras">
        {fases.map((f, i) => (
          <span key={f.indice} style={{ ...estiloCor(corDaFase(i)), flexGrow: f.dias, height: `${Math.max((f.dose_mg / max) * 100, 14)}%` }}>
            <b className="numero">{num(f.dose_mg)}</b>
          </span>
        ))}
      </div>
      <div className="rf-degraus-eixo numero">
        <span>{curta(fases[0].inicio)}</span>
        <span>mg por bloco de doses</span>
        <span>{curta(fases[fases.length - 1].fim)}</span>
      </div>
    </div>
  );
}

function CartaoFase({ f, i }: { f: FaseRelatorio; i: number }) {
  const itens: [string, string, string][] = [
    ['Doses', `${f.doses} × ${num(f.dose_mg)} mg`, ''],
    ['Peso', f.variacao_kg === null ? '–' : sinal(f.variacao_kg, 1, ' kg'), corVariacao(f.variacao_kg, true, MDC.peso_kg)],
    ['Ritmo/sem.', f.kg_por_semana === null ? 'poucos dados' : sinal(f.kg_por_semana, 2, ' kg'), ''],
    ['Cintura', f.cintura_cm === null ? '–' : sinal(f.cintura_cm, 1, ' cm'), corVariacao(f.cintura_cm, true, MDC.cintura_cm)],
    ['Náusea', f.nausea_media === null ? '–' : `${num(f.nausea_media, 1)} de 3`, ''],
    ...(f.treino !== null ? ([['Treino', pct(f.treino, 0), '']] as [string, string, string][]) : []),
  ];
  return (
    <div className="rf-fase" style={estiloCor(corDaFase(i))}>
      <div className="rf-fase-cab">
        <b>{f.nome}</b>
        <span className="etiqueta">{f.fase_indice === null ? 'fora do plano' : `fase ${f.fase_indice + 1}`}</span>
        {f.em_andamento && <span className="etiqueta aviso">em andamento</span>}
      </div>
      <div className="rf-fase-periodo numero">
        {curta(f.inicio)} – {curta(f.fim)} · {f.dias} dias
      </div>
      <dl className="rf-fase-numeros">
        {itens.map(([k, v, c]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={`numero ${c}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const ROTULO_EVENTO: Record<EventoRelatorio['tipo'], string> = {
  inicio: 'Início',
  fase: 'Dose',
  decisao_fase: 'Fim de fase',
  anotacao: 'Anotação',
  registro: 'Registro',
  fim: 'Fim',
};

/** Linha do tempo: blocos de dose (com os números) e as decisões registradas entre eles. */
export function LinhaDoTempoRelatorio({ r }: { r: RelatorioFinal }) {
  const [todas, setTodas] = useState(false);
  if (!r.linha_do_tempo.length) return <Vazio>A linha do tempo começa na primeira aplicação.</Vazio>;
  const decisoes = r.linha_do_tempo.filter((x) => x.tipo === 'registro' || x.tipo === 'decisao_fase' || x.tipo === 'anotacao');
  const muitas = decisoes.length > 8;
  const visiveis = r.linha_do_tempo.filter((x) => todas || !muitas || x.tipo === 'inicio' || x.tipo === 'fase' || x.tipo === 'fim' || x.tipo === 'decisao_fase');
  return (
    <>
      <ol className="rf-tempo">
        {visiveis.map((ev, k) => {
          const fase = ev.tipo === 'inicio' ? 0 : ev.tipo === 'fase' ? ev.fase! : null;
          const f = fase !== null ? r.fases[fase] : null;
          return (
            <li key={`${ev.data}-${k}`} className={`rf-tempo-item ${ev.tipo}`} style={f ? estiloCor(corDaFase(fase!)) : undefined}>
              <span className="rf-tempo-ponto" aria-hidden="true" />
              <div className="rf-tempo-corpo">
                <div className="rf-tempo-data numero">
                  {curta(ev.data)} · {ROTULO_EVENTO[ev.tipo]}
                </div>
                {f ? (
                  <CartaoFase f={f} i={fase!} />
                ) : (
                  <>
                    <div className="rf-tempo-titulo">{ev.titulo}</div>
                    {ev.detalhe && <div className="rf-tempo-detalhe">{ev.detalhe}</div>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {muitas && (
        <button type="button" className="botao pequeno bloco-largo" onClick={() => setTodas((v) => !v)} aria-expanded={todas}>
          {todas ? 'Mostrar só as fases' : `Mostrar os ${decisoes.length - decisoes.filter((x) => x.tipo === 'decisao_fase').length} registros de decisões`}
        </button>
      )}
    </>
  );
}

// ---------- Recordes ----------

const ICONE_CATEGORIA: Record<CategoriaRecorde, string> = { corpo: 'medidas', habito: 'diario', remedio: 'ciclo', treino: 'treino' };
const COR_CATEGORIA: Record<CategoriaRecorde, CorRelatorio> = { corpo: 'azul', habito: 'verde', remedio: 'indigo', treino: 'rosa' };

export function RecordesRelatorio({ r }: { r: RelatorioFinal }) {
  if (!r.recordes.length) return <Vazio>Os recordes aparecem conforme você registra medições, o Diário e os treinos.</Vazio>;
  return (
    <div className="rf-recordes">
      {r.recordes.map((x) => (
        <div key={x.id} className="rf-recorde" style={estiloCor(COR_CATEGORIA[x.categoria])}>
          <span className="rf-recorde-icone" aria-hidden="true">
            <Icone nome={ICONE_CATEGORIA[x.categoria]} />
          </span>
          <span className="rf-recorde-titulo">{x.titulo}</span>
          <b className="rf-recorde-valor numero">{x.texto}</b>
          <span className="rf-recorde-detalhe">{x.detalhe}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Hábitos ----------

export function AneisHabitos({ r }: { r: RelatorioFinal }) {
  const a = r.habitos.adesao;
  const anel = (rotulo: string, t: { feito: number; total: number; fracao: number | null } | null, unidade: string) =>
    t ? <Anel key={rotulo} rotulo={rotulo} fracao={t.fracao} tom={tomAdesao(t.fracao)} detalhe={t.total ? `${num(t.feito, t.feito % 1 ? 1 : 0)} de ${t.total} ${unidade}` : 'sem registro'} /> : null;
  return (
    <div className="aneis rf-aneis">
      {anel('Treino', a.treino, 'dias')}
      {anel('Cardio', a.cardio, 'dias')}
      {anel('Dieta', a.dieta, 'dias')}
      {anel('Água', a.agua, 'dias')}
      {anel('Sono 7 h+', a.sono, 'noites')}
      {anel('Diário', a.registro, 'dias')}
    </div>
  );
}

export function NumerosHabitos({ r }: { r: RelatorioFinal }) {
  const h = r.habitos;
  const itens: [CorRelatorio, string, string, string][] = [
    ['roxo', 'Sono médio', h.sono_medio === null ? '–' : `${num(h.sono_medio, 1)} h`, `${h.noites} noites anotadas`],
    ['ciano', 'Água média', h.agua_media === null ? '–' : `${num(h.agua_media, 1)} L`, h.agua_meta_media === null ? 'sem registro' : `meta média ${num(h.agua_meta_media, 1)} L`],
    ['verde', 'Dieta seguida', h.sequencias.dieta ? `${h.sequencias.dieta} dias` : '–', 'maior sequência no plano'],
    ['laranja', 'Náusea', h.nausea_media === null ? '–' : `${num(h.nausea_media, 1)} de 3`, `${h.dias_com_nausea} dias com náusea`],
  ];
  return (
    <div className="rf-mini-grade">
      {itens.map(([cor, rotulo, valor, sub]) => (
        <Ladrilho key={rotulo} cor={cor} rotulo={rotulo} valor={valor} sub={sub} />
      ))}
    </div>
  );
}

// ---------- Metas ----------

export function MetasRelatorio({ r }: { r: RelatorioFinal }) {
  if (!r.metas.itens.length)
    return (
      <Vazio>
        Sem metas do projeto{r.pessoa.com_treino ? ' (defina na aba Treino › Metas)' : ''}: o caminho até a meta aparece quando houver meta e duas medições.
      </Vazio>
    );
  const fmt = (u: 'kg' | 'cm' | '%') => (n: number) => (u === 'kg' ? kg(n) : u === 'cm' ? cm(n) : pp(n));
  return (
    <div className="metas">
      {r.metas.itens.map((m) => (
        <BarraMeta key={m.chave} nome={m.nome} p={m.progresso} fmt={fmt(m.unidade)} rotuloAtual={r.estado === 'concluido' ? 'Final' : 'Agora'} />
      ))}
    </div>
  );
}

/** Início × fim de todas as medidas: valores e a variação colorida pelo erro da fita. */
export function TabelaNumeros({ r }: { r: RelatorioFinal }) {
  const n = r.numeros;
  const lista = [n.cintura, n.bf, n.massa_gorda, n.massa_magra, n.peso, ...(n.quadril ? [n.quadril] : []), n.pescoco];
  return (
    <div className="rf-numeros" role="table" aria-label="Medidas: início e fim">
      <div className="rf-numeros-linha rf-numeros-cab" role="row">
        <span role="columnheader">Medida</span>
        <span role="columnheader">Início → fim</span>
        <span role="columnheader">Variação</span>
      </div>
      {lista.map((v) => (
        <div key={v.chave} className="rf-numeros-linha" role="row">
          <span role="cell" className="rf-numeros-nome">
            {v.rotulo}
          </span>
          <span role="cell" className="numero rf-numeros-valores">
            {v.inicio === null ? '–' : v.delta === null ? v.texto_inicio : `${v.texto_inicio.replace(/ (kg|cm)$/, '')} → ${v.texto_fim}`}
          </span>
          <span role="cell" className={`numero rf-numeros-delta ${v.tom}`}>
            {v.texto_delta}
          </span>
        </div>
      ))}
    </div>
  );
}
