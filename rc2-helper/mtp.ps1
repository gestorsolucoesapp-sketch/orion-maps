param(
  [ValidateSet('status','backup','replace')][string]$Operation,
  [string]$Directory = '',
  [string]$Source = '',
  [string]$ExpectedHash = '',
  [string]$MissionId = 'F42D349D-2919-4FE5-9AEB-0A19D759B018'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Get-Child($folder, [string]$name) {
  return @($folder.Items()) | Where-Object Name -eq $name | Select-Object -First 1
}
function Get-MissionFolder {
  $shell = New-Object -ComObject Shell.Application
  $folder = $shell.NameSpace(17)
  foreach ($segment in @('DJI RC 2','Armazen. interno partilhado','Android','data','dji.go.v5','files','waypoint',$MissionId)) {
    $item = Get-Child $folder $segment
    if (-not $item) { throw "RC 2 ou pasta da missão não encontrada: $segment" }
    $folder = $item.GetFolder
  }
  return @{ Shell = $shell; Folder = $folder }
}
function Wait-File([string]$path) {
  for ($i=0; $i -lt 80; $i++) {
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      $size = (Get-Item -LiteralPath $path).Length
      Start-Sleep -Milliseconds 250
      if ((Get-Item -LiteralPath $path).Length -eq $size -and $size -gt 0) { return }
    } else { Start-Sleep -Milliseconds 250 }
  }
  throw "Cópia do RC 2 não concluída: $path"
}
function Copy-FromDevice($shell, $item, [string]$destination, [string]$name) {
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  $shell.NameSpace($destination).CopyHere($item,16)
  $path = Join-Path $destination ($name + '.kmz')
  Wait-File $path
  return $path
}

try {
  $context = Get-MissionFolder
  $shell = $context.Shell
  $folder = $context.Folder
  $current = Get-Child $folder $MissionId
  if ($Operation -eq 'status') {
    @{ connected = [bool]$current; mission_id = $MissionId } | ConvertTo-Json -Compress
    exit 0
  }
  if (-not $current) { throw 'O arquivo da missão de referência não está no RC 2.' }
  if (-not $Directory) { throw 'Diretório de trabalho ausente.' }
  $Directory = [IO.Path]::GetFullPath($Directory)
  New-Item -ItemType Directory -Path $Directory -Force | Out-Null
  if ($Operation -eq 'backup') {
    $backup = Copy-FromDevice $shell $current (Join-Path $Directory 'original') $MissionId
    @{ backup = $backup; sha256 = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant() } | ConvertTo-Json -Compress
    exit 0
  }

  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw 'KMZ preparado não encontrado.' }
  if ([IO.Path]::GetFileName($Source) -ne "$MissionId.kmz") { throw 'Nome do KMZ preparado incorreto.' }
  if ($ExpectedHash -notmatch '^[a-fA-F0-9]{64}$') { throw 'Hash esperado inválido.' }
  $preflight = Copy-FromDevice $shell $current (Join-Path $Directory 'preflight') $MissionId
  if ((Get-FileHash -LiteralPath $preflight -Algorithm SHA256).Hash -ne $ExpectedHash) {
    throw 'A missão no RC 2 mudou desde o backup. Feche o DJI Fly e tente novamente.'
  }
  $newHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
  $oldName = $MissionId + '_backup_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
  $renamed = $false
  try {
    $current.Name = $oldName
    Start-Sleep -Milliseconds 500
    if ((Get-Child $folder $MissionId) -or -not (Get-Child $folder $oldName)) { throw 'Não foi possível reservar o nome da missão.' }
    $renamed = $true
    $folder.CopyHere($Source,16)
    $candidate = $null
    for ($i=0; $i -lt 80; $i++) {
      $candidate = Get-Child $folder $MissionId
      if ($candidate) { break }
      Start-Sleep -Milliseconds 250
    }
    if (-not $candidate) { throw 'O novo KMZ não apareceu no RC 2.' }
    $readback = Copy-FromDevice $shell $candidate (Join-Path $Directory 'readback') $MissionId
    if ((Get-FileHash -LiteralPath $readback -Algorithm SHA256).Hash -ne $newHash) {
      throw 'A leitura de volta do RC 2 não coincide com o KMZ preparado.'
    }
  } catch {
    $failure = $_.Exception.Message
    if ($renamed) {
      $candidate = Get-Child $folder $MissionId
      if ($candidate) {
        $failedName = $MissionId + '_failed_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
        $candidate.Name = $failedName
        Start-Sleep -Milliseconds 300
        $failed = Get-Child $folder $failedName
        if ($failed) { $shell.NameSpace($Directory).MoveHere($failed,16) }
      }
      $old = Get-Child $folder $oldName
      if ($old) { $old.Name = $MissionId; Start-Sleep -Milliseconds 500 }
      if (-not (Get-Child $folder $MissionId)) { throw "Falha no envio e na restauração automática: $failure" }
    }
    throw $failure
  }
  $old = Get-Child $folder $oldName
  if ($old) {
    $archive = Join-Path $Directory 'previous'
    New-Item -ItemType Directory -Path $archive -Force | Out-Null
    $shell.NameSpace($archive).MoveHere($old,16)
    Start-Sleep -Milliseconds 500
  }
  @{ status = 'done'; sha256 = $newHash.ToLowerInvariant(); readback = $readback;
     previous_removed = -not [bool](Get-Child $folder $oldName) } | ConvertTo-Json -Compress
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
