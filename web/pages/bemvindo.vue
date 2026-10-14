<script setup lang="ts">
// Primeira abertura do app (Android/iPhone instalado): animação do logo com o nome Zynko e boas-vindas,
// como no WhatsApp. Depois de "Concordar e continuar" vai para o cadastro e não aparece mais.
const WELCOMED_KEY = 'zynko.welcomed';
const ready = ref(false);

onMounted(() => setTimeout(() => (ready.value = true), 1700));

function next() {
  try {
    localStorage.setItem(WELCOMED_KEY, '1');
  } catch {
    // sem armazenamento: mostra de novo na próxima vez, sem problema
  }
  void navigateTo('/login', { replace: true });
}

useHead({ title: 'Bem-vindo ao Zynko' });
</script>

<template>
  <main class="welcome-app" :class="{ ready }">
    <div class="wa-hero">
      <div class="wa-glow" aria-hidden="true" />
      <img class="wa-logo" src="/icon-512.png" alt="" width="128" height="128" />
      <h1 class="wa-name">
        <span v-for="(ch, i) in 'Zynko'" :key="i" :style="{ animationDelay: `${0.65 + i * 0.08}s` }">{{ ch }}</span>
      </h1>
    </div>

    <div class="wa-bottom">
      <h2>Bem-vindo ao Zynko</h2>
      <p>Mensagens, ligações de voz e vídeo, figurinhas e status. Simples, rápido e privado.</p>
      <button class="btn btn-primary btn-block wa-cta" type="button" @click="next">Concordar e continuar</button>
      <small>Ao continuar, você concorda em usar o Zynko com respeito às pessoas com quem conversa.</small>
    </div>
  </main>
</template>

<style scoped>
.welcome-app {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  padding: env(safe-area-inset-top) 24px max(24px, env(safe-area-inset-bottom));
  overflow: hidden;
  background:
    radial-gradient(30rem 30rem at 50% 38%, rgb(var(--accent-rgb) / 0.16), transparent 70%),
    rgb(var(--bg-rgb));
  color: var(--text);
}

.wa-hero {
  position: relative;
  display: grid;
  flex: 1;
  place-content: center;
  justify-items: center;
  gap: 18px;
  transition: transform 0.7s var(--ease);
}

.welcome-app.ready .wa-hero {
  transform: translateY(-6vh);
}

.wa-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 260px;
  height: 260px;
  margin: -170px 0 0 -130px;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(var(--accent-rgb) / 0.45), transparent 65%);
  filter: blur(10px);
  animation: wa-pulse 2.4s ease-in-out infinite;
}

.wa-logo {
  position: relative;
  width: 128px;
  height: auto;
  filter: drop-shadow(0 16px 36px rgb(var(--accent-rgb) / 0.45));
  animation: wa-pop 0.9s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}

.wa-name {
  position: relative;
  display: flex;
  margin: 0;
  font-size: 44px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.wa-name span {
  background: linear-gradient(100deg, rgb(var(--accent-light-rgb)), rgb(var(--accent-rgb)));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: wa-letter 0.5s var(--ease) both;
}

.wa-bottom {
  display: grid;
  justify-items: center;
  gap: 10px;
  text-align: center;
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.6s var(--ease), transform 0.6s var(--ease);
  pointer-events: none;
}

.welcome-app.ready .wa-bottom {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

.wa-bottom h2 {
  margin: 0;
  font-size: 24px;
}

.wa-bottom p {
  max-width: 320px;
  margin: 0 0 10px;
  color: var(--muted);
  line-height: 1.5;
}

.wa-cta {
  height: 52px;
  border-radius: 16px;
  font-size: 16px;
}

.wa-bottom small {
  max-width: 300px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

@keyframes wa-pop {
  from {
    opacity: 0;
    transform: scale(0.3) rotate(-12deg);
  }
}

@keyframes wa-letter {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}

@keyframes wa-pulse {
  50% {
    opacity: 0.55;
    transform: scale(1.12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wa-logo,
  .wa-name span,
  .wa-glow {
    animation: none;
  }
}
</style>
