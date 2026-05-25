# Chạy trên MÁY CHỦ DATA (máy tính khác) — cài Supabase Docker local
# PowerShell: Set-ExecutionPolicy -Scope Process Bypass; .\scripts\data-server\init-supabase.ps1

$ErrorActionPreference = "Stop"
$DataRoot = if ($env:TRACUU_DATA_ROOT) { $env:TRACUU_DATA_ROOT } else { "C:\tracuusp2-data" }
$SupabaseDir = Join-Path $DataRoot "supabase-docker"
$RepoDir = Join-Path $SupabaseDir "supabase"
$DockerDir = Join-Path $RepoDir "docker"
$SchemaFile = Join-Path $PSScriptRoot "..\..\sql\app-schema.sql"
$SchemaFile = (Resolve-Path $SchemaFile -ErrorAction SilentlyContinue)
if (-not $SchemaFile) {
  $SchemaFile = Join-Path (Get-Location) "sql\app-schema.sql"
}

Write-Host "=== Tra cuu S2 — Supabase local (may chu data) ===" -ForegroundColor Cyan
Write-Host "Thu muc: $DockerDir"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Chua co Docker. Cai Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
  exit 1
}

docker info | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker chua chay. Mo Docker Desktop roi chay lai script." -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null

if (-not (Test-Path $DockerDir)) {
  Write-Host "Clone Supabase docker..."
  New-Item -ItemType Directory -Force -Path $SupabaseDir | Out-Null
  git clone --depth 1 https://github.com/supabase/supabase $RepoDir
}

Push-Location $DockerDir
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Da tao .env tu .env.example"
}

Write-Host "Pull images (lan dau co the lau)..."
docker compose pull
Write-Host "Khoi dong containers..."
docker compose up -d

Write-Host "Cho Postgres san sang (30s)..."
Start-Sleep -Seconds 30

if (Test-Path $SchemaFile) {
  Write-Host "Ap dung schema app (app_config, sp2_port_cache)..."
  Get-Content $SchemaFile -Raw | docker compose exec -T db psql -U postgres -d postgres
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Schema OK." -ForegroundColor Green
  } else {
    Write-Host "Schema co the loi — chay tay trong Studio: http://localhost:54323" -ForegroundColor Yellow
  }
} else {
  Write-Host "Khong tim thay sql/app-schema.sql — chay SQL trong Studio." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Tiep theo ===" -ForegroundColor Cyan
Write-Host "1. Studio: http://localhost:54323"
Write-Host "2. API local: http://localhost:8000"
Write-Host "3. Chay: .\scripts\data-server\print-vercel-env.ps1"
Write-Host "4. Cau hinh Cloudflare Tunnel (init-tunnel.ps1)"
Write-Host "5. Dan env len Vercel → Redeploy → mo https://<app>/api/health-storage"

Pop-Location
