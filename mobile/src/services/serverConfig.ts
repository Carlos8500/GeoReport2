import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Dirección del servidor (API) que usa la app móvil.
 * Es la misma API de la versión web/APK: http://<IP-de-la-PC>:4000 en la misma
 * Wi-Fi, o la dirección https://….trycloudflare.com del túnel (scripts/tunnel.ps1).
 * Se guarda en el teléfono con AsyncStorage para no escribirla cada vez.
 */
const STORAGE_KEY = 'rabiacun.serverUrl';

/** Valor inicial opcional: EXPO_PUBLIC_API_URL en mobile/.env */
const BUILD_DEFAULT = normalizeServerUrl(process.env.EXPO_PUBLIC_API_URL ?? '');

let current = BUILD_DEFAULT;

/** Limpia lo que escribe el usuario: espacios, "/" final, "/api" final y protocolo faltante. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

export function isValidServerUrl(url: string): boolean {
  return /^https?:\/\/[^\s/:]+(:\d+)?(\/.*)?$/i.test(url);
}

export const getServerUrl = (): string => current;

export async function loadServerUrl(): Promise<string> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    if (value) current = value;
  } catch {
    // Sin almacenamiento: se usa el valor de compilación
  }
  return current;
}

export async function saveServerUrl(input: string): Promise<string> {
  current = normalizeServerUrl(input);
  try {
    if (current) await AsyncStorage.setItem(STORAGE_KEY, current);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Se conserva sólo en memoria
  }
  return current;
}

/** Prueba una dirección consultando /api/health antes de guardarla. */
export async function testServerUrl(input: string): Promise<{ ok: boolean; message: string }> {
  const url = normalizeServerUrl(input);
  if (!url || !isValidServerUrl(url)) {
    return { ok: false, message: 'Dirección no válida. Ejemplo: https://algo.trycloudflare.com' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
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
          ? 'Sin respuesta en 8 s. ¿Está encendido Docker y el túnel?'
          : 'No se pudo conectar. Revisa la dirección (en iPhone usa la https del túnel).',
    };
  } finally {
    clearTimeout(timer);
  }
}
