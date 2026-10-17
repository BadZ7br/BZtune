$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Set-Location $repo

python -m pip install --disable-pip-version-check -r doomvault-api/requirements.txt pyinstaller waitress pillow
if ($LASTEXITCODE -ne 0) { throw "Falha instalando Python." }
python -m PyInstaller --onefile --noconsole --clean --noconfirm --name bztune-backend --paths doomvault-api --collect-all ytmusicapi --collect-all yt_dlp --collect-all mutagen --collect-all rapidfuzz --collect-all requests --collect-all certifi desktop/backend_entry.py
if ($LASTEXITCODE -ne 0) { throw "Falha no PyInstaller." }

$bin = Join-Path $repo "desktop/src-tauri/binaries"
New-Item $bin -ItemType Directory -Force | Out-Null
$backend = Join-Path $repo "dist/bztune-backend.exe"
if (-not (Test-Path $backend)) { throw "Executável Flask não encontrado." }
Copy-Item $backend (Join-Path $bin "bztune-backend-x86_64-pc-windows-msvc.exe") -Force

$toolsDir = Join-Path $repo "desktop/src-tauri/resources/bin"
New-Item $toolsDir -ItemType Directory -Force | Out-Null
foreach ($name in @("ffmpeg", "ffprobe")) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    choco install ffmpeg -y --no-progress
    $env:PATH = "$env:ProgramData\chocolatey\bin;$env:PATH"
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
  }
  if (-not $cmd) { throw "$name não encontrado." }
  $exe = $cmd.Source
  if ($exe -like "*chocolatey\bin\*") {
    $found = Get-ChildItem (Join-Path $env:ProgramData "chocolatey/lib") -Recurse -Filter "$name.exe" -ErrorAction SilentlyContinue | Where-Object {$_.FullName -match "tools"} | Select-Object -First 1
    if ($found) { $exe = $found.FullName }
  }
  if (-not (Test-Path $exe)) { throw "Arquivo $name inválido." }
  Copy-Item $exe (Join-Path $toolsDir "$name.exe") -Force
}
& (Join-Path $toolsDir "ffmpeg.exe") -version | Select-Object -First 1
& (Join-Path $toolsDir "ffprobe.exe") -version | Select-Object -First 1
python desktop/scripts/make_icons.py
if ($LASTEXITCODE -ne 0) { throw "Falha gerando ícones." }
Write-Output "Preparação Windows concluída."
