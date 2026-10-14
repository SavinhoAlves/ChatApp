<script setup lang="ts">
import {
  CheckCheck,
  Download,
  Lock,
  MapPin,
  MonitorSmartphone,
  Phone,
  QrCode,
  Share,
  ShieldCheck,
  Smartphone,
  SquarePlus,
  Sticker,
  Timer,
  Users,
  Video,
  X,
} from '@lucide/vue';

// Apresentação para quem abre o endereço no navegador sem estar conectado.
// Celular: cria a conta e instala o app. Computador: entra lendo o QR code com o celular.
const desktop = ref(isDesktopDevice());

const FEATURES = [
  { icon: Video, title: 'Ligações de voz e vídeo', text: 'Direto entre os aparelhos, sem custo.' },
  { icon: Users, title: 'Conversas e grupos', text: 'Lida ✓✓, “digitando…” e visto por último.' },
  { icon: Sticker, title: 'Figurinhas', text: 'Crie as suas a partir de fotos e salve as que receber.' },
  { icon: MapPin, title: 'Localização ao vivo', text: 'Mostre onde você está enquanto se desloca.' },
  { icon: Timer, title: 'Mensagens temporárias', text: 'Somem sozinhas depois do tempo escolhido.' },
  { icon: MonitorSmartphone, title: 'Também no computador', text: 'Leia o QR code e continue as conversas na tela grande.' },
];

// Instalar como app: Android usa o aviso guardado pelo plugin; no iPhone mostramos o passo a passo.
const installPrompt = useState<{ prompt: () => Promise<void> } | null>('install.prompt', () => null);
const isIos = import.meta.client && /iphone|ipad|ipod/i.test(navigator.userAgent);
const canInstall = computed(() => !desktop.value && (!!installPrompt.value || isIos));
const iosHelp = ref(false);

async function install() {
  if (installPrompt.value) {
    await installPrompt.value.prompt();
    installPrompt.value = null;
  } else if (isIos) {
    iosHelp.value = true;
  }
}

useHead({ title: 'Zynko — mensagens, ligações e figurinhas' });
</script>

<template>
  <main class="landing">
    <header class="lp-top">
      <span class="lp-brand"><img src="/logo.png" alt="" width="30" height="30" /> Zynko</span>
      <NuxtLink class="lp-top-link" to="/login">
        <QrCode v-if="desktop" :size="16" :stroke-width="2" />
        <Smartphone v-else :size="16" :stroke-width="2" />
        Entrar
      </NuxtLink>
    </header>

    <section class="lp-hero">
      <div class="lp-copy">
        <span class="lp-chip"><ShieldCheck :size="14" :stroke-width="2.2" /> Simples e privado</span>
        <h1>
          Suas conversas,<br />
          <span class="lp-grad">sem complicação.</span>
        </h1>
        <p class="lp-lead">Mensagens, ligações de voz e vídeo, figurinhas e grupos num app leve, que cabe no seu celular.</p>

        <div class="lp-cta">
          <template v-if="desktop">
            <NuxtLink class="lp-btn primary" to="/login"><QrCode :size="18" :stroke-width="2.2" /> Entrar com QR code</NuxtLink>
          </template>
          <template v-else>
            <NuxtLink class="lp-btn primary" to="/login">Criar conta grátis</NuxtLink>
            <button v-if="canInstall" class="lp-btn ghost" type="button" @click="install"><Download :size="18" :stroke-width="2.2" /> Instalar app</button>
          </template>
        </div>

        <p v-if="desktop" class="lp-note"><Smartphone :size="14" :stroke-width="2" /> Ainda não tem conta? Abra este endereço no celular e cadastre seu número.</p>
        <ul v-else class="lp-trust">
          <li><CheckCheck :size="15" :stroke-width="2.2" /> Só o seu número</li>
          <li><Lock :size="14" :stroke-width="2.2" /> Mensagens no seu servidor</li>
        </ul>
      </div>

      <!-- Prévia ilustrativa do app -->
      <div class="lp-device-wrap" aria-hidden="true">
        <div class="lp-device">
          <div class="lp-notch" />
          <div class="lp-chat-top">
            <span class="lp-ava">AS</span>
            <span class="lp-chat-name"><strong>Ana Souza</strong><small>digitando…</small></span>
            <Video :size="17" :stroke-width="2" />
            <Phone :size="15" :stroke-width="2" />
          </div>
          <div class="lp-msgs">
            <p class="lm in">Oi! Chegou bem? 😊</p>
            <p class="lm out">Cheguei sim! Te mando a localização <small>18:42 <CheckCheck :size="13" :stroke-width="2.4" /></small></p>
            <p class="lm out loc"><MapPin :size="14" :stroke-width="2.4" /> Localização em tempo real</p>
            <img class="lm-sticker" src="/stickers/joinha.svg" alt="" width="92" height="92" />
            <p class="lm in">Perfeito, te ligo mais tarde 📞</p>
          </div>
          <div class="lp-composer"><span>Mensagem</span><i /></div>
        </div>
        <div class="lp-float f1"><Video :size="15" :stroke-width="2.2" /> Chamada de vídeo</div>
        <div class="lp-float f2"><CheckCheck :size="15" :stroke-width="2.4" /> Lida</div>
      </div>
    </section>

    <section class="lp-section">
      <h2>Tudo o que você usa no dia a dia</h2>
      <div class="lp-features">
        <article v-for="f in FEATURES" :key="f.title" class="lp-feature">
          <span class="lp-icon"><component :is="f.icon" :size="20" :stroke-width="2" /></span>
          <div>
            <h3>{{ f.title }}</h3>
            <p>{{ f.text }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="lp-section lp-steps-wrap">
      <div class="lp-steps-copy">
        <h2>Do celular para o computador</h2>
        <p>Sua conta mora no celular. No computador é só espelhar as conversas.</p>
      </div>
      <ol class="lp-steps">
        <li><span>1</span><div><strong>Crie a conta no celular</strong>Com o seu número, em segundos.</div></li>
        <li><span>2</span><div><strong>Abra “Computador” no app</strong>Na barra de baixo, toque em Conectar dispositivo.</div></li>
        <li><span>3</span><div><strong>Leia o QR code</strong>Aponte o celular para a tela do computador. Pronto.</div></li>
      </ol>
    </section>

    <section class="lp-final">
      <h2>Comece agora</h2>
      <p>{{ desktop ? 'Já tem a conta no celular? Entre lendo o QR code.' : 'Leva menos de um minuto.' }}</p>
      <NuxtLink class="lp-btn primary" to="/login">
        <template v-if="desktop"><QrCode :size="18" :stroke-width="2.2" /> Mostrar QR code</template>
        <template v-else>Criar conta grátis</template>
      </NuxtLink>
    </section>

    <footer class="lp-footer">Zynko · mensagens em tempo real</footer>

    <!-- iPhone: instalar pelo Safari -->
    <div v-if="iosHelp" class="overlay" @click.self="iosHelp = false">
      <div class="dialog lp-ios" role="dialog" aria-modal="true" aria-label="Instalar no iPhone">
        <header class="dialog-head">
          <h2>Instalar no iPhone</h2>
          <button class="icon-btn" type="button" aria-label="Fechar" @click="iosHelp = false"><X :size="18" /></button>
        </header>
        <div class="dialog-body">
          <ol class="lp-ios-steps">
            <li>Abra este endereço no <strong>Safari</strong></li>
            <li>Toque em <Share :size="16" :stroke-width="2.2" class="inline-icon" /> <strong>Compartilhar</strong></li>
            <li>Escolha <SquarePlus :size="16" :stroke-width="2.2" class="inline-icon" /> <strong>Adicionar à Tela de Início</strong></li>
          </ol>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.landing {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 16px max(24px, env(safe-area-inset-bottom));
  background:
    radial-gradient(42rem 28rem at 110% -5%, rgb(var(--accent-rgb) / 0.22), transparent 65%),
    radial-gradient(36rem 30rem at -20% 60%, rgb(var(--accent-deep-rgb) / 0.16), transparent 65%);
}

.lp-top,
.lp-hero,
.lp-section,
.lp-final,
.lp-footer {
  max-width: 1080px;
  margin-inline: auto;
}

/* ---- Topo ---- */
.lp-top {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-inline: -16px;
  padding: max(12px, env(safe-area-inset-top)) 16px 12px;
  background: rgb(var(--bg-rgb) / 0.7);
  backdrop-filter: blur(16px);
}

@media (min-width: 1112px) {
  .lp-top {
    margin-inline: auto;
    padding-inline: 0;
    background: transparent;
    backdrop-filter: none;
  }
}

.lp-brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.lp-top-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--glass);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

/* ---- Hero ---- */
.lp-hero {
  display: grid;
  gap: 44px;
  padding: 28px 0 40px;
}

.lp-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgb(var(--accent-rgb) / 0.3);
  border-radius: 999px;
  background: rgb(var(--accent-rgb) / 0.1);
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 700;
}

.lp-copy h1 {
  margin: 18px 0 14px;
  font-size: clamp(36px, 9.5vw, 60px);
  font-weight: 800;
  line-height: 1.04;
  letter-spacing: -0.035em;
}

.lp-grad {
  background: linear-gradient(100deg, rgb(var(--accent-light-rgb)), rgb(var(--accent-rgb)) 55%, rgb(var(--accent-deep-rgb)));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lp-lead {
  max-width: 32rem;
  margin: 0;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.55;
}

.lp-cta {
  display: grid;
  gap: 10px;
  margin: 26px 0 16px;
}

.lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 52px;
  padding: 0 24px;
  border: 1px solid transparent;
  border-radius: 16px;
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.15s var(--ease), filter 0.15s var(--ease);
}

.lp-btn:active {
  transform: scale(0.98);
}

.lp-btn.primary {
  background: linear-gradient(135deg, rgb(var(--accent-light-rgb)), rgb(var(--accent-deep-rgb)));
  color: var(--on-accent);
  box-shadow: 0 10px 26px rgb(var(--accent-rgb) / 0.3);
}

.lp-btn.primary:hover {
  filter: brightness(1.06);
}

.lp-btn.ghost {
  border-color: var(--glass-border);
  background: var(--glass);
  color: var(--text);
}

.lp-note,
.lp-trust {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--muted);
  font-size: 13.5px;
}

.lp-trust li,
.lp-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lp-trust svg {
  color: var(--accent);
}

/* ---- Aparelho ilustrativo ---- */
.lp-device-wrap {
  position: relative;
  justify-self: center;
  width: min(300px, 86vw);
}

.lp-device {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 8px solid #0d1513;
  border-radius: 42px;
  background:
    radial-gradient(20rem 16rem at 100% 0%, rgb(var(--accent-rgb) / 0.16), transparent 70%),
    rgb(var(--bg-rgb));
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.08),
    0 40px 80px rgb(0 0 0 / 0.55),
    0 0 60px rgb(var(--accent-rgb) / 0.12);
  overflow: hidden;
}

.lp-notch {
  position: absolute;
  top: 8px;
  left: 50%;
  width: 84px;
  height: 22px;
  border-radius: 999px;
  background: #000;
  transform: translateX(-50%);
}

.lp-chat-top {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 40px 14px 10px;
  border-bottom: 1px solid var(--glass-border);
  color: var(--muted);
}

.lp-ava {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #22c55e, #15803d);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.lp-chat-name {
  display: grid;
  flex: 1;
  line-height: 1.2;
}

.lp-chat-name strong {
  color: var(--text);
  font-size: 14px;
}

.lp-chat-name small {
  color: var(--accent);
  font-size: 11.5px;
}

.lp-msgs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 10px;
}

.lm {
  max-width: 82%;
  margin: 0;
  padding: 7px 10px;
  border-radius: 16px;
  font-size: 13.5px;
  line-height: 1.35;
}

.lm small {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  color: var(--muted);
  font-size: 10.5px;
}

.lm small svg {
  color: var(--read);
}

.lm.in {
  align-self: flex-start;
  border-top-left-radius: 5px;
  background: rgb(255 255 255 / 0.07);
}

.lm.out {
  align-self: flex-end;
  border-top-right-radius: 5px;
  background: linear-gradient(135deg, rgb(var(--accent-rgb) / 0.32), rgb(var(--accent-deep-rgb) / 0.18));
}

.lm.loc {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.lm-sticker {
  align-self: flex-end;
}

.lp-composer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 10px 14px;
  padding: 6px 6px 6px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  color: var(--muted);
  font-size: 13px;
}

.lp-composer span {
  flex: 1;
}

.lp-composer i {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgb(var(--accent-light-rgb)), rgb(var(--accent-deep-rgb)));
}

.lp-float {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  background: rgb(var(--panel-rgb, 20 30 28) / 0.9);
  backdrop-filter: blur(12px);
  box-shadow: 0 14px 30px rgb(0 0 0 / 0.4);
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
}

.lp-float svg {
  color: var(--accent);
}

/* No celular os selos cobririam a conversa: só aparecem com espaço dos lados. */
.lp-float {
  display: none;
}

.lp-float.f1 {
  top: 47%;
  left: -18%;
}

.lp-float.f2 {
  right: -10%;
  bottom: 22%;
}

/* ---- Seções ---- */
.lp-section {
  padding: 28px 0;
}

.lp-section h2,
.lp-final h2 {
  margin: 0 0 18px;
  font-size: clamp(24px, 6vw, 34px);
  font-weight: 800;
  letter-spacing: -0.025em;
}

.lp-features {
  display: grid;
  gap: 10px;
}

.lp-feature {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 16px;
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  background: var(--glass);
}

.lp-feature h3 {
  margin: 1px 0 4px;
  font-size: 15.5px;
}

.lp-feature p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.45;
}

.lp-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: rgb(var(--accent-rgb) / 0.14);
  color: var(--accent);
}

.lp-steps-copy p {
  margin: -8px 0 18px;
  color: var(--muted);
  font-size: 15.5px;
}

.lp-steps {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lp-steps li {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.45;
}

.lp-steps li strong {
  display: block;
  color: var(--text);
  font-size: 15.5px;
}

.lp-steps li > span {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgb(var(--accent-light-rgb)), rgb(var(--accent-deep-rgb)));
  color: var(--on-accent);
  font-weight: 800;
}

.lp-final {
  display: grid;
  justify-items: center;
  gap: 6px;
  margin-top: 28px;
  padding: 36px 20px;
  border: 1px solid rgb(var(--accent-rgb) / 0.25);
  border-radius: 28px;
  background:
    radial-gradient(30rem 14rem at 50% 0%, rgb(var(--accent-rgb) / 0.2), transparent 70%),
    var(--glass);
  text-align: center;
}

.lp-final h2 {
  margin: 0;
}

.lp-final p {
  margin: 0 0 16px;
  color: var(--muted);
}

.lp-final .lp-btn {
  width: min(320px, 100%);
}

.lp-footer {
  padding: 28px 0 8px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.lp-ios-steps {
  margin: 0;
  padding-left: 20px;
  line-height: 2.1;
}

.inline-icon {
  vertical-align: -3px;
}

/* ---- Telas maiores ---- */
@media (min-width: 640px) {
  .lp-float {
    display: inline-flex;
  }

  .lp-cta {
    display: flex;
    flex-wrap: wrap;
  }

  .lp-features {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 900px) {
  .landing {
    padding-inline: 32px;
  }

  .lp-hero {
    grid-template-columns: 1.15fr 1fr;
    align-items: center;
    padding: 64px 0 80px;
  }

  .lp-features {
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .lp-feature {
    flex-direction: column;
    padding: 22px;
  }

  .lp-steps-wrap {
    display: grid;
    grid-template-columns: 1fr 1.2fr;
    gap: 40px;
    align-items: center;
  }

  .lp-steps {
    gap: 18px;
  }
}
</style>
