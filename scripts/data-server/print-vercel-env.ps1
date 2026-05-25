# In ra gia tri can dan len Vercel (chay tren may chu data sau init-supabase.ps1)
$DataRoot = if ($env:TRACUU_DATA_ROOT) { $env:TRACUU_DATA_ROOT } else { "C:\tracuusp2-data" }
$EnvFile = Join-Path $DataRoot "supabase-docker\supabase\docker\.env"

if (-not (Test-Path $EnvFile)) {
  Write-Host "Khong tim thay $EnvFile — chay init-supabase.ps1 truoc." -ForegroundColor Red
  exit 1
}

$serviceRole = ""
$anon = ""
Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*SERVICE_ROLE_KEY=(.+)$') { $serviceRole = $matches[1].Trim() }
  if ($_ -match '^\s*ANON_KEY=(.+)$') { $anon = $matches[1].Trim() }
}

$tunnelUrl = $env:TRACUU_PUBLIC_SUPABASE_URL
if (-not $tunnelUrl) {
  $tunnelUrl = "https://tracuu-db.TEN-DOMAIN-CUA-BAN.com"
}

Write-Host ""
Write-Host "=== Dan len Vercel (Settings → Environment Variables) ===" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT_PUBLIC_SUPABASE_URL=$tunnelUrl"
Write-Host "SUPABASE_SERVICE_ROLE_KEY=$serviceRole"
Write-Host ""
Write-Host "(ANON_KEY chi tham khao, app dung SERVICE_ROLE_KEY tren server)"
Write-Host "ANON_KEY=$anon"
Write-Host ""
Write-Host "Giu ADMIN_PASSWORD va UNLOCK_PASSWORD nhu cu."
Write-Host "XOA URL Supabase cloud cu (xxx.supabase.co)."
Write-Host "Sau do Redeploy → kiem tra: $tunnelUrl/../api/health-storage tren domain Vercel"
Write-Host "  (dung: https://<ten-app-vercel>.vercel.app/api/health-storage)"
Write-Host ""
