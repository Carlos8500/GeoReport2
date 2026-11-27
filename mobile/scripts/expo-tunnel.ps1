# Publica la app Expo (Metro) en Internet con Cloudflare Tunnel, para abrirla en Expo Go
# desde cualquier red, sin cuenta de Expo ni ngrok.
# Uso (desde la carpeta mobile):  powershell -ExecutionPolicy Bypass -File scripts\expo-tunnel.ps1
#
# - Es un túnel distinto al de la API (..\scripts\tunnel.ps1): éste sirve el CÓDIGO de la app.
# - Escanea el QR que imprime ESTE script (exps://…), no el que imprime Expo después.
# - Para cerrarlo: Ctrl+C.

param([int]$Port = 8081)
$ErrorActionPreference = 'Stop'

# 1. Encontrar cloudflared (PATH o ~/.tools/cloudflared)
$exe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $exe) { $exe = "$env:USERPROFILE\.tools\cloudflared\cloudflared.exe" }
if (-not (Test-Path $exe)) {
  throw "No se encontró cloudflared. Guárdalo como $exe (ver ..\scripts\tunnel.ps1)."
}

# 2. Iniciar el túnel hacia Metro y leer la dirección pública
$log = Join-Path $env:TEMP 'rabiacun-expo-tunnel.log'
Remove-Item $log -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath $exe -ArgumentList 'tunnel', '--no-autoupdate', '--url', "http://localhost:$Port" `
  -RedirectStandardError $log -NoNewWindow -PassThru

try {
  $url = $null
  for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    if ($proc.HasExited) { throw "cloudflared se cerró. Revisa $log" }
    $match = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($match) { $url = $match.Matches[0].Value }
  }
  if (-not $url) { throw "cloudflared no entregó una dirección en 60 s. Revisa $log" }

  $expoUrl = $url -replace '^https://', 'exps://'
  Write-Host ""
  Write-Host "Escanea este QR con la cámara del iPhone (o pega la dirección en Expo Go):" -ForegroundColor Green
  Write-Host "  $expoUrl" -ForegroundColor Cyan
  node -e "require('qrcode-terminal').generate(process.argv[1], { small: true })" $expoUrl
  Write-Host "(Ignora el QR que muestre Expo abajo: apunta a la red local.)" -ForegroundColor Yellow
  Write-Host ""

  # 3. Metro anuncia la dirección del túnel en el manifiesto para que Expo Go descargue el código por ahí
  $env:EXPO_PACKAGER_PROXY_URL = $url
  npx expo start --port $Port
}
finally {
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
  Remove-Item Env:\EXPO_PACKAGER_PROXY_URL -ErrorAction SilentlyContinue
}
