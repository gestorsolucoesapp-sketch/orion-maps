[CmdletBinding()]
param([string]$Destination = 'D:\OrionMaps\rc2-helper')
$ErrorActionPreference = 'Stop'
$Destination = [IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath 'D:\OrionMaps' -PathType Container)) {
  throw 'A pasta D:\OrionMaps não existe neste computador.'
}
$python = (Get-Command python -ErrorAction Stop).Source
$pythonw = Join-Path (Split-Path $python -Parent) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $pythonw -PathType Leaf)) { throw 'Pythonw não encontrado.' }
foreach ($file in @('server.py','mission.py','mtp.ps1')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) { throw "Arquivo ausente: $file" }
}
& $python -m py_compile (Join-Path $PSScriptRoot 'server.py') (Join-Path $PSScriptRoot 'mission.py')
if ($LASTEXITCODE -ne 0) { throw 'O assistente contém erro de sintaxe.' }
$tokens = $null
$errors = $null
[void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'mtp.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw "Erro no script MTP: $($errors[0].Message)" }
$running = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -and
  $_.CommandLine.IndexOf((Join-Path $Destination 'server.py'),[StringComparison]::OrdinalIgnoreCase) -ge 0
})
if ($running.Count) { throw 'O assistente já está em execução. Feche-o antes de atualizar.' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
foreach ($file in @('server.py','mission.py','mtp.ps1')) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $Destination $file) -Force
}
$shell = New-Object -ComObject WScript.Shell
foreach ($path in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Conectar Orion RC2.lnk'),
                    (Join-Path ([Environment]::GetFolderPath('Startup')) 'Conectar Orion RC2.lnk'))) {
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $pythonw
  $shortcut.Arguments = '"' + (Join-Path $Destination 'server.py') + '"'
  $shortcut.WorkingDirectory = $Destination
  $shortcut.Description = 'Conectar Orion Maps ao DJI RC 2 neste computador'
  $shortcut.Save()
}
Start-Process -FilePath $pythonw -ArgumentList ('"' + (Join-Path $Destination 'server.py') + '"') -WorkingDirectory $Destination -WindowStyle Hidden
Start-Sleep -Seconds 2
try {
  $response = Invoke-RestMethod -Uri 'http://127.0.0.1:48765/health' -Headers @{Origin='https://orion-maps.vercel.app'} -TimeoutSec 10
  if ($response.helper -ne 'ready') { throw 'O assistente não respondeu como esperado.' }
  Write-Host "Conectar Orion RC2 instalado: $Destination"
  Write-Host "Controle conectado: $($response.connected)"
  Write-Host 'Atalhos criados na área de trabalho e na inicialização do Windows.'
} catch {
  throw "O assistente foi copiado, mas não respondeu em 127.0.0.1:48765: $($_.Exception.Message)"
}
