<script setup lang="ts">
import { UsersRound } from '@lucide/vue';
</script>

<template>
  <aside class="sidebar tab-panel">
    <header class="side-header">
      <div class="me brand-title"><strong>Comunidades</strong></div>
    </header>
    <div class="tab-empty">
      <span class="tab-empty-icon"><UsersRound :size="34" :stroke-width="1.7" /></span>
      <h2>Em breve…</h2>
      <p>Reúna grupos sobre um mesmo assunto num só lugar. Enquanto isso, use os grupos nas Conversas.</p>
    </div>
  </aside>
</template>
