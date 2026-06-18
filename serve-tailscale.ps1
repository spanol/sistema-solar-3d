# serve-tailscale.ps1
# Publica o build estatico (dist/) na tailnet via Tailscale, na porta 8090.
# Uso:   powershell -ExecutionPolicy Bypass -File serve-tailscale.ps1
# URL:   https://spanol-1.tail82f788.ts.net:8090/
# Parar: tailscale serve --https=8090 off   (e encerrar o processo python da porta 8090)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root "dist"
$ts   = "C:\Program Files\Tailscale\tailscale.exe"
$port = 8090

# 1. Garante build atualizado
Push-Location $root
npm run build
Pop-Location

# 2. Sobe o servidor estatico (detached) se a porta nao estiver escutando
$listening = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $listening) {
  Start-Process -FilePath "python" `
    -ArgumentList "-m","http.server","$port","--bind","127.0.0.1","--directory",$dist `
    -WindowStyle Hidden
  Start-Sleep -Seconds 2
  Write-Output "Servidor estatico iniciado em http://127.0.0.1:$port"
} else {
  Write-Output "Porta $port ja esta escutando — reutilizando."
}

# 3. Expoe via Tailscale (persistente, em background)
& $ts serve --bg --https=$port "http://127.0.0.1:$port"

Write-Output ""
Write-Output "Disponivel na tailnet: https://spanol-1.tail82f788.ts.net:$port/"
