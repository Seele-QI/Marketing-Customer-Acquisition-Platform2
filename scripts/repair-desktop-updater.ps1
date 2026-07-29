param(
  [Parameter(Mandatory = $false)]
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Stop"
$FeedUrl = "https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/"
$CacheDirName = "cuocuo-ai-updater"
$ProductExeName = (-join ([char[]](0x62DB, 0x8D22, 0x732B))) + ".exe"

function Test-InstallDirectory {
  param([string]$Candidate)

  if ([string]::IsNullOrWhiteSpace($Candidate)) {
    return $null
  }
  try {
    $Resolved = (Resolve-Path -LiteralPath $Candidate -ErrorAction Stop).Path
  } catch {
    return $null
  }

  $Executable = Join-Path $Resolved $ProductExeName
  $Resources = Join-Path $Resolved "resources"
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
    return $null
  }
  if (-not (Test-Path -LiteralPath $Resources -PathType Container)) {
    return $null
  }
  return $Resolved
}

function Get-RegistryInstallLocations {
  $Roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  foreach ($Root in $Roots) {
    Get-ItemProperty -Path $Root -ErrorAction SilentlyContinue |
      ForEach-Object {
        if (-not [string]::IsNullOrWhiteSpace($_.InstallLocation)) {
          $_.InstallLocation
        }
      }
  }
}

try {
  $Candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($InstallDir)) {
    $Candidates += $InstallDir
  } else {
    $Candidates += $PSScriptRoot
    $Candidates += (Get-Location).Path
    $Candidates += Get-RegistryInstallLocations
  }

  $ValidatedInstallDir = $null
  foreach ($Candidate in $Candidates) {
    $ValidatedInstallDir = Test-InstallDirectory -Candidate $Candidate
    if ($null -ne $ValidatedInstallDir) {
      break
    }
  }

  if ($null -eq $ValidatedInstallDir) {
    throw "No valid application directory was found. Pass -InstallDir with the folder containing the application executable and resources directory."
  }

  $ResourcesDir = Join-Path $ValidatedInstallDir "resources"
  $TargetPath = Join-Path $ResourcesDir "app-update.yml"
  $Content = @(
    "provider: generic",
    "url: $FeedUrl",
    "updaterCacheDirName: $CacheDirName",
    ""
  ) -join "`n"

  if (Test-Path -LiteralPath $TargetPath -PathType Leaf) {
    $Existing = [IO.File]::ReadAllText($TargetPath)
    if ($Existing -eq $Content) {
      Write-Output "Updater configuration is already valid: $TargetPath"
      exit 0
    }
    $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $BackupPath = "$TargetPath.bak-$Timestamp"
    Copy-Item -LiteralPath $TargetPath -Destination $BackupPath -Force
    Write-Output "Backed up the previous configuration: $BackupPath"
  }

  $TemporaryPath = Join-Path $ResourcesDir (".app-update.yml." + [Guid]::NewGuid().ToString("N") + ".tmp")
  try {
    [IO.File]::WriteAllText($TemporaryPath, $Content, [Text.UTF8Encoding]::new($false))
    $Written = [IO.File]::ReadAllText($TemporaryPath)
    if ($Written -ne $Content) {
      throw "Generated updater configuration failed verification."
    }
    if (Test-Path -LiteralPath $TargetPath -PathType Leaf) {
      Remove-Item -LiteralPath $TargetPath -Force
    }
    Move-Item -LiteralPath $TemporaryPath -Destination $TargetPath
  } finally {
    if (Test-Path -LiteralPath $TemporaryPath -PathType Leaf) {
      Remove-Item -LiteralPath $TemporaryPath -Force
    }
  }

  Write-Output "Repair completed: $TargetPath"
  Write-Output "Restart the application, then open Settings and check for updates."
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
