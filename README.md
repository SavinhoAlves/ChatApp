# Chat

Chat em tempo real com conversas 1:1 e grupos, feito para rodar no seu próprio PC e ser acessado por um domínio (via Cloudflare Tunnel).

**Stack:** Fastify · Socket.IO · Prisma + PostgreSQL · Nuxt 3 (PWA) · Redis opcional

## O que já funciona

- Cadastro por telefone + código SMS, login por QR code no computador e lista de dispositivos conectados (sessões revogáveis)
- Contatos: criar conta não torna ninguém visível para os outros. Para conversar, criar grupo ou compartilhar como
  contato, é preciso adicionar a pessoa antes pelo nome de usuário exato (botão "Adicionar contato" na barra lateral)
- Conversas 1:1 e grupos (criar, renomear, adicionar/remover pessoas, sair; o grupo nunca fica sem admin)
- Ações por conversa: arquivar, silenciar, fixar, marcar como não lida, favoritar, limpar histórico (só para você);
  em 1:1 também dá para bloquear e apagar a conversa. Arquivadas/apagadas voltam sozinhas se chegar mensagem nova
- Mensagens em tempo real, com histórico paginado (rolar para cima carrega mais)
- Status de envio: enviando → enviada ✓ → entregue ✓✓ → lida ✓✓ (azul). Em grupo, "lida" só quando todos leram
- "Digitando…", online/visto por último, contador de não lidas
- Responder, editar e apagar para todos
- Envio de fotos, vídeos, áudios (gravação pelo microfone) e arquivos — até 20 MB cada
- Câmera (tirar foto ou gravar vídeo curto direto do navegador)
- Localização atual ou em tempo real (15min/1h/8h, com botão para parar), e compartilhar o contato de outra pessoa do chat
- Mensagem que falha (sem conexão) fica marcada com "tentar de novo"
- Rascunho por conversa, notificações do navegador, tema claro/escuro automático
- PWA: dá para instalar no celular e no PC

Ainda **não** tem: reações, chamadas, notificação push com o app fechado, criptografia ponta a ponta. A estrutura comporta tudo isso depois.

## Estrutura

```
server/   API + WebSocket + serve o site compilado (uma única porta: 3001)
web/      Interface Nuxt 3 (SPA/PWA)
deploy/   Exemplos: Cloudflare Tunnel e PM2
```

## Requisitos

- Node.js 22 (ou 20.19+)
- PostgreSQL 14+ (instalado, ou via `docker compose up -d`)

> **Windows:** coloque a pasta fora do OneDrive (por exemplo `C:\dev\chat-app`). O OneDrive sincroniza `node_modules` e costuma travar o Prisma e o Nuxt.

## 1. Primeira configuração

```powershell
npm run install:all

cd server
copy .env.example .env
```

Edite `server/.env`:

- `DATABASE_URL`: dados do seu PostgreSQL (o padrão já serve para o `docker-compose.yml`)
- `JWT_SECRET`: gere um com
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `SMS_PROVIDER`: `console` (padrão) imprime o código SMS no log do servidor, só para desenvolvimento. Em produção use `twilio` e preencha `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_FROM`

Crie as tabelas (a primeira vez pede um nome para a migração, use `init`):

```powershell
npm run db:migrate
```

Guarde a pasta `server/prisma/migrations` que será criada: é ela que `db:deploy` usa em produção.

## 2. Rodar em desenvolvimento

Dois terminais, na raiz do projeto:

```powershell
npm run dev:server    # API em http://localhost:3001
npm run dev:web       # site em http://localhost:3000 (recarrega sozinho)
```

Abra http://localhost:3000, crie sua conta e a da outra pessoa (em outro navegador ou janela anônima) para testar.

## 3. Rodar como "servidor" (produção)

```powershell
npm run build         # compila o site (web) e o servidor
npm run db:deploy     # aplica as migrações
npm start             # sobe tudo em http://localhost:3001
```

No `server/.env`, troque `NODE_ENV=production`. Para o processo reiniciar sozinho e subir junto com o Windows, use o PM2:

```powershell
npm install -g pm2 pm2-windows-startup
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2-startup install
```

## 4. Colocar no domínio (Cloudflare Tunnel)

1. Tenha o domínio na Cloudflare (pode ser só trocar os nameservers no registrador).
2. Instale e autentique:
   ```powershell
   winget install --id Cloudflare.cloudflared
   cloudflared tunnel login
   cloudflared tunnel create chat
   cloudflared tunnel route dns chat chat.seudominio.com.br
   ```
3. Copie `deploy/cloudflared-config.example.yml` para `C:\Users\SEU_USUARIO\.cloudflared\config.yml` e ajuste o ID do túnel e o domínio.
4. Instale como serviço do Windows (sobe com o PC):
   ```powershell
   cloudflared service install
   ```

Pronto: `https://chat.seudominio.com.br` abre o chat. O WebSocket funciona pelo túnel sem configuração extra, e o HTTPS é automático.

## Segurança (importante)

O PC vira um servidor exposto à internet. O mínimo:

- Depois de criar as contas necessárias, ponha `REGISTRATION_OPEN=false` no `.env` e reinicie. Ninguém mais consegue se cadastrar.
- Mantenha `HOST=127.0.0.1`: o servidor só aceita conexões vindas do próprio PC (o túnel). Não abra portas no roteador.
- Nunca exponha PostgreSQL (5432) nem Redis (6379) na rede.
- `JWT_SECRET` longo e secreto. Se vazar, troque: todos precisam entrar de novo.
- Quer uma camada extra? O **Cloudflare Access** (grátis até 50 usuários) pede login por e-mail antes mesmo de a página carregar.
- Faça backup do banco de vez em quando: `pg_dump -U chat chat > backup.sql`.
- As fotos/áudios/arquivos enviados ficam em `server/uploads/` (fora do banco). Inclua essa pasta no seu backup também.

## Para o chat crescer além de 2 pessoas

- Já suporta vários usuários e grupos; o limite prático é a máquina e a internet.
- Com mais de uma instância do servidor, defina `REDIS_URL`: a presença online e o Socket.IO passam a usar o Redis.
- Se o PC passar a ser um gargalo (queda de energia, internet instável), o mesmo código roda numa VPS sem alterações.

## Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| `Configuração inválida (.env)` ao iniciar | Leia a mensagem: normalmente falta `DATABASE_URL` ou o `JWT_SECRET` tem menos de 32 caracteres |
| Site abre mas diz "reconectando…" | O servidor caiu ou o túnel está parado. Veja `pm2 logs chat` e `cloudflared service` |
| Erro do Prisma ao instalar/gerar | Confira se a pasta não está no OneDrive e rode `npx prisma generate` dentro de `server` |
| "Front-end não encontrado" no log | Falta rodar `npm run build` (ou `npm run generate` dentro de `web`) |
| Mensagens não chegam no celular com a tela bloqueada | Notificação com o app fechado exige Web Push; ainda não implementado |
