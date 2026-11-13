param(
  [ValidateSet('Start','Stop','Status','ConfigureAccount','EnsureIphone','EnsureRc2')]
  [string]$Mode = 'Start',
  [switch]$TestAccount
)

$ErrorActionPreference = 'Stop'
$base = 'D:\OrionMaps'
$stack = Join-Path $base 'local-stack'
$app = Join-Path $base 'local-app'
$runner = Join-Path $app 'scripts\Run-OrionLocal.ps1'
$webApp = Join-Path $base 'desktop-app-v9'
$webRunner = Join-Path $webApp 'scripts\Run-OrionLocal.ps1'
$statePath = Join-Path $app 'orion-local-processes.json'
$logDir = Join-Path $app 'logs'
$iphoneApp = Join-Path $base 'iphone-app-v10'
$iphoneProxy = Join-Path $base 'iphone-proxy.js'
$iphoneStatePath = Join-Path $iphoneApp 'orion-iphone-processes.json'
$iphoneHost = 'pcmaquinas.tailcc2d93.ts.net:8444'

if ($Mode -eq 'ConfigureAccount') {
  & $runner -Mode ConfigureAccount
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel validar a conta pessoal local.' }
  exit 0
}

function Get-ManagedProcess($entry) {
  if (!$entry) { return $null }
  $process = Get-Process -Id ([int]$entry.pid) -ErrorAction SilentlyContinue
  if (!$process) { return $null }
  $started = try { $process.StartTime } catch { $null }
  if (!$started -or $started.ToUniversalTime().Ticks -ne [long]$entry.start_ticks) { return $null }
  return $process
}

function Read-State {
  if (!(Test-Path -LiteralPath $statePath)) { return $null }
  return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
}

function Test-IphoneHttp([int]$port) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/entrar" -Headers @{ Host = $iphoneHost } -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch { return $false }
}

function Test-Rc2Service {
  $client = $null
  $response = $null
  try {
    Add-Type -AssemblyName System.Net.Http
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(8)
    $null = $client.DefaultRequestHeaders.TryAddWithoutValidation('Origin', 'http://127.0.0.1:3001')
    $response = $client.GetAsync('http://127.0.0.1:48765/health').GetAwaiter().GetResult()
    if ([int]$response.StatusCode -notin @(200,503)) { return $false }
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    return $body.helper -eq 'ready' -and $body.protocolVersion -eq 2
  } catch { return $false }
  finally {
    if ($response) { $response.Dispose() }
    if ($client) { $client.Dispose() }
  }
}

if ($Mode -eq 'EnsureRc2') {
  $rc2Script = Join-Path $base 'rc2-helper\server.py'
  $pythonw = 'C:\Users\jpfer\AppData\Local\Programs\Python\Python313\pythonw.exe'
  if (!(Test-Path -LiteralPath $rc2Script) -or !(Test-Path -LiteralPath $pythonw)) { throw 'Conector RC 2 instalado não encontrado.' }
  $listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 48765 -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    if (Test-Rc2Service) { Write-Host 'Conector RC 2 já ativo em loopback.'; exit 0 }
    throw 'Porta 48765 ocupada por conector antigo ou serviço incompatível. Nenhum processo foi encerrado.'
  }
  $rc2Log = Join-Path $base 'rc2-transfers'
  New-Item -ItemType Directory -Path $rc2Log -Force | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $process = Start-Process -FilePath $pythonw -ArgumentList @($rc2Script) -WorkingDirectory (Split-Path $rc2Script) -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $rc2Log "launcher-$stamp.out.log") `
    -RedirectStandardError (Join-Path $rc2Log "launcher-$stamp.err.log")
  for ($i=0; $i -lt 20 -and !(Test-Rc2Service); $i++) { Start-Sleep -Seconds 1 }
  if (!(Test-Rc2Service)) { throw "Conector RC 2 não respondeu após iniciar PID $($process.Id); confira o log. Nenhum envio foi feito." }
  Write-Host "Conector RC 2 iniciado em loopback, PID $($process.Id)."
  exit 0
}

if ($Mode -eq 'EnsureIphone') {
  if (!(Test-Path -LiteralPath (Join-Path $iphoneApp '.next\BUILD_ID')) -or !(Test-Path -LiteralPath $iphoneProxy)) {
    throw 'Variante HTTPS do iPhone nao encontrada em D:\OrionMaps.'
  }
  $nextReady = Test-IphoneHttp 3002
  $proxyReady = Test-IphoneHttp 18771
  if (!$nextReady -and (Get-NetTCPConnection -State Listen -LocalPort 3002 -ErrorAction SilentlyContinue)) {
    throw 'Porta 3002 ocupada por servico que nao responde como Orion.'
  }
  if (!$proxyReady -and (Get-NetTCPConnection -State Listen -LocalPort 18771 -ErrorAction SilentlyContinue)) {
    throw 'Porta 18771 ocupada por proxy que nao responde como Orion.'
  }
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $iphoneLog = Join-Path $iphoneApp 'logs'
  New-Item -ItemType Directory -Path $iphoneLog -Force | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $nextProc = $null
  $proxyProc = $null
  if (!$nextReady) {
    $nextProc = Start-Process -FilePath $node -ArgumentList @('.\node_modules\next\dist\bin\next','start','-p','3002','-H','127.0.0.1') `
      -WorkingDirectory $iphoneApp -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $iphoneLog "next-$stamp.out.log") `
      -RedirectStandardError (Join-Path $iphoneLog "next-$stamp.err.log")
    for ($i=0; $i -lt 30 -and !(Test-IphoneHttp 3002); $i++) { Start-Sleep -Seconds 1 }
    if (!(Test-IphoneHttp 3002)) { throw 'Variante HTTPS do Orion nao iniciou em 3002.' }
  }
  if (!$proxyReady) {
    $proxyProc = Start-Process -FilePath $node -ArgumentList @($iphoneProxy) `
      -WorkingDirectory $base -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $iphoneLog "proxy-$stamp.out.log") `
      -RedirectStandardError (Join-Path $iphoneLog "proxy-$stamp.err.log")
    for ($i=0; $i -lt 15 -and !(Test-IphoneHttp 18771); $i++) { Start-Sleep -Seconds 1 }
    if (!(Test-IphoneHttp 18771)) { throw 'Proxy HTTPS do Orion nao iniciou em 18771.' }
  }
  if ($nextProc -or $proxyProc) {
    $iphoneState = @{
      started_at = [DateTime]::UtcNow.ToString('o')
      next = if ($nextProc) { @{ pid=$nextProc.Id; start_ticks=$nextProc.StartTime.ToUniversalTime().Ticks } } else { $null }
      proxy = if ($proxyProc) { @{ pid=$proxyProc.Id; start_ticks=$proxyProc.StartTime.ToUniversalTime().Ticks } } else { $null }
    }
    $iphoneState | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $iphoneStatePath -Encoding UTF8
  }
  Write-Host 'iPhone HTTPS: ativo em 127.0.0.1:3002/18771; Serve 8444 permanece separado.'
  exit 0
}

function Active-Jobs {
  Push-Location -LiteralPath $stack
  try {
    $result = docker compose -f docker-compose.yml exec -T db psql -U postgres -d postgres -Atqc "select count(*) from public.processing_jobs where status in ('claimed','processing','derivatives','uploading');"
    if ($LASTEXITCODE -ne 0 -or $result -notmatch '^\d+$') { throw 'Nao foi possivel verificar jobs ativos.' }
    return [int]$result
  } finally { Pop-Location }
}

$state = Read-State
$web = if ($state) { Get-ManagedProcess $state.web } else { $null }
$agent = if ($state) { Get-ManagedProcess $state.agent } else { $null }

if ($Mode -eq 'Status') {
  Write-Host "Web: $(if ($web) { 'ativo' } else { 'parado' })"
  Write-Host "Agent: $(if ($agent) { 'ativo' } else { 'parado' })"
  if ($web -or $agent) { Write-Host "Conta do Agent: $($state.account_mode)" }
  Write-Host 'URL local: http://127.0.0.1:3001/entrar'
  Write-Host "iPhone HTTPS: $(if ((Test-IphoneHttp 3002) -and (Test-IphoneHttp 18771)) { 'ativo' } else { 'parado' })"
  Write-Host "Conector RC 2: $(if (Test-Rc2Service) { 'ativo' } else { 'indisponivel ou incompatível' })"
  exit 0
}

if ($Mode -eq 'Stop') {
  if (!$web -and !$agent) { Write-Host 'Web e Agent ja estao parados.'; exit 0 }
  if ((Active-Jobs) -gt 0) { throw 'Ha processamento local ativo. Aguarde sua conclusao antes de parar Web e Agent.' }
  if (Test-Path -LiteralPath $iphoneStatePath) {
    $iphoneState = Get-Content -LiteralPath $iphoneStatePath -Raw | ConvertFrom-Json
    foreach ($entry in @($iphoneState.proxy,$iphoneState.next)) {
      $managed = Get-ManagedProcess $entry
      if ($managed) { & taskkill.exe /PID $managed.Id /T /F | Out-Null }
    }
  }
  foreach ($process in @($agent, $web)) {
    if ($process) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
  }
  $state | Add-Member -NotePropertyName stopped_at -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
  $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
  Write-Host 'Web e Agent parados. A pilha Docker local permanece ativa.'
  exit 0
}

if ($web -or $agent) { throw 'Ja existe um processo Orion iniciado por este lancador. Use -Mode Status.' }
if (Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue) {
  throw 'A porta 3001 ja esta ocupada. Pare a instancia anterior antes de iniciar outra.'
}
if (!(Test-Path -LiteralPath $runner)) { throw 'Aplicativo local nao encontrado.' }
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Push-Location -LiteralPath $stack
try {
  docker compose -f docker-compose.yml up -d --wait --quiet-pull
  if ($LASTEXITCODE -ne 0) {
    Start-Sleep -Seconds 15
    docker compose -f docker-compose.yml up -d --wait --quiet-pull
  }
  if ($LASTEXITCODE -ne 0) { throw 'Pilha local indisponivel.' }
} finally { Pop-Location }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$shell = (Get-Process -Id $PID).Path
$testArg = if ($TestAccount) { ' -TestAccount' } else { '' }
$webProc = Start-Process -FilePath $shell -ArgumentList "-NoProfile -File `"$webRunner`" -Mode Web -SkipStack$testArg" `
  -WorkingDirectory $webApp -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDir "web-$stamp.out.log") `
  -RedirectStandardError (Join-Path $logDir "web-$stamp.err.log")
$agentProc = Start-Process -FilePath $shell -ArgumentList "-NoProfile -File `"$runner`" -Mode Agent -SkipStack$testArg" `
  -WorkingDirectory $app -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDir "agent-$stamp.out.log") `
  -RedirectStandardError (Join-Path $logDir "agent-$stamp.err.log")

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if (!(Get-Process -Id $webProc.Id -ErrorAction SilentlyContinue) -or
      !(Get-Process -Id $agentProc.Id -ErrorAction SilentlyContinue)) { break }
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/entrar' -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
}
if (!$ready) {
  foreach ($process in @($agentProc, $webProc)) {
    if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
      & taskkill.exe /PID $process.Id /T /F | Out-Null
    }
  }
  throw 'Web ou Agent falhou ao iniciar. Veja os logs em D:\OrionMaps\local-app\logs.'
}

$state = @{
  started_at = [DateTime]::UtcNow.ToString('o')
  account_mode = if ($TestAccount) { 'test' } else { 'personal' }
  web = @{ pid = $webProc.Id; start_ticks = $webProc.StartTime.ToUniversalTime().Ticks }
  agent = @{ pid = $agentProc.Id; start_ticks = $agentProc.StartTime.ToUniversalTime().Ticks }
}
$state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
Write-Host 'Orion Maps local iniciado. Web e Agent rodam em segundo plano.'
Write-Host "Conta do Agent: $($state.account_mode)"
Write-Host 'Abra no proprio Pcmaquinas: http://127.0.0.1:3001/entrar'
Write-Host "Para parar: & '$base\Iniciar-OrionLocal.ps1' -Mode Stop"
& $PSCommandPath -Mode EnsureIphone
try { & $PSCommandPath -Mode EnsureRc2 } catch { Write-Warning "Conector RC 2: $($_.Exception.Message)" }

