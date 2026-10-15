import { Capacitor } from '@capacitor/core';

// Android: a barra de status fica por cima do app. Alguns aparelhos/WebViews informam altura 0 para ela,
// e aí o topo do app ficava escondido atrás do relógio/bateria. Mede e, se vier 0, usa a altura padrão.
export default defineNuxtPlugin(() => {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return;
  const check = () => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;visibility:hidden;height:var(--sat)';
    document.body.appendChild(probe);
    const h = probe.offsetHeight;
    probe.remove();
    // O Capacitor injeta '0px' quando ele mesmo já afastou o app da barra: aí não mexe.
    const injected = document.documentElement.style.getPropertyValue('--safe-area-inset-top');
    if (h === 0 && !injected) document.documentElement.style.setProperty('--safe-area-inset-top', '28px');
  };
  setTimeout(check, 800);
});
