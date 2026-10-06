[CmdletBinding()]
param([string]$Root = 'D:\OrionMaps')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Execute no Windows do processador.' }
$Root = [IO.Path]::GetFullPath($Root)
$Name = 'OrionMapsActivityMonitor'
$Bin = Join-Path $Root 'activity-monitor\bin'
$Files = @('orion_activity.py','orion_activity_monitor.py','orion_progress.py','orion_runtime.py')
$Python = ([string](& (Get-Command python -ErrorAction Stop).Source -c 'import sys; print(sys.executable)')).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Python)) { throw 'Python indisponivel.' }
foreach($File in $Files) {
  $Source = Join-Path $PSScriptRoot $File
  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "Arquivo ausente: $File" }
  & $Python -m py_compile $Source
  if ($LASTEXITCODE -ne 0) { throw "Sintaxe invalida: $File" }
}
if (-not (Test-Path -LiteralPath (Join-Path $Root 'agent\orion_agent.py'))) { throw 'Agente Orion existente nao encontrado.' }
$Existing = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
if ($Existing) {
  $Expected = Join-Path $Bin 'orion_activity_monitor.py'
  if (-not ([string]$Existing.Actions.Arguments).Contains($Expected)) { throw 'Tarefa existente nao pertence a este monitor; nada alterado.' }
  Stop-ScheduledTask -TaskName $Name
  Start-Sleep -Seconds 1
}
New-Item -ItemType Directory -Path $Bin -Force | Out-Null
$Backup = Join-Path $Root ('agent-backups\activity-monitor-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path (Join-Path $Bin 'orion_activity_monitor.py')) {
  New-Item -ItemType Directory -Path $Backup -Force | Out-Null
  foreach($File in $Files) { if(Test-Path (Join-Path $Bin $File)) { Copy-Item (Join-Path $Bin $File) (Join-Path $Backup $File) } }
}
foreach($File in $Files) { Copy-Item (Join-Path $PSScriptRoot $File) (Join-Path $Bin $File) -Force }
$PythonW = Join-Path (Split-Path $Python) 'pythonw.exe'
if (-not (Test-Path $PythonW)) { $PythonW = $Python }
$Identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$Action = New-ScheduledTaskAction -Execute $PythonW -Argument ('"' + (Join-Path $Bin 'orion_activity_monitor.py') + '" --root "' + $Root + '"') -WorkingDirectory $Bin
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $Identity
$Principal = New-ScheduledTaskPrincipal -UserId $Identity -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description 'Leitura de atividade do Orion Maps; nao inicia, cancela ou reinicia processamento.' -Force | Out-Null
Start-ScheduledTask -TaskName $Name
Write-Output 'Monitor de atividade iniciado. Agente de processamento e NodeODM nao foram reiniciados.'
