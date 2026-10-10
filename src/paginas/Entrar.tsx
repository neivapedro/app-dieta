import { ehErroDeRede } from '../lib/erros';
import { useState, type FormEvent } from 'react';
import { useDados } from '../dados/contexto';
import { Campo } from '../componentes/ui';

type Modo = 'entrar' | 'cadastrar' | 'recuperar';

export function Entrar() {
  const { repo } = useDados();
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setEnviando(true);
    try {
      if (modo === 'entrar') await repo.entrar(email.trim(), senha);
      else if (modo === 'cadastrar') {
        if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        const { confirmarEmail } = await repo.cadastrar(email.trim(), senha);
        if (confirmarEmail) setMsg({ tipo: 'info', texto: 'Conta criada! Abra o link de confirmação enviado para o seu e-mail e depois entre.' });
      } else {
        await repo.recuperarSenha(email.trim());
        setMsg({ tipo: 'info', texto: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.' });
      }
    } catch (e) {
      setMsg({ tipo: 'erro', texto: ehErroDeRede(e) ? 'Sem conexão com a internet. Confira o sinal e tente de novo.' : (e as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="centro">
      <form className="entrada pilha" onSubmit={enviar}>
        <div className="pilha" style={{ alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <div className="marca-heroi">
            <img src={`${import.meta.env.BASE_URL}braco.webp`} alt="" />
          </div>
          <span className="nome-app">Ciclo</span>
          <h1>Seu ciclo, suas medidas, sua evolução</h1>
          <p className="mudo">Aplicações, composição corporal e resultados em um só lugar.</p>
        </div>
        {repo.modo === 'local' && (
          <div className="alerta info">
            Modo demonstração: a nuvem ainda não foi configurada, então os dados ficam só neste navegador.
          </div>
        )}
        {modo !== 'recuperar' && (
          <div className="abas">
            <button type="button" className={modo === 'entrar' ? 'ativo' : ''} onClick={() => setModo('entrar')}>Entrar</button>
            <button type="button" className={modo === 'cadastrar' ? 'ativo' : ''} onClick={() => setModo('cadastrar')}>Criar conta</button>
          </div>
        )}
        <Campo rotulo="E-mail">
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Campo>
        {modo !== 'recuperar' && (
          <Campo rotulo="Senha">
            <input
              type="password"
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={6}
              required
            />
          </Campo>
        )}
        {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
        <button className="botao primario" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar conta' : 'Enviar link'}
        </button>
        {modo === 'entrar' && repo.modo === 'nuvem' && (
          <button type="button" className="botao pequeno" style={{ border: 0, background: 'none' }} onClick={() => setModo('recuperar')}>
            Esqueci minha senha
          </button>
        )}
        {modo === 'recuperar' && (
          <button type="button" className="botao pequeno" onClick={() => setModo('entrar')}>Voltar</button>
        )}
      </form>
    </div>
  );
}

/** Aberta pelo link de "Esqueci minha senha": define a senha nova. */
export function NovaSenha() {
  const { repo, encerrarRecuperacao } = useDados();
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 6) return setMsg({ tipo: 'erro', texto: 'A senha precisa ter pelo menos 6 caracteres.' });
    if (senha !== repetir) return setMsg({ tipo: 'erro', texto: 'As duas senhas não são iguais.' });
    setEnviando(true);
    try {
      await repo.definirSenha(senha);
      setPronto(true);
      setMsg({ tipo: 'info', texto: 'Senha alterada. Se você instalou o app na Tela de Início, abra-o pelo ícone e entre com a senha nova.' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: ehErroDeRede(e) ? 'Sem conexão com a internet. Confira o sinal e tente de novo.' : (e as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="centro">
      <form className="entrada pilha" onSubmit={enviar}>
        <h1>Criar senha nova</h1>
        {!pronto && (
          <>
            <Campo rotulo="Senha nova">
              <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} required />
            </Campo>
            <Campo rotulo="Repita a senha">
              <input type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} minLength={6} required />
            </Campo>
          </>
        )}
        {msg && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}
        {pronto ? (
          <button type="button" className="botao primario" onClick={encerrarRecuperacao}>
            Continuar
          </button>
        ) : (
          <button className="botao primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar senha'}
          </button>
        )}
      </form>
    </div>
  );
}
