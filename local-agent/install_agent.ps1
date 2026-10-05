param(
  [string]$Root = "D:\OrionMaps"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================"
Write-Host " ORION MAPS - INSTALADOR DO AGENTE LOCAL"
Write-Host "============================================"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python não encontrado no PATH."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker não encontrado no PATH."
}

$AgentDir = Join-Path $Root "agent"
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "jobs") | Out-Null

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item (Join-Path $ScriptDir "orion_agent.py") $AgentDir -Force
Copy-Item (Join-Path $ScriptDir "setup_credentials.py") $AgentDir -Force
Copy-Item (Join-Path $ScriptDir "requirements.txt") $AgentDir -Force

python -m pip install -r (Join-Path $AgentDir "requirements.txt")

Write-Host ""
Write-Host "Configurando credenciais..."
python (Join-Path $AgentDir "setup_credentials.py")

Write-Host ""
Write-Host "Configurando NodeODM para reiniciar automaticamente..."
try {
  docker update --restart unless-stopped orion-nodeodm | Out-Null
} catch {
  Write-Warning "Não foi possível alterar a política de reinício do container agora."
}

$Python = (Get-Command python).Source
$Pythonw = Join-Path (Split-Path $Python -Parent) "pythonw.exe"
if (-not (Test-Path $Pythonw)) {
  $Pythonw = $Python
}

$TaskName = "OrionMapsAgent"
$AgentScript = Join-Path $AgentDir "orion_agent.py"
$Argument = '"' + $AgentScript + '"'
$Action = New-ScheduledTaskAction -Execute $Pythonw -Argument $Argument
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

try {
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Orion Maps - processador local automático" -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "Agente instalado e iniciado pelo Agendador de Tarefas."
} catch {
  Write-Warning "Não foi possível registrar a tarefa automaticamente."
  Write-Host "Você ainda pode iniciar com:"
  Write-Host "python $AgentScript"
}

Write-Host ""
Write-Host "Instalação concluída."
Write-Host "Logs: $Root\logs\agent.log"
Write-Host "Tarefa: $TaskName"
