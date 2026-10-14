<script setup lang="ts">
import { Check, Store } from '@lucide/vue';
import type { User } from '~/types';
import { BUSINESS_CATEGORIES, type BusinessProfile } from '~/utils/business';

const { api, me } = useAuth();
const { confirm } = useConfirm();

const form = reactive({ category: '', description: '', hours: '', address: '', website: '', email: '' });
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    const res = await api<{ business: BusinessProfile | null }>('/me/business');
    if (res.business) {
      Object.assign(form, {
        category: res.business.category,
        description: res.business.description ?? '',
        hours: res.business.hours ?? '',
        address: res.business.address ?? '',
        website: res.business.website ?? '',
        email: res.business.email ?? '',
      });
    }
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

async function save() {
  saving.value = true;
  saved.value = false;
  error.value = '';
  try {
    const res = await api<{ user: User }>('/me/business', { method: 'PUT', body: form });
    me.value = { ...me.value!, ...res.user };
    saved.value = true;
    setTimeout(() => (saved.value = false), 2500);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

async function disable() {
  const ok = await confirm({
    title: 'Voltar para conta pessoal?',
    message: 'O selo de conta comercial some e os dados da empresa são apagados.',
    confirmLabel: 'Desativar',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await api<{ user: User }>('/me/business', { method: 'DELETE' });
    me.value = { ...me.value!, ...res.user };
    Object.assign(form, { category: '', description: '', hours: '', address: '', website: '', email: '' });
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <div v-if="!loading" class="business-settings">
    <div class="business-hero">
      <span class="business-hero-icon"><Store :size="26" :stroke-width="1.8" /></span>
      <p v-if="me?.isBusiness">
        <strong>Sua conta é comercial.</strong> Quem conversar com você vê o selo e os dados da empresa abaixo.
      </p>
      <p v-else>
        Use o Zynko como empresa: um selo de <strong>conta comercial</strong> e um perfil com categoria, horário, endereço e site.
        Dá para usar com 0800, 4004 ou fixo.
      </p>
    </div>

    <form class="auth-form" @submit.prevent="save">
      <label class="field">
        <span>Categoria *</span>
        <select v-model="form.category" class="input" required>
          <option value="" disabled>Escolha…</option>
          <option v-for="c in BUSINESS_CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="field">
        <span>Descrição</span>
        <textarea v-model="form.description" class="input" rows="3" maxlength="256" placeholder="O que a empresa faz" />
      </label>
      <label class="field">
        <span>Horário de atendimento</span>
        <input v-model="form.hours" class="input" type="text" maxlength="120" placeholder="Seg a sex, 9h às 18h" />
      </label>
      <label class="field">
        <span>Endereço</span>
        <input v-model="form.address" class="input" type="text" maxlength="160" placeholder="Rua, número, cidade" />
      </label>
      <label class="field">
        <span>Site</span>
        <input v-model="form.website" class="input" type="url" maxlength="120" placeholder="minhaempresa.com.br" />
      </label>
      <label class="field">
        <span>E-mail</span>
        <input v-model="form.email" class="input" type="email" maxlength="120" placeholder="contato@minhaempresa.com.br" />
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="saved" class="notice"><Check :size="16" /> Dados da empresa salvos.</p>

      <button class="btn btn-primary btn-block" type="submit" :disabled="saving || !form.category">
        {{ me?.isBusiness ? 'Salvar' : 'Ativar conta comercial' }}
      </button>
      <button v-if="me?.isBusiness" class="btn btn-ghost btn-block" type="button" @click="disable">Voltar para conta pessoal</button>
    </form>
  </div>
</template>
