# Servidor HTTP somente em 127.0.0.1 para o teste assinado RC1 -> RC2.
# Nenhum pacote externo, direito de administrador ou publicacao e necessario.
param()

$ErrorActionPreference = "Stop"
$serverDir = Join-Path $PSScriptRoot "update-server"
$installer = "BZtune-Setup-v2.0.0-rc.2-x64.exe"
$installerPath = Join-Path $serverDir $installer
$signaturePath = "$installerPath.sig"
$manifestPath = Join-Path $serverDir "latest.json"
foreach ($path in @($installerPath, $signaturePath, $manifestPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Arquivo de atualizacao ausente: $path"
    }
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$expectedUrl = "http://127.0.0.1:8765/$installer"
$platform = $manifest.platforms.'windows-x86_64'
if ($manifest.version -ne "2.0.0-rc.2" -or
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
Write-Host "BZtune RC2: servidor iniciado SOMENTE em http://127.0.0.1:8765"
Write-Host "Deixe esta janela aberta e use 'Buscar atualizacoes' na RC1 de TESTE."
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
