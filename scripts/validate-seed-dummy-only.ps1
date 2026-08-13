$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$seed = Join-Path $root "db/seed.sql"
$migrationDir = Join-Path $root "db/migrations"

if (!(Test-Path $seed)) {
  Write-Error "db/seed.sql not found."
  exit 1
}

if (Get-ChildItem $migrationDir -File -Filter "*seed*.sql" -ErrorAction SilentlyContinue) {
  Write-Error "Seed migration found. Dummy seed must not be in migrations."
  exit 1
}

$content = Get-Content -Raw $seed

$requiredMarkers = @("Demo", "Dummy", "local/staging only")
foreach ($marker in $requiredMarkers) {
  if ($content -notmatch [regex]::Escape($marker)) {
    Write-Error "Seed missing dummy/local marker: $marker"
    exit 1
  }
}

$forbiddenPatterns = @(
  "\bNIK\b",
  "nomor\s+kk",
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
  "lpq_full\.backup",
  "_private_reference"
)

foreach ($pattern in $forbiddenPatterns) {
  if ($content -match $pattern) {
    Write-Error "Forbidden seed content pattern found: $pattern"
    exit 1
  }
}

Write-Host "Seed dummy-only checks passed."
exit 0
