// Trava da rolagem da página com contagem: várias camadas abertas (folha, tela cheia, stories)
// podem travar e soltar em qualquer ordem — a página só volta a rolar quando a última solta.
// (Guardar e restaurar o overflow em cada camada falhava ao fechar duas de uma vez: a de fora
// restaurava "" e depois a de dentro restaurava o "hidden" que tinha guardado.)

let travas = 0;
let original = '';

export function travarRolagem(corpo: { style: { overflow: string } } = document.body): () => void {
  if (travas === 0) {
    original = corpo.style.overflow === 'hidden' ? '' : corpo.style.overflow;
    corpo.style.overflow = 'hidden';
  }
  travas++;
  let solta = false;
  return () => {
    if (solta) return;
    solta = true;
    travas = Math.max(0, travas - 1);
    if (travas === 0) corpo.style.overflow = original;
  };
}

/** Só para os testes */
export function travasAbertas(): number {
  return travas;
}
