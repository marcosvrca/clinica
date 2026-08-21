# Produção — checklist (Railway: API + SPA + Postgres + volume uploads)

## Antes de subir

1. Gere segredos fortes (não use os valores de `.env.example`):
   - `CLINIC_API_KEY` (≥16 chars)
   - `JWT_SECRET` (≥32 chars)
   - `CLINICAL_ENCRYPTION_KEY` (≥32 chars, **diferente** do JWT) — guarde offline
2. Defina `CLINIC_ID` com o id da clínica do bot (obrigatório em `NODE_ENV=production`).
3. Configure `CORS_ORIGINS`, `PUBLIC_BASE_URL` e `WEB_BASE_URL` com **HTTPS** (mesmo domínio no Railway).
4. Volume Railway montado em `uploads/` (fotos e anexos clínicos).
5. Postgres com backup automático (snapshot diário no mínimo).
6. **Nunca rode `db:seed` em produção** — o código aborta com `NODE_ENV=production`, mas não use o comando.

A API **recusa subir** em production se faltar: secrets fortes, `CLINIC_ID`, CORS `*`, URLs localhost/HTTP, webhook secret, Resend, token MP, planos SOLO/TEAM, ou `PAYMENTS_ALLOW_SANDBOX=true`.

## Banco

```bash
# Ambiente novo
npx prisma migrate deploy

# Já existia schema via `db push` (marcar migration inicial como aplicada)
npx prisma migrate resolve --applied 20260803121500_init
npx prisma migrate deploy
```

| Script | Uso |
|--------|-----|
| `npm run db:migrate` | `prisma migrate deploy` (produção) |
| `npm run db:migrate:dev` | `prisma migrate dev` (desenvolvimento) |
| `npm run db:push` | Só local / protótipo — **não use em prod** |

## Railway (recomendado)

1. Serviço Docker (`Dockerfile` / `railway.toml`) = API + `web/dist`
2. Plugin Postgres → `DATABASE_URL`
3. Volume → path `uploads` (persistir fotos/docs)
4. Variáveis: ver README seção Produção + `.env.example`
5. Healthcheck: `GET /health`
6. Start: `prisma migrate deploy && node dist/main.js`

## Docker local

```bash
cp .env.example .env
# edite secrets, CLINIC_ID, URLs públicas
docker compose up -d --build
```

## API key do bot

A `CLINIC_API_KEY` só acessa agenda/serviços/lembretes do bot. Prontuário, financeiro e pacientes exigem **JWT**.

## Mercado Pago

- Crie dois planos Assinaturas (Individual R$ 39,90 e Compartilhado R$ 69,90)
- Defina `MERCADOPAGO_PREAPPROVAL_PLAN_ID_SOLO` e `_TEAM`
- Webhook: `https://SEU_DOMINIO/v1/public/webhooks/mercado_pago?secret=<PAYMENTS_WEBHOOK_SECRET>`

## Backup (mínimo)

- Postgres: `pg_dump` diário + retenção ≥ 14 dias
- Volume `uploads/`
- Guarde `CLINICAL_ENCRYPTION_KEY` fora do servidor

```bash
# Linux/macOS
./scripts/backup-db.sh
# Windows
./scripts/backup-db.ps1
```
