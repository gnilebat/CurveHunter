# Retry-loops `oci compute instance launch` until Oracle's free-tier ARM
# capacity frees up. Cycles through every availability domain in your region;
# on "Out of host capacity" it waits and tries again, indefinitely.
#
# Auto-discovers the AD list, the latest Ubuntu 24.04 ARM image, and your
# public subnet — you only need a working OCI CLI auth (`oci setup config`).
#
# Prereqs:
#   1. OCI CLI installed + `oci setup config` done (API key uploaded in console)
#   2. The VCN created via the wizard (it has a "public subnet-..." subnet)
#
# Run:  powershell -ExecutionPolicy Bypass -File infra\scripts\oci-launch-retry.ps1
# Stop: Ctrl+C  (safe — it only ever creates one instance, then exits)

$ErrorActionPreference = 'Stop'

# ── Config — change only if your setup differs ─────────────────────────────
$DisplayName    = 'schraeglage'
$Shape          = 'VM.Standard.A1.Flex'
$Ocpus          = 4
$MemoryGB       = 24
$BootVolumeGB   = 100
$SubnetNameLike = 'public subnet'   # substring match for your wizard subnet
$SshKeyPath     = "$env:USERPROFILE\.ssh\id_ed25519.pub"
$SleepSeconds   = 90                # wait between full AD-cycle attempts

# ── Preflight: OCI CLI present + authenticated ─────────────────────────────
if (-not (Get-Command oci -ErrorAction SilentlyContinue)) {
  throw "OCI CLI not found. Install it first (see the deploy notes)."
}
$cfgPath = "$env:USERPROFILE\.oci\config"
if (-not (Test-Path $cfgPath)) {
  throw "No ~/.oci/config — run 'oci setup config' first."
}
$cfg = Get-Content $cfgPath -Raw
$tenancy = [regex]::Match($cfg, '(?m)^tenancy\s*=\s*(\S+)').Groups[1].Value
if (-not $tenancy) { throw "Couldn't read tenancy OCID from $cfgPath." }
Write-Host "Auth OK. Tenancy: $tenancy"

if (-not (Test-Path $SshKeyPath)) { throw "SSH public key not found: $SshKeyPath" }
$sshKey = (Get-Content $SshKeyPath -Raw).Trim()

# ── Discover AD list, Ubuntu image, public subnet ──────────────────────────
Write-Host "Discovering availability domains..."
$ads = (oci iam availability-domain list --compartment-id $tenancy --query 'data[].name' | ConvertFrom-Json)
if (-not $ads) { throw "No availability domains returned — auth or region issue." }
Write-Host ("  " + ($ads -join ', '))

Write-Host "Discovering latest Ubuntu 24.04 ARM image..."
$imageId = oci compute image list --compartment-id $tenancy `
  --operating-system 'Canonical Ubuntu' --operating-system-version '24.04' `
  --shape $Shape --sort-by TIMECREATED --sort-order DESC `
  --query 'data[0].id' --raw-output
if (-not $imageId) { throw "No Ubuntu 24.04 image found for $Shape." }
Write-Host "  $imageId"

Write-Host "Discovering public subnet..."
$subnetId = oci network subnet list --compartment-id $tenancy `
  --query ('data[?contains("display-name", ''' + $SubnetNameLike + ''')].id | [0]') `
  --raw-output
if (-not $subnetId) { throw "No subnet whose name contains '$SubnetNameLike' — check the VCN wizard ran." }
Write-Host "  $subnetId"

# ── Write the JSON params to temp files (sidesteps PS quoting hell) ─────────
$shapeFile = Join-Path $env:TEMP 'oci-shape-config.json'
$metaFile  = Join-Path $env:TEMP 'oci-metadata.json'
@{ ocpus = $Ocpus; memoryInGBs = $MemoryGB } | ConvertTo-Json -Compress | Set-Content $shapeFile -Encoding ascii
@{ ssh_authorized_keys = $sshKey }            | ConvertTo-Json -Compress | Set-Content $metaFile  -Encoding ascii
$shapeUri = 'file:///' + ($shapeFile -replace '\\', '/')
$metaUri  = 'file:///' + ($metaFile  -replace '\\', '/')

# ── Retry loop ─────────────────────────────────────────────────────────────
$logFile = Join-Path $env:TEMP 'oci-launch.log'
$attempt = 0
Write-Host "`nLaunching $DisplayName ($Shape $Ocpus OCPU / $MemoryGB GB). Ctrl+C to stop.`n"

while ($true) {
  foreach ($ad in $ads) {
    $attempt++
    $stamp = (Get-Date -Format 'HH:mm:ss')
    Write-Host "[$stamp] attempt $attempt — $ad ... " -NoNewline

    oci compute instance launch `
      --availability-domain $ad `
      --compartment-id $tenancy `
      --shape $Shape `
      --shape-config $shapeUri `
      --image-id $imageId `
      --subnet-id $subnetId `
      --assign-public-ip true `
      --display-name $DisplayName `
      --boot-volume-size-in-gbs $BootVolumeGB `
      --metadata $metaUri `
      --wait-for-state RUNNING *> $logFile
    $code = $LASTEXITCODE
    $log  = Get-Content $logFile -Raw

    if ($code -eq 0) {
      Write-Host "SUCCESS" -ForegroundColor Green
      Write-Host "`nInstance is RUNNING. Public IP:"
      oci compute instance list-vnics --instance-id (
        (Get-Content $logFile -Raw | ConvertFrom-Json).data.id
      ) --query 'data[0]."public-ip"' --raw-output
      exit 0
    }
    elseif ($log -match 'Out of host capacity|LimitExceeded|capacity') {
      Write-Host "no capacity" -ForegroundColor Yellow
    }
    else {
      # A real error (bad config, auth, quota) — retrying won't fix it.
      Write-Host "ERROR" -ForegroundColor Red
      Write-Host $log
      exit 1
    }
  }
  Write-Host "  all ADs full — sleeping ${SleepSeconds}s...`n"
  Start-Sleep -Seconds $SleepSeconds
}
