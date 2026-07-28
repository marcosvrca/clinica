# Clínica de Psicologia — API + Painel Web

Sistema de agenda da **Clínica Mente em Equilíbrio**, integrado com o bot WhatsApp em `../bot` e com painel web para a equipe.

## O que faz

- Cadastro de clínica, psicólogos, serviços e grade semanal
- Consulta de **horários livres**
- **Marcar**, **cancelar** e **remarcar** (com regra de antecedência)
- Paciente identificado pelo telefone do WhatsApp
- API autenticada por `x-api-key`
- **Painel web** para agenda do dia, novo agendamento e catálogo

## Subir

Precisa do Postgres do bot (`localhost:5433`).

```powershell
# 1) criar database (uma vez)
docker exec bot-postgres-1 psql -U bot -d bot -c "SELECT 'CREATE DATABASE clinica' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'clinica')\gexec"

# 2) API
cd C:\Users\04510018185\Documents\Marcos\clinica-psicologia
cp .env.example .env
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
| Agendar via bot | WhatsApp → `modelo clinica` |

Header das rotas: `x-api-key: clinic-api-key-change-me-16`

## API (resumo)

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/v1/clinic` | Dados da clínica |
| GET | `/v1/services` | Serviços |
| GET | `/v1/professionals?serviceId=` | Psicólogos |
| GET | `/v1/availability?serviceId=&days=14` | Slots livres |
| POST | `/v1/appointments` | Marcar |
| GET | `/v1/appointments?phone=` | Agenda do paciente (bot) |
| GET | `/v1/appointments?from=&to=&status=&scope=clinic` | Agenda da clínica (painel) |
| POST | `/v1/appointments/:id/cancel` | Cancelar |
| POST | `/v1/appointments/:id/reschedule` | Remarcar |

## Painel web

Telas:

1. **Agenda** — filtrar por dia / profissional / status; cancelar e remarcar
2. **Novo agendamento** — serviço → profissional → slot → paciente
3. **Serviços** — catálogo e equipe

O Vite faz proxy de `/v1` e `/health` para `http://localhost:4000`.

## Seed demo

- **Dra. Ana Souza** e **Dr. Bruno Lima**
- Seg–Sex 08:00–12:00 e 14:00–18:00
- Sessão 50 min + Primeira consulta
- Cancelamento mínimo: 2 horas antes

## Integração com o bot

No projeto `bot`, configure:

```
CLINIC_API_URL=http://localhost:4000
CLINIC_API_KEY=clinic-api-key-change-me-16
DEMO_DEFAULT_MODEL=clinic
```

No WhatsApp: `modelo clinica`
