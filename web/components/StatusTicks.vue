<script setup lang="ts">
import { AlertCircle, Check, CheckCheck, Clock } from '@lucide/vue';
import type { MessageStatus } from '~/types';

defineProps<{ status: MessageStatus | null }>();

const labels: Record<MessageStatus, string> = {
  pending: 'Enviando',
  failed: 'Falha ao enviar',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
};
</script>

<template>
  <span v-if="status" class="ticks" :class="`ticks-${status}`" :title="labels[status]" role="img" :aria-label="labels[status]">
    <Clock v-if="status === 'pending'" :size="13" :stroke-width="2" />
    <AlertCircle v-else-if="status === 'failed'" :size="13" :stroke-width="2" />
    <Check v-else-if="status === 'sent'" :size="15" :stroke-width="2.2" />
    <CheckCheck v-else :size="16" :stroke-width="2.2" />
  </span>
</template>
