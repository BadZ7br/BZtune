# Atualiza o código pela branch atual, sem sobrescrever trabalho não commitado.
# Esta rotina é para o ambiente de desenvolvimento. O futuro desktop terá atualizador próprio.
param([string]$Raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
$ErrorActionPreference = 'Stop'
Set-Location $Raiz
if (!(Test-Path 'doomvault/package.json') -or !(Test-Path 'doomvault-api/app.py')) {throw 'Pasta BZtune inválida.'}
if ((git status --porcelain)) {throw 'Há mudanças locais. Faça commit ou backup antes de atualizar.'}
$branch = (git branch --show-current).Trim()
if (!$branch) {throw 'Nenhuma branch Git ativa.'}
Write-Host "Atualizando branch $branch sem push forçado nem reset..."
git fetch origin
if ($LASTEXITCODE -ne 0) {throw 'Falha no git fetch'}
git merge-base --is-ancestor HEAD "origin/$branch"
if ($LASTEXITCODE -ne 0) {throw 'Sua branch divergiu da remota. Atualização automática bloqueada.'}
git pull --ff-only origin $branch
if ($LASTEXITCODE -ne 0) {throw 'Falha no git pull'}
$api = Join-Path $Raiz 'doomvault-api'
$front = Join-Path $Raiz 'doomvault'
$py = Join-Path $api '.venv\Scripts\python.exe'
if (!(Test-Path $py)) {throw 'Ambiente virtual ausente. Execute scripts/instalar_ambiente_windows.ps1.'}
& $py -m pip install -r (Join-Path $api 'requirements.txt')
if ($LASTEXITCODE -ne 0) {throw 'Falha ao atualizar dependências Python'}
Push-Location $front
try {
  npm ci
  if ($LASTEXITCODE -ne 0) {throw 'npm ci falhou'}
  npm run build
  if ($LASTEXITCODE -ne 0) {throw 'npm run build falhou'}
} finally {Pop-Location}
Write-Host 'Atualização do ambiente de desenvolvimento concluída.'
