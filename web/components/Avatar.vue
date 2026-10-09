<script setup lang="ts">
const props = withDefaults(
  defineProps<{ name: string; seed: string; size?: number; online?: boolean; src?: string | null; square?: boolean }>(),
  { size: 44, online: false, src: null, square: false },
);

const initials = computed(() => {
  // Ignora pedaços como "(você)" para não virar "M(".
  const words = props.name
    .trim()
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w));
  const letters = words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
});

// Cor estável por pessoa/grupo, derivada do id.
const hue = computed(() => {
  let hash = 0;
  for (const char of props.seed) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
});

// Se a foto falhar ao carregar, volta para as iniciais.
const broken = ref(false);
watch(
  () => props.src,
  () => (broken.value = false),
);
</script>

<template>
  <span
    class="avatar"
    :class="{ square }"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.round(size * 0.38)}px`,
      background: `linear-gradient(145deg, hsl(${hue} 55% 48%), hsl(${hue} 50% 34%))`,
    }"
    aria-hidden="true"
  >
    <img v-if="src && !broken" class="avatar-img" :src="src" alt="" @error="broken = true" />
    <template v-else>{{ initials }}</template>
    <i v-if="online" class="avatar-dot" />
  </span>
</template>
