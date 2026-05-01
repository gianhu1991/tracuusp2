# Ghi chú triển khai (Supabase)

Tài liệu kỹ thuật ngắn cho quản trị: tạo bảng và biến môi trường cần thiết trên môi trường deploy. Không lưu thông tin nhạy cảm trong repo.

## SQL (Supabase — SQL Editor)

```sql
create table if not exists app_config (
  key text primary key,
  value text
);

-- Cache tra cứu S2 theo port (dùng chung)
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

Meta đồng bộ có thể ghi vào `app_config` (key `sp2_sync_meta`), tùy triển khai.

## Biến môi trường (Vercel)

Thêm URL và khóa API Supabase theo **Project Settings → API** của project (Project URL, service role). Các biến bổ sung cho app do quản trị cấu hình trực tiếp trên Vercel, không liệt kê trong file này.

Sau khi cấu hình xong, redeploy project.
