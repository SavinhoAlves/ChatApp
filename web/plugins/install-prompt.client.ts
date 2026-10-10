// O Chrome do Android avisa uma única vez, logo ao abrir, que o site pode ser instalado.
// Guardamos o aviso para o botão "Instalar app" da apresentação usar quando a pessoa tocar.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default defineNuxtPlugin(() => {
  const prompt = useState<InstallPromptEvent | null>('install.prompt', () => null);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt.value = event as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    prompt.value = null;
  });
});
