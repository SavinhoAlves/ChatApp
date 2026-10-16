<script setup lang="ts">
import { Delete, Fingerprint, Lock, ScanFace } from '@lucide/vue';

// Tela de bloqueio: aparece por cima de tudo quando o bloqueio do app está ligado.
// Com Face ID/digital: um botão grande "Desbloquear" (no iPhone o Face ID só abre depois de um toque).
// Com PIN: o teclado numérico (sozinho ou como alternativa).
const lock = useAppLock();
const { logout } = useAuth();
const { confirm } = useConfirm();

const bio = computed(() => !!lock.settings.value?.biometric);
const ios = uiPlatform() === 'ios';
// Só Face ID/digital, ou o PIN quando a pessoa escolhe "Usar PIN".
const showPad = ref(lock.hasPin.value && !bio.value);

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
  if (!(await lock.unlockWithBiometric())) error.value = 'Não foi possível confirmar. Tente de novo.';
}

// App Android: a digital pode abrir sozinha ao mostrar a tela. No iPhone precisa do toque no botão.
onMounted(() => {
  if (bio.value && isAndroidApp()) setTimeout(() => void tryBiometric(), 300);
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
  if (!showPad.value) return;
  if (/^\d$/.test(e.key)) void press(e.key);
  else if (e.key === 'Backspace') back();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

async function forgot() {
  const ok = await confirm({
    title: 'Não consegue desbloquear?',
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
      <p v-if="showPad">{{ waitSeconds ? `Muitas tentativas. Tente de novo em ${waitSeconds} s.` : 'Digite o seu PIN' }}</p>
      <p v-else>Use a digital, o rosto ou a senha do celular</p>
    </div>

    <template v-if="showPad">
      <div class="app-lock-dots" :class="{ shake }" aria-hidden="true">
        <i v-for="i in pinLength" :key="i" :class="{ on: i <= pin.length }" />
      </div>
      <p class="app-lock-error" role="alert">{{ error }}</p>

      <div class="app-lock-pad">
        <button v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" :key="d" type="button" :disabled="!!waitSeconds" @click="press(d)">{{ d }}</button>
        <button v-if="bio" type="button" class="pad-icon" aria-label="Usar o bloqueio do celular" @click="tryBiometric">
          <component :is="ios ? ScanFace : Fingerprint" :size="26" :stroke-width="1.8" />
        </button>
        <span v-else />
        <button type="button" :disabled="!!waitSeconds" @click="press('0')">0</button>
        <button type="button" class="pad-icon" aria-label="Apagar" @click="back"><Delete :size="24" :stroke-width="1.8" /></button>
      </div>
    </template>

    <template v-else>
      <button class="btn btn-primary app-lock-unlock" type="button" @click="tryBiometric">
        <component :is="ios ? ScanFace : Fingerprint" :size="22" :stroke-width="2" />
        Desbloquear
      </button>
      <p class="app-lock-error" role="alert">{{ error }}</p>
      <button v-if="lock.hasPin.value" class="app-lock-forgot" type="button" @click="showPad = true">Usar PIN</button>
    </template>

    <button class="app-lock-forgot muted" type="button" @click="forgot">{{ showPad ? 'Esqueci o PIN' : 'Não consigo desbloquear' }}</button>
  </div>
</template>
