# Configura dependências do projeto; não instala programas do sistema nem modifica PATH.
param([string]$Raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
$ErrorActionPreference = 'Stop'
Set-Location $Raiz
foreach ($executavel in @('python','node','npm','ffmpeg','ffprobe')) {
    if (-not (Get-Command $executavel -ErrorAction SilentlyContinue)) {
        Write-Warning "Não encontrado: $executavel. Consulte o README antes de continuar."
    }
}
$api = Join-Path $Raiz 'doomvault-api'
$frontend = Join-Path $Raiz 'doomvault'
if (!(Test-Path (Join-Path $api 'app.py')) -or !(Test-Path (Join-Path $frontend 'package.json'))) { throw 'Pasta incorreta' }
python -m venv (Join-Path $api '.venv')
& (Join-Path $api '.venv\Scripts\python.exe') -m pip install -r (Join-Path $api 'requirements.txt')
Push-Location $frontend
try { npm ci; npm run build } finally { Pop-Location }
Write-Host 'Dependências instaladas e compilação concluída.'
