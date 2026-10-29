// Toque tátil (vibração curta) nos toques que gravam algo, nas trocas de aba e nas folhas.
// Android: Vibration API. iPhone (iOS 18+): o Safari não tem a API, mas alternar um
// <input type="checkbox" switch> pelo <label> dá o "tique" nativo do sistema; por isso
// um par label + switch escondido (fora da tela, sem display:none) fica no fim do <body>.
// Chame dentro do tratador do toque, de forma síncrona (o iPhone exige o gesto do usuário).
// Nunca lança erro; sem suporte, não faz nada. Desligável por localStorage (vibracao=desligada).

const CHAVE = 'vibracao';
/** Dois chamados quase juntos (ex.: o botão e o gravar do mesmo toque) viram um tique só */
const INTERVALO_MIN_MS = 40;
/** Espaço entre os dois tiques do "sucesso" */
export const ESPACO_SUCESSO_MS = 80;

let rotulo: HTMLLabelElement | null = null;
let ultimo = -Infinity;
const agoraMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/** Vibração ligada (padrão) ou desligada pela pessoa */
export function vibracaoLigada(): boolean {
  try {
    return globalThis.localStorage?.getItem(CHAVE) !== 'desligada';
  } catch {
    return true;
  }
}

/** Liga ou desliga a vibração do app (fica no aparelho) */
export function definirVibracao(ligada: boolean): void {
  try {
    if (ligada) globalThis.localStorage?.removeItem(CHAVE);
    else globalThis.localStorage?.setItem(CHAVE, 'desligada');
  } catch {
    /* sem armazenamento: segue o padrão */
  }
}

function ehIOS(): boolean {
  const n = globalThis.navigator;
  if (!n) return false;
  // iPadOS se apresenta como Mac, mas com toque
  return /iP(hone|ad|od)/.test(n.userAgent ?? '') || (n.platform === 'MacIntel' && (n.maxTouchPoints ?? 0) > 1);
}

/** O par label + switch escondido, criado uma vez (e recriado se alguém o tirar da página) */
function rotuloSwitch(): HTMLLabelElement | null {
  const doc = globalThis.document;
  if (!doc?.body) return null;
  if (rotulo && rotulo.isConnected) return rotulo;
  const l = doc.createElement('label');
  l.setAttribute('aria-hidden', 'true');
  l.setAttribute('data-haptico', '');
  // Fora da tela (display:none não dispara o tique)
  l.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  const i = doc.createElement('input');
  i.type = 'checkbox';
  i.setAttribute('switch', '');
  i.tabIndex = -1;
  i.setAttribute('aria-hidden', 'true');
  l.appendChild(i);
  // O clique do tique não sobe para a página (ex.: "toque fora fecha")
  l.addEventListener('click', (e) => e.stopPropagation());
  doc.body.appendChild(l);
  rotulo = l;
  return l;
}

function tiqueIOS(): void {
  const l = rotuloSwitch();
  if (!l) return;
  const doc = globalThis.document;
  const antes = doc.activeElement as HTMLElement | null;
  l.click();
  // Se o navegador mover o foco para o switch, devolve (não fecha o teclado nem sai da folha)
  if (antes && doc.activeElement !== antes && typeof antes.focus === 'function') antes.focus({ preventScroll: true });
}

function podeVibrar(): boolean {
  return typeof globalThis.navigator?.vibrate === 'function';
}

/** Um tique leve (marcar, trocar de aba, a folha encaixar) */
export function vibrarLeve(): void {
  try {
    if (!vibracaoLigada()) return;
    const agora = agoraMs();
    if (agora - ultimo < INTERVALO_MIN_MS) return;
    ultimo = agora;
    if (podeVibrar()) navigator.vibrate(10);
    else if (ehIOS()) tiqueIOS();
  } catch {
    /* sem vibração */
  }
}

/** Dois tiques curtos (salvou) */
export function vibrarSucesso(): void {
  try {
    if (!vibracaoLigada()) return;
    ultimo = agoraMs();
    if (podeVibrar()) navigator.vibrate([12, ESPACO_SUCESSO_MS, 12]);
    else if (ehIOS()) {
      tiqueIOS();
      setTimeout(() => {
        try {
          tiqueIOS();
        } catch {
          /* sem o segundo tique */
        }
      }, ESPACO_SUCESSO_MS);
    }
  } catch {
    /* sem vibração */
  }
}

/** Só para os testes */
export function reiniciarHaptico(): void {
  rotulo = null;
  ultimo = -Infinity;
}
