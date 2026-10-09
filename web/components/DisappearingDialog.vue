<script setup lang="ts">
import { Timer, X } from '@lucide/vue';
import type { Conversation } from '~/types';

const props = defineProps<{ conversation: Conversation }>();
const emit = defineEmits<{ close: [] }>();

const { api } = useAuth();
const chat = useChat();

const OPTIONS: { label: string; seconds: number | null }[] = [
  { label: '24 horas', seconds: 24 * 3600 },
  { label: '7 dias', seconds: 7 * 24 * 3600 },
  { label: '90 dias', seconds: 90 * 24 * 3600 },
  { label: 'Desativadas', seconds: null },
];

const selected = ref<number | null>(props.conversation.disappearSeconds);
const saving = ref(false);
const error = ref('');

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const res = await api<{ conversation: Conversation }>(`/conversations/${props.conversation.id}/disappearing`, {
      method: 'PATCH',
      body: { seconds: selected.value },
    });
    chat.upsertConversation(res.conversation);
    emit('close');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Mensagens temporárias">
      <header class="dialog-head">
        <h2>Mensagens temporárias</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="dialog-body">
        <div class="temp-hero"><Timer :size="44" :stroke-width="1.4" /></div>
        <p class="dialog-hint">
          Quando ativadas, as novas mensagens desta conversa somem para todos depois do tempo escolhido. Mensagens já
          enviadas não são afetadas.
        </p>
        <div class="radio-list" role="radiogroup">
          <label v-for="o in OPTIONS" :key="o.label" class="radio-row">
            <input v-model="selected" type="radio" name="disappear" :value="o.seconds" />
            <span>{{ o.label }}</span>
          </label>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
      <footer class="dialog-foot">
        <button class="btn btn-ghost" type="button" @click="emit('close')">Cancelar</button>
        <button class="btn btn-primary" type="button" :disabled="saving" @click="save">Salvar</button>
      </footer>
    </div>
  </div>
</template>
