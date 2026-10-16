<script setup lang="ts">
import { ArrowLeft, ArrowRight, Check, EllipsisVertical, MessageCircle, Pencil, Phone, Search, Send, Trash2, UserPlus, Users, UsersRound, X } from '@lucide/vue';
import { formatPhone } from '~/utils/phone';
import { type PendingContact, shareInvite } from '~/utils/invite';
import type { User } from '~/types';

const props = withDefaults(defineProps<{ initialView?: 'list' | 'group' | 'contact' }>(), { initialView: 'list' });
const emit = defineEmits<{ close: [] }>();

const { api, me } = useAuth();
const chat = useChat();
const { alert } = useConfirm();

// list: lista principal · group: escolher participantes · group-name: nome do grupo · contact: novo contato
const view = ref<'list' | 'group' | 'group-name' | 'contact'>(props.initialView);
const query = ref('');
const contacts = ref<User[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');

const pending = ref<PendingContact[]>([]);

async function loadContacts() {
  loading.value = true;
  try {
    const [c, p] = await Promise.all([
      api<{ contacts: User[] }>('/contacts'),
      api<{ pending: PendingContact[] }>('/contacts/pending').catch(() => ({ pending: [] as PendingContact[] })),
    ]);
    contacts.value = c.contacts;
    pending.value = p.pending;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
onMounted(loadContacts);
watch(chat.contactsVersion, () => void loadContacts());

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const filtered = computed(() => {
  const term = normalize(query.value.trim().replace(/^@/, ''));
  if (!term) return contacts.value;
  return contacts.value.filter((u) => normalize(u.displayName).includes(term) || u.username.includes(term));
});

/** Agrupa por inicial, como na agenda: "#" (não começa com letra) primeiro, depois A–Z. */
const sections = computed(() => {
  const groups = new Map<string, User[]>();
  for (const user of filtered.value) {
    const first = normalize(user.displayName.trim()).charAt(0).toUpperCase();
    const key = /[A-Z]/.test(first) ? first : '#';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(user);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)))
    .map(([letter, users]) => ({
      letter,
      users: users.sort((x, y) => x.displayName.localeCompare(y.displayName, 'pt-BR')),
    }));
});

// Digitou um número: dá para conversar mesmo sem estar nos contatos.
const phoneQuery = computed(() => {
  const q = query.value.trim();
  return !/[a-z@]/i.test(q) && q.replace(/\D/g, '').length >= 8 ? q : '';
});

// "Você" aparece se a busca estiver vazia ou combinar com o seu nome.
const showSelf = computed(() => {
  const term = normalize(query.value.trim());
  return !!me.value && (!term || normalize(me.value.displayName).includes(term) || 'voce'.includes(term));
});

async function run(fn: () => Promise<void>) {
  submitting.value = true;
  error.value = '';
  try {
    await fn();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    submitting.value = false;
  }
}

// Número que ainda não usa o Zynko: em vez de erro, oferece Convidar / Salvar contato.
const notOnChat = ref('');

const openChat = (target: string | { phone: string }) =>
  run(async () => {
    notOnChat.value = '';
    try {
      await chat.createDirect(target);
      emit('close');
    } catch (e) {
      if (typeof target !== 'string' && /ainda não usa/.test((e as Error).message)) notOnChat.value = target.phone;
      else throw e;
    }
  });

// Mudou a busca: o cartão do número anterior some.
watch(query, () => (notOnChat.value = ''));

const inviteNote = ref('');
async function invite(name?: string) {
  const r = await shareInvite(name);
  inviteNote.value = r === 'copied' ? 'Convite copiado. Cole no WhatsApp, SMS ou e-mail para enviar.' : r === 'shared' ? 'Convite enviado.' : r === 'failed' ? 'Não foi possível copiar o convite.' : '';
  if (inviteNote.value) setTimeout(() => (inviteNote.value = ''), 4000);
}

// Editar o nome salvo / apagar o contato (como na agenda do WhatsApp).
const contactMenu = ref<User | null>(null);
async function editContact(u: User) {
  contactMenu.value = null;
  const name = await useConfirm().prompt({ title: 'Editar contato', placeholder: 'Nome do contato', value: u.displayName, confirmLabel: 'Salvar', maxLength: 80 });
  if (!name?.trim()) return;
  const [firstName, ...rest] = name.trim().split(/s+/);
  try {
    await api('/contacts', { method: 'POST', body: { username: u.username, firstName, lastName: rest.join(' ') || undefined } });
    await loadContacts();
    void chat.loadConversations().catch(() => {});
  } catch (e) {
    await alert({ title: 'Não foi possível salvar', message: (e as Error).message });
  }
}
async function deleteContact(u: User) {
  contactMenu.value = null;
  const ok = await useConfirm().confirm({
    title: `Apagar ${u.displayName}?`,
    message: 'A pessoa sai dos seus contatos. As conversas continuam, mostrando o número no lugar do nome.',
    confirmLabel: 'Apagar',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/contacts/${u.id}`, { method: 'DELETE' });
    contacts.value = contacts.value.filter((x) => x.id !== u.id);
    void chat.loadConversations().catch(() => {});
  } catch (e) {
    await alert({ title: 'Não foi possível apagar', message: (e as Error).message });
  }
}

async function removePending(p: PendingContact) {
  try {
    await api(`/contacts/pending/${p.id}`, { method: 'DELETE' });
    pending.value = pending.value.filter((x) => x.id !== p.id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

const filteredPending = computed(() => {
  const term = normalize(query.value.trim());
  if (!term) return pending.value;
  const digits = query.value.replace(/\D/g, '');
  return pending.value.filter((p) => normalize(p.displayName).includes(term) || (digits.length >= 3 && p.phone.includes(digits)));
});

// "Salvar contato" a partir do cartão: abre o formulário já com o número.
const contactPhone = ref('');
function saveNotOnChat() {
  contactPhone.value = notOnChat.value;
  notOnChat.value = '';
  view.value = 'contact';
}

// ---- Novo grupo ----
const selected = ref<User[]>([]);
const groupTitle = ref('');
const isSelected = (user: User) => selected.value.some((u) => u.id === user.id);
function toggle(user: User) {
  selected.value = isSelected(user) ? selected.value.filter((u) => u.id !== user.id) : [...selected.value, user];
}

function startGroup() {
  view.value = 'group';
  query.value = '';
}

const createGroup = () =>
  run(async () => {
    await chat.createGroup(groupTitle.value.trim(), selected.value.map((u) => u.id));
    emit('close');
  });

function back() {
  if (view.value === 'group-name') view.value = 'group';
  else if ((view.value === 'group' || view.value === 'contact') && props.initialView === 'list') {
    view.value = 'list';
    selected.value = [];
  } else emit('close');
}

function newContact() {
  contactPhone.value = '';
  view.value = 'contact';
  query.value = '';
}

// Contato salvo: volta para a lista, já com o nome que você deu.
const justSaved = ref('');
async function onContactSaved(user: User) {
  await loadContacts();
  justSaved.value = `${user.displayName} foi adicionado aos seus contatos.`;
  view.value = 'list';
  setTimeout(() => (justSaved.value = ''), 4000);
}

// Salvo, mas o número ainda não usa o Zynko: fica em "Convidar para o Zynko".
async function onPendingSaved(p: PendingContact) {
  await loadContacts();
  justSaved.value = `${p.displayName} foi salvo. Ainda não usa o Zynko: toque em Convidar abaixo.`;
  view.value = 'list';
  setTimeout(() => (justSaved.value = ''), 6000);
}

function newCommunity() {
  void alert({ title: 'Comunidades', message: 'Comunidades ainda não estão disponíveis no Zynko. Por enquanto, use grupos.' });
}

const titles = { list: 'Nova conversa', group: 'Adicionar participantes', 'group-name': 'Novo grupo', contact: 'Novo contato' };
</script>

<template>
  <aside class="sidebar new-chat-panel">
    <header class="settings-head">
      <button class="icon-btn" type="button" aria-label="Voltar" @click="back">
        <ArrowLeft :size="20" :stroke-width="1.9" />
      </button>
      <h2>{{ titles[view] }}</h2>
    </header>

    <!-- Novo contato -->
    <NewContactForm v-if="view === 'contact'" :initial-phone="contactPhone" @saved="onContactSaved" @pending="onPendingSaved" @imported="loadContacts" />

    <!-- Nome do grupo -->
    <div v-else-if="view === 'group-name'" class="settings-body">
      <div class="chips">
        <span v-for="user in selected" :key="user.id" class="chip">{{ user.displayName }}</span>
      </div>
      <label class="field">
        <span>Nome do grupo</span>
        <input v-model="groupTitle" class="input" type="text" maxlength="60" placeholder="Ex.: Família" autofocus />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="btn btn-primary btn-block" type="button" :disabled="submitting || !groupTitle.trim()" @click="createGroup">
        <Check :size="16" :stroke-width="2.2" /> {{ submitting ? 'Criando…' : 'Criar grupo' }}
      </button>
    </div>

    <template v-else>
      <div class="side-search">
        <div class="field-icon">
          <Search :size="16" :stroke-width="2" />
          <input
            v-model="query"
            class="input"
            type="search"
            :placeholder="view === 'list' ? 'Pesquisar nome ou número' : 'Pesquisar contatos'"
            aria-label="Pesquisar"
            autofocus
          />
        </div>
      </div>

      <div v-if="view === 'group' && selected.length" class="chips selected-chips">
        <button v-for="user in selected" :key="user.id" class="chip" type="button" @click="toggle(user)">
          {{ user.displayName }} <X :size="12" :stroke-width="2.4" />
        </button>
      </div>

      <div class="conv-list new-chat-list">
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="justSaved && view === 'list'" class="notice">{{ justSaved }}</p>
        <p v-if="inviteNote" class="notice">{{ inviteNote }}</p>

        <div v-if="notOnChat && view === 'list'" class="not-on-chat">
          <strong>{{ formatPhone(notOnChat) || notOnChat }} ainda não usa o Zynko</strong>
          <small>Convide para conversar ou salve o número: quando a pessoa entrar, ela aparece nos seus contatos.</small>
          <div class="not-on-chat-actions">
            <button class="btn btn-primary btn-sm" type="button" @click="invite()"><Send :size="14" /> Convidar</button>
            <button class="btn btn-ghost btn-sm" type="button" @click="saveNotOnChat"><UserPlus :size="14" /> Salvar contato</button>
          </div>
        </div>

        <template v-if="view === 'list'">
          <button v-if="phoneQuery" class="user-item" type="button" :disabled="submitting" @click="openChat({ phone: phoneQuery })">
            <span class="number-icon"><Phone :size="18" :stroke-width="2" /></span>
            <span class="user-info">
              <strong>Conversar com {{ phoneQuery }}</strong>
              <small>Mesmo que não esteja nos seus contatos</small>
            </span>
          </button>

          <template v-if="!query.trim()">
            <button class="user-item action-item" type="button" @click="startGroup">
              <span class="action-icon"><Users :size="20" :stroke-width="1.9" /></span>
              <span class="user-info"><strong>Novo grupo</strong></span>
            </button>
            <button class="user-item action-item" type="button" @click="newContact">
              <span class="action-icon"><UserPlus :size="20" :stroke-width="1.9" /></span>
              <span class="user-info"><strong>Novo contato</strong></span>
            </button>
            <button class="user-item action-item" type="button" @click="newCommunity">
              <span class="action-icon"><UsersRound :size="20" :stroke-width="1.9" /></span>
              <span class="user-info">
                <strong>Nova comunidade</strong>
                <small>Em breve</small>
              </span>
            </button>
          </template>

          <p class="section-label">Contatos no Zynko</p>

          <button v-if="showSelf && me" class="user-item" type="button" :disabled="submitting" @click="openChat(me.id)">
            <Avatar :name="me.displayName" :seed="me.id" :size="42" :src="me.avatarUrl" />
            <span class="user-info">
              <strong>{{ me.displayName }} (você)</strong>
              <small>Envie mensagens para você mesmo</small>
            </span>
          </button>
        </template>

        <section v-for="section in sections" :key="section.letter" class="letter-section">
          <p class="letter">{{ section.letter }}</p>
          <div v-for="user in section.users" :key="user.id" class="user-item-wrap">
          <button
            class="user-item"
            type="button"
            :disabled="submitting"
            @click="view === 'list' ? openChat(user.id) : toggle(user)"
          >
            <Avatar :name="user.displayName" :seed="user.id" :size="42" :src="user.avatarUrl" />
            <span class="user-info">
              <strong>{{ user.displayName }}</strong>
              <small v-if="user.phone">{{ formatPhone(user.phone) }}</small>
            </span>
            <span v-if="view === 'group'" class="check" :class="{ on: isSelected(user) }">
              <Check v-if="isSelected(user)" :size="13" :stroke-width="2.6" />
            </span>
          </button>
          <button v-if="view === 'list'" class="icon-btn contact-more" type="button" :aria-label="`Opções de ${user.displayName}`" @click="contactMenu = user">
            <EllipsisVertical :size="18" :stroke-width="2" />
          </button>
          </div>
        </section>

        <div v-if="contactMenu" class="more-backdrop" @click.self="contactMenu = null">
          <div class="more-menu contact-menu" role="menu" :aria-label="contactMenu.displayName">
            <div class="more-group">
              <button type="button" @click="openChat(contactMenu.id)"><MessageCircle :size="19" :stroke-width="2" /> Conversar</button>
              <button type="button" @click="editContact(contactMenu)"><Pencil :size="19" :stroke-width="2" /> Editar contato</button>
            </div>
            <div class="more-group danger">
              <button type="button" @click="deleteContact(contactMenu)"><Trash2 :size="19" :stroke-width="2" /> Apagar contato</button>
            </div>
          </div>
        </div>

        <section v-if="view === 'list' && filteredPending.length" class="letter-section">
          <p class="section-label">Convidar para o Zynko</p>
          <div v-for="p in filteredPending" :key="p.id" class="user-item pending-item">
            <span class="number-icon"><Phone :size="17" :stroke-width="2" /></span>
            <span class="user-info">
              <strong>{{ p.displayName }}</strong>
              <small>{{ formatPhone(p.phone) }}</small>
            </span>
            <button class="btn btn-ghost btn-sm" type="button" @click="invite(p.displayName)">Convidar</button>
            <button class="icon-btn" type="button" title="Remover" aria-label="Remover" @click="removePending(p)"><X :size="15" /></button>
          </div>
        </section>

        <div v-if="!loading && !sections.length && !phoneQuery && !filteredPending.length" class="list-empty">
          <p>{{ query ? 'Nenhum contato encontrado.' : 'Você ainda não tem contatos.' }}</p>
          <button class="btn btn-ghost btn-sm" type="button" @click="newContact">
            <UserPlus :size="14" :stroke-width="2" /> Adicionar contato
          </button>
        </div>
      </div>

      <div v-if="view === 'group'" class="panel-foot">
        <button
          class="send-btn"
          type="button"
          aria-label="Avançar"
          :disabled="!selected.length"
          @click="view = 'group-name'"
        >
          <ArrowRight :size="20" :stroke-width="2.2" />
        </button>
      </div>
    </template>

  </aside>
</template>
