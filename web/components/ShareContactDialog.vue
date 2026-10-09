<script setup lang="ts">
import { Search, UserRound, X } from '@lucide/vue';
import type { User } from '~/types';

const emit = defineEmits<{ close: []; pick: [user: User] }>();

const { api } = useAuth();

const query = ref('');
const results = ref<User[]>([]);
const loading = ref(false);
const error = ref('');

let debounce: ReturnType<typeof setTimeout> | undefined;

async function search() {
  loading.value = true;
  try {
    const res = await api<{ contacts: User[] }>('/contacts', { query: { q: query.value } });
    results.value = res.contacts;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(query, () => {
  clearTimeout(debounce);
  debounce = setTimeout(search, 250);
});
onMounted(search);
onBeforeUnmount(() => clearTimeout(debounce));
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Compartilhar contato">
      <header class="dialog-head">
        <h2>Compartilhar contato</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')">
          <X :size="18" :stroke-width="2" />
        </button>
      </header>

      <div class="dialog-body">
        <div class="field-icon">
          <Search :size="16" :stroke-width="2" />
          <input v-model="query" class="input" type="search" placeholder="Buscar por nome ou usuário" aria-label="Buscar pessoas" autofocus />
        </div>

        <ul class="user-list">
          <li v-for="user in results" :key="user.id">
            <button class="user-item" type="button" @click="emit('pick', user)">
              <Avatar :name="user.displayName" :seed="user.id" :size="38" :src="user.avatarUrl" />
              <span class="user-info">
                <strong>{{ user.displayName }}</strong>
                <small>@{{ user.username }}</small>
              </span>
              <UserRound :size="18" :stroke-width="1.8" class="pick-hint" />
            </button>
          </li>
          <li v-if="!results.length && !loading" class="list-empty">
            {{ query ? 'Nenhum contato encontrado.' : 'Você ainda não tem contatos para compartilhar.' }}
          </li>
        </ul>

        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
    </div>
  </div>
</template>
