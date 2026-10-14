import { existsSync } from 'node:fs';
import type { CapacitorConfig } from '@capacitor/cli';

// App nativo (iPhone e Android) do Chat. O app abre o servidor do Chat por dentro (server.url): telas, API e
// tempo real continuam na mesma origem, e mudanças de visual chegam sem publicar versão nova na loja.
// Os plugins nativos (barra de status, notificações…) funcionam porque o Capacitor injeta a ponte na página.
//
// CHAT_SERVER_URL troca o endereço no build (ex.: quando tiver domínio próprio).
const serverUrl = process.env.CHAT_SERVER_URL || 'https://chat.66-70-214-163.sslip.io';

const config: CapacitorConfig = {
  // Identificador único do app na Apple. Depois do primeiro envio ao App Store Connect não muda mais.
  appId: 'com.savioalves.chat',
  appName: 'Zynko',
  // Arquivos guardados dentro do app: só a página de "sem conexão" é usada (ver errorPath).
  webDir: '.output/public',
  backgroundColor: '#050b0a',
  server: {
    url: serverUrl,
    // Só o próprio servidor abre dentro do app; outros links (mapa, sites) vão para o Safari.
    allowNavigation: [new URL(serverUrl).hostname],
    // Sem internet ou servidor fora do ar: página guardada no próprio app (public/offline.html).
    errorPath: 'offline.html',
  },
  android: {
    // Só APKs com Firebase (google-services.json) podem registrar notificações; sem ele o app fecharia.
    // A página lê esta marca no User-Agent (ver plugins/push.client.ts).
    ...(existsSync('android/app/google-services.json') && { appendUserAgent: 'ChatPush/fcm' }),
  },
  ios: {
    // O CSS já cuida das áreas do notch e da barra de baixo (env(safe-area-inset-*)).
    contentInset: 'never',
  },
  plugins: {
    // App escuro: texto branco na barra de status.
    StatusBar: { style: 'DARK', overlaysWebView: true },
    // App aberto: o aviso nativo não aparece (a própria tela já mostra a mensagem/ligação).
    PushNotifications: { presentationOptions: [] },
  },
};

export default config;
