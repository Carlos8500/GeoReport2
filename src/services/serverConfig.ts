import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Dirección del servidor (API) que usa la app.
 *
 * - Navegador: vacía = misma dirección que la página (en desarrollo, Vite
 *   reenvía /api al contenedor Docker).
 * - APK (Capacitor): el usuario escribe la dirección en «Servidor», por
 *   ejemplo http://192.168.1.73:4000 (misma Wi-Fi) o la dirección https de
 *   Cloudflare Tunnel. Se guarda en el dispositivo con @capacitor/preferences,
 *   así se cambia de red sin recompilar la APK.
 */

const STORAGE_KEY = 'rabiacun.serverUrl';
const BUILD_DEFAULT = normalizeServerUrl(import.meta.env.VITE_API_URL ?? '');

let current = BUILD_DEFAULT;

/** true dentro de la APK de Android (o iOS); false en el navegador. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** Limpia lo que escribe el usuario: espacios, "/" final, "/api" final y protocolo faltante. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

export function isValidServerUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/** Dirección actual (sin "/" final). Vacía = misma dirección que la página. */
export const getServerUrl = (): string => current;

/** Lee la dirección guardada en el dispositivo; se llama antes de mostrar la app. */
export async function loadServerUrl(): Promise<string> {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (value) current = value;
  } catch {
    // Sin almacenamiento disponible: se usa la dirección de compilación
  }
  return current;
}

export async function saveServerUrl(input: string): Promise<string> {
  current = normalizeServerUrl(input) || BUILD_DEFAULT;
  if (current && current !== BUILD_DEFAULT) {
    await Preferences.set({ key: STORAGE_KEY, value: current });
  } else {
    await Preferences.remove({ key: STORAGE_KEY });
  }
  return current;
}

/** En la APK no hay "misma dirección que la página": hace falta configurar el servidor. */
export const needsServerSetup = (): boolean => isNativeApp() && !current;

/** Prueba una dirección consultando /api/health antes de guardarla. */
export async function testServerUrl(input: string): Promise<{ ok: boolean; message: string }> {
  const url = normalizeServerUrl(input);
  if (!isValidServerUrl(url)) {
    return { ok: false, message: 'La dirección no es válida. Ejemplo: http://192.168.1.73:4000' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${url}/api/health`, { signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.status === 'ok') {
      return { ok: true, message: 'Conexión correcta con el servidor de RABIA-CUN.' };
    }
    return {
      ok: false,
      message: response.ok
        ? 'Respondió, pero no parece el servidor de RABIA-CUN.'
        : `El servidor respondió con error ${response.status}.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        (err as Error).name === 'AbortError'
          ? 'Sin respuesta en 6 s. Revisa que la PC y el celular estén en la misma red y que Docker esté encendido.'
          : 'No se pudo conectar. Revisa la dirección, el Firewall de Windows (puerto 4000) y que Docker esté encendido.',
    };
  } finally {
    clearTimeout(timer);
  }
}
