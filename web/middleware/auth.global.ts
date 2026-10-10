// Sem login: no celular vai direto para o número/código; no computador passa pela apresentação (/inicio)
// e de lá para o QR code.
const PUBLIC = ['/login', '/inicio'];

export default defineNuxtRouteMiddleware((to) => {
  const { token } = useAuth();
  if (token.value) {
    if (PUBLIC.includes(to.path)) return navigateTo('/');
    return;
  }
  const desktop = isDesktopDevice();
  if (to.path === '/inicio' && !desktop) return navigateTo('/login');
  if (!PUBLIC.includes(to.path)) return navigateTo(desktop ? '/inicio' : '/login');
});
