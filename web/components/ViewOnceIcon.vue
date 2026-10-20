<script setup lang="ts">
// Ícone de visualização única (círculo tracejado com o "1"), como no WhatsApp. Aceso = ligado.
withDefaults(defineProps<{ size?: number; on?: boolean }>(), { size: 22, on: false });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="view-once-icon" :class="{ on }">
    <circle v-if="on" cx="12" cy="12" r="10" fill="currentColor" />
    <circle v-else cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8" stroke-dasharray="4.2 2.6" stroke-linecap="round" />
    <path d="M10.2 9.3 12.6 7.6V16.6" :stroke="on ? 'var(--once-ink, #fff)' : 'currentColor'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
