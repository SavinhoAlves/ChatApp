<script setup lang="ts">
import { CircleDashed } from '@lucide/vue';
</script>

<template>
  <aside class="sidebar tab-panel">
    <header class="side-header">
      <div class="me brand-title"><strong>Atualizações</strong></div>
    </header>
    <div class="tab-empty">
      <span class="tab-empty-icon"><CircleDashed :size="34" :stroke-width="1.7" /></span>
      <p>Compartilhe fotos e textos que somem em 24 horas.</p>
    </div>
  </aside>
</template>
