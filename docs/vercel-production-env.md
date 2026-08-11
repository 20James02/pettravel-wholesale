# Vercel Production Environment Contract

This repo deploys as two separate Vercel projects:

- `frontend`: Next.js App Router, root directory `frontend`
- `backend`: FastAPI Python runtime, root directory `backend`

The production request path is:

`Browser -> Next API routes -> backendFetchJson() -> FastAPI /api/v1/* -> PostgreSQL/R2`

The browser must never receive backend secrets. Only `NEXT_PUBLIC_APP_URL` is public.

## Frontend Vercel Project

Set these for Production and Preview:

| Key | Required | Secret | Value rule |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | yes | no | HTTPS URL of the frontend Vercel project/domain |
| `BACKEND_URL` | yes | no | HTTPS URL of the backend Vercel project/domain |
| `BACKEND_INTERNAL_SECRET` | yes | yes | Same exact value as backend; at least 32 random chars |
| `JWT_SECRET` | yes | yes | Frontend session signing secret; at least 32 random chars |
| `CRON_SECRET` | yes | yes | At least 16 random chars; Vercel sends it as `Authorization: Bearer ...` for cron |
| `PAYMENT_QR_ACCOUNT_NO` | yes | yes | Bank account number used in generated payment payloads |
| `PAYMENT_QR_ACCOUNT_NAME` | yes | no | Bank account name shown in payment payloads |
| `ALLOW_DEMO_DATA` | yes | no | Must be `false` |
| `ALLOW_RUNTIME_MIGRATIONS` | yes | no | Must be `false` |
| `ADMIN_BOOTSTRAP_EMAIL` | temporary | no | Owner email for first admin creation only |
| `ADMIN_BOOTSTRAP_TOKEN` | temporary | yes | At least 32 random chars; remove after bootstrap |

Do not set `DATABASE_URL`, Supabase service keys, R2 access keys, or backend-only settings in the frontend project.

## Backend Vercel Project

Set these for Production and Preview:

| Key | Required | Secret | Value rule |
| --- | --- | --- | --- |
| `ENVIRONMENT` | yes | no | `production` for production/preview deploys that must fail closed |
| `FRONTEND_URL` | yes | no | HTTPS URL of the frontend Vercel project/domain |
| `DATABASE_URL` | yes | yes | PostgreSQL/Supabase pooler URL, not localhost |
| `DB_SSL_MODE` | recommended | no | `require` for Supabase/Vercel; `verify-full` only with `DB_SSL_ROOT_CERT` |
| `DB_SSL_ROOT_CERT` | conditional | no | Required only for `DB_SSL_MODE=verify-ca` or `verify-full` |
| `JWT_SECRET` | yes | yes | Backend token signing secret; at least 32 random chars |
| `BACKEND_INTERNAL_SECRET` | yes | yes | Same exact value as frontend; at least 32 random chars |
| `R2_ACCOUNT_ID` | yes | yes | Cloudflare R2 account id |
| `R2_ACCESS_KEY_ID` | yes | yes | Cloudflare R2 access key id |
| `R2_SECRET_ACCESS_KEY` | yes | yes | Cloudflare R2 secret access key |
| `R2_BUCKET` | yes | no | Production bucket name |
| `R2_PUBLIC_BASE_URL` | yes | no | Public asset base URL, not placeholder/example |
| `ALLOW_DEMO_DATA` | yes | no | Must be `false` |
| `ALLOW_RUNTIME_MIGRATIONS` | yes | no | Must be `false` |

Do not set `NEXT_PUBLIC_*`, `PAYMENT_QR_*`, `CRON_SECRET`, or admin bootstrap variables in the backend project unless backend code starts using them later.

## Vercel Project Settings

Frontend:

- Root Directory: `frontend`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output: framework default
- Cron: `/api/health/db` daily, configured in `frontend/vercel.json`

Backend:

- Root Directory: `backend`
- Runtime: Vercel Python
- Install: `requirements.txt`
- Build Command: `python scripts/check_production_env.py`
- Routing: `backend/vercel.json` rewrites all paths to `api/index.py`

## Validation Commands

Frontend local checks:

```powershell
cd frontend
npm.cmd run type-check
npm.cmd run lint
npm.cmd run build
```

Backend local checks:

```powershell
cd backend
python scripts/check_production_env.py
pytest -q
```

Live checks after each new deployment:

- Frontend `/api/health` returns `200`
- Frontend `/api/health/db` returns `401` without `CRON_SECRET`
- Frontend `/api/health/db` returns `200` with `Authorization: Bearer <CRON_SECRET>`
- Backend `/` returns healthy
- Backend `/api/v1/health/db` returns `401` without `x-backend-internal-secret`
- Backend `/api/v1/health/db` returns `200` with the shared backend secret
- Login owner, create customer, create product variant, create order, quote, generate payment request, upload proof, confirm payment

## Production Agent Prompt

Use this prompt for future production hardening passes:

```text
Read this repo as two Vercel projects: frontend Next.js in ./frontend and backend FastAPI in ./backend. Preserve dirty worktree changes. Verify the env contract in docs/vercel-production-env.md against actual code references before editing. Do not expose secrets or move backend-only env into NEXT_PUBLIC variables. Keep the browser -> Next BFF -> FastAPI -> database/R2 path intact. Any production claim must include evidence from lint/type-check/build/backend tests plus live authenticated checks; if live credentials are unavailable, report it as unverified. Fix only scoped deployment, security, and frontend-backend integration issues needed for production readiness.
```
