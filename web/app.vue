<script setup lang="ts">
// Cor do app (Configurações › Conversas › Cor do app): o CSS troca a paleta por html[data-accent].
const { prefs } = usePrefs();
watchEffect(() => {
  if (import.meta.client) document.documentElement.dataset.accent = prefs.value.appColor;
});
</script>

<template>
  <NuxtPwaAssets />
  <NuxtPage />
  <ConfirmDialog />
</template>
