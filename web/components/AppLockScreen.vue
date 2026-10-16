<script setup lang="ts">
import { Delete, Fingerprint, Lock } from '@lucide/vue';

// Tela de bloqueio: aparece por cima de tudo quando o bloqueio do app está ligado.
const lock = useAppLock();
const { logout } = useAuth();
const { confirm } = useConfirm();

const pin = ref('');
const error = ref('');
const shake = ref(false);
const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(timer));
const pinLength = computed(() => lock.settings.value?.pinLength ?? 4);
const waitSeconds = computed(() => Math.max(0, Math.ceil((lock.waitUntil.value - now.value) / 1000)));

async function tryBiometric() {
  error.value = '';
  await lock.unlockWithBiometric();
}

// Abriu bloqueado: já pede a digital/rosto (como no WhatsApp).
onMounted(() => {
  if (lock.settings.value?.biometric) setTimeout(() => void tryBiometric(), 300);
});

async function press(d: string) {
  if (waitSeconds.value) return;
  error.value = '';
  pin.value += d;
  // Confere quando chega ao tamanho do PIN criado (4 a 6 dígitos).
  if (pin.value.length < pinLength.value) return;
  if (await lock.unlockWithPin(pin.value)) pin.value = '';
  else wrong();
}

function wrong() {
  pin.value = '';
  error.value = waitSeconds.value ? '' : 'PIN incorreto';
  shake.value = true;
  setTimeout(() => (shake.value = false), 400);
}

function back() {
  pin.value = pin.value.slice(0, -1);
}

// Teclado físico (computador).
function onKey(e: KeyboardEvent) {
  if (/^\d$/.test(e.key)) void press(e.key);
  else if (e.key === 'Backspace') back();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

async function forgot() {
  const ok = await confirm({
    title: 'Esqueceu o PIN?',
    message: 'Você sai do Zynko neste aparelho e entra de novo com o código por SMS. O bloqueio é desligado.',
    confirmLabel: 'Sair e entrar de novo',
    danger: true,
  });
  if (!ok) return;
  lock.disable();
  await logout();
}
</script>

<template>
  <div class="app-lock" role="dialog" aria-modal="true" aria-label="Zynko bloqueado">
    <div class="app-lock-top">
      <span class="app-lock-icon"><Lock :size="26" :stroke-width="2" /></span>
      <h2>Zynko bloqueado</h2>
      <p>{{ waitSeconds ? `Muitas tentativas. Tente de novo em ${waitSeconds} s.` : 'Digite o seu PIN' }}</p>
    </div>

    <div class="app-lock-dots" :class="{ shake }" aria-hidden="true">
      <i v-for="i in pinLength" :key="i" :class="{ on: i <= pin.length }" />
    </div>
    <p class="app-lock-error" role="alert">{{ error }}</p>

    <div class="app-lock-pad">
      <button v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" :key="d" type="button" :disabled="!!waitSeconds" @click="press(d)">{{ d }}</button>
      <button v-if="lock.settings.value?.biometric" type="button" class="pad-icon" aria-label="Usar digital ou rosto" @click="tryBiometric">
        <Fingerprint :size="26" :stroke-width="1.8" />
      </button>
      <span v-else />
      <button type="button" :disabled="!!waitSeconds" @click="press('0')">0</button>
      <button type="button" class="pad-icon" aria-label="Apagar" @click="back"><Delete :size="24" :stroke-width="1.8" /></button>
    </div>

    <button class="app-lock-forgot" type="button" @click="forgot">Esqueci o PIN</button>
  </div>
</template>
