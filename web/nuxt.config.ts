// Front-end em modo SPA: `npm run generate` produz arquivos estáticos que o servidor Fastify serve.
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],

  // ios/ e android/ são os projetos nativos (Capacitor) e guardam uma cópia do site já compilado: fora da checagem de tipos.
  typescript: { tsConfig: { exclude: ['../ios', '../android'] } },

  app: {
    head: {
      title: 'Zynko',
      htmlAttrs: { lang: 'pt-BR' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#050b0a' },
        { name: 'description', content: 'Zynko: mensagens, ligações e figurinhas' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/icon-192.png' },
      ],
    },
  },

  // Em desenvolvimento o Nuxt (porta 3000) repassa a API para o servidor (porta 3001).
  // O WebSocket do socket.io conecta direto na API (ver useChat.ts): o proxy de
  // WebSocket do Nitro em dev é instável (derruba o servidor com ECONNRESET).
  nitro: {
    devProxy: {
      '/api': { target: 'http://127.0.0.1:3001/api', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3001/uploads', changeOrigin: true },
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Zynko',
      short_name: 'Zynko',
      description: 'Zynko: mensagens, ligações e figurinhas',
      lang: 'pt-BR',
      theme_color: '#050b0a',
      background_color: '#050b0a',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      // Nunca interceptar a API nem o WebSocket com o service worker.
      navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/, /^\/uploads/],
      // Notificações com o app fechado (Web Push): public/sw-push.js entra no service worker.
      importScripts: ['/sw-push.js'],
      globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
    },
    devOptions: { enabled: false },
  },
});
