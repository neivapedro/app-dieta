import { BrowserRouter, HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { NovaSenha } from './paginas/Entrar';
import { Protecao } from './componentes/Protecao';
import { Icone } from './componentes/ui';
import { useDados } from './dados/contexto';
import { Analise } from './paginas/Analise';
import { Ciclo } from './paginas/Ciclo';
import { Configurar } from './paginas/Configurar';
import { Dieta } from './paginas/Dieta';
import { Entrar } from './paginas/Entrar';
import { Inicio } from './paginas/Inicio';
import { Medidas } from './paginas/Medidas';
import { Perfil } from './paginas/Perfil';
import { Treino } from './paginas/Treino';

const ABAS = [
  { para: '/', rotulo: 'Início', icone: 'inicio', titulo: 'Início' },
  { para: '/ciclo', rotulo: 'Ciclo', icone: 'ciclo', titulo: 'Ciclo' },
  { para: '/medidas', rotulo: 'Medidas', icone: 'medidas', titulo: 'Medidas' },
  { para: '/dieta', rotulo: 'Dieta', icone: 'dieta', titulo: 'Dieta' },
  { para: '/analise', rotulo: 'Análise', icone: 'analise', titulo: 'Análise do ciclo' },
];

const ABA_TREINO = { para: '/treino', rotulo: 'Treino', icone: 'treino', titulo: 'Treino' };

function AvisoNovaVersao() {
  const [nova, setNova] = useState(false);
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
  const { erro, limparErro, offlineDesde, pendentes, recarregar } = useDados();
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
      {!offlineDesde && pendentes > 0 && (
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

function Estrutura() {
  const { perfil, ciclo } = useDados();
  const { pathname } = useLocation();
  const abas = perfil?.modulo_treino ? [...ABAS.slice(0, 4), ABA_TREINO, ABAS[4]] : ABAS;
  const titulo = pathname === '/perfil' ? 'Perfil' : abas.find((a) => a.para === pathname)?.titulo ?? '';
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
          <Link to="/perfil" className="icone-botao" aria-label="Perfil">
            <Icone nome="perfil" />
          </Link>
        </header>
        <Avisos />
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
  const { usuario, carregando, perfil, ciclo, erro, semConexao, recuperandoSenha } = useDados();
  if (recuperandoSenha) return <NovaSenha />;
  if (semConexao) return <SemConexao />;
  if (carregando) {
    return (
      <div className="centro">
        <p className="mudo">Carregando…</p>
      </div>
    );
  }
  if (!usuario) return <Entrar />;
  if (!perfil || !ciclo) {
    return erro ? (
      <div className="centro"><div className="alerta erro">{erro}</div></div>
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
