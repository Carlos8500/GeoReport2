import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de Capacitor (empaquetado híbrido de la app web en una APK).
 *
 * androidScheme 'http': la app se sirve como http://localhost dentro de la
 * APK. localhost sigue siendo un contexto seguro (GPS, cámara y sensores
 * funcionan) y así la app puede llamar a una API http:// en la red local sin
 * el bloqueo de "contenido mixto". Con Cloudflare Tunnel (https) también funciona.
 */
const config: CapacitorConfig = {
  appId: 'mx.edu.itcancun.rabiacun',
  appName: 'RABIA-CUN',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    // Permite tráfico http hacia la PC servidor en la Wi-Fi (usesCleartextTraffic)
    cleartext: true,
  },
  android: {
    backgroundColor: '#123047',
  },
};

export default config;
