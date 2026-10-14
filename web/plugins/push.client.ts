import { PushNotifications } from '@capacitor/push-notifications';

// Notificações nativas do app de iPhone (APNs). Só roda dentro do app (Capacitor); no navegador não faz nada.
// Logado: pede permissão, registra o aparelho no servidor (preso a esta sessão) e, ao tocar no aviso,
// abre a conversa. Com o app aberto o aviso não aparece (presentationOptions vazio no capacitor.config.ts).
export default defineNuxtPlugin(() => {
  if (!isNativeApp()) return;
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
        void auth.api('/push/devices', { method: 'POST', body: { token: value, platform: 'ios' } }).catch(() => {});
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

  watch(
    auth.token,
    (token) => {
      if (token) void setup().catch(() => {});
    },
    { immediate: true },
  );
});
