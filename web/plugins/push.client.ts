import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

// Notificações nativas do app (iPhone pelo APNs, Android pelo Firebase). Só roda dentro do app (Capacitor); no navegador não faz nada.
// Logado: pede permissão, registra o aparelho no servidor (preso a esta sessão) e, ao tocar no aviso,
// abre a conversa. Com o app aberto o aviso não aparece (presentationOptions vazio no capacitor.config.ts).
export default defineNuxtPlugin(() => {
  if (!isNativeApp()) return;
  const platform = Capacitor.getPlatform();
  // Android: só o APK com Firebase (marca no User-Agent, ver capacitor.config.ts). Sem ele, registrar derruba o app.
  if (platform === 'android' && !navigator.userAgent.includes('ChatPush/fcm')) return;
  if (platform !== 'ios' && platform !== 'android') return;
  const auth = useAuth();
  let listening = false;

  async function openFromNotification(conversationId: string) {
    if (!auth.token.value) return;
    await navigateTo('/');
    const chat = useChat();
    // Abriu o app pelo aviso: espera a lista de conversas chegar antes de abrir a certa.
    for (let i = 0; i < 50 && !chat.conversations.value.some((c) => c.id === conversationId); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await chat.openConversation(conversationId).catch(() => {});
  }

  async function setup() {
    if (!listening) {
      listening = true;
      await PushNotifications.addListener('registration', ({ value }) => {
        void auth.api('/push/devices', { method: 'POST', body: { token: value, platform } }).catch(() => {});
      });
      await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const id = notification.data?.conversationId;
        if (typeof id === 'string') void openFromNotification(id);
      });
    }
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    // A cada abertura: o token pode mudar e passa a valer para a sessão atual.
    if (perm.receive === 'granted') await PushNotifications.register();
  }

  // Abriu o app: as notificações já mostradas saem da barra (e o número do ícone do Android some com elas).
  const clearDelivered = () => {
    if (document.visibilityState === 'visible') void PushNotifications.removeAllDeliveredNotifications().catch(() => {});
  };
  document.addEventListener('visibilitychange', clearDelivered);
  clearDelivered();

  watch(
    auth.token,
    (token) => {
      if (token) void setup().catch(() => {});
    },
    { immediate: true },
  );
});
