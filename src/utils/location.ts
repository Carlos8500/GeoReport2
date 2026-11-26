import { Geolocation, Position } from '@capacitor/geolocation';
import { isNativeApp } from '../services/serverConfig';
import { LatLng } from '../types/rabiaCun';

/**
 * Sensor 1 · GPS mediante el complemento @capacitor/geolocation.
 * En la APK usa el GPS nativo de Android (con su ventana de permisos);
 * en el navegador el mismo complemento usa la Geolocation API.
 */

export interface GpsFix extends LatLng {
  /** Rumbo de desplazamiento en grados (null si el dispositivo no lo reporta) */
  heading: number | null;
}

const toFix = (pos: Position): GpsFix => ({
  lat: Number(pos.coords.latitude.toFixed(5)),
  lng: Number(pos.coords.longitude.toFixed(5)),
  heading:
    typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading)
      ? pos.coords.heading
      : null,
});

/** Pide el permiso de ubicación en la APK (en el navegador lo pide el propio navegador). */
async function ensurePermission(): Promise<boolean> {
  if (!isNativeApp()) return true;
  let status = await Geolocation.checkPermissions();
  if (status.location !== 'granted') {
    status = await Geolocation.requestPermissions({ permissions: ['location'] });
  }
  return status.location === 'granted';
}

/** true si el permiso ya estaba concedido (para empezar a seguir la ubicación sin preguntar). */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    const status = await Geolocation.checkPermissions();
    return status.location === 'granted';
  } catch {
    return false;
  }
}

export async function getCurrentFix(): Promise<GpsFix> {
  if (!(await ensurePermission())) throw new Error('Permiso de ubicación denegado.');
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
  return toFix(pos);
}

/** Sigue la ubicación en tiempo real; devuelve el id para detener el seguimiento. */
export async function watchFix(onFix: (fix: GpsFix) => void): Promise<string> {
  return Geolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 5000 }, (pos) => {
    if (pos) onFix(toFix(pos));
  });
}

export function clearFixWatch(id: string): void {
  Geolocation.clearWatch({ id }).catch(() => {});
}
