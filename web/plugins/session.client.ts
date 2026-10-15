// App nativo: se o armazenamento do navegador interno perdeu o login (cache limpo, problema no WebView),
// recupera a cópia guardada no armazenamento nativo antes da primeira tela. Assim não precisa cadastrar de novo.
export default defineNuxtPlugin({
  name: 'session-restore',
  enforce: 'pre',
  async setup() {
    if (!isNativeApp()) return;
    const { token } = useAuth();
    const { Preferences } = await import('@capacitor/preferences');
    if (token.value) {
      // Login antigo (de antes desta versão): cria a cópia nativa.
      await Preferences.set({ key: 'chat.token', value: token.value });
      return;
    }
    const saved = (await Preferences.get({ key: 'chat.token' })).value;
    if (saved) {
      token.value = saved;
      try {
        localStorage.setItem('chat.token', saved);
      } catch {
        // sem armazenamento local: segue só com a cópia nativa
      }
    }
  },
});
