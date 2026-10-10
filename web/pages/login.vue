<script setup lang="ts">
import { ArrowLeft, Camera, IdCard, Lock, Phone, RefreshCw, Smartphone, X } from '@lucide/vue';
import QRCode from 'qrcode';
import { formatPhone } from '~/utils/phone';
import { BUSINESS_CATEGORIES } from '~/utils/business';

const auth = useAuth();

type Method = 'qr' | 'phone';
type Step = 'phone' | 'code' | 'profile';

const method = ref<Method>(isDesktopDevice() ? 'qr' : 'phone');
const step = ref<Step>('phone');
const error = ref('');
const loading = ref(false);

const phone = ref('');
const code = ref('');
const resendIn = ref(0);
const signupToken = ref('');
const displayName = ref('');

const titles: Record<Step, string> = { phone: 'Seu número', code: 'Confirme o código', profile: 'Seu perfil' };
const subtitles: Record<Step, string> = {
  phone: 'Vamos confirmar que o número é seu com um código de 6 dígitos.',
  code: 'Digite o código para continuar.',
  profile: 'É assim que as pessoas vão ver você no Chat.',
};
// App instalado não tem a apresentação: some o "voltar".
const installed = isInstalledApp();

// ---- Telefone + SMS ----
let resendTimer: ReturnType<typeof setInterval> | undefined;

function startResendTimer(seconds: number) {
  resendIn.value = seconds;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    resendIn.value = Math.max(0, resendIn.value - 1);
    if (resendIn.value === 0) clearInterval(resendTimer);
  }, 1000);
}

async function run(fn: () => Promise<void>) {
  error.value = '';
  loading.value = true;
  try {
    await fn();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

// Modo desenvolvimento (SMS "console"): o servidor devolve o código e a tela já mostra/preenche.
const devCode = ref('');
// Como o código foi enviado: SMS (celular) ou ligação (fixo, 0800, 400x — ou se a pessoa pedir).
// 'admin': o código foi para o WhatsApp do administrador, que repassa à pessoa.
const channel = ref<'sms' | 'call' | 'admin'>('sms');
const canSms = ref(true);
// Com SMS pelo próprio celular (SMS Gate) não há ligação: some o "Me ligue".
const canCall = ref(true);
const codeHint = computed(() => {
  if (channel.value === 'call') return `Vamos ligar para ${formatPhone(phone.value)} e ditar o código`;
  if (channel.value === 'admin') return 'Peça o código de ativação ao administrador do Chat';
  return `Código enviado por SMS para ${formatPhone(phone.value)}`;
});

const sendCode = (via?: 'sms' | 'call') =>
  run(async () => {
    const res = await auth.requestCode(phone.value, via);
    phone.value = res.phone;
    channel.value = res.channel;
    canSms.value = res.canSms;
    canCall.value = res.canCall ?? true;
    step.value = 'code';
    devCode.value = res.devCode ?? '';
    code.value = res.devCode ?? '';
    startResendTimer(res.resendInSeconds);
  });

const confirmCode = () =>
  run(async () => {
    const res = await auth.verifyCode(phone.value, code.value);
    if (res.needsProfile && res.signupToken) {
      signupToken.value = res.signupToken;
      step.value = 'profile';
      return;
    }
    await navigateTo('/');
  });

// Conta comercial (empresa): só a categoria aqui; o resto em Configurações › Conta comercial.
const isBusiness = ref(false);
const businessCategory = ref('');

// Foto de perfil opcional: escolhida antes, enviada logo depois que a conta é criada.
const photo = ref<File | null>(null);
const photoPreview = ref('');
const photoInput = ref<HTMLInputElement | null>(null);

function pickPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    error.value = 'Use uma foto JPG, PNG ou WebP';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'A foto precisa ter no máximo 5 MB';
    return;
  }
  error.value = '';
  clearPhoto();
  photo.value = file;
  photoPreview.value = URL.createObjectURL(file);
}

function clearPhoto() {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  photo.value = null;
  photoPreview.value = '';
}

const saveProfile = () =>
  run(async () => {
    await auth.completeProfile({
      signupToken: signupToken.value,
      displayName: displayName.value,
      businessCategory: isBusiness.value ? businessCategory.value : undefined,
    });
    // A conta já existe: se a foto falhar, entra mesmo assim (dá para trocar depois).
    if (photo.value) await auth.uploadAvatar(photo.value).catch(() => {});
    await navigateTo('/');
  });

// ---- QR code (computador) ----
const qrImage = ref('');
const qrState = ref<'loading' | 'ready' | 'expired'>('loading');
let qrCode = '';
let qrPoll: ReturnType<typeof setInterval> | undefined;
let polling = false;

function stopQr() {
  clearInterval(qrPoll);
  qrPoll = undefined;
}

async function startQr() {
  stopQr();
  qrState.value = 'loading';
  error.value = '';
  try {
    const res = await auth.createQr();
    qrCode = res.code;
    qrImage.value = await QRCode.toDataURL(res.code, { margin: 1, width: 264, color: { dark: '#0f1715', light: '#ffffff' } });
    qrState.value = 'ready';
  } catch (e) {
    error.value = (e as Error).message;
    qrState.value = 'expired';
    return;
  }
  qrPoll = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const status = await auth.pollQr(qrCode);
      if (status === 'approved') {
        stopQr();
        await navigateTo('/');
      } else if (status === 'expired') {
        stopQr();
        qrState.value = 'expired';
      }
    } catch {
      // Falha de rede momentânea: tenta de novo no próximo ciclo.
    } finally {
      polling = false;
    }
  }, 2000);
}

watch(method, (m) => {
  error.value = '';
  if (m === 'qr') void startQr();
  else stopQr();
});

// Computador: só QR code (o número/código é coisa do app no celular, como no WhatsApp).
onMounted(() => {
  if (method.value === 'qr') void startQr();
});
onBeforeUnmount(() => {
  stopQr();
  clearInterval(resendTimer);
  clearPhoto();
});

useHead({ title: 'Entrar · Chat' });
</script>

<template>
  <main class="auth-page">
    <!-- Computador sem vínculo: tela de QR, como no WhatsApp Web -->
    <section v-if="method === 'qr'" class="qr-screen">
      <div class="qr-screen-main">
        <div class="qr-screen-brand"><img src="/logo.png" alt="" width="36" height="36" /> Chat</div>
        <h1>Use o Chat no seu computador</h1>
        <ol class="qr-steps big">
          <li>Abra o Chat no seu celular</li>
          <li>
            Toque em <Smartphone :size="16" :stroke-width="2" class="inline-icon" />
            <strong>Dispositivos conectados</strong>
          </li>
          <li>Toque em <strong>Conectar dispositivo</strong></li>
          <li>Aponte a câmera do celular para esta tela para escanear o código</li>
        </ol>
        <NuxtLink class="link-btn" to="/inicio">Voltar à apresentação</NuxtLink>
      </div>

      <div class="qr-screen-side">
        <div class="qr-box" :class="{ dim: qrState !== 'ready' }" aria-live="polite">
          <img v-if="qrImage" :src="qrImage" alt="QR code para entrar" width="264" height="264" />
          <span v-if="qrState === 'loading'" class="qr-status">Gerando código…</span>
          <button v-if="qrState === 'expired'" class="btn btn-primary" type="button" @click="startQr">
            <RefreshCw :size="16" :stroke-width="2" /> Gerar novo QR
          </button>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-else-if="qrState === 'expired'" class="qr-hint">O código expirou. Gere um novo para continuar.</p>
        <p v-else class="qr-hint">Aguardando a leitura no celular…</p>
      </div>
    </section>

    <div v-else class="auth-card">
      <NuxtLink v-if="step === 'phone' && !installed" class="icon-btn auth-back" to="/inicio" aria-label="Voltar à apresentação">
        <ArrowLeft :size="20" :stroke-width="2" />
      </NuxtLink>
      <img v-if="step !== 'profile'" class="brand-logo" src="/logo.png" alt="Chat" width="96" height="96" />
      <h1>{{ titles[step] }}</h1>
      <p class="auth-sub">{{ subtitles[step] }}</p>

      <!-- Telefone: número -->
      <form v-if="step === 'phone'" class="auth-form" @submit.prevent="sendCode()">
        <label class="field">
          <span>Número de telefone</span>
          <div class="field-icon">
            <Phone :size="16" :stroke-width="2" />
            <input v-model="phone" class="input" type="tel" autocomplete="tel" inputmode="tel" placeholder="(11) 99999-9999" required />
          </div>
          <small>Com DDD. Sem o +, usamos Brasil (+55).</small>
        </label>
        <button class="btn btn-primary btn-block" type="submit" :disabled="loading || !phone.trim()">
          {{ loading ? 'Enviando…' : 'Receber código' }}
        </button>
      </form>

      <!-- Telefone: código -->
      <form v-else-if="step === 'code'" class="auth-form" @submit.prevent="confirmCode">
        <label class="field">
          <span>{{ codeHint }}</span>
          <small v-if="devCode" class="dev-code">Modo desenvolvimento: o código é <strong>{{ devCode }}</strong> (já preenchido).</small>
          <div class="field-icon">
            <Lock :size="16" :stroke-width="2" />
            <input
              v-model="code"
              class="input code-input"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              pattern="\d{6}"
              placeholder="000000"
              autofocus
              required
            />
          </div>
        </label>
        <button class="btn btn-primary btn-block" type="submit" :disabled="loading || code.length !== 6">
          {{ loading ? 'Verificando…' : 'Confirmar' }}
        </button>
        <div class="auth-links">
          <button class="link-btn" type="button" @click="step = 'phone'">Trocar número</button>
          <button class="link-btn" type="button" :disabled="resendIn > 0 || loading" @click="sendCode(channel === 'admin' ? undefined : channel)">
            {{ resendIn > 0 ? `Reenviar em ${resendIn}s` : channel === 'call' ? 'Ligar de novo' : channel === 'admin' ? 'Pedir outro código' : 'Reenviar SMS' }}
          </button>
          <button v-if="channel === 'sms' && canCall" class="link-btn" type="button" :disabled="resendIn > 0 || loading" @click="sendCode('call')">Me ligue</button>
          <button v-else-if="channel === 'call' && canSms" class="link-btn" type="button" :disabled="resendIn > 0 || loading" @click="sendCode('sms')">Enviar por SMS</button>
        </div>
      </form>

      <!-- Telefone: perfil de número novo -->
      <form v-else class="auth-form" @submit.prevent="saveProfile">
        <div class="photo-picker">
          <button class="photo-btn" type="button" :aria-label="photo ? 'Trocar foto' : 'Adicionar foto'" @click="photoInput?.click()">
            <img v-if="photoPreview" :src="photoPreview" alt="" />
            <Camera v-else :size="30" :stroke-width="1.6" />
          </button>
          <button v-if="photo" class="photo-remove" type="button" aria-label="Remover foto" @click="clearPhoto">
            <X :size="14" :stroke-width="2.4" />
          </button>
          <small>{{ photo ? 'Toque para trocar' : 'Adicionar foto (opcional)' }}</small>
          <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="pickPhoto" />
        </div>
        <label class="field">
          <span>Seu nome</span>
          <div class="field-icon">
            <IdCard :size="16" :stroke-width="2" />
            <input v-model="displayName" class="input" type="text" autocomplete="name" maxlength="40" required autofocus />
          </div>
          <small>{{ isBusiness ? 'Nome da empresa, como os clientes vão ver.' : 'É o nome que seus contatos vão ver. Dá para mudar depois.' }}</small>
        </label>
        <label class="radio-row business-toggle">
          <input v-model="isBusiness" type="checkbox" />
          <span>Esta é uma conta comercial (empresa)</span>
        </label>
        <label v-if="isBusiness" class="field">
          <span>Categoria da empresa</span>
          <select v-model="businessCategory" class="input" required>
            <option value="" disabled>Escolha…</option>
            <option v-for="c in BUSINESS_CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <button class="btn btn-primary btn-block" type="submit" :disabled="loading || !displayName.trim() || (isBusiness && !businessCategory)">
          {{ loading ? 'Criando…' : 'Concluir' }}
        </button>
      </form>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

    </div>
  </main>
</template>
