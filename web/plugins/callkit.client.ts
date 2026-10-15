import { Capacitor } from '@capacitor/core';
import { IncomingCallKit } from '@capgo/capacitor-incoming-call-kit';

// Android: ligação chegando aparece em tela cheia (também bloqueado), pela biblioteca de chamadas.
// O aviso vem do servidor pelo Firebase (CallPushService.java); aqui só tratamos Atender/Recusar.
export default defineNuxtPlugin(() => {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return;
  if (!navigator.userAgent.includes('ChatPush/fcm')) return;
  const auth = useAuth();
  const chat = useChat();
  const calls = useCall();

  // O app pode ter sido aberto agora pelo botão: espera conectar antes de responder.
  async function whenConnected() {
    for (let i = 0; i < 150 && !chat.connected.value; i++) await new Promise((r) => setTimeout(r, 100));
    return chat.connected.value;
  }

  void IncomingCallKit.addListener('callAccepted', async ({ call }) => {
    if (!(await whenConnected())) return;
    await navigateTo('/');
    if (calls.call.value?.id === call.callId && calls.call.value.status === 'incoming') await calls.accept(call.hasVideo);
    else if (calls.call.value?.id !== call.callId) await calls.join(call.callId, call.hasVideo);
  });

  void IncomingCallKit.addListener('callDeclined', async ({ call }) => {
    if (!(await whenConnected())) return;
    if (calls.call.value?.id === call.callId) await calls.decline();
    else chat.getSocket()?.emit('call:decline', { callId: call.callId }, () => {});
  });

  // Com o app aberto na tela, a ligação já aparece dentro dele: fecha a tela nativa.
  void IncomingCallKit.addListener('incomingCallDisplayed', ({ call }) => {
    if (document.visibilityState === 'visible') void IncomingCallKit.endCall({ callId: call.callId }).catch(() => {});
  });

  async function askPermissions() {
    let perm = await IncomingCallKit.checkPermissions();
    if (perm.notifications === 'prompt') perm = await IncomingCallKit.requestPermissions();
    // Android 14+: tela cheia com o aparelho bloqueado precisa ser liberada nas configurações (uma vez).
    if (perm.fullScreenIntent === 'denied' && !localStorage.getItem('zynko.fsiAsked')) {
      try {
        localStorage.setItem('zynko.fsiAsked', '1');
      } catch {}
      const ok = await useConfirm().confirm({
        title: 'Ligações na tela bloqueada',
        message: 'Para ver quem está ligando com o celular bloqueado, permita "notificações em tela cheia" para o Zynko.',
        confirmLabel: 'Permitir',
      });
      if (ok) await IncomingCallKit.requestFullScreenIntentPermission();
    }
  }

  watch(
    auth.token,
    (token) => {
      if (token) void askPermissions().catch(() => {});
    },
    { immediate: true },
  );
});
