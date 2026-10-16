<script setup lang="ts">
import { formatPhone } from '~/utils/phone';
import { Crown, LogOut, Search, UserMinus, UserPlus, X } from '@lucide/vue';
import type { User } from '~/types';

const props = defineProps<{ conversationId: string; startAdding?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { me, api } = useAuth();
const chat = useChat();
const { confirm } = useConfirm();

const conv = computed(() => chat.findConversation(props.conversationId) ?? null);
const isAdmin = computed(() => conv.value?.participants.find((p) => p.userId === me.value?.id)?.role === 'ADMIN');

const error = ref('');
const busy = ref(false);
const title = ref(conv.value?.title ?? '');
const adding = ref(false);
const query = ref('');
const candidates = ref<User[]>([]);

// Se o grupo sumir (fui removido), fecha o diálogo.
watch(conv, (value) => {
  if (!value) emit('close');
});

async function run(action: () => Promise<void>) {
  busy.value = true;
  error.value = '';
  try {
    await action();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const rename = () =>
  run(async () => {
    if (title.value.trim() && title.value.trim() !== conv.value?.title) {
      await chat.renameGroup(props.conversationId, title.value.trim());
    }
  });

const remove = (userId: string) => run(() => chat.removeMember(props.conversationId, userId));

async function leave() {
  const ok = await confirm({ message: 'Sair deste grupo?', confirmLabel: 'Sair', danger: true });
  if (!ok) return;
  void run(async () => {
    await chat.removeMember(props.conversationId, me.value!.id);
    emit('close');
  });
}

async function searchCandidates() {
  try {
    const res = await api<{ contacts: User[] }>('/contacts', { query: { q: query.value } });
    const members = new Set(conv.value?.participants.map((p) => p.userId));
    candidates.value = res.contacts.filter((u) => !members.has(u.id));
  } catch (e) {
    error.value = (e as Error).message;
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined;
watch(query, () => {
  clearTimeout(debounce);
  debounce = setTimeout(searchCandidates, 250);
});
onBeforeUnmount(() => clearTimeout(debounce));

function startAdding() {
  adding.value = true;
  void searchCandidates();
}
// Aberto por "Adicionar membro" no menu da conversa: já começa na busca de pessoas.
onMounted(() => {
  if (props.startAdding && isAdmin.value) startAdding();
});

const add = (user: User) =>
  run(async () => {
    await chat.addMembers(props.conversationId, [user.id]);
    candidates.value = candidates.value.filter((u) => u.id !== user.id);
  });
</script>

<template>
  <div v-if="conv" class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Informações do grupo">
      <header class="dialog-head">
        <h2>Informações do grupo</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')">
          <X :size="18" :stroke-width="2" />
        </button>
      </header>

      <div class="dialog-body">
        <div class="group-title">
          <input v-model="title" class="input" type="text" maxlength="60" :disabled="!isAdmin" aria-label="Nome do grupo" @keydown.enter="rename" @blur="isAdmin && rename()" />
        </div>

        <h3 class="section-title">{{ conv.participants.length }} participantes</h3>
        <ul class="user-list">
          <li v-for="p in conv.participants" :key="p.userId">
            <div class="user-item static">
              <Avatar :name="p.user.displayName" :seed="p.userId" :size="38" :online="!!chat.online.value[p.userId]" :src="p.user.avatarUrl" />
              <span class="user-info">
                <strong>{{ p.userId === me?.id ? 'Você' : p.user.displayName }}</strong>
                <small v-if="p.user.phone">{{ formatPhone(p.user.phone) }}</small>
              </span>
              <span v-if="p.role === 'ADMIN'" class="tag"><Crown :size="12" :stroke-width="2.2" /> admin</span>
              <button v-if="isAdmin && p.userId !== me?.id" class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="remove(p.userId)">
                <UserMinus :size="14" :stroke-width="2" /> Remover
              </button>
            </div>
          </li>
        </ul>

        <template v-if="isAdmin">
          <button v-if="!adding" class="btn btn-ghost" type="button" @click="startAdding">
            <UserPlus :size="16" :stroke-width="2" /> Adicionar pessoas
          </button>
          <template v-else>
            <div class="field-icon">
              <Search :size="16" :stroke-width="2" />
              <input v-model="query" class="input" type="search" placeholder="Buscar pessoas para adicionar" aria-label="Buscar pessoas" />
            </div>
            <ul class="user-list">
              <li v-for="user in candidates" :key="user.id">
                <button class="user-item" type="button" :disabled="busy" @click="add(user)">
                  <Avatar :name="user.displayName" :seed="user.id" :size="34" :src="user.avatarUrl" />
                  <span class="user-info">
                    <strong>{{ user.displayName }}</strong>
                    <small v-if="user.phone">{{ formatPhone(user.phone) }}</small>
                  </span>
                  <span class="tag"><UserPlus :size="12" :stroke-width="2.2" /> adicionar</span>
                </button>
              </li>
              <li v-if="!candidates.length" class="list-empty">Ninguém para adicionar.</li>
            </ul>
          </template>
        </template>

        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>

      <footer class="dialog-foot">
        <button class="btn btn-danger" type="button" :disabled="busy" @click="leave">
          <LogOut :size="16" :stroke-width="2" /> Sair do grupo
        </button>
      </footer>
    </div>
  </div>
</template>
