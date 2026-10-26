import { BrowserRouter, HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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

const ABAS = [
  { para: '/', rotulo: 'Início', icone: 'inicio', titulo: 'Início' },
  { para: '/ciclo', rotulo: 'Ciclo', icone: 'ciclo', titulo: 'Ciclo' },
  { para: '/medidas', rotulo: 'Medidas', icone: 'medidas', titulo: 'Medidas' },
  { para: '/dieta', rotulo: 'Dieta', icone: 'dieta', titulo: 'Dieta' },
  { para: '/analise', rotulo: 'Análise', icone: 'analise', titulo: 'Análise do ciclo' },
];

const ABA_TREINO = { para: '/treino', rotulo: 'Treino', icone: 'treino', titulo: 'Treino' };

// Telas abertas pelos botões do cabeçalho (fora da barra de abas)
const TITULOS_EXTRAS: Record<string, string> = { '/perfil': 'Perfil', '/retatrutida': 'Retatrutida' };

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
 * Número no ícone do app (iPhone 16.4+, instalado, com notificações): tarefas de hoje
 * que faltam no checklist do Início. Atualiza com os dados e ao voltar ao app; 0 limpa.
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

function Estrutura() {
  const { perfil, ciclo, recarregar } = useDados();
  const [comBadge] = useState(() => temBadge());
  const { pathname } = useLocation();
  // Cada aba abre do topo, não na altura em que a anterior estava
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const abas = perfil?.modulo_treino ? [...ABAS.slice(0, 4), ABA_TREINO, ABAS[4]] : ABAS;
  const titulo = TITULOS_EXTRAS[pathname] ?? abas.find((a) => a.para === pathname)?.titulo ?? '';
  const primeiroNome = perfil?.nome.split(' ')[0];

  return (
    <>
      <div className="app">
        <header className="topo">
          <div className="topo-marca">
            <span className="marca-mini" aria-hidden="true">
              <img src={`${import.meta.env.BASE_URL}braco.webp`} alt="" />
            </span>
            <div style={{ minWidth: 0 }}>
              <h1>{titulo}</h1>
              {pathname === '/' && <div className="sub">Olá{primeiroNome ? `, ${primeiroNome}` : ''} · {ciclo?.nome}</div>}
            </div>
          </div>
          <div className="topo-acoes">
            <NavLink to="/retatrutida" className={({ isActive }) => `icone-botao${isActive ? ' ativo' : ''}`} aria-label="Sobre a retatrutida">
              <Icone nome="livro" />
            </NavLink>
            <NavLink to="/perfil" className={({ isActive }) => `icone-botao${isActive ? ' ativo' : ''}`} aria-label="Perfil">
              <Icone nome="perfil" />
            </NavLink>
          </div>
        </header>
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
            {perfil?.modulo_treino && <Route path="/treino" element={<Treino />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Protecao>
        </main>
      </div>
      <nav className="nav" aria-label="Navegação principal">
        <div className={`nav-itens ${abas.length > 6 ? 'apertado' : ''}`} style={{ gridTemplateColumns: `repeat(${abas.length}, 1fr)` }}>
          {abas.map((a) => (
            <NavLink key={a.para} to={a.para} end className={({ isActive }) => (isActive ? 'ativo' : '')}>
              <Icone nome={a.icone} />
              {a.rotulo}
            </NavLink>
          ))}
        </div>
      </nav>
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
