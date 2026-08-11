# Produção — checklist

## Antes de subir

1. Gere segredos fortes (não use os valores de `.env.example`):
   - `CLINIC_API_KEY` (≥16 chars)
   - `JWT_SECRET` (≥32 chars)
   - `CLINICAL_ENCRYPTION_KEY` (≥32 chars, **diferente** do JWT)
2. Defina `CLINIC_ID` com o id da clínica real (obrigatório em `NODE_ENV=production`).
3. Configure `CORS_ORIGINS`, `PUBLIC_BASE_URL` e `WEB_BASE_URL` com HTTPS (sem `localhost`).
4. Use Postgres com backup automático (snapshot diário no mínimo).
5. Coloque TLS na frente (nginx / Caddy / cloud load balancer).
6. **Não rode `db:seed` em produção** (usuários demo e dados fictícios).

A API **recusa subir** em production se secrets forem de exemplo, `CLINIC_ID` estiver vazio ou CORS for `*`.

## Banco

```bash
# Ambiente novo
npx prisma migrate deploy

# Já existia schema via `db push` (marcar migration inicial como aplicada)
npx prisma migrate resolve --applied 20260811120000_init
npx prisma migrate deploy
```

Scripts:

| Script | Uso |
|--------|-----|
| `npm run db:migrate` | `prisma migrate deploy` (produção) |
| `npm run db:migrate:dev` | `prisma migrate dev` (desenvolvimento) |
| `npm run db:push` | Só local / protótipo — **não use em prod** |

## Docker

```bash
cp .env.example .env
# edite secrets, CLINIC_ID, URLs públicas
# DATABASE_URL=postgresql://clinica:change-me-db-password@postgres:5432/clinica?schema=public
docker compose up -d --build
```

O entrypoint roda `migrate deploy` e sobe a API na porta 4000.
Sirva o painel (`web/dist`) via nginx/CDN apontando `/` para o SPA e `/v1` + `/health` para a API — ou copie `web/dist` para o host estático e ajuste `CORS_ORIGINS`.

Volume `clinic_uploads` guarda anexos; faça backup junto com o Postgres.

## API key do bot

A `CLINIC_API_KEY` só acessa:

- serviços, profissionais, disponibilidade
- marcar / listar / cancelar / remarcar
- lembretes `due` / `sent` / `failed`

Prontuário, financeiro, pacientes e dashboard exigem **JWT do painel**.

## Lembretes WhatsApp

A API expõe a fila; o bot precisa:

1. `GET /v1/reminders/due`
2. Enviar WhatsApp (texto objetivo, sem clínico)
3. `POST /v1/reminders/:id/sent` ou `/failed`

No bot (`../bot`): worker `clinic-reminder.worker` já faz o polling.
Configure `CLINIC_REMINDERS_ENABLED=true` e, se necessário, `CLINIC_REMINDER_TENANT_SLUG`
(tenant com `evolutionInstance`). Intervalo: `REMINDER_POLL_MS`.

## Backup (mínimo)

- Postgres: `pg_dump` diário + retenção ≥ 14 dias
- Volume `uploads/`
- Guarde `CLINICAL_ENCRYPTION_KEY` fora do servidor (sem ela os prontuários não abrem)
