/**
 * Computador = tela grande com mouse. Como no WhatsApp, o Chat é um app de celular: no computador
 * só se entra lendo o QR code com o celular já logado (o cadastro por número fica no celular).
 */
export const isDesktopDevice = () => import.meta.client && window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;

/** Aberto como app instalado (PWA na tela inicial), e não numa aba do navegador. */
export const isInstalledApp = () =>
  import.meta.client &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
