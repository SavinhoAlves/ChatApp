# App Android (Capacitor)

O projeto nativo fica em `web/android`. O app abre o servidor do Chat por dentro, então mudanças de tela
chegam só atualizando a VPS. APK novo só é preciso quando muda algo nativo (ícone, permissões, plugins, Firebase).

## Chave de assinatura
`android-keystore/` (fora do git) tem `chat-release.jks` e `senha.txt`. **Faça backup**: sem ela não dá para
atualizar o app nos celulares onde ele já está instalado.

## Notificações (Firebase)

### 1. Criar o projeto
<https://console.firebase.google.com> › **Adicionar projeto** › nome `Chat` (pode desligar o Google Analytics).

### 2. Registrar o app Android
No projeto › ícone do Android (**Adicionar app**):
- Nome do pacote: `com.savioalves.chat`
- Apelido: `Chat`
- Baixe o **`google-services.json`** e coloque em `web/android/app/google-services.json`
  (ele fica fora do git). Pode pular os outros passos do assistente.

### 3. Conta de serviço (para o servidor enviar)
⚙ **Configurações do projeto** › **Contas de serviço** › **Gerar nova chave privada**.
Baixa um `.json`: ele dá acesso de envio ao seu Firebase, então **não coloque no git nem mande para ninguém**.

Copie para a VPS e proteja o arquivo:

```bash
scp chat-firebase-adminsdk-XXXX.json savio@SEU_IP:~/chat/server/firebase-service-account.json
```

Na VPS:

```bash
chmod 600 ~/chat/server/firebase-service-account.json
echo 'FCM_SERVICE_ACCOUNT_FILE=./firebase-service-account.json' >> ~/chat/server/.env
pm2 restart chat --update-env
```

### 4. Gerar o APK com Firebase
No PC (com o `google-services.json` no lugar), em `web/`:

```bash
npm run generate && npx cap sync android
```

Depois abra `web/android` no Android Studio › *Build* › *Generate Signed App Bundle / APK* › APK, com a
chave de `android-keystore/`. Ou pelo GitHub: cadastre o segredo `GOOGLE_SERVICES_JSON` (conteúdo do arquivo)
e rode **Actions › Android (APK)**.

Só o APK gerado **com** o `google-services.json` pede permissão e registra notificações. Os anteriores
continuam funcionando, só sem notificações.
