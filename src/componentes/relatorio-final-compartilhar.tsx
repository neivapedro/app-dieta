// Compartilhar o Relatório final como imagem de stories (1080 × 1920). Dose e fotos
// desligadas por padrão: a imagem pode ser compartilhada. Nada sai sem o toque.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatarData } from '../lib/datas';
import { carregarMarca } from '../lib/compartilhar-imagem';
import { gerarStoriesFinal, type FotoStories } from '../lib/relatorio-final-imagem';
import type { RelatorioFinal } from '../lib/relatorio-final';
import { IconeCompartilhar } from './compartilhar';
import type { FotoTela } from './fotos';
import { Folha } from './ui';
import '../estilos/compartilhar.css';

let marca: Promise<HTMLImageElement | null> | null = null;
const carregarMarcaApp = () => (marca ??= carregarMarca(`${import.meta.env.BASE_URL}braco.webp`));

function carregarFoto(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Foto indisponível'));
    img.src = url;
  });
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

function FolhaStories({ r, fotos, aoFechar }: { r: RelatorioFinal; fotos: FotoTela[]; aoFechar: () => void }) {
  const [incluirPeso, setIncluirPeso] = useState(true);
  const [incluirDose, setIncluirDose] = useState(false);
  const [incluirFotos, setIncluirFotos] = useState(false);
  const capa = r.fotos.capa;
  const urlAntes = capa ? fotos.find((f) => f.id === capa.id_antes)?.url : undefined;
  const urlDepois = capa ? fotos.find((f) => f.id === capa.id_depois)?.url : undefined;
  const temFotos = !!(urlAntes && urlDepois);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const urlAtual = useRef<string | null>(null);

  useEffect(
    () => () => {
      const u = urlAtual.current;
      if (u) setTimeout(() => URL.revokeObjectURL(u), 1500);
    },
    [],
  );
  useEffect(() => {
    let vivo = true;
    // Opção trocada: a imagem anterior não sai mais (ex.: com a foto que acabou de ser tirada)
    setArquivo(null);
    setErro(false);
    const comFotos = incluirFotos && temFotos;
    Promise.all([carregarMarcaApp(), comFotos ? Promise.all([carregarFoto(urlAntes!), carregarFoto(urlDepois!)]) : Promise.resolve(null)])
      .then(([m, imgs]) => {
        const par: { antes: FotoStories; depois: FotoStories } | null =
          imgs && capa
            ? {
                antes: { imagem: imgs[0], legenda: `Antes · ${formatarData(capa.data_antes, true)}` },
                depois: { imagem: imgs[1], legenda: `Depois · ${formatarData(capa.data_depois, true)}` },
              }
            : null;
        return gerarStoriesFinal(r.cartao, { incluirPeso, incluirDose, fotos: par }, m);
      })
      .then((blob) => {
        if (!vivo) return;
        const url = URL.createObjectURL(blob);
        if (urlAtual.current) URL.revokeObjectURL(urlAtual.current);
        urlAtual.current = url;
        setArquivo(new File([blob], `relatorio-final-${r.gerado_em}.png`, { type: 'image/png' }));
        setPrevia(url);
      })
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [r, incluirPeso, incluirDose, incluirFotos, temFotos, urlAntes, urlDepois, capa]);

  const podeCompartilhar = !!arquivo && typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });

  async function compartilhar() {
    if (!arquivo) return;
    setMsg(null);
    if (podeCompartilhar) {
      try {
        await navigator.share({ files: [arquivo], title: 'Relatório final do ciclo' });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setMsg('Toque de novo em “Compartilhar imagem”.');
        return;
      }
    }
    baixar(arquivo);
    setMsg('Imagem baixada.');
  }

  return (
    <div className="compartilhar-camada">
      <Folha detentes={false} titulo="Compartilhar o resumo" aoFechar={aoFechar}>
        <div className="pilha">
          <div className={`compartilhar-previa rf-previa-stories ${previa && !arquivo ? 'atualizando' : ''}`} aria-busy={!arquivo}>
            {previa ? (
              <img src={previa} alt={`Resumo do ciclo em imagem: ${r.resumo_texto}`} width={1080} height={1920} />
            ) : (
              <div className={erro ? 'compartilhar-erro' : 'esqueleto'}>{erro && 'Não foi possível gerar a imagem.'}</div>
            )}
          </div>
          <div className="compartilhar-opcoes">
            <label className="marcar">
              <input type="checkbox" checked={incluirPeso} onChange={(e) => setIncluirPeso(e.target.checked)} />
              <span>
                Incluir peso
                <small className="texto-2">Desligue para mostrar só as medidas.</small>
              </span>
            </label>
            <label className="marcar">
              <input type="checkbox" checked={incluirDose} onChange={(e) => setIncluirDose(e.target.checked)} />
              <span>
                Incluir nº de aplicações
                <small className="texto-2">Desligado por padrão: a imagem pode ser compartilhada.</small>
              </span>
            </label>
            <label className={`marcar ${temFotos ? '' : 'desligado'}`}>
              <input type="checkbox" checked={incluirFotos && temFotos} disabled={!temFotos} onChange={(e) => setIncluirFotos(e.target.checked)} />
              <span>
                Incluir fotos de antes e depois
                <small className="texto-2">{temFotos ? 'Desligado por padrão. As fotos só saem do aparelho se você compartilhar.' : 'Precisa de uma foto no Antes e outra no Depois (Medidas).'}</small>
              </span>
            </label>
          </div>
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

/** Botão de destaque que abre a prévia da imagem de stories do relatório. */
export function BotaoStoriesFinal({ r, fotos }: { r: RelatorioFinal; fotos: FotoTela[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="botao rf-botao-stories" onClick={() => setAberto(true)}>
        <span className="rf-botao-stories-icone" aria-hidden="true">
          <IconeCompartilhar />
        </span>
        <span className="rf-botao-stories-texto">
          <b>Compartilhar o resumo</b>
          <small>Imagem para stories, com os números finais</small>
        </span>
      </button>
      {aberto && createPortal(<FolhaStories r={r} fotos={fotos} aoFechar={() => setAberto(false)} />, document.body)}
    </>
  );
}
