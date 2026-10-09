import { VAPID_PUBLICA } from '../config';
import type { Repositorio } from '../dados/repositorio';

export type EstadoNotificacao =
  | 'sem-suporte'
  | 'ios-instalar'
  | 'negado'
  | 'pendente'
  | 'ativo'
  | 'ativo-sem-servidor';

export function ehIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function instaladoComoApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Registra o service worker e procura versão nova sempre que o app volta para a tela.
 * Quando a versão nova assume, dispara o evento "nova-versao" (o App mostra o aviso).
 */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const tinhaControle = !!navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (tinhaControle) {
        (window as { novaVersao?: boolean }).novaVersao = true;
        window.dispatchEvent(new Event('nova-versao'));
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
    });
    return reg;
  } catch {
    return null;
  }
}

export async function estadoNotificacao(): Promise<EstadoNotificacao> {
  // No iPhone, o push só existe com o app adicionado à Tela de Início (iOS 16.4+).
  if (ehIOS() && !instaladoComoApp()) return 'ios-instalar';
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return 'sem-suporte';
  if (Notification.permission === 'denied') return 'negado';
  if (Notification.permission !== 'granted') return 'pendente';
  if (!VAPID_PUBLICA || !('PushManager' in window)) return 'ativo-sem-servidor';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'ativo' : 'pendente';
}

function base64ParaBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesParaBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/** Pede permissão e inscreve este aparelho para receber os lembretes. */
export async function ativarNotificacoes(repo: Repositorio): Promise<EstadoNotificacao> {
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'pendente';
  if (!VAPID_PUBLICA || !('PushManager' in window) || repo.modo === 'local') return 'ativo-sem-servidor';
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(VAPID_PUBLICA) }));
  await repo.salvarInscricaoPush({
    endpoint: sub.endpoint,
    p256dh: bytesParaBase64(sub.getKey('p256dh')),
    auth: bytesParaBase64(sub.getKey('auth')),
  });
  return 'ativo';
}

export async function desativarNotificacoes(repo: Repositorio): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager?.getSubscription();
  if (sub) {
    await repo.removerInscricaoPush(sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function notificacaoTeste(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Teste de lembrete 💉', {
    body: 'As notificações estão funcionando neste aparelho.',
    icon: `${import.meta.env.BASE_URL}icone-192.png`,
    badge: `${import.meta.env.BASE_URL}icone-192.png`,
    tag: 'teste',
  });
}

/**
 * Ao abrir o app: se este aparelho já tem permissão e inscrição, garante que ela
 * está gravada no servidor para a conta atual (o iOS pode trocar o endereço e o
 * servidor apaga inscrições recusadas pela Apple).
 */
export async function sincronizarInscricao(repo: Repositorio): Promise<void> {
  if (!VAPID_PUBLICA || !('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await repo.salvarInscricaoPush({
    endpoint: sub.endpoint,
    p256dh: bytesParaBase64(sub.getKey('p256dh')),
    auth: bytesParaBase64(sub.getKey('auth')),
  });
}

/** Ao sair da conta: este aparelho deixa de receber os lembretes dela. */
export async function esquecerAparelho(repo: Repositorio): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (sub) await repo.removerInscricaoPush(sub.endpoint);
}

/**
 * Confere no servidor se há versão nova publicada (independe do service worker,
 * que no iPhone pode demorar a perceber). Dispara "nova-versao" para o aviso.
 */
export function vigiarVersaoNova(): void {
  if (import.meta.env.DEV || import.meta.env.VITE_DEMO) return;
  const conferir = () =>
    fetch(`${import.meta.env.BASE_URL}versao.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { versao?: string } | null) => {
        if (v?.versao && v.versao !== __VERSAO_APP__) {
          (window as { novaVersao?: boolean }).novaVersao = true;
          window.dispatchEvent(new Event('nova-versao'));
        }
      })
      .catch(() => undefined);
  conferir();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && conferir());
  setInterval(conferir, 10 * 60 * 1000);
}
