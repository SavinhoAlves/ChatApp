// Bloqueio do app: ao voltar para o Zynko depois do tempo escolhido (ou sempre), bloqueia de novo.
export default defineNuxtPlugin(() => {
  const lock = useAppLock();
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    const s = lock.settings.value;
    if (!s) return;
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt >= s.after * 1000) lock.locked.value = true;
  });
});
