[CmdletBinding()]
param(
  [string]$Root = "D:\OrionMaps",
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._/-]{0,150}$')][string]$Revision = "main"
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
if ($env:OS -ne "Windows_NT") { throw "Execute a atualizacao no Windows do processador Orion Maps." }
$Repository = "gestorsolucoesapp-sketch/orion-maps"
$Headers = @{ "User-Agent" = "OrionMapsAgentUpdater"; "Accept" = "application/vnd.github+json" }
$Api = "https://api.github.com/repos/$Repository"
$Files = @("orion_agent.py", "orion_agent_staged.py", "setup_credentials.py", "requirements.txt", "install_agent.ps1", "update_agent.ps1", "README.md")
$StageDir = Join-Path ([IO.Path]::GetTempPath()) ("OrionMapsUpdate-" + [Guid]::NewGuid().ToString("N"))
function Get-GitBlobHash([string]$FilePath) {
  $Bytes = [IO.File]::ReadAllBytes($FilePath)
  $Prefix = [Text.Encoding]::UTF8.GetBytes("blob $($Bytes.Length)`0")
  $Hasher = [Security.Cryptography.SHA1]::Create()
  try {
    [void]$Hasher.TransformBlock($Prefix, 0, $Prefix.Length, $Prefix, 0)
    [void]$Hasher.TransformFinalBlock($Bytes, 0, $Bytes.Length)
    return ([BitConverter]::ToString($Hasher.Hash)).Replace("-", "").ToLowerInvariant()
  } finally { $Hasher.Dispose() }
}
try {
  $Ref = [Uri]::EscapeDataString($Revision)
  $Commit = Invoke-RestMethod -Uri "$Api/commits/$Ref" -Headers $Headers -TimeoutSec 30
  $CommitSha = [string]$Commit.sha
  if ($CommitSha -notmatch '^[0-9a-f]{40}$') { throw "GitHub nao retornou uma revisao valida." }
  $TreeSha = [string]$Commit.commit.tree.sha
  if ($TreeSha -notmatch '^[0-9a-f]{40}$') { throw "GitHub nao retornou uma arvore valida para essa revisao." }
  Write-Host "Preparando atualizacao da revisao $CommitSha"
  # Resolve once; all bytes and expected blob hashes come from that same commit.
  $Tree = Invoke-RestMethod -Uri "$Api/git/trees/${TreeSha}?recursive=1" -Headers $Headers -TimeoutSec 30
  if ($Tree.truncated) { throw "Arvore de arquivos incompleta; instalacao nao iniciada." }
  New-Item -ItemType Directory -Path $StageDir | Out-Null
  foreach ($Name in $Files) {
    $Entries = @($Tree.tree | Where-Object { $_.path -eq "local-agent/$Name" -and $_.type -eq "blob" -and $_.mode -in @("100644", "100755") })
    if ($Entries.Count -ne 1 -or $Entries[0].size -gt 2097152) { throw "Arquivo ausente ou inesperado: $Name" }
    $Target = Join-Path $StageDir $Name
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/$Repository/$CommitSha/local-agent/$Name" -Headers $Headers -UseBasicParsing -OutFile $Target -TimeoutSec 60
    if ((Get-GitBlobHash $Target) -ne [string]$Entries[0].sha) { throw "Integridade do arquivo nao confirmada: $Name" }
  }
  # Parse without importing or executing the downloaded agent.
  $Check = @'
import ast, pathlib, sys
root = pathlib.Path(sys.argv[1])
for name in ("orion_agent.py", "orion_agent_staged.py", "setup_credentials.py"):
    ast.parse((root / name).read_text(encoding="utf-8-sig"), filename=name)
'@
  $PythonCommand = Get-Command python -ErrorAction Stop
  & $PythonCommand.Source -c $Check $StageDir
  if ($LASTEXITCODE -ne 0) { throw "Pacote recusado: erro de sintaxe Python." }
  foreach ($Name in @("install_agent.ps1", "update_agent.ps1")) {
    $ParseTokens = $null
    $ParseErrors = $null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $StageDir $Name), [ref]$ParseTokens, [ref]$ParseErrors)
    if ($ParseErrors.Count -gt 0) { throw "Erro de sintaxe em $Name : $($ParseErrors[0].Message)" }
  }
  & (Join-Path $StageDir "install_agent.ps1") -Root $Root -UpdateOnly -Revision $CommitSha
} finally {
  # Only the scripts downloaded by this invocation live in this temporary folder.
  if (Test-Path -LiteralPath $StageDir -PathType Container) { Remove-Item -LiteralPath $StageDir -Recurse -Force }
}
