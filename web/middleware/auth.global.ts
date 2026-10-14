// Sem login: quem abre o endereço no navegador vê a apresentação (/inicio). O app instalado (Android,
// iPhone ou PWA) mostra as boas-vindas animadas na primeira vez (/bemvindo) e depois o cadastro.
const PUBLIC = ['/login', '/inicio', '/bemvindo'];

function welcomed() {
  try {
    return localStorage.getItem('zynko.welcomed') === '1';
  } catch {
    return true;
  }
}

export default defineNuxtRouteMiddleware((to) => {
  const { token } = useAuth();
  if (token.value) {
    if (PUBLIC.includes(to.path)) return navigateTo('/');
    return;
  }
  const app = isInstalledApp();
  if (to.path === '/inicio' && app) return navigateTo('/login');
  if (!PUBLIC.includes(to.path)) {
    if (!app) return navigateTo('/inicio');
    return navigateTo(welcomed() ? '/login' : '/bemvindo');
  }
});
