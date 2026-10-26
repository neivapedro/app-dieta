import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import {
  aoMudarFotos,
  apagarFoto,
  atualizarFoto,
  blobDaFoto,
  blobDaMiniatura,
  bytesDaFoto,
  guardarMiniatura,
  listarFotos,
  salvarFoto,
  type FotoGuardada,
} from '../dados/fotos';
import { useCalculos } from '../dados/useCalculos';
import { useProjeto } from '../dados/useProjeto';
import { formatarData } from '../lib/datas';
import { corVariacao } from '../lib/formato';
import {
  conflitoDataSessao,
  dataDaSessao,
  DIAS_MEDICAO_FOTO,
  fotosDaSessao,
  idsDosPares,
  medicaoProxima,
  numerosDaMedicao,
  periodoDaSessao,
  ROTULO_FOTO,
  ROTULO_SESSAO,
  ROTULOS,
  SESSOES,
  textoTamanho,
  type Rotulo,
  type Sessao,
} from '../lib/fotos';
import { MDC, type Composicao } from '../lib/gordura';
import {
  LADO_GRADE_PDF,
  LADO_MINIATURA,
  LADO_PDF,
  prepararFoto,
  QUALIDADE_GRADE_PDF,
  QUALIDADE_MINIATURA,
  QUALIDADE_PDF,
  reduzirImagem,
} from '../lib/imagem';
import type { ImagemPdf } from '../lib/relatorioPdf';
import {
  alternarZoom,
  ampliada,
  areaConteudo,
  assentarVista,
  limitarVista,
  textoEscala,
  VISTA_INICIAL,
  vistaDaPinca,
  type Ponto,
  type Vista,
} from '../lib/zoom';
import { ComparadorFotos } from './medidas-comparador';
import { BotaoExcluir, Campo, Escolhas, Folha } from './ui';

export interface FotoTela extends FotoGuardada {
  /** Endereço temporário da imagem inteira (visualizador) */
  url: string;
  /** Endereço da miniatura (galeria); sem miniatura, o da imagem inteira */
  mini: string;
}

/**
 * Fotos da conta guardadas neste aparelho, em ordem (data e ordem de adição).
 * Atualiza sozinho quando uma foto é salva, mudada ou apagada (em qualquer
 * tela) e ao trocar de conta. Com `miniaturas`, cria aos poucos a miniatura das
 * fotos que não têm (migradas do formato antigo ou vindas de um backup).
 */
export function useFotos(opcoes?: { miniaturas?: boolean }) {
  const { usuario } = useDados();
  const id = usuario?.id ?? null;
  const gerar = !!opcoes?.miniaturas;
  const [estado, setEstado] = useState<{ dono: string | null; fotos: FotoTela[]; carregando: boolean; erro: string | null }>({
    dono: null,
    fotos: [],
    carregando: true,
    erro: null,
  });
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    // Endereços por chave: a imagem de uma foto não muda, então recarregar não pisca a galeria
    const urls = new Map<string, string>();
    const endereco = (chave: string, blob: () => Blob) => {
      let u = urls.get(chave);
      if (!u) urls.set(chave, (u = URL.createObjectURL(blob())));
      return u;
    };
    const falhou = new Set<string>();
    let gerando = false;
    async function criarMiniaturas(lista: FotoGuardada[]) {
      const faltam = lista.filter((f) => !f.miniatura && !falhou.has(f.chave));
      if (!gerar || gerando || !faltam.length) return;
      gerando = true;
      // Uma de cada vez: o iPhone tem pouca memória para canvas
      for (const f of faltam) {
        if (!vivo) break;
        try {
          const r = await reduzirImagem(blobDaFoto(f), LADO_MINIATURA, QUALIDADE_MINIATURA);
          await guardarMiniatura(f.usuario, f.id, r.blob);
        } catch {
          falhou.add(f.chave);
        }
      }
      gerando = false;
      if (vivo) void carregar();
    }
    const carregar = () =>
      listarFotos(id)
        .then((lista) => {
          if (!vivo) return;
          const usadas = new Set<string>();
          const fotos = lista.map((f) => {
            const url = endereco(f.chave, () => blobDaFoto(f));
            usadas.add(f.chave);
            let mini = url;
            if (f.miniatura) {
              mini = endereco(`${f.chave}#mini`, () => blobDaMiniatura(f));
              usadas.add(`${f.chave}#mini`);
            }
            return { ...f, url, mini };
          });
          for (const [k, u] of urls)
            if (!usadas.has(k)) {
              URL.revokeObjectURL(u);
              urls.delete(k);
            }
          setEstado({ dono: id, fotos, carregando: false, erro: null });
          void criarMiniaturas(lista);
        })
        .catch((e: Error) => vivo && setEstado({ dono: id, fotos: [], carregando: false, erro: e.message }));
    void carregar();
    const parar = aoMudarFotos(() => void carregar());
    return () => {
      vivo = false;
      parar();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [id, gerar]);
  // Outra conta: nada da anterior aparece, nem por um instante
  return estado.dono === id ? estado : { dono: id, fotos: [] as FotoTela[], carregando: true, erro: null };
}

const fotosTexto = (n: number) => `${n} ${n === 1 ? 'foto' : 'fotos'}`;

function NumerosSessao({
  c,
  base,
  data,
  feminino,
  origem,
}: {
  c: Composicao | null;
  base: Composicao | null;
  data: string | null;
  feminino: boolean;
  /** De qual foto vem a data (ex.: "Foto mais recente, 10/09/26") */
  origem?: string;
}) {
  if (!data) return null;
  if (!c) return <p className="mudo fotos-numeros">{origem ? `${origem}: sem` : 'Sem'} medição até {DIAS_MEDICAO_FOTO} dias da foto.</p>;
  const comparar = base && base.data !== c.data ? base : null;
  const medicao = c.data === data ? 'medição do dia' : `medição de ${formatarData(c.data, true)}`;
  return (
    <div className="fotos-numeros">
      <div className="mudo">
        {origem ? `${origem} · ${medicao}` : medicao.charAt(0).toUpperCase() + medicao.slice(1)}
        {comparar ? ` · variação desde o Antes (medição de ${formatarData(comparar.data, true)})` : ''}
      </div>
      <div className="fotos-numeros-grade">
        {numerosDaMedicao(c, feminino, comparar).map((n) => (
          <div key={n.chave} className="fotos-numero">
            <span className="texto-2">{n.rotulo}</span>
            <b>{n.valor}</b>
            {n.variacao !== undefined && <span className={`sub-valor ${corVariacao(n.delta, true, MDC[n.chave])}`}>{n.variacao}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fotos escolhidas de uma vez para uma sessão, salvas uma a uma. */
interface Lote {
  /** Identifica o lote (as atualizações de um lote antigo não mexem num novo) */
  id: number;
  usuario: string;
  sessao: Sessao;
  arquivos: File[];
  fase: 'escolher' | 'salvando' | 'fim';
  /** Foto sendo salva agora (1, 2, ...) */
  atual: number;
  salvas: number;
  erros: { nome: string; motivo: string }[];
  /** Folha visível (dá para fechar enquanto salva: o card mostra o progresso) */
  aberta: boolean;
  /** A pessoa tocou em Parar: termina a foto atual e não salva as seguintes */
  parar?: boolean;
  /** Quantas ficaram sem salvar por causa do Parar */
  paradas: number;
}

// O lote em andamento fica fora do cartão: sair da aba Medidas no meio do
// salvamento não perde o progresso nem a lista das fotos com problema.
let loteAtual: Lote | null = null;
let proximoLote = 1;
const ouvintesLote = new Set<() => void>();
function mudarLote(mudanca: Lote | null | ((l: Lote | null) => Lote | null)) {
  loteAtual = typeof mudanca === 'function' ? mudanca(loteAtual) : mudanca;
  for (const cb of ouvintesLote) cb();
}
function useLote(): Lote | null {
  return useSyncExternalStore(
    (cb) => {
      ouvintesLote.add(cb);
      return () => ouvintesLote.delete(cb);
    },
    () => loteAtual,
  );
}

const OPCOES_ROTULO = ROTULOS.map((r) => ({ valor: r, rotulo: r === 'outra' ? 'Sem rótulo / Outra' : ROTULO_FOTO[r] }));
const OPCOES_ROTULO_CURTAS = ROTULOS.map((r) => ({ valor: r, rotulo: ROTULO_FOTO[r] }));

/**
 * Cartão "Fotos: antes e depois" da aba Medidas: uma galeria por sessão (quantas
 * fotos a pessoa quiser), com os números da medição mais próxima da foto mais
 * recente de cada sessão.
 */
export function CartaoFotos() {
  const { usuario, perfil, hoje } = useDados();
  const { composicoes } = useCalculos();
  const proj = useProjeto();
  const { fotos, carregando, erro } = useFotos({ miniaturas: true });
  const feminino = perfil?.sexo === 'Feminino';
  const entrada = useRef<HTMLInputElement>(null);
  const alvo = useRef<Sessao | null>(null);
  const loteGlobal = useLote();
  // Lote de outra conta (trocou de conta no meio) não aparece aqui
  const lote = loteGlobal && loteGlobal.usuario === usuario?.id ? loteGlobal : null;
  const [msg, setMsg] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null);
  const [vendo, setVendo] = useState<string | null>(null);
  if (!usuario) return null;
  const usuarioId = usuario.id;

  function adicionar(sessao: Sessao) {
    setMsg(null);
    alvo.current = sessao;
    entrada.current?.click();
  }

  function aoEscolher(lista: FileList | null) {
    const sessao = alvo.current;
    const arquivos = lista ? Array.from(lista) : [];
    if (entrada.current) entrada.current.value = '';
    if (!sessao || !arquivos.length) return;
    mudarLote({ id: proximoLote++, usuario: usuarioId, sessao, arquivos, fase: 'escolher', atual: 0, salvas: 0, erros: [], aberta: true, paradas: 0 });
  }

  async function salvarLote(l: Lote, data: string, rotulo: Rotulo) {
    const erros: Lote['erros'] = [];
    let salvas = 0;
    let paradas = 0;
    // Só mexe neste lote (um lote novo, de outra conta, fica como está)
    const mudar = (fn: (x: Lote) => Lote) => mudarLote((x) => (x && x.id === l.id ? fn(x) : x));
    for (let i = 0; i < l.arquivos.length; i++) {
      if (loteAtual?.id === l.id && loteAtual.parar) {
        paradas = l.arquivos.length - i;
        break;
      }
      const arquivo = l.arquivos[i];
      mudar((x) => ({ ...x, fase: 'salvando', atual: i + 1 }));
      try {
        const imagem = await prepararFoto(arquivo);
        // Miniatura para a galeria (sem ela, a galeria usa a foto inteira)
        const mini = await reduzirImagem(imagem.blob, LADO_MINIATURA, QUALIDADE_MINIATURA).catch(() => null);
        await salvarFoto(usuarioId, { sessao: l.sessao, rotulo, data, blob: imagem.blob, largura: imagem.largura, altura: imagem.altura, miniatura: mini?.blob });
        salvas++;
      } catch (e) {
        // Uma foto com problema não perde as outras
        erros.push({ nome: arquivo.name || `Foto ${i + 1}`, motivo: (e as Error).message });
      }
      mudar((x) => ({ ...x, salvas, erros: [...erros] }));
      // Deixa a tela respirar entre uma foto e outra
      await new Promise((ok) => setTimeout(ok, 0));
    }
    const onde = ROTULO_SESSAO[l.sessao];
    if (!erros.length && !paradas) {
      mudarLote((x) => (x && x.id === l.id ? null : x));
      setMsg({ tipo: 'info', texto: salvas === 1 ? `Foto salva no ${onde}.` : `${salvas} fotos salvas no ${onde}.` });
    } else mudar((x) => ({ ...x, fase: 'fim', aberta: true, paradas }));
  }

  const depoisFeitas = fotos.filter((f) => f.sessao === 'depois').length;
  // Fim do remédio (última dose aplicada, plano concluído ou fase pós-remédio): hora do depois
  const horaDoDepois = !!proj?.concluido && depoisFeitas === 0;
  const medicoes = SESSOES.map((s) => {
    const data = dataDaSessao(fotos, s);
    return { s, data, c: data ? medicaoProxima(composicoes, data) : null };
  });
  const bytes = fotos.reduce((t, f) => t + bytesDaFoto(f), 0);
  const vista = vendo ? fotos.find((f) => f.id === vendo) : undefined;
  const salvando = lote && lote.fase === 'salvando' ? lote : null;

  const comNumeros = medicoes.some((m) => m.data);
  return (
    <section className="cartao pilha fotos-cartao" style={{ gap: 12 }}>
      <div className="secao-cab" style={{ marginBottom: 0 }}>
        <div className="cresce">
          <h2>Fotos: antes e depois</h2>
          <div className="secao-sub">
            {fotos.length ? `${fotosTexto(fotos.length)} · ~${textoTamanho(bytes)} neste aparelho` : 'Frente, lado e costas, nas mesmas condições'}
          </div>
        </div>
        {horaDoDepois && <span className="etiqueta aviso">fim do ciclo</span>}
      </div>
      {horaDoDepois && (
        <div className="alerta">
          <div>
            <b>Tire as fotos do depois.</b> O remédio chegou ao fim: frente, lado e costas (e outras, se quiser), nas mesmas condições das do antes.
            Elas podem ir no PDF final (opção na Análise).
          </div>
        </div>
      )}
      {erro && <div className="alerta erro">{erro}</div>}
      {!carregando && !erro && <ComparadorFotos fotos={fotos} composicoes={composicoes} feminino={feminino} />}
      {!carregando && !erro && (
        <div className="pilha" style={{ gap: 14 }}>
          {medicoes.map(({ s }) => {
            const daSessao = fotosDaSessao(fotos, s);
            const periodo = periodoDaSessao(fotos, s);
            const ocupado = salvando?.sessao === s;
            return (
              <div key={s} className="fotos-sessao">
                <div className="fotos-cab">
                  <b>{ROTULO_SESSAO[s]}</b>
                  {periodo && (
                    <span className="mudo">
                      {fotosTexto(daSessao.length)} ·{' '}
                      {periodo.primeira === periodo.ultima
                        ? formatarData(periodo.primeira, true)
                        : `${formatarData(periodo.primeira, true)} a ${formatarData(periodo.ultima, true)}`}
                    </span>
                  )}
                </div>
                <div className="fotos-grade">
                  {daSessao.map((f, i) => (
                    <button
                      key={f.id}
                      type="button"
                      className="foto-slot cheio"
                      aria-label={`${ROTULO_SESSAO[s]}, foto ${i + 1} de ${daSessao.length}: ${f.rotulo === 'outra' ? 'sem rótulo' : ROTULO_FOTO[f.rotulo]}, ${formatarData(f.data, true)}`}
                      onClick={() => {
                        setMsg(null);
                        setVendo(f.id);
                      }}
                    >
                      <img src={f.mini} alt="" loading="lazy" decoding="async" />
                      {f.rotulo !== 'outra' && <span className="foto-pose">{ROTULO_FOTO[f.rotulo]}</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`foto-slot foto-adicionar ${s === 'depois' && horaDoDepois ? 'destaque' : ''}`}
                    aria-label={`Adicionar fotos ao ${ROTULO_SESSAO[s]}`}
                    disabled={!!lote}
                    onClick={() => adicionar(s)}
                  >
                    <span className="foto-mais">{ocupado ? '…' : '+'}</span>
                    <span className="foto-adicionar-texto">{ocupado ? `Salvando ${salvando.atual} de ${salvando.arquivos.length}…` : daSessao.length ? 'Mais fotos' : 'Adicionar fotos'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Com a folha de uma foto aberta, o erro aparece só nela */}
      {msg && !vendo && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
      {!carregando && !erro && comNumeros && (
        <details className="tabela-detalhe" style={{ marginTop: 0 }}>
          <summary>Números das fotos</summary>
          <div className="pilha" style={{ gap: 12 }}>
            {medicoes.map(({ s, data, c }) =>
              data ? (
                <div key={s} className="fotos-sessao">
                  <b>{ROTULO_SESSAO[s]}</b>
                  <NumerosSessao
                    c={c}
                    base={s === 'depois' ? (medicoes[0].c ?? null) : null}
                    data={data}
                    feminino={feminino}
                    origem={`${fotosDaSessao(fotos, s).length > 1 ? 'Foto mais recente' : 'Foto'} de ${formatarData(data, true)}`}
                  />
                </div>
              ) : null,
            )}
          </div>
        </details>
      )}
      <details className="tabela-detalhe" style={{ marginTop: 0 }}>
        <summary>Como tirar e guardar</summary>
        <div className="pilha" style={{ gap: 8 }}>
          <p className="mudo" style={{ margin: 0 }}>
            Para comparar: mesma luz, mesmo lugar, mesma distância, de manhã em jejum, roupa parecida. Marque Frente, Lado ou Costas para formar os pares
            Antes × Depois do comparador e do PDF. O Depois pode ser preenchido a qualquer momento.
          </p>
          <p className="mudo" style={{ margin: 0 }}>
            No comparador, arraste a linha para o lado (ou toque num ponto da foto) para ver mais do Antes ou do Depois.
          </p>
        </div>
      </details>
      <p className="mudo" style={{ margin: 0 }}>
        As fotos ficam só neste aparelho. Para não perder ao trocar de celular, faça o backup no <Link to="/perfil">Perfil</Link> (com as fotos).
      </p>
      {/* Várias de uma vez; sem "capture": o iPhone oferece a câmera e a galeria */}
      <input ref={entrada} type="file" accept="image/*" multiple className="oculto" onChange={(e) => aoEscolher(e.target.files)} />

      {lote && lote.aberta && (
        <FolhaLote
          lote={lote}
          hoje={hoje}
          conferir={(data) => conflitoDataSessao(fotos, lote.sessao, data)}
          aoFechar={() => {
            if (lote.fase === 'salvando') mudarLote((x) => x && { ...x, aberta: false });
            else mudarLote(null);
          }}
          aoParar={() => mudarLote((x) => x && { ...x, parar: true })}
          aoSalvar={(data, rotulo) => void salvarLote(lote, data, rotulo)}
        />
      )}
      {vista && (
        <Visualizador
          vista={vista}
          fotos={fotos}
          composicoes={composicoes}
          feminino={feminino}
          hoje={hoje}
          usuario={usuarioId}
          aoIr={setVendo}
          aoFechar={() => setVendo(null)}
        />
      )}
    </section>
  );
}

/** Folha das fotos escolhidas: pergunta uma vez a data e o rótulo do lote e mostra o progresso. */
function FolhaLote({
  lote,
  hoje,
  conferir,
  aoFechar,
  aoSalvar,
  aoParar,
}: {
  lote: Lote;
  hoje: string;
  /** Erro de data (ex.: Depois antes do Antes) ou null */
  conferir: (data: string) => string | null;
  aoFechar: () => void;
  aoSalvar: (data: string, rotulo: Rotulo) => void;
  aoParar: () => void;
}) {
  const [data, setData] = useState(hoje);
  const [rotulo, setRotulo] = useState<Rotulo>('outra');
  const [erro, setErro] = useState<string | null>(null);
  const n = lote.arquivos.length;
  const onde = ROTULO_SESSAO[lote.sessao];

  function salvar() {
    if (!data || data > hoje) return setErro('Informe a data das fotos (até hoje).');
    const conflito = conferir(data);
    if (conflito) return setErro(conflito);
    setErro(null);
    aoSalvar(data, rotulo);
  }

  return (
    <Folha titulo={n === 1 ? `Nova foto · ${onde}` : `${n} fotos novas · ${onde}`} aoFechar={aoFechar}>
      {lote.fase === 'escolher' && (
        <div className="pilha" style={{ gap: 12 }}>
          <Campo
            rotulo={n === 1 ? 'Data da foto' : 'Data das fotos'}
            dica={`${n === 1 ? '' : `Vale para as ${n} fotos; dá para mudar uma a uma depois. `}Os números vêm da medição mais próxima dessa data (até ${DIAS_MEDICAO_FOTO} dias).`}
          >
            <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo
            rotulo={n === 1 ? 'Pose' : 'Pose (para todas)'}
            grupo
            dica="Frente, Lado e Costas formam os pares Antes × Depois do PDF. Dá para mudar depois, tocando na foto."
          >
            <Escolhas opcoes={OPCOES_ROTULO} valor={rotulo} aoMudar={(v) => v && setRotulo(v)} />
          </Campo>
          {erro && <div className="alerta erro">{erro}</div>}
          <div className="linha">
            <button type="button" className="botao primario" onClick={salvar}>
              {n === 1 ? 'Salvar foto' : `Salvar ${n} fotos`}
            </button>
            <button type="button" className="botao" onClick={aoFechar}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {lote.fase === 'salvando' && (
        <div className="pilha" style={{ gap: 10 }} aria-live="polite">
          <b>
            Salvando {lote.atual} de {n}…
          </b>
          <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={lote.salvas + lote.erros.length}>
            <div style={{ width: `${((lote.salvas + lote.erros.length) / n) * 100}%` }} />
          </div>
          {lote.erros.length > 0 && <p className="mudo">{lote.erros.length} com problema até agora (as outras continuam).</p>}
          <p className="mudo">Pode fechar esta janela: as fotos continuam sendo salvas.</p>
          <button type="button" className="botao" disabled={lote.parar} onClick={aoParar}>
            {lote.parar ? 'Parando depois desta foto…' : 'Parar'}
          </button>
        </div>
      )}
      {lote.fase === 'fim' && (
        <div className="pilha" style={{ gap: 10 }}>
          <p style={{ margin: 0 }}>
            {lote.salvas
              ? `${lote.salvas} de ${n} ${n === 1 ? 'foto salva' : 'fotos salvas'} no ${onde}.`
              : `Nenhuma foto foi salva no ${onde}.`}
          </p>
          {lote.paradas > 0 && (
            <p className="mudo" style={{ margin: 0 }}>
              Você parou: {lote.paradas === 1 ? 'a última não foi salva' : `as ${lote.paradas} últimas não foram salvas`}. As já salvas ficam no {onde}.
            </p>
          )}
          {lote.erros.length > 0 && (
            <div className="alerta erro">
              <div>
                <b>{lote.erros.length === 1 ? 'Esta não entrou:' : `Estas ${lote.erros.length} não entraram:`}</b>
                <ul className="fotos-erros">
                  {lote.erros.map((e, i) => (
                    <li key={i}>
                      <b>{e.nome}</b>: {e.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <button type="button" className="botao" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      )}
    </Folha>
  );
}

/** Foto grande, com data e pose editáveis, apagar e ‹ › para as outras da mesma sessão. */
function Visualizador({
  vista,
  fotos,
  composicoes,
  feminino,
  hoje,
  usuario,
  aoIr,
  aoFechar,
}: {
  vista: FotoTela;
  fotos: FotoTela[];
  composicoes: Composicao[];
  feminino: boolean;
  hoje: string;
  usuario: string;
  aoIr: (id: string) => void;
  aoFechar: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const lista = fotosDaSessao(fotos, vista.sessao);
  const i = lista.findIndex((f) => f.id === vista.id);
  const anterior = i > 0 ? lista[i - 1] : null;
  const proxima = i < lista.length - 1 ? lista[i + 1] : null;
  const ir = (f: FotoTela | null) => {
    if (!f) return;
    setMsg(null);
    aoIr(f.id);
  };
  // Setas do teclado (computador)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' && anterior) aoIr(anterior.id);
      if (e.key === 'ArrowRight' && proxima) aoIr(proxima.id);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [anterior, proxima, aoIr]);

  // Depois: compara com a primeira foto do Antes da mesma pose (como no PDF); sem ela, com a mais recente do Antes
  let base: Composicao | null = null;
  if (vista.sessao === 'depois') {
    const antes = fotosDaSessao(fotos, 'antes');
    const mesma = vista.rotulo !== 'outra' ? antes.find((f) => f.rotulo === vista.rotulo) : undefined;
    const ref = mesma?.data ?? dataDaSessao(fotos, 'antes');
    base = ref ? medicaoProxima(composicoes, ref) : null;
  }

  return (
    <Folha titulo={`${ROTULO_SESSAO[vista.sessao]} · foto ${i + 1} de ${lista.length}`} aoFechar={aoFechar}>
      <div className="pilha" style={{ gap: 10 }}>
        <CarrosselFoto
          key={vista.id}
          atual={vista}
          anterior={anterior}
          proxima={proxima}
          alt={`${ROTULO_SESSAO[vista.sessao]}, ${vista.rotulo === 'outra' ? 'sem rótulo' : ROTULO_FOTO[vista.rotulo]}, ${formatarData(vista.data, true)}`}
          aoIr={ir}
        />
        <p className="mudo dica foto-dica">Dois dedos ou toque duplo para dar zoom.</p>
        {lista.length > 1 && (
          <div className="foto-navegar">
            <button type="button" className="botao pequeno" disabled={!anterior} onClick={() => ir(anterior)} aria-label="Foto anterior">
              ‹ Anterior
            </button>
            <span className="mudo">
              {i + 1} de {lista.length}
            </span>
            <button type="button" className="botao pequeno" disabled={!proxima} onClick={() => ir(proxima)} aria-label="Próxima foto">
              Próxima ›
            </button>
          </div>
        )}
        <Campo rotulo="Pose" grupo>
          <Escolhas
            opcoes={OPCOES_ROTULO_CURTAS}
            valor={vista.rotulo}
            aoMudar={(v) => {
              if (!v || v === vista.rotulo) return;
              setMsg(null);
              void atualizarFoto(usuario, vista.id, { rotulo: v }).catch((x: Error) => setMsg(x.message));
            }}
          />
        </Campo>
        <Campo rotulo="Data da foto">
          <input
            type="date"
            value={vista.data}
            max={hoje}
            onChange={(e) => {
              const d = e.target.value;
              if (!d) return;
              if (d > hoje) return setMsg('A data da foto não pode ser futura.');
              const conflito = conflitoDataSessao(fotos, vista.sessao, d);
              if (conflito) return setMsg(conflito);
              setMsg(null);
              void atualizarFoto(usuario, vista.id, { data: d }).catch((x: Error) => setMsg(x.message));
            }}
          />
        </Campo>
        <NumerosSessao c={medicaoProxima(composicoes, vista.data)} base={base} data={vista.data} feminino={feminino} />
        {msg && <div className="alerta erro">{msg}</div>}
        <div className="linha">
          <BotaoExcluir
            key={vista.id}
            rotulo="Apagar"
            aviso="A foto sai deste aparelho."
            aoConfirmar={() =>
              apagarFoto(usuario, vista.id)
                .then(() => {
                  // Segue para a próxima da sessão (ou a anterior); era a última: fecha
                  const seguinte = proxima ?? anterior;
                  if (seguinte) aoIr(seguinte.id);
                  else aoFechar();
                })
                .catch((x: Error) => setMsg(x.message))
            }
          />
        </div>
      </div>
    </Folha>
  );
}

/** No Balanço do projeto: lembra das fotos do depois enquanto não houver nenhuma. */
export function LembreteFotosDepois() {
  const { fotos, carregando, erro } = useFotos();
  if (carregando || erro) return null;
  const feitas = fotos.filter((f) => f.sessao === 'depois').length;
  if (feitas) return <p className="mudo">Fotos do depois: {fotosTexto(feitas)}. Elas podem ir no PDF final (opção na Análise).</p>;
  return (
    <div className="alerta info">
      <div>
        <b>Tire as fotos do depois</b>: frente, lado e costas (e outras, se quiser), nas mesmas condições das do antes.{' '}
        <Link to="/medidas">Abrir em Medidas</Link>
      </div>
    </div>
  );
}

/**
 * Fotos reduzidas para o PDF (JPEG menor), por id: as dos pares Antes × Depois
 * maiores, as da grade "Outras fotos" menores.
 */
export async function prepararFotosPdf(fotos: FotoGuardada[]): Promise<Map<string, ImagemPdf>> {
  const mapa = new Map<string, ImagemPdf>();
  const pares = idsDosPares(fotos);
  // Uma de cada vez: o iPhone tem pouca memória para canvas
  for (const f of fotos) {
    const par = pares.has(f.id);
    const r = await reduzirImagem(blobDaFoto(f), par ? LADO_PDF : LADO_GRADE_PDF, par ? QUALIDADE_PDF : QUALIDADE_GRADE_PDF);
    mapa.set(f.id, { dados: new Uint8Array(await r.blob.arrayBuffer()), largura: r.largura, altura: r.altura });
  }
  return mapa;
}

/**
 * Foto que acompanha o dedo, como num feed: só ela anda para o lado (a página
 * fica parada). A vizinha aparece na borda e, ao soltar depois de um terço da
 * largura (ou num gesto rápido), a troca termina com animação.
 *
 * Zoom só na foto atual: pinça (1× a 4×, no meio dos dedos) ou toque duplo
 * (2,5× no ponto tocado / volta ao normal). Ampliada, um dedo arrasta a foto e
 * a troca de foto e a rolagem da folha ficam desligadas. Trocar de foto volta
 * ao normal (o componente é recriado a cada foto).
 */
function CarrosselFoto({
  atual,
  anterior,
  proxima,
  alt,
  aoIr,
}: {
  atual: FotoTela;
  anterior: FotoTela | null;
  proxima: FotoTela | null;
  alt: string;
  aoIr: (f: FotoTela | null) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const foto = useRef<HTMLImageElement>(null);
  const gesto = useRef<{ x: number; y: number; t: number; horizontal: boolean | null } | null>(null);
  const [dx, setDx] = useState(0);
  // Deslocamento da faixa também num ref (a pinça que começa no meio de um deslize precisa do valor mais novo)
  const dxAtual = useRef(0);
  const [indo, setIndo] = useState<'anterior' | 'proxima' | null>(null);

  // Zoom: a vista fica também num ref para os eventos lerem o valor mais novo
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const [animar, setAnimar] = useState(false);
  const vistaAtual = useRef<Vista>(VISTA_INICIAL);
  const animando = useRef(false);
  // Dedos (ou mouse) do gesto da foto, na posição da tela (inclui dedo que caiu fora dela durante a pinça)
  const dedos = useRef(new Map<number, Ponto>());
  // Todos os dedos na tela agora (um dedo pode cair fora da foto, na dica logo abaixo, e ainda fazer parte da pinça)
  const naTela = useRef(new Map<number, Ponto>());
  // Toques (TouchEvent) que começaram na foto: só eles fazem a página ficar parada
  const nossos = useRef(new Set<number>());
  // Arraste da foto ampliada (livre: o que sobrou de uma pinça, sem limite até soltar) ou pinça em andamento
  const mao = useRef<
    | { tipo: 'arraste'; id: number; p0: Ponto; v0: Vista; livre: boolean; ancora0?: Ponto }
    | { tipo: 'pinca'; meio0: Ponto; dist0: number; v0: Vista; meio: Ponto }
    | null
  >(null);
  // Depois de uma pinça, segura a folha até soltar todos os dedos
  const segurar = useRef(false);
  // Para reconhecer o toque duplo
  const toque = useRef<{ x: number; y: number; t: number; mexeu: boolean; varios: boolean } | null>(null);
  const ultimoToque = useRef<{ x: number; y: number; t: number } | null>(null);
  const duploEm = useRef(-Infinity);

  const mudarVista = (v: Vista, comAnimacao = false) => {
    vistaAtual.current = v;
    animando.current = comAnimacao;
    setVista(v);
    setAnimar(comAnimacao);
  };
  const mudarDx = (v: number) => {
    dxAtual.current = v;
    setDx(v);
  };

  // Garantia: se o navegador não avisar o fim da animação, troca assim mesmo
  useEffect(() => {
    if (!indo) return;
    const t = setTimeout(() => aoIr(indo === 'proxima' ? proxima : anterior), 400);
    return () => clearTimeout(t);
  }, [indo, aoIr, proxima, anterior]);

  // Fim da animação do zoom (0,25 s): desliga a transição
  useEffect(() => {
    if (!animar) return;
    const t = setTimeout(() => {
      animando.current = false;
      setAnimar(false);
    }, 300);
    return () => clearTimeout(t);
  }, [animar, vista]);

  const largura = () => caixa.current?.clientWidth ?? 1;
  const terminar = (x: number, t: number) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g || !g.horizontal) return mudarDx(0);
    const desloc = x - g.x;
    const rapido = Math.abs(desloc) / Math.max(t - g.t, 1) > 0.5;
    const passou = Math.abs(desloc) > largura() / 3 || (rapido && Math.abs(desloc) > 30);
    if (passou && desloc < 0 && proxima) return setIndo('proxima');
    if (passou && desloc > 0 && anterior) return setIndo('anterior');
    mudarDx(0);
  };

  // Ponto da tela → px relativos à foto sem transformação (ela fica no canto da caixa)
  const local = (p: Ponto): Ponto => {
    const r = caixa.current?.getBoundingClientRect();
    return r ? { x: p.x - r.left, y: p.y - r.top } : p;
  };
  // Janela (a própria foto, sem zoom) e o desenho dentro dela (object-fit: contain deixa faixas)
  const medidas = () => {
    const img = foto.current;
    const janela = { w: img?.offsetWidth || 1, h: img?.offsetHeight || 1 };
    return { janela, conteudo: areaConteudo(janela, { w: img?.naturalWidth ?? 0, h: img?.naturalHeight ?? 0 }) };
  };
  // Animação do zoom em andamento: para onde a foto está agora (o gesto novo continua dali, sem pulo)
  const congelar = () => {
    if (!animando.current) return;
    const img = foto.current;
    const t = img ? getComputedStyle(img).transform : 'none';
    let v = vistaAtual.current;
    if (t && t !== 'none' && typeof DOMMatrixReadOnly !== 'undefined') {
      try {
        const m = new DOMMatrixReadOnly(t);
        v = { x: m.e, y: m.f, s: m.a };
      } catch {
        // fica com o alvo da animação
      }
    }
    mudarVista(v);
  };
  const doisDedos = () => {
    const [a, b] = [...dedos.current.values()];
    return { meio: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const comecarPinca = () => {
    congelar();
    const { meio, dist } = doisDedos();
    mao.current = { tipo: 'pinca', meio0: meio, dist0: dist, v0: vistaAtual.current, meio };
    segurar.current = true;
  };
  const comecarArraste = (id: number, livre: boolean, ancora0?: Ponto) => {
    congelar();
    const p = dedos.current.get(id);
    if (!p) return;
    mao.current = { tipo: 'arraste', id, p0: p, v0: vistaAtual.current, livre, ancora0 };
    try {
      caixa.current?.setPointerCapture?.(id);
    } catch {
      // o ponteiro já não está ativo
    }
  };
  // Fim do gesto: volta para 1×–4× e para dentro das bordas, com animação (se estiver fora)
  const assentar = (p?: Ponto) => {
    const { janela, conteudo } = medidas();
    const v = vistaAtual.current;
    const alvo = assentarVista(v, janela, conteudo, p);
    if (Math.abs(alvo.x - v.x) > 0.5 || Math.abs(alvo.y - v.y) > 0.5 || Math.abs(alvo.s - v.s) > 0.001) mudarVista(alvo, true);
  };

  type EventoDedo = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'timeStamp' | 'isPrimary' | 'pointerType' | 'button'>;

  const baixar = (e: EventoDedo) => {
    if (indo) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Primeiro dedo de um toque novo: esquece restos de um gesto perdido
    if (e.isPrimary) {
      dedos.current.clear();
      mao.current = null;
      gesto.current = null;
    }
    // Dedo que já estava na tela fora da foto (ex.: na dica): entra no gesto, para a pinça valer
    if (e.pointerType !== 'mouse') {
      for (const [id, p] of naTela.current) if (id !== e.pointerId && !dedos.current.has(id)) dedos.current.set(id, p);
    }
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.current.size === 1) {
      toque.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, mexeu: false, varios: false };
      // Ampliada: o dedo arrasta a foto (sem trocar de foto)
      if (ampliada(vistaAtual.current)) comecarArraste(e.pointerId, false);
      else gesto.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, horizontal: null };
    } else if (dedos.current.size === 2) {
      if (toque.current) toque.current.varios = true;
      // Segundo dedo: a troca de foto para e começa a pinça. A foto fica onde está
      // (o deslocamento da faixa passa para a própria foto, que depois assenta).
      if (gesto.current) {
        gesto.current = null;
        if (dxAtual.current) {
          const v = vistaAtual.current;
          mudarVista({ ...v, x: v.x + dxAtual.current });
          mudarDx(0);
        }
      }
      comecarPinca();
    }
  };

  const mover = (e: EventoDedo) => {
    if (!dedos.current.has(e.pointerId)) return;
    const p = { x: e.clientX, y: e.clientY };
    dedos.current.set(e.pointerId, p);
    const tq = toque.current;
    if (tq && Math.hypot(p.x - tq.x, p.y - tq.y) > 10) tq.mexeu = true;

    const m = mao.current;
    if (m?.tipo === 'pinca') {
      if (dedos.current.size < 2) return;
      const { meio, dist } = doisDedos();
      m.meio = meio;
      mudarVista(vistaDaPinca(m.v0, m.meio0, m.dist0, meio, dist));
      return;
    }
    if (m?.tipo === 'arraste') {
      if (m.id !== e.pointerId) return;
      const v = { x: m.v0.x + p.x - m.p0.x, y: m.v0.y + p.y - m.p0.y, s: m.v0.s };
      if (m.livre) return mudarVista(v);
      const { janela, conteudo } = medidas();
      mudarVista(limitarVista(v, janela, conteudo));
      return;
    }

    const g = gesto.current;
    if (!g) return;
    const ddx = e.clientX - g.x;
    const ddy = e.clientY - g.y;
    // Decide no começo se o gesto é para o lado (troca de foto) ou para cima/baixo (rolar a folha)
    if (g.horizontal === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) {
      g.horizontal = Math.abs(ddx) > Math.abs(ddy);
      if (g.horizontal) {
        try {
          caixa.current?.setPointerCapture?.(e.pointerId);
        } catch {
          // sem captura: segue assim mesmo
        }
      }
    }
    if (!g.horizontal) return;
    // Na primeira ou na última foto, o arraste resiste (não há vizinha)
    const semVizinha = (ddx > 0 && !anterior) || (ddx < 0 && !proxima);
    mudarDx(semVizinha ? ddx * 0.25 : ddx);
  };

  // A pinça perdeu um dedo: o que sobrou continua arrastando de onde a foto está (sem pulo); assenta ao soltar
  const sobrouUm = (meio: Ponto) => {
    mao.current = null;
    const [resto] = [...dedos.current.keys()];
    if (resto !== undefined) comecarArraste(resto, true, meio);
  };

  const soltar = (e: EventoDedo) => {
    if (!dedos.current.has(e.pointerId)) return;
    dedos.current.delete(e.pointerId);
    const m = mao.current;
    let ancora: Ponto | undefined;
    if (m?.tipo === 'pinca') {
      ancora = m.meio;
      if (dedos.current.size >= 2) comecarPinca();
      else sobrouUm(m.meio);
    } else if (m?.tipo === 'arraste') {
      if (m.id === e.pointerId) {
        mao.current = null;
        // O meio da pinça (andou junto com o dedo que sobrou) ou o próprio dedo
        ancora = m.ancora0 ? { x: m.ancora0.x + e.clientX - m.p0.x, y: m.ancora0.y + e.clientY - m.p0.y } : local({ x: e.clientX, y: e.clientY });
      }
    } else if (gesto.current) terminar(e.clientX, e.timeStamp);

    if (dedos.current.size > 0) return;
    // Soltou todos os dedos
    mao.current = null;
    segurar.current = false;
    const tq = toque.current;
    toque.current = null;
    // Toque duplo: dois toques curtos, parados e perto um do outro
    if (tq && !tq.mexeu && !tq.varios && e.timeStamp - tq.t < 350) {
      const ult = ultimoToque.current;
      if (ult && e.timeStamp - ult.t < 400 && Math.hypot(e.clientX - ult.x, e.clientY - ult.y) < 40) {
        ultimoToque.current = null;
        duploEm.current = e.timeStamp;
        const { janela, conteudo } = medidas();
        mudarVista(alternarZoom(vistaAtual.current, local({ x: e.clientX, y: e.clientY }), janela, conteudo), true);
        return;
      }
      ultimoToque.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    } else ultimoToque.current = null;
    assentar(ancora);
  };

  const cancelar = (e: EventoDedo) => {
    dedos.current.delete(e.pointerId);
    gesto.current = null;
    toque.current = null;
    ultimoToque.current = null;
    mudarDx(0);
    const m = mao.current;
    if (dedos.current.size === 0) {
      segurar.current = false;
      mao.current = null;
      if (m) assentar(m.tipo === 'pinca' ? m.meio : undefined);
    } else if (m?.tipo === 'pinca' && dedos.current.size < 2) sobrouUm(m.meio);
    else if (m?.tipo === 'arraste' && m.id === e.pointerId) mao.current = null;
  };

  // Os ouvintes do documento chamam sempre as funções do último render
  const manip = useRef({ baixar, mover, soltar, cancelar });
  manip.current = { baixar, mover, soltar, cancelar };

  // Ouvintes nativos no documento, enquanto a foto está aberta:
  // - dedos que caem fora da foto (ex.: na dica logo abaixo) também contam na pinça;
  // - o navegador não pode tomar a pinça nem o arraste da foto ampliada (rolar a
  //   folha ou dar zoom na página). O touch-action é decidido no começo do toque
  //   (e o Safari do iPhone ignora parte dele), então cancela à mão; precisa de
  //   ouvintes não passivos. Um dedo com a foto normal segue livre (rolar a folha).
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const dentro = (t: EventTarget | null) => t instanceof Node && el.contains(t);

    const pDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (e.isPrimary) naTela.current.clear();
      naTela.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!dentro(e.target) && dedos.current.size > 0) manip.current.baixar(e);
    };
    const pMove = (e: PointerEvent) => {
      if (naTela.current.has(e.pointerId)) naTela.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!dentro(e.target) && dedos.current.has(e.pointerId)) manip.current.mover(e);
    };
    const pUp = (e: PointerEvent) => {
      naTela.current.delete(e.pointerId);
      if (!dentro(e.target) && dedos.current.has(e.pointerId)) manip.current.soltar(e);
    };
    const pCancel = (e: PointerEvent) => {
      naTela.current.delete(e.pointerId);
      if (!dentro(e.target) && dedos.current.has(e.pointerId)) manip.current.cancelar(e);
    };

    const bloquear = (e: TouchEvent) => {
      if (e.cancelable && nossos.current.size > 0 && (e.touches.length >= 2 || segurar.current || ampliada(vistaAtual.current)))
        e.preventDefault();
    };
    const tStart = (e: TouchEvent) => {
      const ativos = new Set(Array.from(e.touches, (t) => t.identifier));
      for (const id of nossos.current) if (!ativos.has(id)) nossos.current.delete(id);
      for (const t of Array.from(e.changedTouches)) if (dentro(t.target)) nossos.current.add(t.identifier);
      bloquear(e);
    };
    const tEnd = (e: TouchEvent) => {
      const eraNosso = Array.from(e.changedTouches).some((t) => nossos.current.has(t.identifier));
      // Toque duplo reconhecido: sem clique nem zoom do navegador
      if (eraNosso && e.cancelable && e.timeStamp - duploEm.current < 300) e.preventDefault();
      for (const t of Array.from(e.changedTouches)) nossos.current.delete(t.identifier);
    };
    // Safari: gestos de pinça da página que envolvem a foto
    const gestoSafari = (e: Event) => {
      if (nossos.current.size > 0 || dentro(e.target)) e.preventDefault();
    };

    const nao = { passive: false, capture: true } as const;
    const cap = { capture: true } as const;
    const ponteiro: [string, (e: PointerEvent) => void][] = [
      ['pointerdown', pDown],
      ['pointermove', pMove],
      ['pointerup', pUp],
      ['pointercancel', pCancel],
    ];
    const toques: [string, (e: TouchEvent) => void][] = [
      ['touchstart', tStart],
      ['touchmove', bloquear],
      ['touchend', tEnd],
      ['touchcancel', tEnd],
    ];
    const gestos = ['gesturestart', 'gesturechange', 'gestureend'];
    for (const [n, f] of ponteiro) document.addEventListener(n, f as EventListener, cap);
    for (const [n, f] of toques) document.addEventListener(n, f as EventListener, nao);
    for (const g of gestos) document.addEventListener(g, gestoSafari, nao);
    return () => {
      for (const [n, f] of ponteiro) document.removeEventListener(n, f as EventListener, cap);
      for (const [n, f] of toques) document.removeEventListener(n, f as EventListener, nao);
      for (const g of gestos) document.removeEventListener(g, gestoSafari, nao);
    };
  }, []);

  // A foto mudou de tamanho (girou o celular, janela mudou): a vista ampliada acompanha e volta para dentro das bordas
  const tamanho = useRef({ w: 0, h: 0 });
  const relimitar = () => {
    const img = foto.current;
    if (!img) return;
    const novo = { w: img.offsetWidth, h: img.offsetHeight };
    const ant = tamanho.current;
    tamanho.current = novo;
    if (mao.current || !ampliada(vistaAtual.current)) return;
    const v = vistaAtual.current;
    const kx = ant.w > 0 ? novo.w / ant.w : 1;
    const ky = ant.h > 0 ? novo.h / ant.h : 1;
    const { janela, conteudo } = medidas();
    mudarVista(limitarVista({ x: v.x * kx, y: v.y * ky, s: v.s }, janela, conteudo));
  };
  const relimitarAtual = useRef(relimitar);
  relimitarAtual.current = relimitar;
  useEffect(() => {
    const img = foto.current;
    if (!img) return;
    tamanho.current = { w: img.offsetWidth, h: img.offsetHeight };
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const t = tamanho.current;
      if (img.offsetWidth !== t.w || img.offsetHeight !== t.h) relimitarAtual.current();
    });
    ro.observe(img);
    return () => ro.disconnect();
  }, []);

  // Posição da faixa [anterior | atual | próxima]: a atual fica no meio
  const base = indo === 'proxima' ? -200 : indo === 'anterior' ? 0 : -100;
  const arrastando = (gesto.current?.horizontal && !indo) || mao.current?.tipo === 'pinca';
  const zoom = ampliada(vista);
  // Camada própria para a foto só durante o gesto ou a animação (pintura leve; parada, ela volta nítida)
  const camada = mao.current !== null || animar;
  return (
    <div
      ref={caixa}
      className={`foto-carrossel${zoom ? ' ampliada' : ''}${camada ? ' gesto-zoom' : ''}`}
      data-zoom={textoEscala(vista.s)}
      onPointerDown={(e) => baixar(e)}
      onPointerMove={(e) => mover(e)}
      onPointerUp={(e) => soltar(e)}
      onPointerCancel={(e) => cancelar(e)}
    >
      <div
        className="foto-faixa"
        style={{
          transform: `translateX(calc(${base}% + ${indo ? 0 : dx}px))`,
          transition: arrastando ? 'none' : 'transform 0.25s ease-out',
        }}
        onTransitionEnd={(e) => {
          if (indo && e.target === e.currentTarget) aoIr(indo === 'proxima' ? proxima : anterior);
        }}
      >
        <div className="foto-slide">{anterior && <img className="foto-grande" src={anterior.url} alt="" draggable={false} />}</div>
        <div className="foto-slide">
          <img
            ref={foto}
            className="foto-grande"
            src={atual.url}
            alt={alt}
            draggable={false}
            onLoad={() => relimitar()}
            style={{
              transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.s})`,
              transformOrigin: '0 0',
              transition: animar ? 'transform 0.25s ease-out' : 'none',
              // O canto arredondado não cresce com o zoom
              borderRadius: zoom ? `${12 / vista.s}px` : undefined,
            }}
          />
        </div>
        <div className="foto-slide">{proxima && <img className="foto-grande" src={proxima.url} alt="" draggable={false} />}</div>
      </div>
    </div>
  );
}
