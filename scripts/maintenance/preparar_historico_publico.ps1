# PREPARAÇÃO SEGURA DO HISTÓRICO PÚBLICO DO BZTUNE
# NÃO publica, não apaga branches remotas e NÃO faz push/force-push.
# Execute em um computador com Git e git-filter-repo instalados.
param(
  [string]$Dest = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "BZtune-revisao-historico.git")
)

$ErrorActionPreference = "Stop"
$repo = "https://github.com/BadZ7br/BZtune.git"

if (Test-Path -LiteralPath $Dest) {
  throw "Destino já existe: $Dest. Escolha outra pasta; não sobrescreva uma revisão anterior."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git não encontrado."
}
& git filter-repo --version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Instale git-filter-repo (python -m pip install --user git-filter-repo) e confira: git filter-repo --version."
}

Write-Host "Clonando repositório PRIVADO remoto para revisão isolada..."
& git clone --mirror $repo $Dest
if ($LASTEXITCODE -ne 0) { throw "Falha clonando. Nenhuma referência remota foi alterada." }
if (-not (Test-Path -LiteralPath $Dest)) { throw "Pasta da cópia não encontrada." }

Write-Host "Filtrando apenas a CÓPIA local. Nenhum push será executado."
& git -C $Dest filter-repo --force `
  --path doomvault-api/cover_cache/ `
  --path-regex '(^|/)__pycache__/.*' `
  --path-regex '(^|/)[^/]+\.pyc$' `
  --path BZtune_backups/ `
  --path doomvault-api/doomvault_download_sources.json `
  --path doomvault/src/legacy/ApiAlbums.tsx `
  --path doomvault/src/catalog/coverArt.ts `
  --path doomvault/src/catalog/data.ts `
  --path docs/legacy/DoomVault_LEIA-ME_original.txt `
  --invert-paths
if ($LASTEXITCODE -ne 0) { throw "Falha no filtro; descartar somente esta CÓPIA de revisão." }

$objects = @(& git -C $Dest rev-list --all --objects)
$remnants = @($objects | Where-Object {
  $_ -match ' doomvault-api/cover_cache/' -or
  $_ -match '(^|/)__pycache__/' -or
  $_ -match '\.pyc$' -or
  $_ -match ' BZtune_backups/' -or
  $_ -match ' doomvault-api/doomvault_download_sources\.json$' -or
  $_ -match ' doomvault/src/legacy/ApiAlbums\.tsx$' -or
  $_ -match ' doomvault/src/catalog/(coverArt|data)\.ts$'
})
if ($remnants.Count -gt 0) {
  throw "Verificação incompleta: ainda há $($remnants.Count) caminhos antigos. NÃO publicar."
}

$emails = @(& git -C $Dest log --all --format='%ae%n%ce' | Sort-Object -Unique)
$suspect = @($emails | Where-Object { $_ -and $_ -notmatch '@users\.noreply\.github\.com$' })
Write-Host "Histórico filtrado nesta pasta: $Dest"
Write-Host "Referências presentes:"
& git -C $Dest for-each-ref --format='%(refname:short)' refs/heads refs/tags | Select-Object -First 30
Write-Host "E-mails que exigem revisão antes de publicar (não exibidos): $($suspect.Count)"
Write-Host "Aguardando auditoria de segredos, autoria e testes. NÃO execute git push --force ainda."
