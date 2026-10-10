<script setup lang="ts">
import { Lock, MapPin, MonitorSmartphone, Phone, QrCode, Smartphone, Sticker, Users } from '@lucide/vue';

// Apresentação para quem abre o Chat no computador sem estar conectado (o celular vai direto ao login).
const FEATURES = [
  { icon: Phone, title: 'Ligações de voz e vídeo', text: 'Direto entre os aparelhos, com qualidade e sem custo.' },
  { icon: Users, title: 'Conversas e grupos', text: 'Confirmação de leitura, “digitando…” e visto por último.' },
  { icon: Sticker, title: 'Figurinhas', text: 'Crie as suas a partir de fotos e salve as que receber.' },
  { icon: MapPin, title: 'Localização em tempo real', text: 'Compartilhe onde você está enquanto se desloca.' },
  { icon: Lock, title: 'Mensagens temporárias', text: 'Somem sozinhas depois do tempo que você escolher.' },
  { icon: MonitorSmartphone, title: 'No celular e no computador', text: 'O celular é a sua conta; o computador espelha as conversas.' },
];

useHead({ title: 'Chat' });
</script>

<template>
  <main class="landing">
    <header class="landing-top">
      <span class="landing-brand"><img src="/logo.png" alt="" width="32" height="32" /> Chat</span>
      <NuxtLink class="btn btn-primary btn-sm" to="/login"><QrCode :size="16" :stroke-width="2" /> Entrar</NuxtLink>
    </header>

    <section class="landing-hero">
      <div class="landing-copy">
        <h1>Converse com quem importa, do celular ao computador.</h1>
        <p>
          Um mensageiro simples e privado: mensagens, ligações, figurinhas e grupos. Crie sua conta no celular e use também aqui,
          lendo um QR code.
        </p>
        <div class="landing-cta">
          <NuxtLink class="btn btn-primary" to="/login"><QrCode :size="18" :stroke-width="2" /> Entrar com QR code</NuxtLink>
        </div>
        <p class="landing-note"><Smartphone :size="14" :stroke-width="2" /> Ainda não tem conta? Abra este endereço no celular e cadastre seu número.</p>
      </div>

      <!-- Prévia ilustrativa de uma conversa -->
      <div class="landing-phone" aria-hidden="true">
        <div class="landing-phone-bar"><span class="dot" /> Ana · online</div>
        <div class="landing-msgs">
          <p class="lm in">Oi! Chegou bem? 😊</p>
          <p class="lm out">Cheguei sim! Te mando a localização</p>
          <p class="lm out loc"><MapPin :size="14" :stroke-width="2.2" /> Localização em tempo real</p>
          <img class="lm-sticker" src="/stickers/joinha.svg" alt="" width="96" height="96" />
          <p class="lm in">Perfeito, te ligo mais tarde 📞</p>
        </div>
      </div>
    </section>

    <section class="landing-features">
      <article v-for="f in FEATURES" :key="f.title" class="landing-feature">
        <span class="landing-icon"><component :is="f.icon" :size="20" :stroke-width="2" /></span>
        <h2>{{ f.title }}</h2>
        <p>{{ f.text }}</p>
      </article>
    </section>

    <section class="landing-steps">
      <h2>Como usar no computador</h2>
      <ol>
        <li><strong>Cadastre-se no celular</strong> com o seu número.</li>
        <li>No app, abra <strong>Dispositivos conectados</strong> e toque em <strong>Conectar dispositivo</strong>.</li>
        <li>Clique em <strong>Entrar</strong> aqui e aponte o celular para o QR code.</li>
      </ol>
      <NuxtLink class="btn btn-primary" to="/login"><QrCode :size="18" :stroke-width="2" /> Mostrar QR code</NuxtLink>
    </section>

    <footer class="landing-footer">Chat · mensagens em tempo real</footer>
  </main>
</template>

<style scoped>
.landing {
  height: 100%;
  overflow-y: auto;
  padding: 0 16px 32px;
  background:
    radial-gradient(60rem 30rem at 85% -10%, var(--accent-soft), transparent 70%),
    var(--bg);
}

.landing-top,
.landing-hero,
.landing-features,
.landing-steps,
.landing-footer {
  max-width: 1080px;
  margin: 0 auto;
}

.landing-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 0;
}

.landing-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
}

.landing-hero {
  display: grid;
  gap: 40px;
  align-items: center;
  padding: 32px 0 48px;
}

.landing-copy h1 {
  margin: 0 0 14px;
  font-size: clamp(30px, 4.4vw, 48px);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.landing-copy > p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.55;
}

.landing-cta {
  margin: 26px 0 14px;
}

.landing-note {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.landing-phone {
  justify-self: center;
  width: min(320px, 100%);
  border: 1px solid var(--border);
  border-radius: 32px;
  background: var(--chat-bg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.landing-phone-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  background: var(--surface);
  font-weight: 600;
  font-size: 14px;
}

.landing-phone-bar .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.landing-msgs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 14px 22px;
}

.lm {
  max-width: 80%;
  margin: 0;
  padding: 8px 12px;
  border-radius: 14px;
  color: var(--bubble-text);
  font-size: 14px;
  box-shadow: var(--shadow-sm);
}

.lm.in {
  align-self: flex-start;
  background: var(--bubble-in);
  border-top-left-radius: 4px;
}

.lm.out {
  align-self: flex-end;
  background: var(--bubble-out);
  border-top-right-radius: 4px;
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

.landing-features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.landing-feature {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.landing-feature h2 {
  margin: 12px 0 6px;
  font-size: 16px;
}

.landing-feature p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}

.landing-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}

.landing-steps {
  margin-top: 48px;
  padding: 28px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
}

.landing-steps h2 {
  margin: 0 0 14px;
  font-size: 20px;
}

.landing-steps ol {
  margin: 0 0 22px;
  padding-left: 20px;
  line-height: 1.9;
}

.landing-footer {
  padding-top: 28px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.landing .btn {
  text-decoration: none;
}

@media (min-width: 900px) {
  .landing-hero {
    grid-template-columns: 1.2fr 1fr;
    padding: 56px 0 72px;
  }
}
</style>
