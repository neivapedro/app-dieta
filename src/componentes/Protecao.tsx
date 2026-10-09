import { Component, type ReactNode } from 'react';

/** Se uma tela quebrar (ex.: parte do app não baixou), mostra um aviso com "Recarregar" em vez de tela preta. */
export class Protecao extends Component<{ children: ReactNode; chave?: string }, { erro: Error | null; chave?: string }> {
  state: { erro: Error | null; chave?: string } = { erro: null, chave: this.props.chave };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  static getDerivedStateFromProps(props: { chave?: string }, state: { erro: Error | null; chave?: string }) {
    // Trocar de aba limpa o erro da aba anterior
    return props.chave !== state.chave ? { erro: null, chave: props.chave } : null;
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="cartao pilha">
        <h2>Algo deu errado nesta tela</h2>
        <p className="mudo">Normalmente é uma versão nova do app chegando ou falta de sinal. Seus dados estão salvos.</p>
        <button className="botao primario" onClick={() => location.reload()}>
          Recarregar
        </button>
      </div>
    );
  }
}
