<script setup lang="ts">
import { Info, TriangleAlert } from '@lucide/vue';

const { modal, promptValue, settle } = useConfirm();

const isDanger = computed(() => modal.value?.kind === 'confirm' && !!modal.value.options.danger);
</script>

<template>
  <div v-if="modal" class="overlay" @click.self="settle(false)" @keydown.esc="settle(false)">
    <div class="dialog confirm-dialog" role="alertdialog" aria-modal="true">
      <div class="confirm-icon" :class="{ danger: isDanger }">
        <TriangleAlert v-if="isDanger" :size="22" :stroke-width="2" />
        <Info v-else :size="22" :stroke-width="2" />
      </div>

      <h2 v-if="modal.options.title">{{ modal.options.title }}</h2>
      <p v-if="modal.options.message" class="confirm-message">{{ modal.options.message }}</p>
      <form v-if="modal.kind === 'prompt'" class="confirm-prompt" @submit.prevent="settle(true)">
        <input
          v-model="promptValue"
          class="input"
          :type="modal.options.secret ? 'password' : 'text'"
          :inputmode="modal.options.numeric ? 'numeric' : undefined"
          :autocomplete="modal.options.secret ? 'off' : undefined"
          :placeholder="modal.options.placeholder"
          :maxlength="modal.options.maxLength ?? 60"
          autofocus
        />
      </form>

      <div class="confirm-actions">
        <template v-if="modal.kind === 'prompt'">
          <button class="btn btn-ghost" type="button" @click="settle(false)">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="!promptValue.trim()" @click="settle(true)">
            {{ modal.options.confirmLabel ?? 'Salvar' }}
          </button>
        </template>
        <template v-else-if="modal.kind === 'confirm'">
          <button class="btn btn-ghost" type="button" autofocus @click="settle(false)">
            {{ modal.options.cancelLabel ?? 'Cancelar' }}
          </button>
          <button :class="['btn', isDanger ? 'btn-danger' : 'btn-primary']" type="button" @click="settle(true)">
            {{ modal.options.confirmLabel ?? 'Confirmar' }}
          </button>
        </template>
        <button v-else class="btn btn-primary" type="button" autofocus @click="settle(true)">
          {{ modal.options.okLabel ?? 'OK' }}
        </button>
      </div>
    </div>
  </div>
</template>
