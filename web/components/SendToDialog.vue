<script setup lang="ts">
import { Check, Search, Send, X } from '@lucide/vue';

// "Enviar para…" (câmera do topo e Encaminhar): escolhe uma ou mais conversas, como no WhatsApp.
const props = withDefaults(defineProps<{ title?: string; max?: number }>(), { title: 'Enviar para…', max: 5 });
const emit = defineEmits<{ close: []; pick: [conversationIds: string[]] }>();

const chat = useChat();
const term = ref('');
const picked = ref<string[]>([]);

const items = computed(() => {
  const t = term.value.trim().toLowerCase();
  const all = [...chat.conversations.value, ...chat.archivedConversations.value];
  return t ? all.filter((c) => chat.conversationTitle(c).toLowerCase().includes(t)) : all;
});

function toggle(id: string) {
  if (picked.value.includes(id)) picked.value = picked.value.filter((x) => x !== id);
  else if (picked.value.length < props.max) picked.value = [...picked.value, id];
}

const names = computed(() =>
  picked.value
    .map((id) => chat.findConversation(id))
    .filter((c) => !!c)
    .map((c) => chat.conversationTitle(c!))
    .join(', '),
);
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog send-to" role="dialog" aria-modal="true" :aria-label="title">
      <header class="dialog-head">
        <h2>{{ title }}</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="send-to-search field-icon">
        <Search :size="16" :stroke-width="2" />
        <input v-model="term" class="input" type="search" placeholder="Pesquisar conversa" aria-label="Pesquisar conversa" />
      </div>
      <ul class="send-to-list">
        <li v-for="c in items" :key="c.id">
          <button type="button" class="send-to-item" :class="{ on: picked.includes(c.id) }" @click="toggle(c.id)">
            <Avatar :name="chat.conversationTitle(c)" :seed="c.id" :size="40" :square="c.type === 'GROUP'" :src="c.type === 'DIRECT' ? chat.otherUser(c)?.avatarUrl : null" />
            <span class="send-to-name">{{ chat.conversationTitle(c) }}</span>
            <span class="select-check" :class="{ on: picked.includes(c.id) }" aria-hidden="true"><Check v-if="picked.includes(c.id)" :size="13" :stroke-width="3" /></span>
          </button>
        </li>
        <li v-if="!items.length" class="list-empty">Nenhuma conversa encontrada.</li>
      </ul>
      <footer v-if="picked.length" class="send-to-foot">
        <span>{{ names }}</span>
        <button class="send-btn" type="button" aria-label="Enviar" @click="emit('pick', picked)"><Send :size="20" :stroke-width="2" /></button>
      </footer>
    </div>
  </div>
</template>
