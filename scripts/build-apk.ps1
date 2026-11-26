# Compila la APK de depuración de RABIA-CUN.
# Uso (desde la carpeta GeoReport2):  powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
#
# Requisitos: Android Studio (SDK de Android) y un JDK 21. Gradle 8.14 de
# Capacitor no funciona con Java 25, que es el que trae Android Studio 2026.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# 1. Buscar un JDK 21 (variable JDK21_HOME, ~/.jdks o Program Files)
$candidates = @()
if ($env:JDK21_HOME) { $candidates += $env:JDK21_HOME }
$candidates += Get-ChildItem "$env:USERPROFILE\.jdks", 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Java' `
  -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
$jdk = $candidates | Where-Object { Test-Path "$_\bin\java.exe" } | Select-Object -First 1
if (-not $jdk) { throw 'No se encontró un JDK 21. Instala Eclipse Temurin 21 o define JDK21_HOME.' }
$env:JAVA_HOME = $jdk
Write-Host "JDK: $jdk"

# 2. SDK de Android para Gradle (android/local.properties no se sube a Git)
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
if (-not (Test-Path $sdk)) { throw "No está el SDK de Android en $sdk. Instala Android Studio." }
Set-Content -Path "$root\android\local.properties" -Value ("sdk.dir=" + ($sdk -replace '\\', '/')) -Encoding ascii

# 3. Antivirus con análisis HTTPS (AVG, Avast): Java usa los certificados de Windows
$env:JAVA_TOOL_OPTIONS = '-Djavax.net.ssl.trustStore=NONE -Djavax.net.ssl.trustStoreType=Windows-ROOT'

# 4. Compilar la app web, copiarla al proyecto Android y generar la APK
Push-Location $root
try {
  npm run android:sync
  Push-Location android
  try { .\gradlew.bat assembleDebug } finally { Pop-Location }
} finally { Pop-Location }

$apk = "$root\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host "APK lista: $apk"
