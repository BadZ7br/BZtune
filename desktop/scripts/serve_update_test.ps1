# Servidor HTTP somente em 127.0.0.1 para os testes assinados RC1->RC2 e RC3->RC4.
# Sem pacotes externos, privilegio de administrador ou publicacao.
param()

$ErrorActionPreference = "Stop"
$serverDir = Join-Path $PSScriptRoot "update-server"
$manifestPath = Join-Path $serverDir "latest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Manifesto de atualizacao ausente: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notin @("2.0.0-rc.2", "2.0.0-rc.4")) {
    throw "O servidor aceita apenas RC2 ou RC4 de teste."
}
$installer = "BZtune-Setup-v$version-x64.exe"
$installerPath = Join-Path $serverDir $installer
$signaturePath = "$installerPath.sig"
foreach ($path in @($installerPath, $signaturePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Arquivo de atualizacao ausente: $path"
    }
}
$expectedUrl = "http://127.0.0.1:8765/$installer"
$platform = $manifest.platforms.'windows-x86_64'
if ($manifest.version -ne $version -or
    $null -eq $platform -or
    $platform.url -ne $expectedUrl -or
    $platform.signature.Trim() -ne (Get-Content -LiteralPath $signaturePath -Raw).Trim()) {
    throw "Manifesto local inconsistente: arquivo, URL, versao ou assinatura diferentes."
}

$files = @{
    "/latest.json" = $manifestPath
    "/$installer" = $installerPath
}
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 8765)
$listener.Start()
Write-Host "BZtune $version`: servidor iniciado SOMENTE em http://127.0.0.1:8765"
Write-Host "Deixe esta janela aberta e abra a RC anterior de TESTE no BZtune."
Write-Host "Pressione Ctrl+C para encerrar. Nao e necessario acesso a internet."
try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout = 10000
            $reader = [System.IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
            $line = $reader.ReadLine()
            for ($i = 0; $i -lt 100; $i++) {
                $header = $reader.ReadLine()
                if ($null -eq $header -or $header.Length -eq 0) { break }
            }
            $parts = @("$line" -split " ")
            $status = "404 Not Found"
            $bodyPath = $null
            if ($parts.Count -ge 2 -and $parts[0] -eq "GET" -and $files.ContainsKey($parts[1])) {
                $bodyPath = $files[$parts[1]]
                $status = "200 OK"
            }
            $length = if ($null -ne $bodyPath) { (Get-Item -LiteralPath $bodyPath).Length } else { 0 }
            $type = if ($null -ne $bodyPath -and $parts[1] -eq "/latest.json") { "application/json" } else { "application/octet-stream" }
            $response = "HTTP/1.1 $status`r`nContent-Length: $length`r`nContent-Type: $type`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
            $headerBytes = [Text.Encoding]::ASCII.GetBytes($response)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($null -ne $bodyPath) {
                $fileStream = [System.IO.File]::OpenRead($bodyPath)
                try { $fileStream.CopyTo($stream) } finally { $fileStream.Dispose() }
                Write-Host "200 $($parts[1])"
            }
        } catch {
            Write-Warning "Conexao de teste: $($_.Exception.Message)"
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
