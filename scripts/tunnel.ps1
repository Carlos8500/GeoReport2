# Publica la API de RABIA-CUN en Internet con Cloudflare Tunnel (túnel rápido).
# Uso (desde la carpeta GeoReport2):  powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1
#
# - No abre puertos del módem ni del Firewall: cloudflared hace una conexión de
#   SALIDA a Cloudflare, que entrega una dirección https://….trycloudflare.com.
# - La dirección cambia cada vez que se inicia el túnel: escríbela en la app
#   (engrane ⚙ › Servidor). Se copia sola al portapapeles.
# - El túnel rápido no transmite Server-Sent Events: la app se actualiza cada 15 s.
# - Para cerrarlo: Ctrl+C o cerrar esta ventana.

param([int]$Port = 4000)
$ErrorActionPreference = 'Stop'

# 1. Encontrar cloudflared (PATH o ~/.tools/cloudflared)
$exe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $exe) { $exe = "$env:USERPROFILE\.tools\cloudflared\cloudflared.exe" }
if (-not (Test-Path $exe)) {
  throw "No se encontró cloudflared. Descárgalo de https://github.com/cloudflare/cloudflared/releases (cloudflared-windows-amd64.exe) y guárdalo como $exe"
}

# 2. La API debe estar encendida (docker compose up -d)
try {
  $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 5
  Write-Host "API local: $($health.status) · base de datos: $($health.database)"
} catch {
  throw "La API no responde en http://localhost:$Port. Ejecuta 'docker compose up -d' primero."
}

# 3. Iniciar el túnel y leer la dirección pública de su registro
$log = Join-Path $env:TEMP 'rabiacun-tunnel.log'
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
  if (-not $url) { throw "No se obtuvo la dirección del túnel en 60 s. Revisa $log" }

  # Esperar a que la dirección ya responda (el DNS tarda unos segundos)
  for ($i = 0; $i -lt 20; $i++) {
    try { Invoke-RestMethod "$url/api/health" -TimeoutSec 5 | Out-Null; break } catch { Start-Sleep -Seconds 2 }
  }

  Set-Clipboard -Value $url
  Write-Host ''
  Write-Host '  Dirección del servidor para la app (ya está en el portapapeles):' -ForegroundColor Cyan
  Write-Host "  $url" -ForegroundColor Green
  Write-Host ''
  Write-Host '  En el celular: engrane ⚙ › Servidor › pegar la dirección › Guardar.'
  Write-Host '  Deja esta ventana abierta mientras usen la app. Ctrl+C para cerrar el túnel.'
  Wait-Process -Id $proc.Id
} finally {
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
}
