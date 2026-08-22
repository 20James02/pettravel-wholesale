# Pet Travel WholeSale

Nen tang ban si do thu cung cho Pet Travel: khach chi thay gia sau khi dang nhap, Admin tao tai khoan, quan ly nhieu nha cung cap noi bo, tach don theo supplier, comment 2 chieu, quote versioning, QR thanh toan va upload chung tu len Cloudflare R2.

## Stack

- Next.js App Router tren Vercel
- Supabase Postgres, Auth va RLS
- Cloudflare R2 qua presigned URL
- TypeScript, Tailwind CSS, Zod, Lucide icons

## Chay local

Backend (PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --require-hashes -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Frontend (terminal khac):

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Mo `http://localhost:3000`. Tai khoan User/Admin phai ton tai trong database; public signup da tat.

## Bien moi truong

Du an deploy thanh 2 Vercel project rieng:

- `frontend`: Next.js App Router, root directory `frontend`
- `backend`: FastAPI Python runtime, root directory `backend`

Contract chi tiet nam o `docs/vercel-production-env.md`.

Frontend project can:

- `NEXT_PUBLIC_APP_URL`
- `BACKEND_URL`
- `BACKEND_INTERNAL_SECRET`
- `JWT_SECRET`
- `CRON_SECRET`
- `ALLOW_DEMO_DATA=false`
- `ALLOW_RUNTIME_MIGRATIONS=false`
- Tam thoi khi bootstrap owner: `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_TOKEN`

Backend project can:

- `ENVIRONMENT=production`
- `FRONTEND_URL`
- `DATABASE_URL`
- `DB_SSL_MODE=require`
- `DB_SSL_ROOT_CERT` chi khi dung `verify-ca` hoac `verify-full`
- `JWT_SECRET`
- `BACKEND_INTERNAL_SECRET`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PRIVATE_BUCKET`
- `R2_PUBLIC_BASE_URL`
- `PAYMENT_QR_BANK_CODE`
- `PAYMENT_QR_ACCOUNT_NO`
- `PAYMENT_QR_ACCOUNT_NAME`
- `VIETQR_WEBHOOK_SECRET`
- `PAYMENT_SYSTEM_ACTOR_ID`
- `ALLOW_DEMO_DATA=false`
- `ALLOW_RUNTIME_MIGRATIONS=false`

`BACKEND_INTERNAL_SECRET` phai trung nhau o ca frontend va backend. Khong commit `.env.local`, `.env.backend`, `.env.production` hoac secret that.

## Supabase

1. Tao project Supabase.
2. Database moi: chay `supabase/schema.sql`, sau do chay tat ca file `supabase/update_*.sql` theo thu tu phien ban tang dan (`update_schema.sql`, V2 ... V15; neu cung phien ban thi theo ten file). `schema.sql` khong tu thay the cac migration operations/inventory lich su.
3. Database dang hoat dong: backup/restore drill truoc, chi chay cac forward migration chua ap dung theo thu tu; khong chay rollback artifact nhu migration thuong.
   - Truoc V14, doi soat moi `payment_request_id` chi co toi da mot `payment_proofs.status='pending_admin_confirmation'`. V14 se fail-closed neu du lieu cu bi trung de tranh tu dong xoa chung tu tai chinh.
   - V15 tao `auth_rate_limit_buckets` cho rate limit dang nhap dung chung giua cac instance serverless. Bang chi luu SHA-256 digest, bat RLS va khong co policy truy cap tu browser.
4. Bat RLS va review policy truoc khi mo production.
5. Tao user bang Admin flow, khong mo public signup.
6. Server dung database credential chi o backend/BFF, khong dua xuong client.
7. Khong bat `ALLOW_DEMO_DATA` hoac `ALLOW_RUNTIME_MIGRATIONS` tren production.

Backend la lop rate limit dang nhap authoritative dung PostgreSQL, nen van chan duoc brute force khi Vercel scale-out hoac cold start. Frontend BFF giu them limiter trong bo nho de cat request som; khong duoc coi limiter BFF la lop bao ve duy nhat.

### Kiem tra ket noi database

Backend co script healthcheck an toan, khong in user/password/token:

```powershell
cd backend
python .\scripts\check_db_connection.py --env-file .env.backend
```

Lenh tren chi chay `select 1`. De xac minh schema ung dung co the doc/ghi bang `app_settings`, dung them:

```powershell
python .\scripts\check_db_connection.py --env-file .env.backend --write-health
```

Ket qua hop le can co `DB_SELECT_OK=true`; voi `--write-health` can them `DB_WRITE_HEALTH_OK=true`. Neu production dung Supabase/Vercel, `DATABASE_URL` phai la connection string Postgres that, khong phai placeholder hay bien tham chieu ngan.

Neu `DB_DNS_SAFE` bao `gaierror/getaddrinfo failed` voi host dang la `db.<project-ref>.supabase.co`, hay kiem tra trong Supabase Dashboard > Connect va can nhac dung Supavisor pooler string. Direct database host cua Supabase thuong di qua IPv6; nhieu moi truong serverless/CI chi ho tro IPv4, nen pooler IPv4 la lua chon phu hop hon cho app runtime.

Ket noi PostgreSQL tu xa mac dinh dung `DB_SSL_MODE=require`, bat buoc ma hoa TLS nhung khong xac minh CA. De bat xac minh day du, tai CA certificate trong Supabase Dashboard > Database Settings > SSL Configuration, sau do dat `DB_SSL_MODE=verify-full` va `DB_SSL_ROOT_CERT` thanh duong dan den certificate. Khong dat `DB_SSL_MODE=disable` cho database tu xa.

## Cloudflare R2

1. Tao hai bucket rieng biet: `pettravel-wholesale` cho anh catalog cong khai va `pettravel-wholesale-private` cho minh chung thanh toan/hoa don. Khong bat public access cho bucket private.
2. Tao R2 API token co quyen toi thieu tren dung hai bucket.
3. Cau hinh CORS cho domain Vercel, cho `PUT`, `GET`, `HEAD`, header `Content-Type`, `Content-Length`, va expose `ETag`.
4. Upload dung presigned URL 300 giay. Metadata minh chung chi duoc luu sau khi backend kiem tra object bang `HEAD`; tai xuong can quyen tren don hang va URL private chi ton tai 60 giay.
5. Neu he thong cu tung luu minh chung trong bucket public, phai copy object sang bucket private, doi soat `HEAD`/checksum, cap nhat `storage_key`, sau do xoa ban public va purge cache truoc khi mo production. Khong chi doi bien moi truong ma bo lai object cu.

### Chuyen anh catalog base64 cu len R2

Code moi chi cho phep luu duong dan noi bo hoac URL HTTPS; `data:`, `blob:`, HTTP va URL co credentials bi tu choi o frontend lan backend. API doc catalog cung loc du lieu legacy khong an toan de tranh tra payload base64 lon.

Luon chay dry-run truoc. Lenh chi doc PostgreSQL va tao manifest khong chua base64/secret:

```powershell
cd backend
python .\scripts\migrate_legacy_catalog_images.py
```

Co the them `--env-file <FILE>` neu file do chua gia tri that; file Vercel da redacted/placeholder se bi tu choi. Neu public R2 URL local dang redacted, dry-run van dem va tinh hash bang domain `.invalid` khong routable; manifest khong luu URL preview nay.

Review `legacyReferenceCount`, object key, SHA-256 va byte length trong `scratch/catalog-image-migration-*.json`. Chi khi da backup DB, xac minh bucket/domain R2 va co cua so van hanh moi apply voi dung count tu dry-run. Cau hinh env luc apply phai chua `R2_PUBLIC_BASE_URL` HTTPS that, hoac truyen `--public-base-url` cong khai:

```powershell
python .\scripts\migrate_legacy_catalog_images.py `
  --apply `
  --expected-legacy-references <COUNT_TU_DRY_RUN>
```

Apply la idempotent: object co key theo SHA-256, object ton tai phai khop size/MIME/hash, va DB chi cap nhat neu gia tri goc chua thay doi. Script khong xoa object. Neu credential database/R2 tung xuat hien trong source hoac log, phai rotate credential tai nha cung cap va cap nhat Vercel; chi xoa khoi file la chua du.

## Vercel

1. Tao 2 Vercel project tu cung repo.
2. Frontend project: root directory `frontend`, install `npm ci`, build `npm run build`.
3. Backend project: root directory `backend`, Python runtime cai dependency tu `requirements.txt` da lock hash, build command `python scripts/check_production_env.py`.
4. Them dung bien trong `docs/vercel-production-env.md` cho `Production` va `Preview`.
5. Bat "Automatically expose System Environment Variables" neu muon xem `VERCEL_GIT_COMMIT_SHA` tren health endpoint; khong dua secret vao `NEXT_PUBLIC_*`.
6. Sau khi thay doi env, redeploy de bien moi co tac dung.
7. Kiem tra `/api/health`, `/api/health/db`, backend `/`, backend `/api/v1/health/db`, login, upload presign va order room tren preview truoc khi promote production.

Tao secret nhanh tren may local:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Chay lenh nhieu lan va dung gia tri khac nhau cho `JWT_SECRET`, `BACKEND_INTERNAL_SECRET`, `CRON_SECRET`, `ADMIN_BOOTSTRAP_TOKEN`.

## Checklist thu cong truoc deploy that

1. Supabase SQL Editor: project moi phai chay `supabase/schema.sql` va toan bo `update_*.sql` theo dung thu tu o muc Supabase; database hien huu chi ap dung forward migration chua chay sau khi co backup va schema audit.
2. Supabase Table Editor: dam bao `roles`, `permissions`, `role_permissions` da co du lieu seed.
3. Vercel env: them du cac bien trong `docs/vercel-production-env.md`; rieng `JWT_SECRET`, `BACKEND_INTERNAL_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` phai de dang secret/encrypted, khong dua vao client.
4. Admin bootstrap: dat `ADMIN_BOOTSTRAP_EMAIL`, dat `ADMIN_BOOTSTRAP_TOKEN` random toi thieu 32 ky tu o frontend project, redeploy, sau do goi endpoint bootstrap mot lan:

```powershell
$body = @{
  email = "owner@example.com"
  fullName = "Owner Pet Travel"
  phone = "0900000000"
  password = "doi-mat-khau-manh-12-ky-tu"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://your-vercel-domain.vercel.app/api/admin/bootstrap" `
  -Headers @{ "x-bootstrap-token" = "ADMIN_BOOTSTRAP_TOKEN_CUA_BAN" } `
  -ContentType "application/json" `
  -Body $body
```

Sau khi login owner thanh cong, xoa `ADMIN_BOOTSTRAP_TOKEN` khoi Vercel env va redeploy.
5. Cloudflare R2: bucket catalog co public custom domain; bucket chung tu phai private. CORS cho domain Vercel production/preview duoc `PUT`, `GET`, `HEAD`; allowed headers toi thieu `Content-Type`, `Content-Length`; expose `ETag`.
6. Verify live: login owner, tao user dai ly, tao san pham co variant, khach chot don, admin bao gia, tao QR, upload chung tu, thu ca nhanh tu choi/tai lai va het han/phat hanh lai, admin xac nhan coc, di qua tung buoc fulfillment, nhap ma van don that, giao hang, thanh toan COD con lai va ghi so.
7. Sau verify: dat `ALLOW_DEMO_DATA=false`, `ALLOW_RUNTIME_MIGRATIONS=false`, redeploy production.

## Nghiep vu chinh

- User chi thay mot nha cung cap: Pet Travel.
- Admin quan ly nhieu supplier, gan variant/offers theo supplier.
- Mot don cua khach duoc tach thanh `fulfillment_groups` de Admin check tung supplier.
- Gia, SKU, so luong, quote va QR deu co snapshot/version.
- Khach chon `coc + COD` hoac `thanh toan het` tai thoi diem chot don.
- Admin duyet lai gia, ship, freeship, chiet khau, uu dai va phat hanh payment request.
- Upload chung tu khong dong nghia da thu tien. Admin ke toan phai xac nhan tien ve.
- Tien da xac nhan khong sua truc tiep. Sua sai bang payment request bo sung hoac refund ledger.

## Kiem thu nen co

- Guest khong thay gia si.
- Customer khong thay ten supplier noi bo.
- Admin thay supplier split va note noi bo.
- Quote version cu bi `superseded` khi Admin sua gia/so luong.
- QR het han khong duoc xac nhan.
- Proof upload sai file type bi tu choi.
- Role khong co `order.confirm_payment` khong duoc xac nhan tien.
- RLS khong cho khach doc don cua organization khac.

## Trang thai hien tai

Local lint, type-check, audit va production build da pass. Live Supabase/R2/Vercel can duoc xac minh bang env that sau khi deploy preview.
