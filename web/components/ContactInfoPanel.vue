<script setup lang="ts">
import { AtSign, Ban, Check, Clock, Globe, Images, Mail, MapPin, Pencil, Phone, Store, Trash2, UserPlus, X } from '@lucide/vue';
import { type BusinessProfile, websiteHref } from '~/utils/business';
import { formatPhone } from '~/utils/phone';

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ close: [] }>();

const { api, me } = useAuth();
const chat = useChat();
const { confirm } = useConfirm();

const conv = computed(() => chat.findConversation(props.conversationId));
const isSelf = computed(() => !!conv.value && chat.isSelfChat(conv.value));
const user = computed(() => (conv.value ? chat.otherUser(conv.value) : null));
const title = computed(() => (conv.value ? chat.conversationTitle(conv.value) : ''));
// Nome do perfil diferente do nome que você salvou: mostra "~Nome", como no WhatsApp.
const profileName = computed(() => {
  const u = user.value;
  return u?.profileName && u.profileName !== u.displayName ? u.profileName : null;
});

const media = computed(() =>
  (chat.messages.value[props.conversationId] ?? [])
    .filter((m) => !m.deleted && (m.attachment?.type === 'IMAGE' || m.attachment?.type === 'VIDEO'))
    .slice(-9)
    .reverse(),
);

// ---- Conta comercial: busca o perfil da empresa ----
const business = ref<BusinessProfile | null>(null);
watch(
  () => (user.value?.isBusiness ? user.value.id : null),
  async (id) => {
    business.value = null;
    if (!id) return;
    try {
      business.value = (await api<{ business: BusinessProfile }>(`/users/${id}/business`)).business;
    } catch {
      business.value = null;
    }
  },
  { immediate: true },
);

// ---- Salvar / editar o nome nos contatos ----
const editing = ref(false);
const firstName = ref('');
const lastName = ref('');
const saving = ref(false);
const error = ref('');

function startEdit() {
  const parts = (conv.value?.peerIsContact ? (user.value?.displayName ?? '') : (user.value?.profileName ?? user.value?.displayName ?? '')).split(' ');
  firstName.value = parts[0] ?? '';
  lastName.value = parts.slice(1).join(' ');
  error.value = '';
  editing.value = true;
}

async function saveContact() {
  if (!user.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api('/contacts', {
      method: 'POST',
      body: { username: user.value.username, firstName: firstName.value.trim() || undefined, lastName: lastName.value.trim() || undefined },
    });
    await chat.loadConversations();
    editing.value = false;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

async function deleteContact() {
  const u = user.value;
  if (!u) return;
  const ok = await confirm({
    title: `Apagar ${u.displayName}?`,
    message: 'A pessoa sai dos seus contatos. A conversa continua, mostrando o número no lugar do nome.',
    confirmLabel: 'Apagar',
    danger: true,
  });
  if (!ok) return;
  error.value = '';
  try {
    await api(`/contacts/${u.id}`, { method: 'DELETE' });
    await chat.loadConversations();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function toggleBlock() {
  const c = conv.value;
  const u = user.value;
  if (!c || !u) return;
  error.value = '';
  try {
    if (c.youBlocked) await chat.unblockUser(u.id, c.id);
    else {
      const ok = await confirm({
        title: `Bloquear ${u.displayName}?`,
        message: 'Essa pessoa não poderá mais te mandar mensagens.',
        confirmLabel: 'Bloquear',
        danger: true,
      });
      if (ok) await chat.blockUser(u.id, c.id);
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}

// Conversa virou grupo ou sumiu: fecha.
watch(conv, (c) => {
  if (!c || c.type !== 'DIRECT') emit('close');
});
</script>

<template>
  <aside v-if="conv && user" class="info-panel" :aria-label="user.isBusiness ? 'Dados da empresa' : 'Dados do contato'">
    <header class="info-head">
      <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')">
        <X :size="20" :stroke-width="1.9" />
      </button>
      <h2>{{ isSelf ? 'Você' : user.isBusiness ? 'Dados da empresa' : 'Dados do contato' }}</h2>
    </header>

    <div class="info-body">
      <section class="info-hero">
        <Avatar :name="isSelf ? (me?.displayName ?? '') : title" :seed="conv.id" :size="168" :src="user.avatarUrl" />
        <h3>{{ isSelf ? me?.displayName : title }}</h3>
        <p v-if="conv.peerPhone" class="info-phone">{{ formatPhone(conv.peerPhone) }}</p>
        <p v-if="profileName" class="info-muted">~{{ profileName }}</p>
        <span v-if="user.isBusiness" class="business-badge"><Store :size="13" :stroke-width="2.2" /> Conta comercial</span>
        <p v-if="isSelf" class="info-muted">Envie mensagens, links e arquivos para você mesmo.</p>
      </section>

      <section v-if="!isSelf" class="info-card">
        <div class="info-row">
          <AtSign :size="18" :stroke-width="1.8" />
          <span><small>Nome de usuário</small>{{ user.username }}</span>
        </div>
        <div v-if="conv.peerPhone" class="info-row">
          <Phone :size="18" :stroke-width="1.8" />
          <span><small>Telefone</small>{{ formatPhone(conv.peerPhone) }}</span>
        </div>
      </section>

      <section v-if="business" class="info-card">
        <p class="info-card-title"><Store :size="16" :stroke-width="1.9" /> {{ business.category }}</p>
        <p v-if="business.description" class="business-desc">{{ business.description }}</p>
        <div v-if="business.hours" class="info-row"><Clock :size="18" :stroke-width="1.8" /><span><small>Horário</small>{{ business.hours }}</span></div>
        <div v-if="business.address" class="info-row"><MapPin :size="18" :stroke-width="1.8" /><span><small>Endereço</small>{{ business.address }}</span></div>
        <a v-if="business.website" class="info-row link" :href="websiteHref(business.website)" target="_blank" rel="noopener noreferrer">
          <Globe :size="18" :stroke-width="1.8" /><span><small>Site</small>{{ business.website }}</span>
        </a>
        <a v-if="business.email" class="info-row link" :href="`mailto:${business.email}`">
          <Mail :size="18" :stroke-width="1.8" /><span><small>E-mail</small>{{ business.email }}</span>
        </a>
      </section>

      <section v-if="media.length" class="info-card">
        <p class="info-card-title"><Images :size="16" :stroke-width="1.9" /> Mídia recente</p>
        <div class="info-media">
          <a v-for="m in media" :key="m.id" :href="m.attachment!.url" target="_blank" rel="noopener">
            <img v-if="m.attachment!.type === 'IMAGE'" :src="m.attachment!.url" alt="" loading="lazy" />
            <video v-else :src="m.attachment!.url" muted preload="metadata" />
          </a>
        </div>
      </section>

      <section v-if="!isSelf" class="info-card">
        <form v-if="editing" class="info-edit" @submit.prevent="saveContact">
          <p class="info-card-title">{{ conv.peerIsContact ? 'Editar contato' : 'Adicionar aos contatos' }}</p>
          <input v-model="firstName" class="input" type="text" maxlength="40" placeholder="Nome" aria-label="Nome" autofocus />
          <input v-model="lastName" class="input" type="text" maxlength="40" placeholder="Sobrenome" aria-label="Sobrenome" />
          <div class="info-edit-actions">
            <button class="btn btn-ghost btn-sm" type="button" @click="editing = false">Cancelar</button>
            <button class="btn btn-primary btn-sm" type="submit" :disabled="saving"><Check :size="14" :stroke-width="2.2" /> Salvar</button>
          </div>
        </form>
        <template v-else>
          <button class="settings-item" type="button" @click="startEdit">
            <component :is="conv.peerIsContact ? Pencil : UserPlus" :size="20" :stroke-width="1.8" class="settings-icon" />
            <span class="settings-text"><strong>{{ conv.peerIsContact ? 'Editar contato' : 'Adicionar aos contatos' }}</strong></span>
          </button>
          <button v-if="conv.peerIsContact" class="settings-item danger" type="button" @click="deleteContact">
            <Trash2 :size="20" :stroke-width="1.8" class="settings-icon" />
            <span class="settings-text"><strong>Apagar contato</strong></span>
          </button>
          <button class="settings-item danger" type="button" @click="toggleBlock">
            <Ban :size="20" :stroke-width="1.8" class="settings-icon" />
            <span class="settings-text"><strong>{{ conv.youBlocked ? `Desbloquear ${user.displayName}` : `Bloquear ${user.displayName}` }}</strong></span>
          </button>
        </template>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </section>
    </div>
  </aside>
</template>
