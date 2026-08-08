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
- `DATABASE_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

Khong commit `.env.local` hoac secret that.

## Supabase

1. Tao project Supabase.
2. Chay SQL trong `supabase/schema.sql`.
3. Bat RLS va review policy truoc khi mo production.
4. Tao user bang Admin flow, khong mo public signup.
5. Server dung `SUPABASE_SERVICE_ROLE_KEY` chi trong route/server action, khong dua xuong client.

## Cloudflare R2

1. Tao bucket `pettravel-wholesale`.
2. Tao R2 API token co quyen bucket toi thieu.
3. Cau hinh CORS cho domain Vercel, cho `PUT`, `GET`, `HEAD`, header `Content-Type`, va expose `ETag`.
4. Upload anh/chung tu dung `/api/uploads/presign`, URL het han sau 300 giay.

## Vercel

1. Import repo len Vercel.
2. Them env cho `Production`, `Preview`, `Development`.
3. Build command: `npm run build`.
4. Sau khi thay doi env, redeploy de bien moi co tac dung.
5. Kiem tra `/api/health`, trang chu, upload presign va order room tren preview truoc khi promote production.

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

Day la nen tang khoi tao co UI va domain model chay duoc voi mock data. Ket noi Supabase CRUD, auth admin-created, realtime channel va R2 upload flow that se la milestone tiep theo.
