// Web Push (PWA no iPhone pelo Safari, Chrome, Edge): mostra a notificação mesmo com o app fechado
// e, ao tocar, abre (ou traz para a frente) o Zynko na conversa. Incluído no service worker pelo
// nuxt.config.ts (workbox.importScripts).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Zynko', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Zynko';
  // Número de não lidas no ícone do app (iPhone 16.4+ instalado, Android, computador).
  if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
    self.navigator.setAppBadge(data.badge).catch(() => {});
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // Mesma conversa: o aviso novo substitui o anterior em vez de empilhar.
      tag: data.tag || undefined,
      renotify: !!data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: data.data || {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = event.notification.data && event.notification.data.conversationId;
  const url = conversationId ? `/?c=${encodeURIComponent(conversationId)}` : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'open-conversation', conversationId });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
