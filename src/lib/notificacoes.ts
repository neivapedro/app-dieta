import type { Repositorio } from '../dados/repositorio';

const VAPID_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

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

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
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
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    tag: 'teste',
  });
}
