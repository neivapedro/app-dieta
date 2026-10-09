import { BrowserRouter, HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Icone } from './componentes/ui';
import { useDados } from './dados/contexto';
import { Analise } from './paginas/Analise';
import { Ciclo } from './paginas/Ciclo';
import { Configurar } from './paginas/Configurar';
import { Diario } from './paginas/Diario';
import { Entrar } from './paginas/Entrar';
import { Inicio } from './paginas/Inicio';
import { Medidas } from './paginas/Medidas';
import { Perfil } from './paginas/Perfil';
import { Treino } from './paginas/Treino';

const ABAS = [
  { para: '/', rotulo: 'Início', icone: 'inicio', titulo: 'Início' },
  { para: '/ciclo', rotulo: 'Ciclo', icone: 'ciclo', titulo: 'Ciclo' },
  { para: '/diario', rotulo: 'Diário', icone: 'diario', titulo: 'Diário' },
  { para: '/medidas', rotulo: 'Medidas', icone: 'medidas', titulo: 'Medidas' },
  { para: '/analise', rotulo: 'Análise', icone: 'analise', titulo: 'Análise do ciclo' },
];

const ABA_TREINO = { para: '/treino', rotulo: 'Treino', icone: 'treino', titulo: 'Treino' };

function Estrutura() {
  const { perfil, ciclo, erro } = useDados();
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
        {erro && <div className="alerta erro" style={{ marginBottom: 14 }}>{erro}</div>}
        <main>
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/ciclo" element={<Ciclo />} />
            <Route path="/diario" element={<Diario />} />
            <Route path="/medidas" element={<Medidas />} />
            <Route path="/analise" element={<Analise />} />
            <Route path="/perfil" element={<Perfil />} />
            {perfil?.modulo_treino && <Route path="/treino" element={<Treino />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <nav className="nav" aria-label="Navegação principal">
        <div className="nav-itens" style={{ gridTemplateColumns: `repeat(${abas.length}, 1fr)` }}>
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

export function App() {
  const { usuario, carregando, perfil, ciclo, erro } = useDados();
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
