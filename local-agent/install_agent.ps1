[CmdletBinding()]
param(
  [string]$Root = "D:\OrionMaps",
  [switch]$UpdateOnly,
  [ValidatePattern('^$|^[0-9a-fA-F]{40}$')][string]$Revision = ""
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw "Execute este instalador no Windows do processador Orion Maps." }
$Root = [IO.Path]::GetFullPath($Root)
$AgentDir = Join-Path $Root "agent"
$ScriptDir = $PSScriptRoot
$TaskName = "OrionMapsAgent"
$TaskPath = "\"
$MaintenancePath = Join-Path $AgentDir "maintenance.json"
$Files = @("orion_agent.py", "orion_agent_staged.py", "orion_progress.py", "orion_runtime.py", "setup_credentials.py", "requirements.txt", "install_agent.ps1", "update_agent.ps1", "README.md")
$InstalledFiles = $Files + @("run_agent.py", "installed_revision.txt")
$Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ([IO.Path]::GetFullPath($ScriptDir).TrimEnd('\') -eq $AgentDir.TrimEnd('\')) {
  throw "Use update_agent.ps1; o instalador precisa de uma pasta de origem separada."
}
foreach ($Name in $Files) {
  if (-not (Test-Path -LiteralPath (Join-Path $ScriptDir $Name) -PathType Leaf)) { throw "Arquivo ausente: $Name" }
}
$PythonCommand = Get-Command python -ErrorAction Stop
$PythonOutput = @(& $PythonCommand.Source -c "import sys; print(sys.executable)")
if ($LASTEXITCODE -ne 0 -or $PythonOutput.Count -ne 1) { throw "Python indisponivel nesta conta Windows." }
$Python = ([string]$PythonOutput[0]).Trim()
$SyntaxFiles = @("orion_agent.py", "orion_agent_staged.py", "setup_credentials.py")
foreach ($SyntaxName in $SyntaxFiles) {
  & $Python -m py_compile (Join-Path $ScriptDir $SyntaxName)
  if ($LASTEXITCODE -ne 0) { throw "Pacote recusado: erro de sintaxe Python em $SyntaxName." }
}
foreach ($Name in @("install_agent.ps1", "update_agent.ps1")) {
  $ParseTokens = $null
  $ParseErrors = $null
  [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $ScriptDir $Name), [ref]$ParseTokens, [ref]$ParseErrors)
  if ($ParseErrors.Count -gt 0) { throw "Erro de sintaxe em $Name : $($ParseErrors[0].Message)" }
}

function Get-OrionProcesses {
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^(pythonw?|py)\.exe$' -and
    $_.CommandLine -match '(?i)(orion_agent(?:_staged)?|run_agent)\.py(?:["\s]|$)'
  })
}
function Assert-NoManualWorker {
  $Agents = @(Get-OrionProcesses)
  if ($Agents.Count -eq 0) { return }
  $Scheduler = New-Object -ComObject "Schedule.Service"
  $Scheduler.Connect()
  $Running = @($Scheduler.GetRunningTasks(1) | Where-Object { $_.Path -eq "$TaskPath$TaskName" })
  $EngineIds = @($Running | ForEach-Object { [int]$_.EnginePID })
  $Processes = @{}
  foreach ($Process in @(Get-CimInstance Win32_Process)) { $Processes[[int]$Process.ProcessId] = $Process }
  foreach ($AgentProcess in $Agents) {
    $AncestorId = [int]$AgentProcess.ProcessId
    $Scheduled = $false
    for ($Depth = 0; $Depth -lt 64 -and $AncestorId -gt 0; $Depth++) {
      if ($EngineIds -contains $AncestorId) { $Scheduled = $true; break }
      if (-not $Processes.ContainsKey($AncestorId)) { break }
      $Child = $Processes[$AncestorId]
      $ParentId = [int]$Child.ParentProcessId
      if ($Processes.ContainsKey($ParentId) -and $Processes[$ParentId].CreationDate -gt $Child.CreationDate) { break }
      $AncestorId = $ParentId
    }
    if (-not $Scheduled) {
      throw "Agente manual ou nao atribuivel a OrionMapsAgent detectado (PID $($AgentProcess.ProcessId)). Encerre esse agente quando estiver ocioso e tente novamente. Nenhum processo foi encerrado."
    }
  }
}
function Assert-Idle {
  # Read-only checks: no claim, requeue, cancellation, or Docker mutation.
  $Check = @'
import ast, os, pathlib, sys
try:
    import keyring, requests
    from supabase import create_client
    config = {}
    tree = ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    for item in tree.body:
        if isinstance(item, ast.Assign):
            for target in item.targets:
                if isinstance(target, ast.Name) and target.id in ("SERVICE", "SUPABASE_URL", "SUPABASE_KEY"):
                    config[target.id] = ast.literal_eval(item.value)
    email = keyring.get_password(config["SERVICE"], "account")
    password = keyring.get_password(config["SERVICE"], email) if email else None
    if not email or not password:
        raise RuntimeError("Credenciais existentes nao encontradas nesta conta Windows. A atualizacao nao pede nem substitui a senha.")
    client = create_client(config["SUPABASE_URL"], config["SUPABASE_KEY"])
    auth = client.auth.sign_in_with_password({"email": email, "password": password})
    if not auth.user:
        raise RuntimeError("Nao foi possivel validar a conta existente.")
    statuses = ["queued", "claimed", "downloading", "validating", "processing", "derivatives", "uploading"]
    jobs = client.table("processing_jobs").select("id,status").eq("owner_id", auth.user.id).in_("status", statuses).limit(1).execute().data or []
    if jobs:
        raise RuntimeError("Manutencao adiada: tarefa " + str(jobs[0]["id"]) + " em estado " + str(jobs[0]["status"]) + ". Aguarde a conclusao e confirme que o motor esta ocioso antes de tentar novamente.")
    node = os.environ.get("ORION_NODEODM_URL", "http://127.0.0.1:3000").rstrip("/")
    response = requests.get(node + "/info", timeout=15)
    response.raise_for_status()
    info = response.json()
    count = info.get("taskQueueCount") if isinstance(info, dict) and not info.get("error") else None
    if type(count) is not int or count < 0:
        raise RuntimeError("NodeODM nao retornou um estado valido; manutencao adiada.")
    if count:
        raise RuntimeError("NodeODM tem tarefa ativa ou na fila; manutencao adiada sem interromper o motor.")
except RuntimeError as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(2)
except Exception as exc:
    print("Nao foi possivel confirmar que o processador esta ocioso (" + type(exc).__name__ + "). Nenhuma tarefa sera criada ou cancelada.", file=sys.stderr)
    sys.exit(2)
'@
  $CheckPath = Join-Path ([IO.Path]::GetTempPath()) ("orion-idle-" + [Guid]::NewGuid().ToString("N") + ".py")
  try {
    [IO.File]::WriteAllText($CheckPath, $Check, [Text.UTF8Encoding]::new($false))
    & $Python $CheckPath (Join-Path $ScriptDir "orion_agent.py")
    if ($LASTEXITCODE -ne 0) { throw "Manutencao recusada. Nenhum script sera substituido." }
  } finally {
    if (Test-Path -LiteralPath $CheckPath) { Remove-Item -LiteralPath $CheckPath -Force }
  }
}

$ExistingTask = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue
if ($UpdateOnly -and -not (Test-Path -LiteralPath (Join-Path $AgentDir "orion_agent.py") -PathType Leaf)) {
  throw "Instalacao existente nao encontrada em $AgentDir."
}
if (-not $UpdateOnly -and ($ExistingTask -or (Test-Path -LiteralPath (Join-Path $AgentDir "orion_agent.py")))) {
  throw "Ja existe uma instalacao. Use update_agent.ps1 ou install_agent.ps1 -UpdateOnly."
}
if ($ExistingTask) {
  $TaskUser = [string]$ExistingTask.Principal.UserId
  $TaskSid = if ($TaskUser -match '^S-1-') { $TaskUser } else {
    ([Security.Principal.NTAccount]::new($TaskUser)).Translate([Security.Principal.SecurityIdentifier]).Value
  }
  if ($TaskSid -ne $Identity.User.Value) { throw "Use a mesma conta Windows da tarefa OrionMapsAgent." }
  if (@($ExistingTask.Actions).Count -ne 1 -or $ExistingTask.Actions[0].Arguments -notmatch '(orion_agent(?:_staged)?|run_agent)\.py' -or
      ([string]$ExistingTask.Actions[0].Arguments).IndexOf($AgentDir, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "OrionMapsAgent usa uma acao desconhecida e nao sera modificada."
  }
}
Assert-NoManualWorker
if ($UpdateOnly) {
  & $Python -c "import keyring, requests, supabase, PIL"
  if ($LASTEXITCODE -ne 0) { throw "Dependencias Python indisponiveis. Scripts existentes preservados." }
} else {
  & $Python -m pip install -r (Join-Path $ScriptDir "requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar dependencias Python." }
  & $Python (Join-Path $ScriptDir "setup_credentials.py")
  if ($LASTEXITCODE -ne 0) { throw "Configuracao inicial das credenciais nao concluida." }
}
Assert-Idle

$OwnMarker = $false
$ScriptsChanged = $false
$TaskChanged = $false
$BackupDir = $null
$OriginalFiles = @()
$WasDisabled = $ExistingTask -and ([string]$ExistingTask.State -eq "Disabled")
try {
  New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
  $Marker = [IO.File]::Open($MaintenancePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
  $OwnMarker = $true
  try {
    $MarkerBytes = [Text.Encoding]::UTF8.GetBytes('{"reason":"agent-update"}')
    $Marker.Write($MarkerBytes, 0, $MarkerBytes.Length)
  } finally { $Marker.Dispose() }
  Assert-NoManualWorker
  Assert-Idle
  if ($ExistingTask -and [string]$ExistingTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath
    $Deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
      Start-Sleep -Milliseconds 250
      $TaskState = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath
      if ([string]$TaskState.State -ne "Running") { break }
    } while ([DateTime]::UtcNow -lt $Deadline)
    if ([string]$TaskState.State -eq "Running") { throw "OrionMapsAgent nao parou; scripts preservados." }
  }
  if (@(Get-OrionProcesses).Count -gt 0) { throw "Ainda existe um agente em execucao; scripts preservados." }
  Assert-Idle
  $BackupDir = Join-Path (Join-Path $Root "agent-backups") ((Get-Date -Format "yyyyMMdd-HHmmss") + "-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  foreach ($Name in $InstalledFiles) {
    $OldFile = Join-Path $AgentDir $Name
    if (Test-Path -LiteralPath $OldFile -PathType Leaf) {
      Copy-Item -LiteralPath $OldFile -Destination (Join-Path $BackupDir $Name)
      $OriginalFiles += $Name
    }
  }
  $ScriptsChanged = $true
  foreach ($Name in $Files) { Copy-Item -LiteralPath (Join-Path $ScriptDir $Name) -Destination (Join-Path $AgentDir $Name) -Force }
  $RootLiteral = ConvertTo-Json -InputObject $Root -Compress
  $Launcher = "import os`n" + "os.environ['ORION_ROOT'] = $RootLiteral`n" + "from orion_agent import main`n" + "if __name__ == '__main__':`n    main()`n"
  [IO.File]::WriteAllText((Join-Path $AgentDir "run_agent.py"), $Launcher, [Text.UTF8Encoding]::new($false))
  $RevisionLabel = if ($Revision) { $Revision.ToLowerInvariant() } else { "pacote-local-sem-revisao-Git" }
  [IO.File]::WriteAllText((Join-Path $AgentDir "installed_revision.txt"), $RevisionLabel, [Text.UTF8Encoding]::new($false))
  $Pythonw = Join-Path (Split-Path $Python -Parent) "pythonw.exe"
  if (-not (Test-Path -LiteralPath $Pythonw -PathType Leaf)) { $Pythonw = $Python }
  $AgentScript = Join-Path $AgentDir "run_agent.py"
  $Action = New-ScheduledTaskAction -Execute $Pythonw -Argument ('"' + $AgentScript + '"') -WorkingDirectory $AgentDir
  if ($ExistingTask) {
    Set-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Action $Action | Out-Null
  } else {
    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $Identity.Name
    $Principal = New-ScheduledTaskPrincipal -UserId $Identity.Name -LogonType Interactive -RunLevel Limited
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description "Orion Maps - processador local" | Out-Null
  }
  $TaskChanged = $true
  Remove-Item -LiteralPath $MaintenancePath -Force
  $OwnMarker = $false
  if (-not $WasDisabled) { Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath }
  Write-Host "Scripts instalados em $AgentDir"
  Write-Host "Backup dos scripts anteriores: $BackupDir"
  if ($Revision) { Write-Host "Revisao: $Revision" }
  if ($WasDisabled) { Write-Host "OrionMapsAgent continua desativada, conforme a configuracao anterior." }
  else { Write-Host "Inicio de OrionMapsAgent solicitado. Confirme o processador online no app." }
} catch {
  $Failure = $_
  if ($ScriptsChanged) {
    foreach ($Name in $InstalledFiles) {
      $Target = Join-Path $AgentDir $Name
      if ($OriginalFiles -contains $Name) { Copy-Item -LiteralPath (Join-Path $BackupDir $Name) -Destination $Target -Force }
      elseif (Test-Path -LiteralPath $Target -PathType Leaf) { Remove-Item -LiteralPath $Target -Force }
    }
  }
  if ($TaskChanged) {
    if ($ExistingTask) { Set-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Action $ExistingTask.Actions | Out-Null }
    else { Unregister-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Confirm:$false }
  }
  Write-Warning "Manutencao nao concluida. Se a tarefa foi parada, permanece parada. NodeODM e dados nao foram alterados."
  throw $Failure
} finally {
  if ($OwnMarker) { Remove-Item -LiteralPath $MaintenancePath -Force }
}
