# Huong dan nhanh Cloudflare Tunnel (chay tren may chu data)
Write-Host @"

=== Cloudflare Tunnel (may chu data) ===

1. Tai cloudflared Windows:
   https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

2. Dang nhap:
   cloudflared tunnel login

3. Tao tunnel:
   cloudflared tunnel create tracuu-supabase
   (ghi lai TUNNEL_ID)

4. Sua file mau:
   scripts\data-server\cloudflared.config.example.yml
   → copy thanh C:\cloudflared\config.yml

5. Cloudflare DNS → CNAME:
   tracuu-db  →  <TUNNEL_ID>.cfargotunnel.com  (proxy bat)

6. Chay thu:
   cloudflared tunnel run tracuu-supabase

7. Dat bien (PowerShell) roi in env Vercel:
   `$env:TRACUU_PUBLIC_SUPABASE_URL = 'https://tracuu-db.ten-cua-ban.com'
   .\scripts\data-server\print-vercel-env.ps1

8. Cai service Windows (tu chay khi boot):
   cloudflared service install
   (roi cau hinh service tro den config.yml — xem tai lieu Cloudflare)

Kiem tra tu dien thoai 4G: https://tracuu-db.ten-cua-ban.com/rest/v1/

"@ -ForegroundColor Cyan
