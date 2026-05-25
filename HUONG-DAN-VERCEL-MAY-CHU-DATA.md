# Vercel (app) + Supabase trên máy tính khác (data)

## Script tự động (trên máy chủ data)

Copy cả thư mục project (hoặc chỉ `scripts/data-server` + `sql`) sang máy chủ data, mở PowerShell **tại thư mục gốc project**:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\data-server\init-supabase.ps1
.\scripts\data-server\init-tunnel.ps1
# Sau khi tunnel chạy và có hostname:
$env:TRACUU_PUBLIC_SUPABASE_URL = 'https://tracuu-db.ten-cua-ban.com'
.\scripts\data-server\print-vercel-env.ps1
```

Sau khi cấu hình Vercel + redeploy, mở: `https://<ten-app>.vercel.app/api/health-storage` — phải thấy `"ok":true`.

---

Hướng dẫn triển khai khi:

- **App** vẫn chạy trên **Vercel** (URL công khai, ví dụ `ttvtnhoquantracuusp2.vercel.app`).
- **Database / cache chung** chạy trên **một máy tính riêng** (không phải máy bạn đang dev/chat) — gọi là **máy chủ data**.
- **Cloudflare Tunnel** để Vercel (trên internet) gọi được Supabase trên máy chủ data **không cần mở port modem**.

```
[Người dùng] → Vercel (Next.js)
                  ↓ HTTPS
         https://db.tenban.cfd  ← Cloudflare Tunnel
                  ↓
         [Máy chủ data] Docker Supabase :8000
                  ↓
              ổ cứng máy chủ data
```

---

## Phân vai từng máy

| Máy | Việc cần làm |
|-----|----------------|
| **Máy chủ data** (máy tính khác) | Cài Docker, Supabase self-host, Cloudflare Tunnel, **bật 24/7** khi có người dùng |
| **Máy dev** (máy bạn đang code) | Chỉ sửa code / push GitHub; **không** bắt buộc chạy Supabase |
| **Vercel** | Cấu hình biến môi trường trỏ URL tunnel; redeploy |

---

## Phần A — Trên máy chủ data (làm một lần)

Giả sử máy chủ data dùng **Windows 10/11**. (Linux cũng được, lệnh Docker tương tự.)

### A1. Cài Docker Desktop

1. Tải: https://www.docker.com/products/docker-desktop/
2. Cài xong → mở Docker Desktop → đợi trạng thái **Running**.
3. Trong PowerShell kiểm tra: `docker --version`

### A2. Cài Supabase self-host (Docker)

1. Cài **Git** nếu chưa có: https://git-scm.com/download/win

2. Mở PowerShell:

```powershell
cd C:\
git clone --depth 1 https://github.com/supabase/supabase
cd supabase\docker
copy .env.example .env
```

3. Mở file `C:\supabase\docker\.env` bằng Notepad, tìm và ghi nhớ (sau này dán lên Vercel):

- `SERVICE_ROLE_KEY` — **bắt buộc** cho app (quyền ghi server)
- `ANON_KEY` — có thể cần cho client
- API thường lộ ở cổng **8000** (`KONG_HTTP_PORT=8000`)

4. Khởi động Supabase (lần đầu tải image, có thể 10–20 phút):

```powershell
cd C:\supabase\docker
docker compose pull
docker compose up -d
```

5. Kiểm tra trên **chính máy chủ data**:

- Trình duyệt: http://localhost:8000 — có phản hồi (có thể 401, không sao)
- Supabase Studio: http://localhost:54323 (đăng nhập theo `.env`: `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`)

### A3. Tạo bảng cho app (SQL)

Trong **Studio** → **SQL Editor**, chạy nội dung file `VERCEL-SETUP.md` trong project:

```sql
create table if not exists app_config (
  key text primary key,
  value text
);

create table if not exists sp2_port_cache (
  cache_key text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.truncate_sp2_port_cache()
returns void
language sql
security definer
set search_path = public
as $$
  truncate table sp2_port_cache;
$$;
```

### A4. Cài Cloudflare Tunnel (`cloudflared`)

Mục tiêu: có URL dạng `https://tracuu-db.ten-cua-ban.com` trỏ vào `http://localhost:8000` trên máy chủ data.

1. Tạo tài khoản Cloudflare (miễn phí): https://dash.cloudflare.com  
2. Thêm domain (hoặc dùng subdomain miễn phí qua Cloudflare) — cần **một hostname** public.
3. Tải `cloudflared` Windows: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

4. Đăng nhập (trên máy chủ data):

```powershell
cloudflared tunnel login
```

5. Tạo tunnel:

```powershell
cloudflared tunnel create tracuu-supabase
```

Ghi lại **Tunnel ID** (UUID).

6. Tạo file cấu hình `C:\cloudflared\config.yml` (tạo thư mục nếu chưa có):

```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<TEN_USER_WINDOWS>\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: tracuu-db.ten-cua-ban.com
    service: http://localhost:8000
  - service: http_status:404
```

Thay `<TUNNEL_ID>`, `<TEN_USER_WINDOWS>`, `tracuu-db.ten-cua-ban.com` cho đúng.

7. Trên Cloudflare DNS: thêm bản ghi **CNAME**  
   `tracuu-db` → `<TUNNEL_ID>.cfargotunnel.com` (proxy bật — đám mây cam).

8. Chạy tunnel (thử):

```powershell
cloudflared tunnel run tracuu-supabase
```

9. Trên máy **bất kỳ** (kể cả máy dev), mở trình duyệt:

`https://tracuu-db.ten-cua-ban.com/rest/v1/`  
— nếu thấy JSON / thông báo Supabase API là tunnel **OK**.

10. Chạy tunnel **tự khởi động khi bật máy** (Windows Service):

```powershell
cloudflared service install
cloudflared tunnel run tracuu-supabase
```

Hoặc dùng **Tác vụ đăng nhập (Task Scheduler)** chạy lệnh trên khi user đăng nhập.

### A5. Ghi lại thông tin cho Vercel

Trên máy chủ data, mở `C:\supabase\docker\.env`:

| Biến Vercel | Giá trị lấy từ đâu |
|-------------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tracuu-db.ten-cua-ban.com` (URL tunnel, **không** có `/rest/v1` ở cuối) |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` trong `.env` Docker |
| `ADMIN_PASSWORD` | Mật khẩu quản trị app (tự đặt, giống hiện tại) |
| `UNLOCK_PASSWORD` | Mã mở Cài đặt / upload TB (tự đặt) |

**Không** commit file `.env` Docker lên GitHub.

---

## Phần B — Trên Vercel (làm trên trình duyệt, không cần máy chủ data)

1. Vào **Vercel** → project `tracuusp2` → **Settings** → **Environment Variables**.
2. **Sửa / thêm** (Production + Preview nếu cần):

   - `NEXT_PUBLIC_SUPABASE_URL` = `https://tracuu-db.ten-cua-ban.com`
   - `SUPABASE_SERVICE_ROLE_KEY` = (copy `SERVICE_ROLE_KEY` từ máy chủ data)
   - Giữ `ADMIN_PASSWORD`, `UNLOCK_PASSWORD` như cũ.

3. **Xóa hoặc không dùng** URL Supabase cloud cũ (`xxx.supabase.co`) — tránh vẫn trỏ project bị `exceed_egress_quota`.

4. **Deployments** → **Redeploy** bản mới nhất.

5. Mở app Vercel → **Cài đặt** → dán JWT → **Lưu lên server** → thử **Đồng bộ toàn bộ S2** (có mã cache chung).

---

## Phần C — Vận hành hàng ngày

### Máy chủ data phải

- **Bật** và **đăng nhập Windows** (hoặc chạy service tunnel + Docker ở chế độ nền).
- Docker Desktop **Running**.
- `cloudflared` tunnel **đang chạy**.

Nếu tắt máy chủ data → Vercel vẫn mở được nhưng **không lưu/đọc cache**, báo lỗi Supabase.

### Giảm tải (tránh đầy băng thông / ổ đĩa)

- Không mở quá nhiều tab app cùng lúc (auto refresh meta ~20s/tab).
- Đồng bộ S2 **có mã cache chung** chỉ khi cần; cân nhắc tắt auto sync 5 phút nếu không cần (cấu hình thói quen sử dụng).
- **Backup** định kỳ thư mục Docker volume Supabase (hoặc `pg_dump` Postgres trong container).

### Sao lưu database (gợi ý)

Trên máy chủ data:

```powershell
cd C:\supabase\docker
docker compose exec db pg_dump -U postgres postgres > C:\backup\tracuu_%date%.sql
```

(Tạo `C:\backup` trước; chỉnh lệnh ngày theo PowerShell nếu cần.)

---

## Phần D — Di chuyển dữ liệu từ Supabase cloud cũ (tùy chọn)

Khi cloud **mở khóa** trở lại, có thể export bảng `sp2_port_cache`, `app_config` rồi import vào Postgres local (Studio → Table editor / SQL). Nếu cloud vẫn khóa, bỏ qua bước này và **đồng bộ lại** từ app.

---

## Kiểm tra nhanh (checklist)

- [ ] Máy chủ data: `docker compose ps` — các container Supabase **Up**
- [ ] Máy chủ data: http://localhost:8000 phản hồi
- [ ] Tunnel: `https://tracuu-db...` mở được từ mạng ngoài (4G điện thoại thử)
- [ ] Vercel: biến env đã đổi URL + service role mới
- [ ] App: **Lưu lên server** thành công (không còn `exceed_egress_quota`)
- [ ] App: **Đồng bộ toàn bộ S2** + máy khác tra cứu cache chung

---

## Xử lý sự cố

| Triệu chứng | Gợi ý |
|-------------|--------|
| Vercel: không lưu được token | Tunnel tắt / Docker tắt / sai `SERVICE_ROLE_KEY` / chưa tạo bảng SQL |
| `exceed_egress_quota` vẫn hiện | Vercel vẫn trỏ URL **Supabase cloud cũ** — kiểm tra lại env và redeploy |
| Chỉ máy trong nhà dùng được tunnel | DNS chưa propagate; kiểm tra CNAME Cloudflare |
| Studio không vào được | Kiểm tra cổng 54323, firewall Windows cho localhost |

---

## Tóm tắt

Bạn **không** cần cài Supabase trên máy đang chat với Cursor. Chỉ cần **máy tính khác** làm máy chủ data (Docker + tunnel), Vercel trỏ URL tunnel — app giữ nguyên code, tránh khóa quota Supabase cloud.
