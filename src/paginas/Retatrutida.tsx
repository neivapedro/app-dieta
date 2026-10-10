import { Fragment, type MouseEvent, type ReactNode } from 'react';
import { conteudo, partesTexto, type BlocoRetatrutida, type BlocoTabela, type SecaoRetatrutida } from '../dados/retatrutida';
import { formatarData } from '../lib/datas';

// Aba educativa sobre a retatrutida. Todo o texto vem de dados/retatrutida.json
// e vai junto no pacote do app, então abre sem internet.

const ID_INDICE = 'indice';
const idSecao = (id: string) => `sec-${id}`;
const idRef = (n: number) => `ref-${n}`;

/**
 * Rola até um ponto da página sem mexer no endereço: a versão de demonstração usa
 * rotas com # (HashRouter), então um link "#secao" comum trocaria de tela.
 */
function rolarPara(id: string) {
  const alvo = document.getElementById(id);
  if (!alvo) return;
  const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  alvo.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  // Leitor de tela e teclado continuam a partir do destino
  const foco = alvo.querySelector<HTMLElement>('[data-foco]') ?? alvo;
  foco.focus({ preventScroll: true });
  // Marca o destino por um instante, para o olho achar onde parou
  alvo.classList.remove('alvo');
  void alvo.offsetWidth;
  alvo.classList.add('alvo');
  window.setTimeout(() => alvo.classList.remove('alvo'), 1600);
}

function LinkInterno({ para, children, className, rotulo }: { para: string; children: ReactNode; className?: string; rotulo?: string }) {
  const ir = (e: MouseEvent) => {
    e.preventDefault();
    rolarPara(para);
  };
  return (
    <a href={`#${para}`} className={className} aria-label={rotulo} onClick={ir}>
      {children}
    </a>
  );
}

/** Texto com as citações [n] virando links para a lista de referências. */
function Texto({ texto }: { texto: string }) {
  return (
    <>
      {partesTexto(texto).map((p, i) => {
        if (p.tipo === 'texto') return <Fragment key={i}>{p.texto}</Fragment>;
        if (p.tipo === 'preliminar') return <span key={i} className="preliminar">{p.texto}</span>;
        return (
          <span key={i} className="citacao">
            [
            {p.numeros.map((n, j) => (
              <Fragment key={n}>
                {j > 0 && ', '}
                <LinkInterno para={idRef(n)} rotulo={`Referência ${n}`}>
                  {n}
                </LinkInterno>
              </Fragment>
            ))}
            ]
          </span>
        );
      })}
    </>
  );
}

// "1. A aplicação. A injeção é…": o início numerado do passo vai em negrito
const PASSO = /^(\d+\.\s+[^.]{2,60}\.)\s+/;

// "Dose esquecida: cada remédio…": rótulo curto (até 4 palavras) antes de ":" vai em negrito
const ROTULO = /^([^.:[\]]{2,40}:)\s+/;

/** Texto corrido com o começo destacado: passo numerado ou rótulo curto antes de ":". */
function TextoComInicio({ texto }: { texto: string }) {
  const passo = texto.match(PASSO);
  const rotulo = passo ? null : texto.match(ROTULO);
  const inicio = passo ?? (rotulo && rotulo[1].trim().split(/\s+/).length <= 4 ? rotulo : null);
  if (!inicio) return <Texto texto={texto} />;
  return (
    <>
      <strong>
        <Texto texto={inicio[1]} />
      </strong>{' '}
      <Texto texto={texto.slice(inicio[0].length)} />
    </>
  );
}

function Paragrafo({ texto }: { texto: string }) {
  // Parágrafo curto terminado em ":" é um subtítulo do que vem a seguir ("Onde aplicar:")
  if (texto.length <= 70 && texto.trimEnd().endsWith(':')) {
    return (
      <h3 className="subtitulo-leitura">
        <Texto texto={texto} />
      </h3>
    );
  }
  return (
    <p>
      <TextoComInicio texto={texto} />
    </p>
  );
}

function Tabela({ bloco, rotulo }: { bloco: BlocoTabela; rotulo: string }) {
  return (
    <>
      <p className="dica-rolagem mudo" aria-hidden="true">
        Deslize a tabela para o lado →
      </p>
      {/* Rola só dentro do cartão; a 1ª coluna fica parada para não perder a linha */}
      <div className="tabela-rolagem tabela-leitura-rolagem" role="region" aria-label={`Tabela: ${rotulo}`} tabIndex={0}>
        <table className="tabela-leitura">
          <thead>
            <tr>
              {bloco.cabecalho.map((c, i) => (
                <th key={i} scope="col">
                  {c ? <Texto texto={c} /> : <span className="oculto-visual">Item</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bloco.linhas.map((linha, i) => (
              <tr key={i}>
                {linha.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      <Texto texto={c} />
                    </th>
                  ) : (
                    <td key={j}>
                      <Texto texto={c} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Bloco({ bloco, secao }: { bloco: BlocoRetatrutida; secao: SecaoRetatrutida }) {
  switch (bloco.tipo) {
    case 'paragrafo':
      return <Paragrafo texto={bloco.texto} />;
    case 'destaque':
      return (
        <div className="alerta info">
          <p>
            <TextoComInicio texto={bloco.texto} />
          </p>
        </div>
      );
    case 'lista':
      return (
        <ul className="lista-leitura">
          {bloco.itens.map((t, i) => (
            <li key={i}>
              <Texto texto={t} />
            </li>
          ))}
        </ul>
      );
    case 'tabela':
      return <Tabela bloco={bloco} rotulo={secao.titulo} />;
  }
}

// Quais receptores cada remédio ativa (diagrama da seção dos receptores)
const RECEPTORES = ['GLP-1', 'GIP', 'Glucagon'];
const REMEDIOS: { nome: string; ativa: boolean[] }[] = [
  { nome: 'Semaglutida', ativa: [true, false, false] },
  { nome: 'Tirzepatida', ativa: [true, true, false] },
  { nome: 'Retatrutida', ativa: [true, true, true] },
];

/** Grade simples: remédios nas linhas, receptores nas colunas, círculo cheio = ativa. */
function DiagramaReceptores() {
  const colX = [136, 192, 248];
  const linhaY = (i: number) => 62 + i * 42;
  return (
    <figure className="diagrama">
      <svg viewBox="0 0 280 176" role="img" aria-labelledby="diag-titulo diag-desc">
        <title id="diag-titulo">Receptores ativados por cada remédio</title>
        <desc id="diag-desc">
          Semaglutida ativa só o GLP-1. Tirzepatida ativa GLP-1 e GIP. Retatrutida ativa GLP-1, GIP e glucagon.
        </desc>
        {/* Faixa na linha da retatrutida, a única que ativa os três */}
        <rect x="2" y={linhaY(2) - 19} width="276" height="38" rx="10" style={{ fill: 'var(--superficie-2)' }} />
        {RECEPTORES.map((r, j) => (
          <text key={r} x={colX[j]} y="24" textAnchor="middle" style={{ fill: 'var(--texto-2)', fontSize: 12.5, fontWeight: 650 }}>
            {r}
          </text>
        ))}
        <line x1="2" x2="278" y1="36" y2="36" style={{ stroke: 'var(--borda)' }} />
        {REMEDIOS.map((m, i) => (
          <g key={m.nome}>
            <text x="12" y={linhaY(i) + 5} style={{ fill: 'var(--texto)', fontSize: 13.5, fontWeight: i === 2 ? 700 : 500 }}>
              {m.nome}
            </text>
            {m.ativa.map((sim, j) =>
              sim ? (
                <g key={j}>
                  <circle cx={colX[j]} cy={linhaY(i)} r="11" style={{ fill: 'var(--texto)' }} />
                  <path
                    d={`M${colX[j] - 5} ${linhaY(i)} l3.5 3.5 l6.5 -7`}
                    style={{ fill: 'none', stroke: 'var(--superficie)', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }}
                  />
                </g>
              ) : (
                <circle key={j} cx={colX[j]} cy={linhaY(i)} r="10" style={{ fill: 'none', stroke: 'var(--texto-3)', strokeWidth: 1.5, strokeDasharray: '3 3' }} />
              ),
            )}
          </g>
        ))}
      </svg>
      <figcaption>
        <span>
          <strong>GLP-1</strong>: menos fome, estômago mais lento, insulina.
        </span>
        <span>
          <strong>GIP</strong>: reforça a insulina; age na gordura e no cérebro.
        </span>
        <span>
          <strong>Glucagon</strong>: fígado queima gordura e gasta mais energia.
        </span>
        <span className="mudo">Círculo cheio: o remédio ativa o receptor. Tracejado: não ativa.</span>
      </figcaption>
    </figure>
  );
}

function Secao({ secao }: { secao: SecaoRetatrutida }) {
  const titulo = `titulo-${secao.id}`;
  return (
    <section id={idSecao(secao.id)} className="cartao leitura" aria-labelledby={titulo}>
      <h2 id={titulo} tabIndex={-1} data-foco>
        {secao.titulo}
      </h2>
      {secao.resumo && <p className="resumo-leitura">{secao.resumo}</p>}
      <div className="blocos-leitura">
        {secao.blocos.map((b, i) => (
          <Fragment key={i}>
            <Bloco bloco={b} secao={secao} />
            {secao.id === 'tres-receptores' && i === 0 && <DiagramaReceptores />}
          </Fragment>
        ))}
      </div>
      <LinkInterno para={ID_INDICE} className="voltar-indice">
        ↑ Voltar ao índice
      </LinkInterno>
    </section>
  );
}

/** Texto do link da referência: o site, avisando quando o link é uma busca e não o artigo em si. */
function rotuloLink(url: string): { site: string; busca: boolean } {
  try {
    const u = new URL(url);
    const busca = /search/i.test(u.pathname) || /[?&](term|query|search_api_fulltext)=/.test(u.search);
    return { site: u.hostname.replace(/^www\./, ''), busca };
  } catch {
    return { site: url, busca: false };
  }
}

function LinkReferencia({ url }: { url: string }) {
  const { site, busca } = rotuloLink(url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {busca && 'busca em '}
      {/* O endereço não quebra no meio; "busca em" pode ir para a linha de cima */}
      <span className="sem-quebra">{site} ↗</span>
    </a>
  );
}

export function Retatrutida() {
  const c = conteudo;
  const extras = [
    { id: 'glossario', titulo: 'Glossário' },
    { id: 'referencias', titulo: 'Referências' },
  ];
  return (
    <div className="pilha pagina-leitura">
      <div className="alerta" role="note">
        <p>
          <strong>Atenção. </strong>
          <Texto texto={c.aviso} />
        </p>
      </div>
      <p className="mudo">Conteúdo educativo · atualizado em {formatarData(c.atualizado_em)}</p>

      <nav id={ID_INDICE} className="cartao leitura" aria-labelledby="titulo-indice">
        <h2 id="titulo-indice" tabIndex={-1} data-foco>
          Nesta página
        </h2>
        <ol className="indice-leitura">
          {c.secoes.map((s) => (
            <li key={s.id}>
              <LinkInterno para={idSecao(s.id)}>{s.titulo}</LinkInterno>
            </li>
          ))}
          {extras.map((s) => (
            <li key={s.id}>
              <LinkInterno para={idSecao(s.id)}>{s.titulo}</LinkInterno>
            </li>
          ))}
        </ol>
      </nav>

      {c.secoes.map((s) => (
        <Secao key={s.id} secao={s} />
      ))}

      <section id={idSecao('glossario')} className="cartao leitura" aria-labelledby="titulo-glossario">
        <h2 id="titulo-glossario" tabIndex={-1} data-foco>
          Glossário
        </h2>
        <dl className="glossario">
          {c.glossario.map((g) => (
            <div key={g.termo}>
              <dt>{g.termo}</dt>
              <dd>
                <Texto texto={g.definicao} />
              </dd>
            </div>
          ))}
        </dl>
        <LinkInterno para={ID_INDICE} className="voltar-indice">
          ↑ Voltar ao índice
        </LinkInterno>
      </section>

      <section id={idSecao('referencias')} className="cartao leitura" aria-labelledby="titulo-referencias">
        <h2 id="titulo-referencias" tabIndex={-1} data-foco>
          Referências
        </h2>
        <ol className="referencias">
          {c.referencias.map((r) => (
            <li key={r.n} id={idRef(r.n)} value={r.n} tabIndex={-1}>
              <span className="ref-num">{r.n}.</span>
              <span className="ref-texto">
                {r.texto}
                {r.url && (
                  <>
                    {' '}
                    <LinkReferencia url={r.url} />
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
        <LinkInterno para={ID_INDICE} className="voltar-indice">
          ↑ Voltar ao índice
        </LinkInterno>
      </section>
    </div>
  );
}

export default Retatrutida;
