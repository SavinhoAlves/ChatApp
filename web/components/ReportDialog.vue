<script setup lang="ts">
import { Flag, X } from '@lucide/vue';
import type { Conversation } from '~/types';

const props = defineProps<{ conversation: Conversation }>();
const emit = defineEmits<{ close: [] }>();

const { api } = useAuth();
const chat = useChat();
const { alert } = useConfirm();

const name = computed(() => chat.conversationTitle(props.conversation));
const alsoBlock = ref(true);
const sending = ref(false);
const error = ref('');

async function send() {
  sending.value = true;
  error.value = '';
  try {
    const res = await api<{ blocked: boolean }>(`/conversations/${props.conversation.id}/report`, {
      method: 'POST',
      body: { block: alsoBlock.value },
    });
    if (res.blocked) props.conversation.youBlocked = true;
    emit('close');
    await alert({ title: 'Denúncia enviada', message: res.blocked ? `${name.value} também foi bloqueado.` : 'Obrigado por avisar.' });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Denunciar">
      <header class="dialog-head">
        <h2>Denunciar {{ name }}?</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="dialog-body">
        <p class="dialog-hint">
          As últimas 5 mensagens desta conversa serão enviadas para quem administra o Zynko analisar. A pessoa não será
          avisada.
        </p>
        <label class="radio-row">
          <input v-model="alsoBlock" type="checkbox" />
          <span>Bloquear {{ name }} também</span>
        </label>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
      <footer class="dialog-foot">
        <button class="btn btn-ghost" type="button" @click="emit('close')">Cancelar</button>
        <button class="btn btn-danger" type="button" :disabled="sending" @click="send"><Flag :size="15" /> Denunciar</button>
      </footer>
    </div>
  </div>
</template>
