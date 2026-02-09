# Cấu hình Vercel — đổi token trên web (dùng Supabase)

Làm **một lần** theo thứ tự sau. Sau đó mỗi ngày chỉ cần vào app → Cài đặt → Lưu token lên server.

---

## Bước 1: Cài dependency (trên máy bạn)

```bash
cd c:\Users\Admin\Desktop\tracuusp2
npm install
```

---

## Bước 2: Tạo project Supabase và bảng

1. Vào **https://supabase.com** → đăng nhập → **New Project** (hoặc dùng project có sẵn).
2. Vào **SQL Editor** → **New query** → dán và chạy:

```sql
create table if not exists app_config (
  key text primary key,
  value text
);
```

3. Vào **Project Settings** → **API**:
   - Copy **Project URL** (dùng làm `NEXT_PUBLIC_SUPABASE_URL`).
   - Copy **service_role** key (Secret) — dùng làm `SUPABASE_SERVICE_ROLE_KEY` (không public key anon nếu muốn chỉ server ghi).

---

## Bước 3: Thêm biến môi trường trên Vercel

1. Vào **https://vercel.com** → project **tracuusp2** → **Settings** → **Environment Variables**.
2. Thêm 3 biến:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase (vd: https://xxx.supabase.co) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (Secret) từ Supabase → Settings → API |
| `ADMIN_PASSWORD` | Mật khẩu quản trị (vd: QuanTri@2025) — dùng khi bấm "Lưu token lên server" trên web |

3. **Save**.

---

## Bước 4: Deploy lại

1. **Deployments** → **Redeploy** (hoặc push code rồi đợi deploy xong).
2. Mở app → **Cài đặt** → mở khóa → dán token OneBSS → nhập **Mật khẩu quản trị** (đúng ADMIN_PASSWORD) → bấm **Lưu token lên server**.

Sau đó mọi người dùng app sẽ dùng token này. Mỗi ngày bạn chỉ cần vào Cài đặt → dán token mới → Lưu token lên server (không cần vào Vercel).
