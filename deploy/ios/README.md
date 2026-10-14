# App de iPhone (Capacitor + TestFlight)

O app nativo fica em `web/ios` (projeto do Xcode gerado pelo Capacitor). Ele abre o servidor do Chat
por dentro (`server.url` em `web/capacitor.config.ts`), então mudanças de tela chegam sem publicar
versão nova. Só é preciso gerar um build novo quando mudar algo nativo (ícone, permissões, plugins).

O build roda num Mac do GitHub (workflow `.github/workflows/ios-testflight.yml`): **não precisa de Mac**.

## Configuração (uma vez só)

### 1. Conta Apple Developer
Crie em <https://developer.apple.com/programs/> (US$ 99/ano). A aprovação pode levar até 48 h.

### 2. Registrar o identificador do app
<https://developer.apple.com/account/resources/identifiers> › **+** › *App IDs* › *App*:
- Description: `Chat`
- Bundle ID (Explicit): `com.savioalves.chat`

### 3. Criar o app no App Store Connect
<https://appstoreconnect.apple.com/apps> › **+** › *Novo app*:
- Plataforma: iOS · Nome: um nome livre na App Store (ex.: `Chat Savio` — "Chat" sozinho já existe)
- Idioma: Português (Brasil) · ID do pacote: `com.savioalves.chat` · SKU: `chat`

### 4. Chave de API do App Store Connect
<https://appstoreconnect.apple.com/access/integrations/api> › *Chaves da equipe* › **+**:
- Nome: `GitHub Actions` · Acesso: **Admin**
- Anote o **Issuer ID** e o **Key ID** e baixe o arquivo `AuthKey_XXXX.p8` (só dá para baixar uma vez).

### 5. Chave do certificado de distribuição
No Git Bash (Windows), gere uma chave RSA que será usada para criar o certificado:

```bash
ssh-keygen -t rsa -b 2048 -m PEM -f ios_cert_key -q -N ""
```

Guarde o arquivo `ios_cert_key` num lugar seguro (gerenciador de senhas). O `ios_cert_key.pub` não é usado.

### 6. Segredos no GitHub
Repositório › *Settings* › *Secrets and variables* › *Actions* › **New repository secret**:

| Nome | Valor |
|---|---|
| `ASC_ISSUER_ID` | Issuer ID (passo 4) |
| `ASC_KEY_ID` | Key ID (passo 4) |
| `ASC_PRIVATE_KEY` | conteúdo inteiro do `AuthKey_XXXX.p8` |
| `IOS_CERTIFICATE_KEY` | conteúdo inteiro do `ios_cert_key` (passo 5) |

Os segredos não aparecem para ninguém, nem com o repositório público.

## Gerar uma versão

Repositório › *Actions* › **iOS (TestFlight)** › *Run workflow* › informe a versão (ex.: `1.0.0`).
Leva uns 15 min. Depois o App Store Connect processa o build (mais uns 10–30 min).

## Instalar no iPhone

1. App Store Connect › seu app › **TestFlight** › *Testes internos* › crie um grupo e adicione seu e-mail.
2. No iPhone, instale o app **TestFlight** da App Store e aceite o convite.

## Antes de publicar na App Store (pendente)
- Excluir a conta pelo próprio app (exigência da Apple).
- Notificações nativas (APNs).
- Política de privacidade publicada e capturas de tela.
