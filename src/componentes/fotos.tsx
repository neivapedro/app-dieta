import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import { aoMudarFotos, apagarFoto, blobDaFoto, listarFotos, mudarDataFoto, salvarFoto, type FotoGuardada } from '../dados/fotos';
import { useCalculos } from '../dados/useCalculos';
import { useProjeto } from '../dados/useProjeto';
import { formatarData } from '../lib/datas';
import { corVariacao } from '../lib/formato';
import {
  chaveSlot,
  dataDaSessao,
  DIAS_MEDICAO_FOTO,
  medicaoProxima,
  numerosDaMedicao,
  POSES,
  ROTULO_POSE,
  ROTULO_SESSAO,
  SESSOES,
  type Pose,
  type Sessao,
} from '../lib/fotos';
import { MDC, type Composicao } from '../lib/gordura';
import { LADO_PDF, prepararFoto, QUALIDADE_PDF, reduzirImagem, type ImagemPronta } from '../lib/imagem';
import type { ImagemPdf } from '../lib/relatorioPdf';
import { BotaoExcluir, Campo, Folha } from './ui';

export interface FotoTela extends FotoGuardada {
  /** Endereço temporário da imagem para a <img> */
  url: string;
}

/**
 * Fotos da conta guardadas neste aparelho. Atualiza sozinho quando uma foto é
 * salva, trocada ou apagada (em qualquer tela) e ao trocar de conta.
 */
export function useFotos() {
  const { usuario } = useDados();
  const id = usuario?.id ?? null;
  const [estado, setEstado] = useState<{ dono: string | null; fotos: FotoTela[]; carregando: boolean; erro: string | null }>({
    dono: null,
    fotos: [],
    carregando: true,
    erro: null,
  });
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    let urls: string[] = [];
    const carregar = () =>
      listarFotos(id)
        .then((lista) => {
          if (!vivo) return;
          urls.forEach((u) => URL.revokeObjectURL(u));
          const fotos = lista.map((f) => ({ ...f, url: URL.createObjectURL(blobDaFoto(f)) }));
          urls = fotos.map((f) => f.url);
          setEstado({ dono: id, fotos, carregando: false, erro: null });
        })
        .catch((e: Error) => vivo && setEstado({ dono: id, fotos: [], carregando: false, erro: e.message }));
    void carregar();
    const parar = aoMudarFotos(() => void carregar());
    return () => {
      vivo = false;
      parar();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [id]);
  // Outra conta: nada da anterior aparece, nem por um instante
  return estado.dono === id ? estado : { dono: id, fotos: [] as FotoTela[], carregando: true, erro: null };
}

const achar = (fotos: FotoTela[], sessao: Sessao, pose: Pose) => fotos.find((f) => f.sessao === sessao && f.pose === pose);

function NumerosSessao({ c, base, data, feminino }: { c: Composicao | null; base: Composicao | null; data: string | null; feminino: boolean }) {
  if (!data) return null;
  if (!c) return <p className="mudo fotos-numeros">Sem medição até {DIAS_MEDICAO_FOTO} dias da foto.</p>;
  const comparar = base && base.data !== c.data ? base : null;
  return (
    <div className="fotos-numeros">
      <div className="mudo">
        {c.data === data ? 'Medição do dia' : `Medição de ${formatarData(c.data, true)}`}
        {comparar ? ' · variação desde o Antes' : ''}
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

/**
 * Cartão "Fotos: antes e depois" da aba Medidas: Antes | Depois, com frente,
 * lado e costas, e os números da medição mais próxima de cada sessão.
 */
export function CartaoFotos() {
  const { usuario, perfil, hoje } = useDados();
  const { composicoes } = useCalculos();
  const proj = useProjeto();
  const { fotos, carregando, erro } = useFotos();
  const feminino = perfil?.sexo === 'Feminino';
  const entrada = useRef<HTMLInputElement>(null);
  const alvo = useRef<{ sessao: Sessao; pose: Pose } | null>(null);
  const [preparando, setPreparando] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nova, setNova] = useState<{ sessao: Sessao; pose: Pose; imagem: ImagemPronta; url: string; dataInicial?: string } | null>(null);
  const [vendo, setVendo] = useState<{ sessao: Sessao; pose: Pose } | null>(null);
  if (!usuario) return null;

  function escolher(sessao: Sessao, pose: Pose) {
    setMsg(null);
    alvo.current = { sessao, pose };
    entrada.current?.click();
  }

  async function aoEscolher(arquivo: File) {
    const a = alvo.current;
    if (!a) return;
    setPreparando(`${a.sessao}|${a.pose}`);
    try {
      const imagem = await prepararFoto(arquivo);
      setVendo(null);
      // Trocar a imagem de uma foto já salva propõe a data dela, não hoje
      setNova({ ...a, imagem, url: URL.createObjectURL(imagem.blob), dataInicial: achar(fotos, a.sessao, a.pose)?.data });
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setPreparando(null);
      if (entrada.current) entrada.current.value = '';
    }
  }

  const fechaNova = () => {
    if (nova) URL.revokeObjectURL(nova.url);
    setNova(null);
  };

  const depoisFeitas = fotos.filter((f) => f.sessao === 'depois').length;
  // Fim do remédio (última dose aplicada, plano concluído ou fase pós-remédio): hora do depois
  const horaDoDepois = !!proj?.concluido && depoisFeitas < POSES.length;
  const medicoes = SESSOES.map((s) => {
    const data = dataDaSessao(fotos, s);
    return { s, data, c: data ? medicaoProxima(composicoes, data) : null };
  });
  const vista = vendo ? achar(fotos, vendo.sessao, vendo.pose) : undefined;

  return (
    <section className="cartao pilha" style={{ gap: 10 }}>
      <div className="cartao-cab" style={{ marginBottom: 0 }}>
        <h2>Fotos: antes e depois</h2>
        {horaDoDepois && <span className="etiqueta aviso">fim do ciclo</span>}
      </div>
      {horaDoDepois && (
        <div className="alerta">
          <div>
            <b>Tire as fotos do depois.</b> O remédio chegou ao fim: frente, lado e costas, nas mesmas condições das do antes. Elas podem ir no PDF final
            (opção na Análise).
          </div>
        </div>
      )}
      {erro && <div className="alerta erro">{erro}</div>}
      {!carregando && !erro && (
        <div className="pilha" style={{ gap: 14 }}>
          {medicoes.map(({ s, data, c }) => (
            <div key={s} className="fotos-sessao">
              <div className="fotos-cab">
                <b>{ROTULO_SESSAO[s]}</b>
                {data && <span className="mudo">{formatarData(data, true)}</span>}
              </div>
              <div className="fotos-poses">
                {POSES.map((p) => {
                  const f = achar(fotos, s, p);
                  const ocupado = preparando === `${s}|${p}`;
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`foto-slot ${f ? 'cheio' : ''} ${s === 'depois' && horaDoDepois && !f ? 'destaque' : ''}`}
                      aria-label={`${ROTULO_SESSAO[s]}: ${ROTULO_POSE[p]}${f ? ` (${formatarData(f.data, true)})` : ' (adicionar)'}`}
                      disabled={!!preparando}
                      onClick={() => (f ? setVendo({ sessao: s, pose: p }) : escolher(s, p))}
                    >
                      {f ? <img src={f.url} alt="" /> : <span className="foto-mais">{ocupado ? '…' : '+'}</span>}
                      <span className="foto-pose">{ocupado ? 'Preparando…' : ROTULO_POSE[p]}</span>
                    </button>
                  );
                })}
              </div>
              <NumerosSessao c={c} base={s === 'depois' ? (medicoes[0].c ?? null) : null} data={data} feminino={feminino} />
            </div>
          ))}
        </div>
      )}
      {msg && <div className="alerta erro">{msg}</div>}
      <p className="mudo">
        Para comparar: mesma luz, mesmo lugar, mesma distância, de manhã em jejum, roupa parecida. O Depois pode ser preenchido a qualquer momento.
      </p>
      <p className="mudo">As fotos ficam só neste aparelho. Para não perder ao trocar de celular, faça o backup no Perfil.</p>
      {/* Sem "capture": o iPhone oferece a câmera e a galeria */}
      <input ref={entrada} type="file" accept="image/*" className="oculto" onChange={(e) => e.target.files?.[0] && void aoEscolher(e.target.files[0])} />

      {nova && (
        <FolhaNova
          nova={nova}
          hoje={hoje}
          aoFechar={fechaNova}
          aoSalvar={async (data) => {
            await salvarFoto(usuario.id, { sessao: nova.sessao, pose: nova.pose, data, blob: nova.imagem.blob, largura: nova.imagem.largura, altura: nova.imagem.altura });
            fechaNova();
          }}
        />
      )}
      {vendo && vista && (
        <Folha titulo={`${ROTULO_SESSAO[vista.sessao]} · ${ROTULO_POSE[vista.pose]}`} aoFechar={() => setVendo(null)}>
          <div className="pilha" style={{ gap: 10 }}>
            <img className="foto-grande" src={vista.url} alt={`${ROTULO_SESSAO[vista.sessao]}, ${ROTULO_POSE[vista.pose]}`} />
            <Campo rotulo="Data da foto">
              <input
                type="date"
                value={vista.data}
                max={hoje}
                onChange={(e) => e.target.value && e.target.value <= hoje && void mudarDataFoto(usuario.id, vista.sessao, vista.pose, e.target.value).catch((x: Error) => setMsg(x.message))}
              />
            </Campo>
            <NumerosSessao
              c={medicaoProxima(composicoes, vista.data)}
              base={vista.sessao === 'depois' ? (medicoes[0].c ?? null) : null}
              data={vista.data}
              feminino={feminino}
            />
            {msg && <div className="alerta erro">{msg}</div>}
            <div className="linha">
              <button type="button" className="botao" disabled={!!preparando} onClick={() => escolher(vista.sessao, vista.pose)}>
                {preparando ? 'Preparando…' : 'Trocar'}
              </button>
              <BotaoExcluir
                rotulo="Apagar"
                aviso="A foto sai deste aparelho."
                aoConfirmar={() =>
                  apagarFoto(usuario.id, vista.sessao, vista.pose)
                    .then(() => setVendo(null))
                    .catch((x: Error) => setMsg(x.message))
                }
              />
            </div>
          </div>
        </Folha>
      )}
    </section>
  );
}

function FolhaNova({
  nova,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  nova: { sessao: Sessao; pose: Pose; url: string; dataInicial?: string };
  hoje: string;
  aoFechar: () => void;
  aoSalvar: (data: string) => Promise<void>;
}) {
  const [data, setData] = useState(nova.dataInicial ?? hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    if (!data || data > hoje) return setErro('Informe a data da foto (até hoje).');
    setSalvando(true);
    try {
      await aoSalvar(data);
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }
  return (
    <Folha titulo={`Nova foto · ${ROTULO_SESSAO[nova.sessao]} · ${ROTULO_POSE[nova.pose]}`} aoFechar={aoFechar}>
      <div className="pilha" style={{ gap: 10 }}>
        <img className="foto-grande" src={nova.url} alt="Prévia da foto" />
        <Campo rotulo="Data da foto" dica="Os números ao lado vêm da medição mais próxima dessa data (até 7 dias).">
          <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
        </Campo>
        {erro && <div className="alerta erro">{erro}</div>}
        <div className="linha">
          <button type="button" className="botao primario" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar foto'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </div>
    </Folha>
  );
}

/** No Balanço do projeto: lembra das fotos do depois enquanto faltarem. */
export function LembreteFotosDepois() {
  const { fotos, carregando, erro } = useFotos();
  if (carregando || erro) return null;
  const feitas = fotos.filter((f) => f.sessao === 'depois').length;
  if (feitas >= POSES.length) return <p className="mudo">Fotos do depois tiradas. Elas podem ir no PDF final (opção na Análise).</p>;
  return (
    <div className="alerta info">
      <div>
        <b>Tire as fotos do depois</b>
        {feitas ? ` (faltam ${POSES.length - feitas})` : ''}: frente, lado e costas, nas mesmas condições das do antes.{' '}
        <Link to="/medidas">Abrir em Medidas</Link>
      </div>
    </div>
  );
}

/** Fotos reduzidas para o PDF (JPEG menor), por sessão + pose. */
export async function prepararFotosPdf(fotos: FotoGuardada[]): Promise<Map<string, ImagemPdf>> {
  const mapa = new Map<string, ImagemPdf>();
  // Uma de cada vez: o iPhone tem pouca memória para canvas
  for (const f of fotos) {
    const r = await reduzirImagem(blobDaFoto(f), LADO_PDF, QUALIDADE_PDF);
    mapa.set(chaveSlot(f), { dados: new Uint8Array(await r.blob.arrayBuffer()), largura: r.largura, altura: r.altura });
  }
  return mapa;
}
