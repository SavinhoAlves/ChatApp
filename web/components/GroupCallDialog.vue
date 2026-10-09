<script setup lang="ts">
import { Check, Phone, Search, Video, X } from '@lucide/vue';
import type { User } from '~/types';

const props = defineProps<{ preselect?: string[] }>();
const emit = defineEmits<{ close: [] }>();

const { api } = useAuth();
const calls = useCall();

const MAX = 7; // + você = 8 pessoas
const contacts = ref<User[]>([]);
const query = ref('');
const selected = ref<string[]>([...(props.preselect ?? [])]);
const error = ref('');

onMounted(async () => {
  try {
    contacts.value = (await api<{ contacts: User[] }>('/contacts')).contacts;
  } catch (e) {
    error.value = (e as Error).message;
  }
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? contacts.value.filter((u) => u.displayName.toLowerCase().includes(q) || u.username.includes(q)) : contacts.value;
});

function toggle(id: string) {
  if (selected.value.includes(id)) selected.value = selected.value.filter((x) => x !== id);
  else if (selected.value.length < MAX) selected.value = [...selected.value, id];
}

async function start(video: boolean) {
  emit('close');
  await calls.startCall({ userIds: selected.value }, video);
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Nova ligação em grupo">
      <header class="dialog-head">
        <h2>Nova ligação em grupo</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="dialog-body">
        <p class="dialog-hint">Escolha até {{ MAX }} contatos ({{ selected.length }}/{{ MAX }}).</p>
        <div class="field-icon">
          <Search :size="16" />
          <input v-model="query" class="input" type="search" placeholder="Pesquisar contatos" />
        </div>
        <ul class="user-list">
          <li v-for="u in filtered" :key="u.id">
            <button class="user-item" type="button" @click="toggle(u.id)">
              <Avatar :name="u.displayName" :seed="u.id" :size="38" :src="u.avatarUrl" />
              <span class="user-info"><strong>{{ u.displayName }}</strong><small>@{{ u.username }}</small></span>
              <span class="check" :class="{ on: selected.includes(u.id) }"><Check v-if="selected.includes(u.id)" :size="13" :stroke-width="2.6" /></span>
            </button>
          </li>
          <li v-if="!filtered.length" class="list-empty">Nenhum contato encontrado.</li>
        </ul>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
      <footer class="dialog-foot">
        <button class="btn btn-ghost" type="button" :disabled="!selected.length" @click="start(false)"><Phone :size="15" /> Voz</button>
        <button class="btn btn-primary" type="button" :disabled="!selected.length" @click="start(true)"><Video :size="15" /> Vídeo</button>
      </footer>
    </div>
  </div>
</template>
