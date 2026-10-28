import { BrowserRouter, HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Comemoracoes, menosMovimento } from './componentes/comemoracao';
import { useRolagemDaTela } from './componentes/navegacao';
import { NovaSenha } from './paginas/Entrar';
import { PuxarAtualizar } from './componentes/movimento';
import { Protecao } from './componentes/Protecao';
import { Icone } from './componentes/ui';
import { useDados } from './dados/contexto';
import { useCalculos } from './dados/useCalculos';
import { useProjeto } from './dados/useProjeto';
import { useTreino } from './dados/useTreino';
import { aplicarBadge, pendentesHoje, temBadge } from './lib/badge-hoje';
import { Analise } from './paginas/Analise';
import { Ciclo } from './paginas/Ciclo';
import { Configurar } from './paginas/Configurar';
import { Dieta } from './paginas/Dieta';
import { Entrar } from './paginas/Entrar';
import { Inicio } from './paginas/Inicio';
import { Medidas } from './paginas/Medidas';
import { Perfil } from './paginas/Perfil';
import { Treino } from './paginas/Treino';

// Texto longo e só de leitura: baixa à parte (o service worker guarda junto com o resto)
const Retatrutida = lazy(() => import('./paginas/Retatrutida'));
// Relatório final: tela longa, com gráficos e fotos; baixa só quando aberta
const RelatorioFinal = lazy(() => import('./paginas/RelatorioFinal'));

const ABAS = [
  { para: '/', rotulo: 'Início', icone: 'inicio', titulo: 'Início' },
  { para: '/ciclo', rotulo: 'Ciclo', icone: 'ciclo', titulo: 'Ciclo' },
  { para: '/medidas', rotulo: 'Medidas', icone: 'medidas', titulo: 'Medidas' },
  { para: '/dieta', rotulo: 'Dieta', icone: 'dieta', titulo: 'Dieta' },
  { para: '/analise', rotulo: 'Análise', icone: 'analise', titulo: 'Análise do ciclo' },
];

const ABA_TREINO = { para: '/treino', rotulo: 'Treino', icone: 'treino', titulo: 'Treino' };

// Telas abertas pelos botões do cabeçalho (fora da barra de abas)
const TITULOS_EXTRAS: Record<string, string> = { '/perfil': 'Perfil', '/retatrutida': 'Retatrutida', '/relatorio-final': 'Relatório final' };

function AvisoNovaVersao() {
  // O aviso pode chegar antes desta parte da tela existir (ainda carregando)
  const [nova, setNova] = useState(() => !!(window as { novaVersao?: boolean }).novaVersao);
  useEffect(() => {
    const ver = () => setNova(true);
    window.addEventListener('nova-versao', ver);
    return () => window.removeEventListener('nova-versao', ver);
  }, []);
  if (!nova) return null;
  return (
    <div className="alerta info" style={{ marginBottom: 14, alignItems: 'center' }}>
      <span className="cresce">Nova versão do app disponível.</span>
      <button className="botao pequeno primario" onClick={() => location.reload()}>
        Atualizar
      </button>
    </div>
  );
}

function hora(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return d.toLocaleString('pt-BR', hoje ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Sem internet, gravações na fila, erros: avisos curtos no topo */
function Avisos() {
  const { erro, limparErro, offlineDesde, falhaRede, pendentes, recarregar } = useDados();
  return (
    <>
      <AvisoNovaVersao />
      {offlineDesde && (
        <div className="alerta" style={{ marginBottom: 14, alignItems: 'center' }}>
          <span className="cresce">
            Sem conexão · mostrando os dados de {hora(offlineDesde)}
            {pendentes ? ` · ${pendentes} alteração(ões) guardada(s) para enviar` : ''}
          </span>
          <button className="botao pequeno" onClick={() => void recarregar()}>
            Tentar
          </button>
        </div>
      )}
      {!offlineDesde && pendentes > 0 && falhaRede && (
        <div className="alerta" style={{ marginBottom: 14, alignItems: 'center' }}>
          <span className="cresce">Sem conexão · {pendentes} alteração(ões) guardada(s) para enviar quando a internet voltar</span>
          <button className="botao pequeno" onClick={() => void recarregar()}>
            Tentar
          </button>
        </div>
      )}
      {!offlineDesde && pendentes > 0 && !falhaRede && (
        <div className="alerta info" style={{ marginBottom: 14 }}>
          {pendentes} alteração(ões) guardada(s) no aparelho, enviando…
        </div>
      )}
      {erro && (
        <div className="alerta erro" style={{ marginBottom: 14, alignItems: 'center' }} role="alert">
          <span className="cresce">{erro}</span>
          <button className="icone-botao" aria-label="Fechar aviso" onClick={limparErro} style={{ width: 32, height: 32 }}>
            <Icone nome="fechar" />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Número no ícone do app (iPhone 16.4+, instalado, com notificações): só pendências
 * importantes (dose, medição de segunda, ontem sem registro). Atualiza com os dados e
 * ao voltar ao app; 0 limpa.
 */
function useBadgeApp() {
  const { diario, medidas, dieta } = useDados();
  const { resumo, hoje } = useCalculos();
  const proj = useProjeto();
  const t = useTreino();
  const comTreino = !!t && t.placar.iniciado && !t.placar.encerrado;
  const n = pendentesHoje({
    hoje,
    diario,
    medidas,
    comDieta: !!dieta?.refeicoes.some((r) => r.itens.length),
    proxima: resumo?.proxima ?? null,
    ultimaDose: proj?.ultimaDose ?? null,
    posRemedio: !!proj?.pos,
    comTreino,
    treinoDia: t?.doDia(hoje) ?? null,
    temResumo: !!resumo && !!proj,
  });
  const ultimo = useRef(n);
  ultimo.current = n;
  useEffect(() => {
    void aplicarBadge(n);
  }, [n]);
  useEffect(() => {
    const ver = () => void aplicarBadge(ultimo.current);
    document.addEventListener('visibilitychange', ver);
    return () => {
      document.removeEventListener('visibilitychange', ver);
      // Saiu da conta: o ícone fica sem número
      void aplicarBadge(0);
    };
  }, []);
}

/** Só faz as contas do badge onde o aparelho tem o recurso */
function BadgeApp() {
  useBadgeApp();
  return null;
}

type DocumentoComTransicao = Document & { startViewTransition?: (atualizar: () => Promise<void>) => { finished: Promise<void> } };

/**
 * Troca de tela com transição suave (View Transitions: Safari 18+, Chrome): a tela
 * sai e a nova entra deslizando pouco, para o lado da aba escolhida; cabeçalho e
 * barra de abas ficam parados. Sem suporte ou com "Reduzir movimento": troca direto.
 */
function useTrocaDeTela(ordem: string[]) {
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const pronta = useRef<(() => void) | null>(null);
  // Cada aba abre do topo, não na altura em que a anterior estava; com a tela nova
  // já montada, a transição pode tirar a "foto" do depois
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    pronta.current?.();
    pronta.current = null;
  }, [pathname]);
  return (para: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const doc = document as DocumentoComTransicao;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
    if (para === pathname || typeof doc.startViewTransition !== 'function' || menosMovimento()) return;
    e.preventDefault();
    const posicao = (p: string) => {
      const i = ordem.indexOf(p);
      return i < 0 ? ordem.length : i;
    };
    const raiz = document.documentElement;
    raiz.dataset.troca = posicao(para) < posicao(pathname) ? 'voltar' : 'avancar';
    raiz.classList.add('trocando-tela');
    try {
      const t = doc.startViewTransition(
        () =>
          new Promise<void>((pronto) => {
            // Tela que demora (parte baixada sob demanda): não segura a transição
            const limite = setTimeout(pronto, 600);
            pronta.current = () => {
              clearTimeout(limite);
              pronto();
            };
            navegar(para);
          }),
      );
      t.finished.catch(() => undefined).finally(() => {
        raiz.classList.remove('trocando-tela');
        delete raiz.dataset.troca;
      });
    } catch {
      raiz.classList.remove('trocando-tela');
      navegar(para);
    }
  };
}

function Estrutura() {
  const { perfil, ciclo, recarregar } = useDados();
  const [comBadge] = useState(() => temBadge());
  const { pathname, search } = useLocation();
  const abas = perfil?.modulo_treino ? [...ABAS.slice(0, 4), ABA_TREINO, ABAS[4]] : ABAS;
  // Ordem da esquerda para a direita: abas e, depois, os botões do cabeçalho
  const trocar = useTrocaDeTela([...abas.map((a) => a.para), '/retatrutida', '/perfil']);
  const titulo = TITULOS_EXTRAS[pathname] ?? abas.find((a) => a.para === pathname)?.titulo ?? '';
  const primeiroNome = perfil?.nome.split(' ')[0];
  // Subtela do Perfil (?secao=) tem título e botão de voltar próprios: sem o título grande.
  // Tela nova fora das abas: ponha o título em TITULOS_EXTRAS (sem título, fica sem o grande)
  const comTituloGrande = !!titulo && !(pathname === '/perfil' && new URLSearchParams(search).has('secao'));
  const topo = useRef<HTMLElement>(null);
  const nav = useRef<HTMLElement>(null);
  const tituloGrande = useRef<HTMLDivElement>(null);
  useRolagemDaTela({ topo, nav, titulo: tituloGrande }, pathname + search);

  return (
    <>
      <div className="app">
        {/* Cabeçalho de vidro: marca, título pequeno (aparece quando o grande sai da tela) e atalhos */}
        <header className="topo" ref={topo}>
          <span className="marca-mini" aria-hidden="true">
            <img src={`${import.meta.env.BASE_URL}braco.webp`} alt="" />
          </span>
          {comTituloGrande ? (
            <div className="topo-titulo" aria-hidden="true">
              {titulo}
            </div>
          ) : (
            <h1 className="topo-titulo">{titulo}</h1>
          )}
          <div className="topo-acoes">
            <NavLink to="/retatrutida" onClick={trocar('/retatrutida')} className={({ isActive }) => `icone-botao${isActive ? ' ativo' : ''}`} aria-label="Sobre a retatrutida">
              <Icone nome="livro" />
            </NavLink>
            <NavLink to="/perfil" onClick={trocar('/perfil')} className={({ isActive }) => `icone-botao${isActive ? ' ativo' : ''}`} aria-label="Perfil">
              <Icone nome="perfil" />
            </NavLink>
          </div>
        </header>
        {comTituloGrande && (
          <div className="titulo-grande nao-imprimir" ref={tituloGrande}>
            <h1>{titulo}</h1>
            {pathname === '/' && <div className="sub">Olá{primeiroNome ? `, ${primeiroNome}` : ''} · {ciclo?.nome}</div>}
          </div>
        )}
        <Avisos />
        <PuxarAtualizar aoAtualizar={recarregar} />
        {comBadge && <BadgeApp />}
        <main>
          <Protecao chave={pathname}>
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/ciclo" element={<Ciclo />} />
            <Route path="/diario" element={<Navigate to="/ciclo?aba=diario" replace />} />
            <Route path="/medidas" element={<Medidas />} />
            <Route path="/dieta" element={<Dieta />} />
            <Route path="/analise" element={<Analise />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route
              path="/retatrutida"
              element={
                <Suspense fallback={<p className="mudo">Carregando…</p>}>
                  <Retatrutida />
                </Suspense>
              }
            />
            <Route
              path="/relatorio-final"
              element={
                <Suspense fallback={<p className="mudo">Carregando…</p>}>
                  <RelatorioFinal />
                </Suspense>
              }
            />
            {perfil?.modulo_treino && <Route path="/treino" element={<Treino />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Protecao>
        </main>
      </div>
      {/* Barra de abas flutuante (cápsula de vidro); encolhe rolando para baixo (useRolagemDaTela) */}
      <nav className="nav" aria-label="Navegação principal" ref={nav}>
        <div className={`nav-itens${abas.length > 5 ? ' seis' : ''}`}>
          {abas.map((a) => (
            <NavLink key={a.para} to={a.para} end onClick={trocar(a.para)} className={({ isActive }) => (isActive ? 'ativo' : '')}>
              <Icone nome={a.icone} />
              <span className="nav-rotulo">{a.rotulo}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <Comemoracoes />
    </>
  );
}

// A versão de demonstração roda dentro de outra página, então usa rotas com #
const Roteador = import.meta.env.VITE_DEMO ? HashRouter : BrowserRouter;

function SemConexao() {
  const { recarregar, carregando } = useDados();
  return (
    <div className="centro">
      <div className="entrada pilha" style={{ textAlign: 'center' }}>
        <h1>Sem conexão com o servidor</h1>
        <p className="mudo">Confira a internet. Se estiver com sinal, o servidor pode estar pausado ou fora do ar.</p>
        <button className="botao primario" disabled={carregando} onClick={() => void recarregar()}>
          {carregando ? 'Tentando…' : 'Tentar de novo'}
        </button>
      </div>
    </div>
  );
}

export function App() {
  const { usuario, carregando, perfil, ciclo, erro, semConexao, recuperandoSenha, falhouCarregar, recarregar } = useDados();
  if (recuperandoSenha) return <NovaSenha />;
  if (semConexao) return <SemConexao />;
  // Recarregando com os dados já na tela (puxar para atualizar, "Tentar"): a tela fica
  if (carregando && !(usuario && perfil && ciclo)) {
    return (
      <div className="carregando-app" role="status" aria-label="Carregando">
        <div className="esqueleto" style={{ height: 44, width: '55%' }} />
        <div className="esqueleto" style={{ height: 150 }} />
        <div className="esqueleto" style={{ height: 96 }} />
        <div className="esqueleto" style={{ height: 210 }} />
      </div>
    );
  }
  if (!usuario) return <Entrar />;
  if (!perfil || !ciclo) {
    // Falha ao carregar não é conta nova: não abre a configuração inicial por cima dos dados
    return erro || falhouCarregar ? (
      <div className="centro">
        <div className="pilha" style={{ alignItems: 'center' }}>
          <div className="alerta erro">{erro ?? 'Não foi possível carregar seus dados.'}</div>
          <button className="botao primario" onClick={() => void recarregar()}>
            Tentar de novo
          </button>
        </div>
      </div>
    ) : (
      <Configurar />
    );
  }
  return (
    <Roteador basename={import.meta.env.VITE_DEMO ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Estrutura />
    </Roteador>
  );
}
