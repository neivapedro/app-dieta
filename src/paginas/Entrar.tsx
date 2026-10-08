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
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="centro">
      <form className="entrada pilha" onSubmit={enviar}>
        <div className="pilha" style={{ alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <img src={`${import.meta.env.BASE_URL}icone-192.png`} alt="" className="logo" />
          <h1>Ciclo · Acompanhamento</h1>
          <p className="mudo">Aplicações, medidas e evolução, em um só lugar.</p>
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
