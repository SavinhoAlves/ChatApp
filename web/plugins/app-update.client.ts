import { Capacitor, registerPlugin } from '@capacitor/core';

// Android: atualização do APK. Ao abrir, ao voltar para o app e quando a rede volta, pergunta ao servidor
// se há versão nova; havendo, baixa em segundo plano e oferece instalar (o Android exige esse toque).
type AppUpdatePlugin = {
  getVersion(): Promise<{ version: string }>;
  download(o: { url: string; version: string; size: number }): Promise<void>;
  install(o: { version: string }): Promise<{ needsPermission?: boolean }>;
};
const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate');

const newer = (a: string, b: string) => {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

export default defineNuxtPlugin(() => {
  // APKs antigos não têm o plugin nativo: só a partir desta versão.
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('AppUpdate')) return;
  let busy = false;
  let lastCheck = 0;
  let declined = '';

  async function check() {
    if (busy || !navigator.onLine || Date.now() - lastCheck < 10 * 60_000) return;
    busy = true;
    try {
      const latest = await $fetch<{ version: string; url: string; size: number }>('/api/app/android').catch(() => null);
      lastCheck = Date.now();
      if (!latest) return;
      const { version } = await AppUpdate.getVersion();
      if (!newer(latest.version, version) || declined === latest.version) return;
      await AppUpdate.download({ url: new URL(latest.url, location.origin).href, version: latest.version, size: latest.size });
      if (document.visibilityState !== 'visible') {
        lastCheck = 0; // Termina de baixar com o app fechado: pergunta quando voltar.
        return;
      }
      const ok = await useConfirm().confirm({
        title: 'Atualização disponível',
        message: `A versão ${latest.version} do Zynko já foi baixada. Instalar agora?`,
        confirmLabel: 'Instalar',
      });
      if (!ok) {
        declined = latest.version;
        return;
      }
      const res = await AppUpdate.install({ version: latest.version });
      if (res.needsPermission) {
        // Primeira vez: o Android abriu a tela "Permitir desta fonte". Ao voltar, oferece de novo.
        lastCheck = 0;
      }
    } catch {
      lastCheck = Date.now() - 9 * 60_000; // Falhou (rede caiu): tenta de novo em ~1 min.
    } finally {
      busy = false;
    }
  }

  setTimeout(() => void check(), 5000);
  window.addEventListener('online', () => void check());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
});
