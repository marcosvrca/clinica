# Backup Postgres da clínica (Windows / PowerShell)
# Uso: .\scripts\backup-db.ps1
# Requer pg_dump no PATH (PostgreSQL client tools).

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl -and (Test-Path ".env")) {
  $line = Get-Content ".env" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if ($line) {
    $databaseUrl = ($line -replace '^DATABASE_URL=', '').Trim('"')
  }
}
if (-not $databaseUrl) {
  throw "DATABASE_URL não definida"
}

$outDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $Root "backups" }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$outFile = Join-Path $outDir "clinica-$stamp.sql"

Write-Host "Backup → $outFile"
& pg_dump --no-owner --no-acl $databaseUrl -f $outFile
Write-Host "OK ($((Get-Item $outFile).Length) bytes)"

Get-ChildItem $outDir -Filter "clinica-*.sql*" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 14 |
  Remove-Item -Force -ErrorAction SilentlyContinue
