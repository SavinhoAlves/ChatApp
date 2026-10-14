<script setup lang="ts">
import { CheckCheck, X } from '@lucide/vue';
import type { Message, MessageInfo } from '~/types';

// "Dados da mensagem": quando foi enviada, entregue e lida (por pessoa, em grupos).
const props = defineProps<{ message: Message }>();
const emit = defineEmits<{ close: [] }>();

const chat = useChat();
const info = ref<MessageInfo | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    info.value = await chat.messageInfo(props.message);
  } catch (e) {
    error.value = (e as Error).message;
  }
});

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const read = computed(() => info.value?.receipts.filter((r) => r.readAt) ?? []);
const delivered = computed(() => info.value?.receipts.filter((r) => r.deliveredAt && !r.readAt) ?? []);
const pending = computed(() => info.value?.receipts.filter((r) => !r.deliveredAt) ?? []);
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog msg-info" role="dialog" aria-modal="true" aria-label="Dados da mensagem">
      <header class="dialog-head">
        <h2>Dados da mensagem</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="dialog-body">
        <p class="msg-info-preview">{{ message.body || (message.attachment ? 'Anexo' : '') }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <template v-else-if="info">
          <div class="msg-info-row">
            <span>Enviada</span>
            <time>{{ when(info.sentAt) }}</time>
          </div>
          <section v-if="read.length">
            <h3 class="msg-info-title read"><CheckCheck :size="16" :stroke-width="2.4" /> Lida</h3>
            <div v-for="r in read" :key="r.userId" class="msg-info-row">
              <span>{{ r.displayName }}</span>
              <time>{{ when(r.readAt) }}</time>
            </div>
          </section>
          <section v-if="delivered.length">
            <h3 class="msg-info-title"><CheckCheck :size="16" :stroke-width="2.4" /> Entregue</h3>
            <div v-for="r in delivered" :key="r.userId" class="msg-info-row">
              <span>{{ r.displayName }}</span>
              <time>{{ when(r.deliveredAt) }}</time>
            </div>
          </section>
          <section v-if="pending.length">
            <h3 class="msg-info-title">Ainda não entregue</h3>
            <div v-for="r in pending" :key="r.userId" class="msg-info-row"><span>{{ r.displayName }}</span></div>
          </section>
        </template>
        <p v-else class="settings-note">Carregando…</p>
      </div>
    </div>
  </div>
</template>
