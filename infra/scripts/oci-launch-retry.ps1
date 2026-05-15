# Retry-loops `oci compute instance launch` until Oracle's free-tier ARM
# capacity frees up. Cycles through every availability domain in the region;
# on "Out of host capacity" it waits and tries again, indefinitely.
#
# Auto-discovers the AD list, the latest Ubuntu 24.04 ARM image, and the
# public subnet - you only need a working OCI CLI auth (~/.oci/config).
#
# Prereqs:
#   1. OCI CLI installed + ~/.oci/config valid (verify: oci iam region list)
#   2. The VCN created via the wizard (it has a "public subnet-..." subnet)
#
# Run:  powershell -ExecutionPolicy Bypass -File infra\scripts\oci-launch-retry.ps1
# Stop: Ctrl+C  (safe - it only ever creates one instance, then exits)
#
# NOTE: pure ASCII on purpose - PowerShell 5.1 reads non-BOM files as ANSI,
# so any em-dash / box-drawing char breaks the parser.

$ErrorActionPreference = 'Stop'
# The OCI CLI nags about a missing 'OCI_API_KEY' label on the key file -
# do NOT add that label, it breaks request signing. Just silence the nag.
$env:SUPPRESS_LABEL_WARNING = 'True'

# --- Config - change only if your setup differs --------------------------
$DisplayName    = 'schraeglage'
$Shape          = 'VM.Standard.A1.Flex'
$Ocpus          = 4
$MemoryGB       = 24
$BootVolumeGB   = 100
$SubnetNameLike = 'public subnet'   # substring match for the wizard subnet
$SshKeyPath     = "$env:USERPROFILE\.ssh\id_ed25519.pub"
$SleepSeconds   = 90                # wait between full AD-cycle attempts

# --- Resolve the oci binary (winget install not always on a stale PATH) --
$Oci = (Get-Command oci -ErrorAction SilentlyContinue).Source
if (-not $Oci) { $Oci = 'C:\Program Files (x86)\Oracle\oci_cli\oci.exe' }
if (-not (Test-Path $Oci)) { throw 'OCI CLI not found. Install it first.' }

# --- Preflight: config present -------------------------------------------
$cfgPath = "$env:USERPROFILE\.oci\config"
if (-not (Test-Path $cfgPath)) { throw 'No ~/.oci/config. Set up OCI auth first.' }
$cfg = Get-Content $cfgPath -Raw
$tenancy = [regex]::Match($cfg, '(?m)^tenancy\s*=\s*(\S+)').Groups[1].Value
if (-not $tenancy) { throw 'Could not read tenancy OCID from the config.' }
if (-not (Test-Path $SshKeyPath)) { throw "SSH public key not found: $SshKeyPath" }
$sshKey = (Get-Content $SshKeyPath -Raw).Trim()
Write-Host "Auth config OK. Tenancy: $tenancy"

# --- Discover AD list, Ubuntu image, public subnet -----------------------
Write-Host 'Discovering availability domains...'
$ads = (& $Oci iam availability-domain list --compartment-id $tenancy --query 'data[].name' | ConvertFrom-Json)
if (-not $ads) { throw 'No availability domains returned - auth or region issue.' }
Write-Host ('  ' + ($ads -join ', '))

Write-Host 'Discovering latest Ubuntu 24.04 ARM image...'
$imageId = & $Oci compute image list --compartment-id $tenancy `
  --operating-system 'Canonical Ubuntu' --operating-system-version '24.04' `
  --shape $Shape --sort-by TIMECREATED --sort-order DESC `
  --query 'data[0].id' --raw-output
if (-not $imageId) { throw "No Ubuntu 24.04 image found for $Shape." }
Write-Host "  $imageId"

Write-Host 'Discovering public subnet...'
# Filter in PowerShell rather than JMESPath - PS 5.1 strips the double quotes
# needed around the hyphenated "display-name" key when passing to oci.exe.
$subnets = (& $Oci network subnet list --compartment-id $tenancy | ConvertFrom-Json).data
$subnetId = ($subnets | Where-Object { $_.'display-name' -like "*$SubnetNameLike*" } |
             Select-Object -First 1 -ExpandProperty id)
if (-not $subnetId) { throw "No subnet name contains '$SubnetNameLike' - check the VCN wizard ran." }
Write-Host "  $subnetId"

# --- Write JSON params to temp files (sidesteps PS quoting hell) ----------
$shapeFile = Join-Path $env:TEMP 'oci-shape-config.json'
$metaFile  = Join-Path $env:TEMP 'oci-metadata.json'
@{ ocpus = $Ocpus; memoryInGBs = $MemoryGB } | ConvertTo-Json -Compress | Set-Content $shapeFile -Encoding ascii
@{ ssh_authorized_keys = $sshKey }            | ConvertTo-Json -Compress | Set-Content $metaFile  -Encoding ascii
# OCI CLI strips the "file://" prefix and treats the rest as a path, so on
# Windows it must be file://C:/... (two slashes). file:/// leaves a stray
# leading slash -> "/C:/..." -> file not found.
$shapeUri = 'file://' + ($shapeFile -replace '\\', '/')
$metaUri  = 'file://' + ($metaFile  -replace '\\', '/')

# --- Retry loop ----------------------------------------------------------
$logFile = Join-Path $env:TEMP 'oci-launch.log'
$attempt = 0
Write-Host ''
Write-Host "Launching $DisplayName ($Shape $Ocpus OCPU / $MemoryGB GB). Ctrl+C to stop."
Write-Host ''

# Switch to non-terminating errors for the loop - native oci.exe writes
# ServiceError JSON to stderr on capacity errors; with 'Stop' that becomes a
# terminating NativeCommandError before we can capture and branch on it.
$ErrorActionPreference = 'Continue'

while ($true) {
  foreach ($ad in $ads) {
    $attempt++
    $stamp = (Get-Date -Format 'HH:mm:ss')
    Write-Host "[$stamp] attempt $attempt - $ad ... " -NoNewline

    # 2>&1 merges stderr into the output pipeline so we can read both.
    $out = & $Oci compute instance launch `
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
      --wait-for-state RUNNING 2>&1
    $code = $LASTEXITCODE
    $log  = ($out | ForEach-Object { "$_" }) -join "`n"
    Set-Content -Path $logFile -Value $log -Encoding ascii

    if ($code -eq 0) {
      Write-Host 'SUCCESS' -ForegroundColor Green
      try {
        $instanceId = ($log | ConvertFrom-Json).data.id
        Write-Host ''
        Write-Host "Instance RUNNING: $instanceId"
        Write-Host 'Public IP:'
        & $Oci compute instance list-vnics --instance-id $instanceId --query 'data[0].\"public-ip\"' --raw-output
      } catch {
        Write-Host "Couldn't parse instance id from response - check OCI console."
        Write-Host $log
      }
      exit 0
    }
    elseif ($log -match 'Out of host capacity|LimitExceeded|capacity') {
      Write-Host 'no capacity' -ForegroundColor Yellow
    }
    elseif ($log -match 'timed out|Timeout|RequestException|Connection|ServiceUnavailable|InternalServerError|TooManyRequests') {
      # Transient network / service blip - keep retrying.
      Write-Host 'transient error (will retry)' -ForegroundColor Yellow
    }
    else {
      # Looks fatal - but still don't exit; just log and keep trying. Worst
      # case the user sees the same error repeating in the log and stops the
      # script. Better than dying overnight on a one-off glitch.
      Write-Host 'unexpected error (will retry, check log)' -ForegroundColor Red
      Write-Host $log
    }
  }
  Write-Host "  all ADs full - sleeping ${SleepSeconds}s..."
  Write-Host ''
  Start-Sleep -Seconds $SleepSeconds
}
