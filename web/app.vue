<script setup lang="ts">
// Cor do app (Configurações › Conversas › Cor do app): o CSS troca a paleta por html[data-accent].
const { prefs } = usePrefs();
watchEffect(() => {
  if (import.meta.client) document.documentElement.dataset.accent = prefs.value.appColor;
});
// iPhone ou Android: cada um com o seu layout (ver "Plataforma" no main.css).
if (import.meta.client) document.documentElement.dataset.platform = uiPlatform();
// Bloqueio do app (só com login feito).
const lock = useAppLock();
const { token } = useAuth();
</script>

<template>
  <NuxtPwaAssets />
  <NuxtPage />
  <AppLockScreen v-if="lock.locked.value && token" />
  <ConfirmDialog />
</template>
