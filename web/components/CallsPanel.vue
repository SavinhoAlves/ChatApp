<script setup lang="ts">
import { Phone } from '@lucide/vue';
</script>

<template>
  <aside class="sidebar tab-panel">
    <header class="side-header">
      <div class="me brand-title"><strong>Ligações</strong></div>
    </header>
    <div class="tab-empty">
      <span class="tab-empty-icon"><Phone :size="34" :stroke-width="1.7" /></span>
      <p>Seu histórico de ligações de voz e vídeo aparece aqui.</p>
    </div>
  </aside>
</template>
