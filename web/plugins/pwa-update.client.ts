// App instalado (PWA): o navegador só procura versão nova quando o app abre do zero. No celular o app
// costuma ficar em segundo plano e "voltar" não conta, então ficava preso na versão antiga.
// Aqui verificamos também ao voltar para a tela e a cada 30 min; achando versão nova, o próprio
// service worker assume (registerType: 'autoUpdate') e a página recarrega sozinha.
const CHECK_EVERY_MS = 30 * 60_000;

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hook('service-worker:registered', ({ registration }) => {
    if (!registration) return;
    let last = Date.now();
    const check = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      last = Date.now();
      registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', check);
    setInterval(() => Date.now() - last >= CHECK_EVERY_MS && check(), 60_000);
  });
});
