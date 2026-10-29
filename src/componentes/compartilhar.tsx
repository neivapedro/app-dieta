import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useMetaAgua, useTreino } from '../dados/useTreino';
import { montarCartao, type Periodo } from '../lib/compartilhar-cartao';
import { carregarMarca, gerarPng } from '../lib/compartilhar-imagem';
import { Folha } from './ui';
import '../estilos/compartilhar.css';

/** Ícone de compartilhar do iPhone (quadrado com a seta para cima). */
export function IconeCompartilhar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M8 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

// A marca é baixada uma vez só (e o cartão sai sem ela se não carregar)
let marca: Promise<HTMLImageElement | null> | null = null;
const carregarMarcaApp = () => (marca ??= carregarMarca(`${import.meta.env.BASE_URL}braco.webp`));

/** Os dados do cartão, com as mesmas contas da Análise. */
function useCartao(periodo: Periodo | null | undefined, incluirDose: boolean, incluirPeso: boolean) {
  const { diario, treinos, aplicacoes, ciclo } = useDados();
  const { composicoes, serie, resumo, hoje, fimRemedio } = useCalculos();
  const treino = useTreino();
  const metaAgua = useMetaAgua();
  const de = periodo?.de;
  const ate = periodo?.ate;
  return useMemo(() => {
    const inicioCiclo = resumo?.linhas[0]?.aplicacao.data ?? ciclo?.data_inicio ?? hoje;
    const doCiclo = ciclo ? aplicacoes.filter((a) => a.ciclo_id === ciclo.id) : aplicacoes;
    return montarCartao({
      composicoes,
      serie,
      inicioCiclo,
      hoje,
      // Remédio concluído: o cartão do ciclo vai até o fim do período do remédio (como o Resumo da Análise)
      fimPadrao: fimRemedio && fimRemedio < hoje ? fimRemedio : hoje,
      periodo: de && ate ? { de, ate } : null,
      aplicacoes: doCiclo,
      diario,
      treinos: treino ? treinos : null,
      metaAgua: (d) => metaAgua(d).meta,
      incluirDose,
      incluirPeso,
    });
  }, [composicoes, serie, resumo, ciclo, hoje, fimRemedio, de, ate, aplicacoes, diario, treino, treinos, metaAgua, incluirDose, incluirPeso]);
}

function baixar(arquivo: File) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Pré-visualização do cartão, com as opções e o Compartilhar (ou Baixar, sem o menu do sistema). */
function FolhaCompartilhar({ periodo, aoFechar }: { periodo?: Periodo | null; aoFechar: () => void }) {
  // Dose desligada por padrão (a imagem pode ser compartilhada); peso ligado, mas dá para tirar
  const [incluirDose, setIncluirDose] = useState(false);
  const [incluirPeso, setIncluirPeso] = useState(true);
  const dados = useCartao(periodo, incluirDose, incluirPeso);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // A imagem é gerada antes do toque: no iPhone, o Compartilhar só abre logo depois do toque
  const urlAtual = useRef<string | null>(null);
  // Ao fechar, a folha ainda desliza para baixo com a imagem: libera a URL só depois da animação
  useEffect(
    () => () => {
      const u = urlAtual.current;
      if (u) setTimeout(() => URL.revokeObjectURL(u), 1500);
    },
    [],
  );
  useEffect(() => {
    let vivo = true;
    // Opção trocada: a imagem anterior não pode mais sair (ex.: com a dose que acabou de ser tirada)
    setArquivo(null);
    setErro(false);
    carregarMarcaApp()
      .then((m) => gerarPng(dados, m))
      .then((blob) => {
        if (!vivo) return;
        const url = URL.createObjectURL(blob);
        if (urlAtual.current) URL.revokeObjectURL(urlAtual.current);
        urlAtual.current = url;
        setArquivo(new File([blob], dados.nomeArquivo, { type: 'image/png' }));
        setPrevia(url);
      })
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [dados]);

  // Esc fecha só esta folha (e não a folha de baixo, como o Resumo da semana)
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      fechar.current();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, []);

  const podeCompartilhar = !!arquivo && typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });

  async function compartilhar() {
    if (!arquivo) return;
    setMsg(null);
    if (podeCompartilhar) {
      try {
        await navigator.share({ files: [arquivo], title: dados.titulo });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        // O iPhone pede um toque novo quando a imagem demorou: o botão continua ali
        setMsg('Toque de novo em “Compartilhar imagem”.');
        return;
      }
    }
    baixar(arquivo);
    setMsg('Imagem baixada.');
  }

  return (
    <div className="compartilhar-camada">
      <Folha detentes={false} titulo="Compartilhar progresso" aoFechar={aoFechar}>
        <div className="pilha">
          <div className={`compartilhar-previa ${previa && !arquivo ? 'atualizando' : ''}`} aria-busy={!arquivo}>
            {previa ? <img src={previa} alt={dados.descricao} width={1080} height={1350} /> : <div className={erro ? 'compartilhar-erro' : 'esqueleto'}>{erro && 'Não foi possível gerar a imagem.'}</div>}
          </div>
          <div className="compartilhar-opcoes">
            <label className="marcar">
              <input type="checkbox" checked={incluirDose} onChange={(e) => setIncluirDose(e.target.checked)} />
              <span>
                Incluir dose
                <small className="texto-2">Desligado por padrão: a imagem pode ser compartilhada.</small>
              </span>
            </label>
            <label className="marcar">
              <input type="checkbox" checked={incluirPeso} onChange={(e) => setIncluirPeso(e.target.checked)} />
              <span>
                Incluir peso
                <small className="texto-2">Desligue para mostrar só as medidas.</small>
              </span>
            </label>
          </div>
          {!dados.temDados && <p className="texto-2">Ainda sem medições: o cartão mostra os números depois da primeira medição.</p>}
          <button className="botao primario bloco-largo compartilhar-acao" disabled={!arquivo} onClick={() => void compartilhar()}>
            <IconeCompartilhar />
            {!arquivo ? 'Gerando a imagem…' : podeCompartilhar ? 'Compartilhar imagem' : 'Baixar imagem'}
          </button>
          {podeCompartilhar && arquivo && (
            <button
              className="botao bloco-largo"
              onClick={() => {
                baixar(arquivo);
                setMsg('Imagem baixada.');
              }}
            >
              Baixar
            </button>
          )}
          {msg && (
            <p className="texto-2 compartilhar-msg" role="status">
              {msg}
            </p>
          )}
        </div>
      </Folha>
    </div>
  );
}

/**
 * Botão "Compartilhar": abre a pré-visualização do cartão de progresso (PNG 1080 × 1350)
 * e manda pelo menu Compartilhar do iPhone ou baixa o arquivo.
 * `periodo` limita o cartão (ex.: a semana); sem ele, o ciclo inteiro.
 */
export function BotaoCompartilharProgresso({
  periodo,
  variante = 'normal',
  rotulo = 'Compartilhar',
  classe,
  aoMudarAberto,
}: {
  periodo?: Periodo | null;
  variante?: 'pequeno' | 'normal';
  rotulo?: string;
  /** Classe extra do botão */
  classe?: string;
  /** Avisado ao abrir e fechar a folha (ex.: os stories pausam enquanto ela está aberta) */
  aoMudarAberto?: (aberto: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const mudar = (v: boolean) => {
    setAberto(v);
    aoMudarAberto?.(v);
  };
  return (
    <>
      <button type="button" className={`botao ${variante === 'pequeno' ? 'pequeno' : ''} botao-compartilhar ${classe ?? ''}`} onClick={() => mudar(true)}>
        <IconeCompartilhar />
        {rotulo}
      </button>
      {aberto && createPortal(<FolhaCompartilhar periodo={periodo} aoFechar={() => mudar(false)} />, document.body)}
    </>
  );
}
