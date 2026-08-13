$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$passed = 0
$failed = 0

function Add-Check([string]$Name, [scriptblock]$Test) {
  try {
    & $Test
    Write-Host "PASS $Name"
    $script:passed++
  } catch {
    Write-Host "FAIL $Name - $($_.Exception.Message)"
    $script:failed++
  }
}

function Read-Text([string]$RelativePath) {
  Get-Content -Raw (Join-Path $root $RelativePath)
}

Add-Check "migration adds optional default SPP with minimum constraint" {
  $migration = Read-Text "db/migrations/20260716000100_santri_default_spp_and_hafalan_curriculum.sql"
  if ($migration -notmatch "default_spp_amount numeric\(12,2\)") { throw "default SPP column missing" }
  if ($migration -notmatch "default_spp_amount >= 10000") { throw "default SPP constraint missing" }
}

Add-Check "official curriculum contains 103 ordered items" {
  $migration = Read-Text "db/migrations/20260716000100_santri_default_spp_and_hafalan_curriculum.sql"
  $rows = [regex]::Matches($migration, "(?m)^\s*\('(Doa|Sholat|Surat)',\s*'[1-6]',\s*\d+,\s*'.*'\),?\s*$")
  if ($rows.Count -ne 103) { throw "expected 103 curriculum rows, found $($rows.Count)" }
  $doa = @($rows | Where-Object { $_.Groups[1].Value -eq "Doa" }).Count
  $sholat = @($rows | Where-Object { $_.Groups[1].Value -eq "Sholat" }).Count
  $surat = @($rows | Where-Object { $_.Groups[1].Value -eq "Surat" }).Count
  if ($doa -ne 44 -or $sholat -ne 33 -or $surat -ne 26) {
    throw "unexpected category totals: Doa=$doa Sholat=$sholat Surat=$surat"
  }
}

Add-Check "santri form persists default SPP through adapter and create function" {
  $component = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  $adapter = Read-Text "src/lib/dataMasterAdapters.js"
  $manageUser = Read-Text "supabase/functions/manage-user/index.ts"
  if ($component -notmatch "Default SPP Bulanan") { throw "form field missing" }
  if ($adapter -notmatch "default_spp_amount: normalizeDefaultSppAmount") { throw "adapter mapping missing" }
  if ($manageUser -notmatch "default_spp_amount: profile.default_spp_amount") { throw "create-user mapping missing" }
}

Add-Check "payment dialog uses an unambiguous shared santri default" {
  $component = Read-Text "src/components/dashboard/admin/PaymentSystem.jsx"
  if ($component -notmatch "getSharedDefaultSppAmount\(selectedSantri\)") { throw "default helper not used" }

  $node = "C:\Program Files\nodejs\node.exe"
  $moduleUrl = (New-Object System.Uri((Join-Path $root "src/lib/paymentAdapters.js"))).AbsoluteUri
  $js = @"
import('$moduleUrl').then(({ getSharedDefaultSppAmount }) => {
  const same = getSharedDefaultSppAmount([{ default_spp_amount: 70000 }, { default_spp_amount: '70000' }]);
  const mixed = getSharedDefaultSppAmount([{ default_spp_amount: 70000 }, { default_spp_amount: 100000 }]);
  const missing = getSharedDefaultSppAmount([{ default_spp_amount: 70000 }, { default_spp_amount: null }]);
  if (same !== 70000 || mixed !== null || missing !== null) process.exit(1);
});
"@
  & $node --input-type=module -e $js
  if ($LASTEXITCODE -ne 0) { throw "shared default helper behavior failed" }
}

Write-Host "SUMMARY passed=$passed failed=$failed"
if ($failed -gt 0) { exit 1 }
exit 0
