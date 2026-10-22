import { useEffect, useRef, useState } from 'react';
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
  sessao: Sessao;
  arquivos: File[];
  fase: 'escolher' | 'salvando' | 'fim';
  /** Foto sendo salva agora (1, 2, ...) */
  atual: number;
  salvas: number;
  erros: { nome: string; motivo: string }[];
  /** Folha visível (dá para fechar enquanto salva: o card mostra o progresso) */
  aberta: boolean;
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
  const [lote, setLote] = useState<Lote | null>(null);
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
    setLote({ sessao, arquivos, fase: 'escolher', atual: 0, salvas: 0, erros: [], aberta: true });
  }

  async function salvarLote(l: Lote, data: string, rotulo: Rotulo) {
    const erros: Lote['erros'] = [];
    let salvas = 0;
    for (let i = 0; i < l.arquivos.length; i++) {
      const arquivo = l.arquivos[i];
      setLote((x) => x && { ...x, fase: 'salvando', atual: i + 1 });
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
      setLote((x) => x && { ...x, salvas, erros: [...erros] });
      // Deixa a tela respirar entre uma foto e outra
      await new Promise((ok) => setTimeout(ok, 0));
    }
    const onde = ROTULO_SESSAO[l.sessao];
    if (!erros.length) {
      setLote(null);
      setMsg({ tipo: 'info', texto: salvas === 1 ? `Foto salva no ${onde}.` : `${salvas} fotos salvas no ${onde}.` });
    } else setLote((x) => x && { ...x, fase: 'fim', aberta: true });
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

  return (
    <section className="cartao pilha" style={{ gap: 10 }}>
      <div className="cartao-cab" style={{ marginBottom: 0 }}>
        <h2>Fotos: antes e depois</h2>
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
      {!carregando && !erro && (
        <div className="pilha" style={{ gap: 16 }}>
          {medicoes.map(({ s, data, c }) => {
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
                    <span className="foto-adicionar-texto">{ocupado ? `Salvando ${salvando.atual} de ${salvando.arquivos.length}…` : 'Adicionar fotos'}</span>
                  </button>
                </div>
                <NumerosSessao
                  c={c}
                  base={s === 'depois' ? (medicoes[0].c ?? null) : null}
                  data={data}
                  feminino={feminino}
                  origem={data ? `${daSessao.length > 1 ? 'Foto mais recente' : 'Foto'} de ${formatarData(data, true)}` : undefined}
                />
              </div>
            );
          })}
        </div>
      )}
      {/* Com a folha de uma foto aberta, o erro aparece só nela */}
      {msg && !vendo && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
      {fotos.length > 0 && (
        <p className="texto-2" style={{ margin: 0 }}>
          {fotosTexto(fotos.length)} · ~{textoTamanho(bytes)} neste aparelho
        </p>
      )}
      <p className="mudo">
        Para comparar: mesma luz, mesmo lugar, mesma distância, de manhã em jejum, roupa parecida. Marque Frente, Lado ou Costas para formar os pares
        Antes × Depois do PDF. O Depois pode ser preenchido a qualquer momento.
      </p>
      <p className="mudo">
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
            if (lote.fase === 'salvando') setLote((x) => x && { ...x, aberta: false });
            else setLote(null);
          }}
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
}: {
  lote: Lote;
  hoje: string;
  /** Erro de data (ex.: Depois antes do Antes) ou null */
  conferir: (data: string) => string | null;
  aoFechar: () => void;
  aoSalvar: (data: string, rotulo: Rotulo) => void;
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
        </div>
      )}
      {lote.fase === 'fim' && (
        <div className="pilha" style={{ gap: 10 }}>
          <p style={{ margin: 0 }}>
            {lote.salvas
              ? `${lote.salvas} de ${n} ${n === 1 ? 'foto salva' : 'fotos salvas'} no ${onde}.`
              : `Nenhuma foto foi salva no ${onde}.`}
          </p>
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
  const toque = useRef<number | null>(null);
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
        <img
          className="foto-grande"
          src={vista.url}
          alt={`${ROTULO_SESSAO[vista.sessao]}, ${vista.rotulo === 'outra' ? 'sem rótulo' : ROTULO_FOTO[vista.rotulo]}, ${formatarData(vista.data, true)}`}
          onTouchStart={(e) => (toque.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const x0 = toque.current;
            const x1 = e.changedTouches[0]?.clientX;
            toque.current = null;
            if (x0 === null || x1 === undefined || Math.abs(x1 - x0) < 50) return;
            ir(x1 < x0 ? proxima : anterior);
          }}
        />
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
