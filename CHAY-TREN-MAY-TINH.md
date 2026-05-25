# Chạy app Tra cứu S2 trên máy tính (Windows)

> **App trên Vercel, data trên máy tính khác:** xem **[HUONG-DAN-VERCEL-MAY-CHU-DATA.md](./HUONG-DAN-VERCEL-MAY-CHU-DATA.md)**.

Hướng dẫn chạy **cả website + API** trên một PC (không bắt buộc Vercel). Máy khác trong cùng mạng LAN có thể mở bằng địa chỉ IP máy chủ (ví dụ `http://192.168.1.10:3000`).

## 1. Cài đặt trước

1. **Node.js** LTS (18 trở lên): https://nodejs.org  
2. Copy thư mục project (hoặc `git clone`) vào máy, ví dụ `C:\tracuusp2`.

## 2. Cấu hình `.env.local`

Tạo file `.env.local` trong thư mục project (copy từ `.env.example`):

```env
# Bắt buộc — mã quản trị (Đồng bộ cache chung, Lưu token, Cài đặt)
ADMIN_PASSWORD=mat-khau-manh-cua-ban

# Mã mở khóa menu Cài đặt / Báo cáo / upload TB
UNLOCK_PASSWORD=mat-khau-mo-khoa

# --- Chọn MỘT trong hai cách lưu dữ liệu chung bên dưới ---
```

### Cách A — Vẫn dùng Supabase (cloud hoặc self-host)

Khi Supabase cloud **không bị khóa quota**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

Chạy SQL trong Supabase (SQL Editor) — xem `VERCEL-SETUP.md` (`app_config`, `sp2_port_cache`).

### Cách B — Supabase chạy trên chính máy này (Docker, khuyến nghị nếu cloud bị exceed_egress_quota)

1. Cài [Docker Desktop](https://www.docker.com/products/docker-desktop/).  
2. Self-host Supabase theo tài liệu: https://supabase.com/docs/guides/self-hosting/docker  
3. Lấy URL + `service_role` key của instance local → ghi vào `.env.local` như Cách A.

### Cách C — Chỉ một người / một trình duyệt trên máy này (không Supabase)

**Không** đặt `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

- Tra cứu S2: dán JWT vào Cài đặt, dùng **đồng bộ trên trình duyệt** (không nhập mã cache chung).  
- **Không** có cache chung cho máy khác, không upload TB dùng chung server.

## 3. Chạy app

Mở PowerShell trong thư mục project:

```powershell
cd C:\Users\Admin\Desktop\tracuusp2
npm install
npm run build
npm run start:lan
```

- Trên **chính máy này**: mở trình duyệt → http://localhost:3000  
- **Máy khác cùng Wi‑Fi/LAN**: http://&lt;IP-máy-chủ&gt;:3000  
  - Xem IP: `ipconfig` → IPv4 (ví dụ `192.168.1.10`).

### Windows Firewall

Lần đầu có thể cần cho phép **Node.js** / cổng **3000** (Inbound).

## 4. Chạy nền (tự mở lại khi bật máy) — tùy chọn

Dùng [PM2 for Windows](https://pm2.keymetrics.io/) hoặc Tạo shortcut chạy:

```powershell
npm run start:lan
```

Giữ cửa sổ PowerShell mở hoặc dùng PM2:

```powershell
npm install -g pm2
pm2 start npm --name tracuusp2 -- run start:lan
pm2 save
```

## 5. Lưu ý quan trọng

| Nội dung | Giải thích |
|----------|------------|
| Máy tắt = app tắt | Không ai truy cập được cho đến khi bật lại PC và chạy `start:lan`. |
| Cache chung / máy khác | Cần Supabase (cloud hoặc Docker trên máy này) + mã `ADMIN_PASSWORD` khi đồng bộ. |
| HTTPS | LAN dùng `http://` (không khóa bảo mật như production). |
| OneBSS | Vẫn cần JWT/ mạng ra internet để gọi API VNPT. |

## 6. So sánh nhanh

| | Vercel + Supabase cloud | App trên máy bạn |
|--|-------------------------|------------------|
| Bật 24/7 | Có (nếu trả phí / free tier) | Chỉ khi PC bật |
| Egress Supabase | Có hạn mức | Self-host / local: tự chủ |
| Máy trong LAN dùng chung | Có | Có (cùng IP:3000 + Supabase local/cloud) |
