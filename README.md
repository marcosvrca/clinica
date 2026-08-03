# Clínica de Psicologia — API + Painel Web

Sistema de agenda da **Clínica Bem Estar**, integrado com o bot WhatsApp em `../bot` e com painel web para a equipe.

## O que faz

- Cadastro de clínica, psicólogos, serviços e grade semanal
- Consulta de **horários livres** (respeita bloqueios)
- **Marcar**, **cancelar** e **remarcar** (com regra de antecedência)
- **Bloqueios** de agenda no mesmo calendário
- Paciente identificado pelo telefone do WhatsApp
- **Prontuário**: rascunho editável → confirmação (imutável)
- **Recebimentos** operacionais (pendente / pago) ligados à sessão
- Painel autenticado por **JWT** (login); bot autenticado por **x-api-key**

## Subir

Precisa do Postgres do bot (`localhost:5433`).

```powershell
# 1) criar database (uma vez)
docker exec bot-postgres-1 psql -U bot -d bot -c "SELECT 'CREATE DATABASE clinica' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'clinica')\gexec"

# 2) API
cd C:\Users\04510018185\Documents\Marcos\clinica-psicologia
cp .env.example .env
# ajuste CLINIC_API_KEY, JWT_SECRET e CORS_ORIGINS
npm install
npx prisma db push
npm run db:seed
npm run dev

# 3) Painel web (outro terminal)
cd web
cp .env.example .env
npm install
npm run dev
```

| O quê | URL |
|-------|-----|
| API (saúde) | http://localhost:4000/health |
| Painel web | http://localhost:5173 |
| Login demo | `ana@bemestar.local` / `demo1234` |
| Agendar via bot | WhatsApp → `modelo clinica` |

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
