param(
  [string]$Target = "local"
)

$ErrorActionPreference = "Stop"

if ($Target -match "prod|production") {
  Write-Error "Refusing production target for Phase 3B-1 local source checks."
  exit 1
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$docsAndScripts = @("db", "scripts") | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ }
$unsafe = @()

foreach ($path in $docsAndScripts) {
  $files = Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue
  $matches = $files | Select-String -Pattern "supabase\s+db\s+reset.*production|production.*supabase\s+db\s+reset" -ErrorAction SilentlyContinue
  if ($matches) { $unsafe += $matches }
}

if ($unsafe.Count -gt 0) {
  $unsafe | ForEach-Object { Write-Error "Unsafe production seed/reset reference: $($_.Path):$($_.LineNumber)" }
  exit 1
}

Write-Host "Production guard checks passed for target '$Target'."
exit 0
