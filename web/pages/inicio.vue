<script setup lang="ts">
import { Download, MapPin, MonitorSmartphone, QrCode, Share, ShieldCheck, Smartphone, SquarePlus, Sticker, Timer, Users, Video, X } from '@lucide/vue';

// Apresentação para quem abre o endereço no navegador sem estar conectado (layout da "página inicial
// modernizada"). Computador: entra lendo o QR code (tela real em /login). Celular: cria a conta e instala.
const desktop = ref(isDesktopDevice());

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

useHead({
  title: 'Zynko: mensagens, ligações e figurinhas',
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap' },
  ],
});
</script>

<template>
  <div class="lp">
    <header class="lp-head">
      <div class="lp-wrap lp-nav">
        <span class="lp-logo"><img src="/icon-512.png" alt="" width="30" height="30" />Zynko</span>
        <NuxtLink class="lp-btn ghost" to="/login">
          <QrCode v-if="desktop" :size="18" :stroke-width="2" />
          <Smartphone v-else :size="18" :stroke-width="2" />
          Entrar
        </NuxtLink>
      </div>
    </header>

    <main>
      <div class="lp-wrap lp-hero">
        <div>
          <span class="lp-pill"><ShieldCheck :size="15" :stroke-width="2" />Simples e privado</span>
          <h1>Suas conversas, sem complicação.</h1>
          <p class="lp-lead">Mensagens, ligações de voz e vídeo, figurinhas e grupos num app leve, que cabe no seu celular.</p>
          <div class="lp-cta-row">
            <NuxtLink v-if="desktop" class="lp-btn main" to="/login"><QrCode :size="18" :stroke-width="2" />Entrar com QR code</NuxtLink>
            <template v-else>
              <NuxtLink class="lp-btn main" to="/login">Criar conta grátis</NuxtLink>
              <button v-if="canInstall" class="lp-btn ghost" type="button" @click="install"><Download :size="18" :stroke-width="2" />Instalar app</button>
            </template>
          </div>
          <p class="lp-hint">
            <Users :size="18" :stroke-width="2" />
            <template v-if="desktop">Ainda não tem conta? Abra este endereço no celular e cadastre seu número.</template>
            <template v-else>Só o seu número. Sem e-mail, sem senha.</template>
          </p>
        </div>

        <div class="lp-stage" aria-hidden="true">
          <div class="lp-phone">
            <div class="lp-screen">
              <div class="lp-chat-head">
                <div class="lp-av">AS</div>
                <div><b>Ana Souza</b><small>digitando…</small></div>
              </div>
              <div class="lp-msgs">
                <div class="m in">Oi! Chegou bem? 😊</div>
                <div class="m out">Cheguei sim! Te mando a localização<em>18:42 ✓✓</em></div>
                <div class="m out loc"><MapPin :size="16" :stroke-width="2" />Localização em tempo real</div>
                <img class="lp-sticker" src="/stickers/joinha.svg" alt="" width="84" height="84" />
                <div class="m in">Perfeito, te ligo mais tarde 📞</div>
              </div>
              <div class="lp-compose">Mensagem<i /></div>
            </div>
          </div>
          <div class="lp-chip a"><Video :size="16" :stroke-width="2" />Chamada de vídeo</div>
          <div class="lp-chip b"><ShieldCheck :size="16" :stroke-width="2" />Lida</div>
        </div>
      </div>

      <section>
        <div class="lp-wrap">
          <h2>Tudo o que você usa no dia a dia</h2>
          <div class="lp-bento">
            <article class="lp-card big s4">
              <div class="ic"><Video :size="22" :stroke-width="2" /></div>
              <h3>Ligações de voz e vídeo</h3>
              <p>Direto entre os aparelhos, sem custo.</p>
            </article>
            <article class="lp-card s2">
              <div class="ic"><Users :size="22" :stroke-width="2" /></div>
              <h3>Conversas e grupos</h3>
              <p>Lida ✓✓, “digitando…” e visto por último.</p>
            </article>
            <article class="lp-card s2">
              <div class="ic"><Sticker :size="22" :stroke-width="2" /></div>
              <h3>Figurinhas</h3>
              <p>Crie as suas a partir de fotos e salve as que receber.</p>
            </article>
            <article class="lp-card s2">
              <div class="ic"><MapPin :size="22" :stroke-width="2" /></div>
              <h3>Localização ao vivo</h3>
              <p>Mostre onde você está enquanto se desloca.</p>
            </article>
            <article class="lp-card s2">
              <div class="ic"><Timer :size="22" :stroke-width="2" /></div>
              <h3>Mensagens temporárias</h3>
              <p>Somem sozinhas depois do tempo escolhido.</p>
            </article>
            <article class="lp-card big s6">
              <div class="ic"><MonitorSmartphone :size="22" :stroke-width="2" /></div>
              <h3>Também no computador</h3>
              <p>Leia o QR code e continue as conversas na tela grande.</p>
            </article>
          </div>
        </div>
      </section>

      <section>
        <div class="lp-wrap lp-steps">
          <div>
            <h2>Do celular para o computador</h2>
            <p class="lp-sub">Sua conta mora no celular. No computador é só espelhar as conversas.</p>
          </div>
          <ol>
            <li><div><b>Crie a conta no celular</b><span>Com o seu número, em segundos.</span></div></li>
            <li><div><b>Abra Configurações › Dispositivos</b><span>No app, toque em Conectar dispositivo.</span></div></li>
            <li><div><b>Leia o QR code</b><span>Aponte o celular para a tela do computador. Pronto.</span></div></li>
          </ol>
        </div>
      </section>

      <div class="lp-wrap">
        <div class="lp-final">
          <h2>Comece agora</h2>
          <p class="lp-sub">{{ desktop ? 'Já tem a conta no celular? Entre lendo o QR code.' : 'Leva menos de um minuto.' }}</p>
          <NuxtLink class="lp-btn main" to="/login">
            <template v-if="desktop"><QrCode :size="18" :stroke-width="2" />Mostrar QR code</template>
            <template v-else>Criar conta grátis</template>
          </NuxtLink>
        </div>
      </div>
    </main>
    <footer class="lp-foot">Zynko · mensagens em tempo real</footer>

    <!-- iPhone: instalar pelo Safari -->
    <div v-if="iosHelp" class="overlay" @click.self="iosHelp = false">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Instalar no iPhone">
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
  </div>
</template>

<style scoped>
.lp {
  --fd: 'Bricolage Grotesque', var(--font);
  --mint: rgb(var(--accent-rgb));
  --mint2: rgb(var(--accent-deep-rgb));
  --line: rgb(var(--accent-light-rgb) / 0.12);
  --card: rgb(var(--panel-rgb));
  --glow: rgb(var(--accent-rgb) / 0.16);
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  background:
    radial-gradient(60rem 36rem at 85% -10%, var(--glow), transparent 70%),
    radial-gradient(40rem 30rem at -10% 40%, var(--glow), transparent 70%),
    rgb(var(--bg-rgb));
  color: var(--text);
  font: 400 1.0625rem/1.6 var(--font);
}

.lp h1,
.lp h2,
.lp h3 {
  margin: 0;
  font-family: var(--fd);
  letter-spacing: -0.025em;
  line-height: 1.05;
}

.lp p {
  margin: 0;
}

.lp-wrap {
  width: min(1120px, 100% - 2.5rem);
  margin-inline: auto;
}

.lp-head {
  position: sticky;
  top: 0;
  z-index: 20;
  padding-top: env(safe-area-inset-top);
  border-bottom: 1px solid var(--line);
  background: rgb(var(--bg-rgb) / 0.72);
  backdrop-filter: blur(14px);
}

.lp-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.lp-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font: 800 1.25rem var(--fd);
  letter-spacing: -0.02em;
}

.lp-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1.5rem;
  border: 0;
  border-radius: 999px;
  font: 600 1rem var(--font);
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s, background 0.2s;
}

.lp-btn.main {
  background: linear-gradient(135deg, var(--mint), var(--mint2));
  color: #fff;
  box-shadow: 0 8px 28px -8px var(--mint2);
}

.lp-btn.main:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 32px -8px var(--mint2);
}

.lp-btn.ghost {
  padding: 0.55rem 1.1rem;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  font-size: 0.95rem;
}

.lp-btn.ghost:hover {
  background: var(--card);
}

.lp-hero {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  align-items: center;
  gap: 3rem;
  padding: clamp(3rem, 8vw, 6.5rem) 0;
}

.lp-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.4rem;
  padding: 0.35rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: var(--mint);
  font-size: 0.9rem;
  font-weight: 500;
}

.lp h1 {
  max-width: 11ch;
  font-size: clamp(2.6rem, 6.4vw, 4.8rem);
  font-weight: 800;
}

.lp-lead {
  max-width: 34ch;
  margin: 1.4rem 0 2rem !important;
  color: var(--muted);
  font-size: 1.2rem;
}

.lp-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.lp-hint {
  display: flex;
  gap: 0.6rem;
  max-width: 42ch;
  margin-top: 1.1rem !important;
  color: var(--muted);
  font-size: 0.92rem;
}

.lp-hint svg {
  flex: none;
  margin-top: 2px;
}

.lp-stage {
  position: relative;
  display: grid;
  place-items: center;
}

.lp-phone {
  width: min(320px, 100%);
  aspect-ratio: 9 / 17.5;
  padding: 10px;
  border-radius: 42px;
  background: linear-gradient(160deg, rgb(var(--panel-rgb)), rgb(var(--bg-rgb)));
  box-shadow: 0 40px 80px -30px #000, 0 0 0 1px var(--line), 0 0 90px -20px var(--mint2);
}

.lp-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: 33px;
  background: rgb(var(--panel-rgb));
}

.lp-chat-head {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 1.3rem 1rem 0.8rem;
  border-bottom: 1px solid var(--line);
}

.lp-av {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #1f9d5c;
  color: #fff;
  font: 700 0.8rem var(--font);
}

.lp-chat-head b {
  display: block;
  font-size: 0.95rem;
  line-height: 1.2;
}

.lp-chat-head small {
  color: var(--mint);
  font-size: 0.78rem;
}

.lp-msgs {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.55rem;
  padding: 1rem 0.9rem;
}

.m {
  max-width: 80%;
  padding: 0.55rem 0.8rem;
  border-radius: 16px;
  font-size: 0.88rem;
  line-height: 1.35;
  opacity: 0;
  transform: translateY(8px);
  animation: lp-in 0.45s forwards;
}

.m.in {
  align-self: flex-start;
  border-bottom-left-radius: 5px;
  background: rgb(255 255 255 / 0.07);
}

.m.out {
  align-self: flex-end;
  border-bottom-right-radius: 5px;
  background: rgb(var(--accent-rgb) / 0.25);
}

.m em {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 0.7rem;
  font-style: normal;
  text-align: right;
}

.m.loc {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.m.loc svg {
  color: var(--mint);
}

.lp-sticker {
  align-self: flex-end;
  opacity: 0;
  animation: lp-in 0.5s 2.9s forwards, lp-wob 3s 3.6s ease-in-out infinite;
}

.m:nth-child(1) {
  animation-delay: 0.5s;
}

.m:nth-child(2) {
  animation-delay: 1.3s;
}

.m:nth-child(3) {
  animation-delay: 2.1s;
}

.m:nth-child(5) {
  animation-delay: 3.7s;
}

.lp-compose {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0.4rem 0.8rem 0.9rem;
  padding: 0.45rem 0.5rem 0.45rem 1rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.88rem;
}

.lp-compose i {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--mint), var(--mint2));
}

.lp-chip {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgb(var(--panel-rgb) / 0.88);
  backdrop-filter: blur(10px);
  box-shadow: 0 14px 30px -14px #000;
  font-size: 0.85rem;
  font-weight: 600;
}

.lp-chip svg {
  color: var(--mint);
}

.lp-chip.a {
  top: 46%;
  left: -1rem;
}

.lp-chip.b {
  right: -0.5rem;
  bottom: 20%;
}

@keyframes lp-in {
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes lp-wob {
  50% {
    transform: rotate(-4deg) translateY(-3px);
  }
}

.lp section {
  padding: clamp(3rem, 7vw, 5.5rem) 0;
}

.lp h2 {
  max-width: 18ch;
  font-size: clamp(1.9rem, 4vw, 2.9rem);
  font-weight: 700;
}

.lp-sub {
  max-width: 44ch;
  margin-top: 0.9rem !important;
  color: var(--muted);
}

.lp-bento {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1rem;
  margin-top: 2.6rem;
}

.lp-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 180px;
  padding: 1.6rem;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: linear-gradient(180deg, var(--card), rgb(var(--bg-rgb) / 0.6));
  transition: border-color 0.2s;
}

.lp-card:hover {
  border-color: rgb(var(--accent-rgb) / 0.4);
}

.lp-card .ic {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: auto;
  border-radius: 14px;
  background: rgb(var(--accent-rgb) / 0.14);
  color: var(--mint);
}

.lp-card h3 {
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: -0.015em;
}

.lp-card p {
  color: var(--muted);
  font-size: 0.98rem;
}

.lp-card.big {
  min-height: 240px;
  background: radial-gradient(30rem 16rem at 100% 0, var(--glow), transparent), var(--card);
}

.lp-card.big h3 {
  font-size: 1.7rem;
}

.s2 {
  grid-column: span 2;
}

.s4 {
  grid-column: span 4;
}

.s6 {
  grid-column: span 6;
}

.lp-steps {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  align-items: start;
  gap: 3rem;
}

.lp ol {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: s;
}

.lp-steps ol::before {
  content: '';
  position: absolute;
  top: 20px;
  bottom: 20px;
  left: 19px;
  width: 2px;
  background: linear-gradient(var(--mint), transparent);
}

.lp-steps li {
  position: relative;
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 1.2rem;
  padding-bottom: 2rem;
  counter-increment: s;
}

.lp-steps li::before {
  content: counter(s);
  z-index: 1;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 2px solid var(--mint);
  border-radius: 50%;
  background: rgb(var(--bg-rgb));
  color: var(--mint);
  font: 700 1rem var(--fd);
}

.lp-steps li b {
  display: block;
  font: 700 1.2rem var(--fd);
  letter-spacing: -0.01em;
}

.lp-steps li span {
  color: var(--muted);
}

.lp-final {
  padding: clamp(2.5rem, 7vw, 4.5rem) 1.5rem;
  border: 1px solid var(--line);
  border-radius: 32px;
  background: radial-gradient(34rem 16rem at 50% 0, var(--glow), transparent), var(--card);
  text-align: center;
}

.lp-final h2 {
  margin-inline: auto;
}

.lp-final .lp-sub {
  margin: 0.9rem auto 1.8rem !important;
}

.lp-foot {
  padding: 2rem 0 max(3rem, env(safe-area-inset-bottom));
  color: var(--muted);
  font-size: 0.9rem;
  text-align: center;
}

.lp-ios-steps {
  margin: 0;
  padding-left: 20px;
  list-style: decimal;
  line-height: 2.1;
}

.inline-icon {
  vertical-align: -3px;
}

@media (max-width: 860px) {
  .lp-hero {
    grid-template-columns: 1fr;
    gap: 3.5rem;
  }

  .lp-steps {
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  .lp-bento {
    grid-template-columns: repeat(2, 1fr);
  }

  .s4,
  .s6 {
    grid-column: span 2;
  }

  .s2 {
    grid-column: span 1;
  }

  .lp-chip.a {
    left: 0;
  }

  .lp-chip.b {
    right: 0;
  }
}

@media (max-width: 520px) {
  .s2 {
    grid-column: span 2;
  }

  .lp-chip {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .m,
  .lp-sticker {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
</style>
