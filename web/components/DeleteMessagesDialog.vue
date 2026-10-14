<script setup lang="ts">
import type { Message } from '~/types';

// "Apagar": para mim (sempre) ou para todos (suas mensagens dentro do prazo; o número master, sempre).
const props = defineProps<{ messages: Message[] }>();
const emit = defineEmits<{ close: []; done: [error?: string] }>();

const chat = useChat();
const { me } = useAuth();
const busy = ref(false);

const canForAll = computed(() => props.messages.length > 0 && props.messages.every((m) => chat.canDeleteForAll(m)));
const ownOutOfTime = computed(() => !canForAll.value && props.messages.some((m) => m.senderId === me.value?.id && !m.deleted));
const label = computed(() => (props.messages.length > 1 ? `Apagar ${props.messages.length} mensagens?` : 'Apagar mensagem?'));

async function run(scope: 'me' | 'all') {
  busy.value = true;
  try {
    for (const m of props.messages) await chat.deleteMessage(m, scope);
    emit('done');
  } catch (e) {
    emit('done', (e as Error).message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog delete-sheet" role="dialog" aria-modal="true" :aria-label="label">
      <h2>{{ label }}</h2>
      <p v-if="ownOutOfTime" class="delete-note">
        O prazo para apagar para todos ({{ me?.deleteForAllMinutes ?? 60 }} min) já passou. Ainda dá para apagar só para você.
      </p>
      <div class="delete-actions">
        <button v-if="canForAll" class="btn btn-danger btn-block" type="button" :disabled="busy" @click="run('all')">Apagar para todos</button>
        <button class="btn btn-ghost btn-block danger-text" type="button" :disabled="busy" @click="run('me')">Apagar para mim</button>
        <button class="btn btn-ghost btn-block" type="button" :disabled="busy" @click="emit('close')">Cancelar</button>
      </div>
    </div>
  </div>
</template>
