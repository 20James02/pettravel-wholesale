# Pet Travel WholeSale

Nen tang ban si do thu cung cho Pet Travel: khach chi thay gia sau khi dang nhap, Admin tao tai khoan, quan ly nhieu nha cung cap noi bo, tach don theo supplier, comment 2 chieu, quote versioning, QR thanh toan va upload chung tu len Cloudflare R2.

## Stack

- Next.js App Router tren Vercel
- Supabase Postgres, Auth va RLS
- Cloudflare R2 qua presigned URL
- TypeScript, Tailwind CSS, Zod, Lucide icons

## Chay local

```powershell
npm.cmd install
npm.cmd run dev
```

Mo `http://localhost:3000`. App hien co 3 che do demo: `Guest`, `User`, `Admin`.

## Bien moi truong

Sao chep `.env.example` thanh `.env.local`, dien cac bien:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `DATABASE_URL`
- `BACKEND_URL`
- `BACKEND_INTERNAL_SECRET`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`
- `ADMIN_EMAILS`
- `JWT_SECRET`
- `PASSWORD_PEPPER`

Khong commit `.env.local` hoac secret that.

## Supabase

1. Tao project Supabase.
2. Chay SQL trong `supabase/schema.sql`.
3. Bat RLS va review policy truoc khi mo production.
4. Tao user bang Admin flow, khong mo public signup.
5. Server dung `SUPABASE_SERVICE_ROLE_KEY` chi trong route/server action, khong dua xuong client.
6. Khong bat `ALLOW_DEMO_DATA` hoac `ALLOW_RUNTIME_MIGRATIONS` tren production.

## Cloudflare R2

1. Tao bucket `pettravel-wholesale`.
2. Tao R2 API token co quyen bucket toi thieu.
3. Cau hinh CORS cho domain Vercel, cho `PUT`, `GET`, `HEAD`, header `Content-Type`, va expose `ETag`.
4. Upload anh/chung tu dung `/api/uploads/presign`, URL het han sau 300 giay.

## Vercel

1. Import repo len Vercel.
2. Them env cho `Production`, `Preview`, `Development`.
3. Bat buoc them `JWT_SECRET` va `PASSWORD_PEPPER`, moi bien toi thieu 32 ky tu random. Neu thieu, dang nhap production se fail-secure.
4. Nen them `BACKEND_INTERNAL_SECRET` cung mot gia tri o ca frontend project va backend project de Next server goi FastAPI. Neu chua co, code co the dung `SUPABASE_JWT_SECRET` lam alias tam thoi, nhung secret rieng van an toan hon.
5. Build command: `npm run build`.
6. Sau khi thay doi env, redeploy de bien moi co tac dung.
7. Kiem tra `/api/health`, trang chu, upload presign va order room tren preview truoc khi promote production.

Tao secret nhanh tren may local:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Chay lenh 2 lan, dung gia tri khac nhau cho `JWT_SECRET` va `PASSWORD_PEPPER`.

## Checklist thu cong truoc deploy that

1. Supabase SQL Editor: chay `supabase/schema.sql` tren project moi hoac tao migration rieng neu database da co bang.
2. Supabase Table Editor: dam bao `roles`, `permissions`, `role_permissions` da co du lieu seed.
3. Vercel env: them du cac bien trong `.env.example`; rieng `JWT_SECRET`, `PASSWORD_PEPPER`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_SECRET_ACCESS_KEY` chi dat o Server/Encrypted env, khong dua vao client.
4. Admin bootstrap: dat cung mot email owner trong `ADMIN_EMAILS` va `ADMIN_BOOTSTRAP_EMAIL`, dat `ADMIN_BOOTSTRAP_TOKEN` random toi thieu 32 ky tu, redeploy, sau do goi endpoint bootstrap mot lan:

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
5. Cloudflare R2 CORS: cho domain Vercel production/preview duoc `PUT`, `GET`, `HEAD`; allowed headers toi thieu `Content-Type`, `Content-Length`; expose `ETag`.
6. Verify live: login owner, tao user dai ly, tao san pham co variant, khach chot don, admin bao gia, tao QR, upload chung tu, admin xac nhan coc, gan van don.
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
