/**
 * Web Push: notificações com o app fechado no PWA (iPhone pelo Safari, iOS 16.4+, instalado na tela inicial)
 * e em navegadores. O app nativo (Android/iPhone) usa o plugin próprio (plugins/push.client.ts).
 */
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function useWebPush() {
  const { api } = useAuth();

  const supported = () =>
    import.meta.client && !isNativeApp() && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

  /** Inscreve este aparelho (precisa da permissão já concedida). Seguro chamar várias vezes. */
  async function subscribe() {
    if (!supported() || Notification.permission !== 'granted') return false;
    const { publicKey } = await api<{ publicKey: string | null }>('/push/vapid');
    if (!publicKey) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await api('/push/devices', { method: 'POST', body: { platform: 'web', subscription: { endpoint: json.endpoint, keys: json.keys } } });
    return true;
  }

  /** Pede a permissão (no iPhone só funciona a partir de um toque) e inscreve. */
  async function enable() {
    if (!supported()) return 'unsupported' as const;
    const result = await Notification.requestPermission();
    if (result !== 'granted') return result;
    await subscribe();
    return 'granted' as const;
  }

  return { supported, subscribe, enable };
}
