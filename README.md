# Clínica de Psicologia — API + Painel Web

Sistema de agenda da **Clínica Bem Estar**, integrado com o bot WhatsApp em `../bot` e com painel web para a equipe. Em produção (Railway) a API e o painel rodam no **mesmo domínio**.

## O que faz

- Cadastro de clínica, psicólogos, serviços e grade semanal
- Consulta de **horários livres** (respeita bloqueios)
- **Marcar**, **cancelar** e **remarcar** (com regra de antecedência)
- **Bloqueios** de agenda no mesmo calendário
- Paciente identificado pelo telefone do WhatsApp
- **Prontuário**: rascunho editável → confirmação (imutável)
- **Recebimentos** operacionais (pendente / pago) ligados à sessão
- Onboarding SaaS (`/assine`) com Resend + Mercado Pago
- Painel autenticado por **JWT** (login); bot autenticado por **x-api-key**

## Subir (local)

Precisa do Postgres (`localhost:5433`).

```powershell
cp .env.example .env
# ajuste CLINIC_API_KEY, JWT_SECRET, CLINICAL_ENCRYPTION_KEY, RESEND_*, etc.
npm install
npm install --prefix web
npx prisma migrate deploy
npm run db:seed
npm run dev

# Painel (outro terminal) — só em desenvolvimento
npm run dev:web
```

Se o banco já existir de um `db push` antigo e a migration falhar:

```powershell
npx prisma migrate resolve --applied 20260803121500_init
```

| O quê | URL |
|-------|-----|
| API (saúde) | http://localhost:4000/health |
| Painel web (Vite) | http://localhost:5173 |
| Login demo (seed) | `ana@bemestar.local` / `demo1234` |
| Assinar | http://localhost:5173/assine |

## Produção (Railway + mvflow.com.br)

### Arquitetura

- 1 serviço Docker (`Dockerfile`) = API Fastify + `web/dist` (SPA)
- Plugin **Postgres** no Railway
- Domínio custom (ex.: `clinica.mvflow.com.br`) → CNAME do Railway
- Healthcheck: `GET /health`

### Passos

1. Crie o projeto no Railway, adicione Postgres e conecte este repositório.
2. Variáveis obrigatórias (produção):

| Variável | Valor |
|----------|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | (do plugin Postgres) |
| `CLINIC_API_KEY` | secret ≥ 16 chars |
| `JWT_SECRET` | secret ≥ 32 chars |
| `CLINICAL_ENCRYPTION_KEY` | secret ≥ 32 chars (≠ JWT) |
| `CORS_ORIGINS` | `https://clinica.mvflow.com.br` |
| `PUBLIC_BASE_URL` | `https://clinica.mvflow.com.br` |
| `WEB_BASE_URL` | `https://clinica.mvflow.com.br` |
| `RESEND_API_KEY` / `RESEND_FROM` | Resend (domínio verificado) |
| `PAYMENTS_WEBHOOK_SECRET` | secret forte |
| `PAYMENTS_ALLOW_SANDBOX` | `false` (ou `auto`) |
| `MERCADOPAGO_ACCESS_TOKEN` | token **produção** |
| `MERCADOPAGO_PREAPPROVAL_PLAN_ID` | opcional — id do plano Assinaturas |
| `COMPLIMENTARY_SIGNUP_EMAILS` | e-mail do usuário sem cobrança |

3. Deploy (`railway.toml` usa o Dockerfile). O start roda `prisma migrate deploy` e sobe a API.
4. DNS: CNAME do subdomínio → Railway; HTTPS automático.
5. Mercado Pago: ative **Assinaturas** e webhooks →  
   `https://clinica.mvflow.com.br/v1/public/webhooks/mercado_pago?secret=<PAYMENTS_WEBHOOK_SECRET>`  
   (Checkout Pro continua só para pagamento de sessão do paciente.)
6. Bot WhatsApp: `CLINIC_API_URL=https://clinica.mvflow.com.br` + mesma `CLINIC_API_KEY` (+ `CLINIC_ID`).

### Assinatura SaaS (renovação automática)

- `/assine` cria **preapproval** no Mercado Pago (mensal no cartão).
- Webhooks renovam `billingStatus` / `currentPeriodEnd`; atraso com grace de 3 dias → depois escritas retornam **402**.
- Complimentary não cria cobrança MP. Cancelamento: Configurações (admin) → `POST /v1/billing/cancel`.

### Smoke go-live

1. `GET /health` → 200
2. Abrir `/assine` no domínio público
3. Assinar com e-mail em `COMPLIMENTARY_SIGNUP_EMAILS` → e-mail Resend + finalizar cadastro
4. Assinar com outro e-mail → Assinaturas Mercado Pago → webhook → e-mail de setup
5. Login JWT no painel
6. (Opcional) volume persistente Railway para `uploads/`

### Usuário complimentary

E-mails em `COMPLIMENTARY_SIGNUP_EMAILS` (vírgula) pulam o Mercado Pago, marcam a assinatura como paga e disparam o e-mail de setup normalmente. Não rode `db:seed` em produção (credenciais demo).

## Autenticação

| Cliente | Como |
|---------|------|
| Painel web | `POST /v1/auth/login` → `Authorization: Bearer <jwt>` |
| Bot WhatsApp | Header `x-api-key` (somente server-side; **não** no browser) |

## API (resumo)

| Método | Rota | Uso |
|--------|------|-----|
| POST | `/v1/auth/login` | Login do painel |
| GET | `/v1/auth/me` | Usuário logado |
| GET | `/v1/clinic` | Dados da clínica |
| GET | `/v1/services` | Serviços |
| GET | `/v1/professionals?serviceId=` | Psicólogos |
| GET | `/v1/availability?serviceId=&days=14` | Slots livres |
| POST | `/v1/appointments` | Marcar |
| GET | `/v1/appointments?phone=` | Agenda do paciente (bot) |
| GET | `/v1/appointments?from=&to=&status=&scope=clinic` | Agenda da clínica |
| POST | `/v1/appointments/:id/cancel` | Cancelar |
| POST | `/v1/appointments/:id/reschedule` | Remarcar |
| GET/POST/DELETE | `/v1/calendar-blocks` | Bloqueios |
| GET | `/v1/payments` | Recebimentos |
| POST | `/v1/payments/:id/pay` | Marcar pago |
| GET/POST/PATCH | `/v1/clinical-records` | Prontuários |
| POST | `/v1/clinical-records/:id/confirm` | Confirmar no prontuário |
| POST | `/v1/public/signup/checkout` | Iniciar assinatura SaaS (MP Assinaturas) |
| POST | `/v1/public/webhooks/:provider` | Webhook pagamento / renovação |
| GET | `/v1/billing` | Status da assinatura da clínica |
| POST | `/v1/billing/cancel` | Cancelar assinatura (admin) |

## Integração com o bot

No projeto `bot`, configure:

```
CLINIC_API_URL=http://localhost:4000
CLINIC_API_KEY=clinic-api-key-change-me-16
DEMO_DEFAULT_MODEL=clinic
```

## Testes

```powershell
npm test
```

Testes unitários sempre rodam; integração Prisma: `RUN_INTEGRATION=1 npm test` (Postgres + seed).

## Bot — lembretes WhatsApp

O bot deve:

1. `GET /v1/reminders/due` (com `x-api-key`)
2. Enviar `message` + `patient.phone` via WhatsApp (texto objetivo, sem clínico)
3. `POST /v1/reminders/:id/sent` ou `/failed`

Lembretes são criados automaticamente ao marcar/remarcar (padrão: 24h antes).
