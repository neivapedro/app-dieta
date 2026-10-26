// PDF final do ciclo: gerado no próprio aparelho e aberto no menu Compartilhar
// (Salvar em Arquivos, Imprimir, WhatsApp, e-mail), como o PDF da consulta na Análise.
// O gerador (jsPDF) é baixado à parte quando a seção aparece: no toque, o PDF sai na
// hora (o iPhone só abre o Compartilhar logo depois do toque). As fotos só entram com
// "Incluir fotos" marcado (desmarcado por padrão: o PDF pode ser compartilhado).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { estimarTamanhoPdf, textoTamanho } from '../lib/fotos';
import type { RelatorioFinal } from '../lib/relatorio-final';
import type { ImagemPdf } from '../lib/relatorioPdf';
import { prepararFotosPdf, type FotoTela } from './fotos';

export interface PropsPdfFinal {
  relatorio: RelatorioFinal;
  fotos: FotoTela[];
  carregandoFotos?: boolean;
}

/** O resto do PDF final (capa, gráficos e tabelas), sem as fotos, comprimido (~200 KB num ciclo inteiro). */
const TAMANHO_SEM_FOTOS = 200 * 1024;

function IconePdf() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

/** Botão do PDF final, com a opção de incluir as fotos e o "Compartilhar PDF" de reserva. */
export function SlotPdfFinal({ relatorio: r, fotos, carregandoFotos = false }: PropsPdfFinal) {
  const gerador = useRef<Promise<typeof import('../lib/relatorioFinalPdf')> | null>(null);
  useEffect(() => {
    gerador.current = import('../lib/relatorioFinalPdf');
    gerador.current.catch(() => (gerador.current = null));
  }, []);
  const [pdf, setPdf] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [incluirFotos, setIncluirFotos] = useState(false);
  // As fotos que entram no PDF: os pares por pose (a capa é um deles) e as outras em grade
  const fotosPdf = useMemo(() => {
    const usadas = new Set([...r.fotos.pares.flatMap((p) => [p.id_antes, p.id_depois]), ...r.fotos.pdf.outrasAntes.map((f) => f.id), ...r.fotos.pdf.outrasDepois.map((f) => f.id)]);
    return fotos.filter((f) => usadas.has(f.id));
  }, [r, fotos]);
  const semFotos = fotosPdf.length === 0;
  const tamanho = semFotos ? null : estimarTamanhoPdf(fotosPdf.map((f) => ({ ...f, bytes: f.dados.byteLength }))) + TAMANHO_SEM_FOTOS;

  // Dados ou fotos mudaram depois de gerar: o PDF guardado ficou velho
  useEffect(() => {
    setPdf(null);
  }, [r, fotos]);
  // Com a opção marcada, as fotos já são reduzidas antes do toque: o PDF sai na hora
  const imagens = useRef<Promise<Map<string, ImagemPdf>> | null>(null);
  useEffect(() => {
    imagens.current = incluirFotos && fotosPdf.length ? prepararFotosPdf(fotosPdf) : null;
    imagens.current?.catch(() => undefined);
  }, [incluirFotos, fotosPdf]);

  async function compartilhar(arquivo: File) {
    if (navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: 'Relatório final do ciclo' });
        setMsg({ tipo: 'info', texto: 'PDF pronto. Use “Compartilhar PDF” para enviar de novo.' });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        // O iPhone pede um toque novo: o botão "Compartilhar PDF" fica disponível
        setMsg({ tipo: 'info', texto: 'PDF pronto. Toque em “Compartilhar PDF” para salvar, imprimir ou enviar.' });
        return;
      }
    }
    // Sem o menu Compartilhar (computador): baixa o arquivo
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = arquivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setMsg({ tipo: 'info', texto: 'PDF baixado.' });
  }

  async function gerarPdf() {
    setMsg(null);
    setGerando(true);
    try {
      gerador.current ??= import('../lib/relatorioFinalPdf');
      const mod = await gerador.current;
      const mapa = incluirFotos && !semFotos ? await (imagens.current ??= prepararFotosPdf(fotosPdf)) : null;
      const blob = mod.gerarRelatorioFinalPdf(r, mapa);
      const arquivo = new File([blob], `relatorio-final-${r.gerado_em}.pdf`, { type: 'application/pdf' });
      setPdf(arquivo);
      await compartilhar(arquivo);
    } catch (e) {
      gerador.current = null;
      imagens.current = null;
      setMsg({ tipo: 'erro', texto: `Não deu para gerar o PDF: ${(e as Error).message}` });
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="rf-slot-pdf" data-slot="pdf-final">
      <button type="button" className="botao rf-botao-stories rf-botao-pdf" disabled={gerando} aria-busy={gerando} onClick={() => void gerarPdf()}>
        <span className="rf-botao-stories-icone" aria-hidden="true">
          <IconePdf />
        </span>
        <span className="rf-botao-stories-texto">
          <b>{gerando ? 'Gerando o PDF…' : 'PDF final'}</b>
          <small>Colorido, com capa, gráficos e fases: para guardar ou levar ao médico</small>
        </span>
      </button>
      <label className={`marcar ${semFotos ? 'desligado' : ''}`}>
        <input
          type="checkbox"
          checked={incluirFotos && !semFotos}
          disabled={semFotos}
          onChange={(e) => {
            setIncluirFotos(e.target.checked);
            // O PDF já gerado era da outra escolha: gera de novo
            setPdf(null);
            setMsg(null);
          }}
        />
        <span>
          Incluir fotos de antes e depois
          <small className="texto-2" style={{ display: 'block' }}>
            {carregandoFotos && semFotos ? (
              'Carregando as fotos…'
            ) : semFotos ? (
              <>
                Sem fotos neste aparelho. Adicione em <Link to="/medidas">Medidas</Link>.
              </>
            ) : (
              <>
                Desmarcado por padrão: o PDF pode ser compartilhado. Com as {fotosPdf.length} {fotosPdf.length === 1 ? 'foto' : 'fotos'} (capa, pares por pose e as outras em grade), fica com ~{textoTamanho(tamanho!)}.
              </>
            )}
          </small>
        </span>
      </label>
      {pdf && (
        <button type="button" className="botao bloco-largo" onClick={() => void compartilhar(pdf)}>
          Compartilhar PDF (salvar, imprimir, enviar)
        </button>
      )}
      {msg && (
        <div className={`alerta ${msg.tipo}`} role="status">
          {msg.texto}
        </div>
      )}
    </div>
  );
}
