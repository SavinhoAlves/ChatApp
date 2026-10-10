// Sem login: quem abre o endereço no navegador vê a apresentação (/inicio). O app instalado no celular
// vai direto para o número/código. No computador, da apresentação se segue para o QR code.
const PUBLIC = ['/login', '/inicio'];

export default defineNuxtRouteMiddleware((to) => {
  const { token } = useAuth();
  if (token.value) {
    if (PUBLIC.includes(to.path)) return navigateTo('/');
    return;
  }
  if (to.path === '/inicio' && isInstalledApp()) return navigateTo('/login');
  if (!PUBLIC.includes(to.path)) return navigateTo(isInstalledApp() ? '/login' : '/inicio');
});
