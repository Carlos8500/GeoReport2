# RABIA-CUN · cliente móvil (Expo)

Segundo frontend de RABIA-CUN, hecho con **Expo / React Native** para abrirse en **Expo Go**
(iPhone y Android). Usa **la misma API** (`../server`) que la versión web/APK de Capacitor:
misma base de datos, mismos usuarios y mismos reportes.

| Función | Paquete |
|---|---|
| GPS en tiempo real | `expo-location` (`watchPositionAsync`) |
| Brújula (alpha / punto cardinal) | `expo-location` (`watchHeadingAsync`) |
| Giroscopio / inclinación (beta, gamma) | `expo-sensors` (`DeviceMotion`) |
| Cámara y galería | `expo-image-picker` + `expo-image-manipulator` (reduce la foto a 1280 px) |
| Mapa | `react-native-maps` (Apple Maps en iOS) |
| Sesión y dirección del servidor | `@react-native-async-storage/async-storage` |

La lógica de geocerca, privacidad y orientación es una copia de `../src/utils` en `src/shared/`
(si cambias una, actualiza la otra).

## Cómo mostrarlo en el iPhone

1. **Backend** (desde `GeoReport2/`):
   ```powershell
   docker compose up -d
   ```
2. **Túnel de la API** (desde `GeoReport2/`). Copia la dirección `https://….trycloudflare.com`:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1
   ```
3. **App Expo** (desde `GeoReport2/mobile/`):
   ```powershell
   npx expo start
   ```
   Si el iPhone no está en la misma Wi-Fi que la PC (o la red de la escuela aísla los dispositivos), publica Metro
   con cloudflared. No necesita cuenta de Expo ni ngrok:
   ```powershell
   npm run tunnel
   ```
   Escanea el QR **`exps://…` que imprime el script**, no el que Expo muestra después, porque ese apunta a la red local.
   (`npx expo start --tunnel` exige iniciar sesión en Expo, y `--tunnel ngrok` suele fallar con «took too long».)
4. En el iPhone instala **Expo Go** (App Store), escanea el QR con la **cámara** del iPhone y ábrelo en Expo Go.
5. En la primera pantalla pega la dirección del túnel de la API, entra con tu cuenta y acepta los permisos de
   ubicación, cámara y movimiento.

> Son dos túneles distintos: `expo start --tunnel` sirve el **código de la app**; `tunnel.ps1` (cloudflared)
> publica la **API**. La dirección de cloudflared cambia cada vez que lo inicias: cámbiala en Perfil › Cambiar servidor.

Opcional: crea `mobile/.env` con `EXPO_PUBLIC_API_URL=https://….trycloudflare.com` para que esa dirección aparezca
ya escrita.

## Modo demo académico

Si el GPS del teléfono está fuera de Cancún, la API rechaza el reporte (geocerca). Activa
**Modo demo académico** en la pestaña Reportar: el pin se coloca en el Parque Kabah y el reporte se guarda con
`gpsVerificationMode: "demo_academico"`, igual que en la versión web.

## Comandos

```powershell
npx tsc --noEmit
```
```powershell
npx expo-doctor
```
