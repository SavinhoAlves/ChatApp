/**
 * Computador = tela grande com mouse. Como no WhatsApp, o Chat é um app de celular: no computador
 * só se entra lendo o QR code com o celular já logado (o cadastro por número fica no celular).
 */
export const isDesktopDevice = () => import.meta.client && window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;

/** Rodando dentro do app nativo (Capacitor, iPhone). */
export const isNativeApp = () =>
  import.meta.client && !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Aberto como app (nativo ou PWA na tela inicial), e não numa aba do navegador. */
export const isInstalledApp = () =>
  import.meta.client &&
  (isNativeApp() ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * Layout por plataforma, como no WhatsApp: no iPhone a barra de baixo é flutuante e a nova conversa fica
 * no "+" do topo; no Android há o botão flutuante e as abas começam por Conversas.
 */
export function uiPlatform(): 'ios' | 'android' | 'desktop' {
  if (!import.meta.client) return 'desktop';
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  if (cap === 'ios' || cap === 'android') return cap;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}
