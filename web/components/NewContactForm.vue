<script setup lang="ts">
import { AtSign, BookUser, Check, Phone, User as UserIcon } from '@lucide/vue';
import type { User } from '~/types';
import { COUNTRIES } from '~/utils/countries';
import type { PendingContact } from '~/utils/invite';

const props = defineProps<{ initialPhone?: string }>();
const emit = defineEmits<{ saved: [user: User]; pending: [contact: PendingContact]; imported: [users: User[]] }>();

const { api } = useAuth();

const firstName = ref('');
const lastName = ref('');
const countryCode = ref('BR');
// Veio de "Salvar contato" (número que ainda não usa o Zynko): já preenche.
const number = ref(props.initialPhone ?? '');
const username = ref('');
const saving = ref(false);
const error = ref('');

const country = computed(() => COUNTRIES.find((c) => c.code === countryCode.value) ?? COUNTRIES[0]!);
const digits = computed(() => number.value.replace(/\D/g, ''));

// Como no WhatsApp: o botão de salvar só aparece depois que há um número (ou um @usuário).
const canSave = computed(() => digits.value.length >= 8 || username.value.trim().replace(/^@/, '').length >= 3);

/** Número completo: se a pessoa digitou com "+", vale o que ela digitou; senão, código do país + número. */
const fullPhone = computed(() => {
  if (!digits.value) return undefined;
  return number.value.trim().startsWith('+') ? `+${digits.value}` : `+${country.value.dial}${digits.value.replace(/^0+/, '')}`;
});

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await api<{ contact: User | null; pending?: PendingContact }>('/contacts', {
      method: 'POST',
      body: {
        firstName: firstName.value.trim() || undefined,
        lastName: lastName.value.trim() || undefined,
        phone: fullPhone.value,
        username: username.value.trim().replace(/^@/, '') || undefined,
        // Como na agenda do celular: salva mesmo que o número ainda não use o Zynko.
        allowPending: true,
      },
    });
    if (res.contact) emit('saved', res.contact);
    else if (res.pending) emit('pending', res.pending);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

// ---- Importar da agenda (Chrome do Android) ----
type PickedContact = { tel?: string[] };
type ContactsManager = { select: (props: string[], opts: { multiple: boolean }) => Promise<PickedContact[]> };
const contactsApi = import.meta.client ? (navigator as Navigator & { contacts?: ContactsManager }).contacts : undefined;
const canImport = !!contactsApi && 'ContactsManager' in window;
const importing = ref(false);
const importNote = ref('');

async function importFromPhonebook() {
  if (!contactsApi) return;
  error.value = '';
  importNote.value = '';
  let picked: PickedContact[];
  try {
    picked = await contactsApi.select(['tel'], { multiple: true });
  } catch {
    return; // fechou o seletor ou negou a permissão
  }
  const phones = picked.flatMap((c) => c.tel ?? []).filter(Boolean);
  if (!phones.length) return;
  importing.value = true;
  try {
    const res = await api<{ added: User[]; alreadyContacts: number; checked: number }>('/contacts/import', {
      method: 'POST',
      body: { phones: phones.slice(0, 1000) },
    });
    if (res.added.length) {
      importNote.value = `${res.added.length === 1 ? '1 contato adicionado' : `${res.added.length} contatos adicionados`}: ${res.added.map((u) => u.displayName).join(', ')}`;
      emit('imported', res.added);
    } else if (res.alreadyContacts) importNote.value = 'Quem usa o Zynko dessa lista já estava nos seus contatos.';
    else importNote.value = `Nenhum dos ${res.checked} números escolhidos usa o Zynko ainda.`;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <form class="contact-form" @submit.prevent="save">
    <div class="settings-body">
      <label class="field">
        <span>Nome</span>
        <div class="field-icon">
          <UserIcon :size="16" :stroke-width="2" />
          <input v-model="firstName" class="input" type="text" maxlength="40" autocomplete="off" autofocus />
        </div>
      </label>

      <label class="field">
        <span>Sobrenome</span>
        <input v-model="lastName" class="input" type="text" maxlength="40" autocomplete="off" />
      </label>

      <div class="field">
        <span>Telefone</span>
        <div class="phone-row">
          <label class="country-select">
            <span class="country-flag" aria-hidden="true">{{ country.flag }}</span>
            <span class="country-dial">+{{ country.dial }}</span>
            <select v-model="countryCode" aria-label="País">
              <option v-for="c in COUNTRIES" :key="c.code" :value="c.code">{{ c.flag }} {{ c.name }} (+{{ c.dial }})</option>
            </select>
          </label>
          <div class="field-icon phone-input">
            <Phone :size="16" :stroke-width="2" />
            <input v-model="number" class="input" type="tel" inputmode="tel" autocomplete="off" placeholder="11 99999-9999" aria-label="Número" />
          </div>
        </div>
      </div>

      <label class="field">
        <span>Nome de usuário (opcional)</span>
        <div class="field-icon">
          <AtSign :size="16" :stroke-width="2" />
          <input v-model="username" class="input" type="text" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="usuario" />
        </div>
        <small>Sem número, dá para adicionar só pelo @usuário.</small>
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <template v-if="canImport">
        <div class="or-sep"><span>ou</span></div>
        <button class="btn btn-ghost btn-block" type="button" :disabled="importing" @click="importFromPhonebook">
          <BookUser :size="16" :stroke-width="2" /> {{ importing ? 'Procurando…' : 'Importar da agenda' }}
        </button>
        <p v-if="importNote" class="notice"><Check :size="16" :stroke-width="2" /> {{ importNote }}</p>
      </template>
    </div>

    <Transition name="fab">
      <div v-if="canSave" class="panel-foot">
        <button class="send-btn" type="submit" :disabled="saving" aria-label="Salvar contato" title="Salvar contato">
          <Check :size="24" :stroke-width="2.4" />
        </button>
      </div>
    </Transition>
  </form>
</template>
