/**
 * Computador = tela grande com mouse. Como no WhatsApp, o Chat é um app de celular: no computador
 * só se entra lendo o QR code com o celular já logado (o cadastro por número fica no celular).
 */
export const isDesktopDevice = () => import.meta.client && window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;
