import { AuthUser } from '../types/rabiaCun';

/**
 * Sesión guardada en el dispositivo con Web Storage (localStorage).
 * Así el usuario no tiene que iniciar sesión cada vez que abre la app.
 * Se guarda el token firmado por el servidor, nunca la contraseña.
 */
const STORAGE_KEY = 'rabiacun.session';

export interface Session {
  token: string;
  user: AuthUser;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed && typeof parsed.token === 'string' && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Modo privado o almacenamiento bloqueado: la sesión dura sólo mientras la app esté abierta
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin acceso al almacenamiento
  }
}

export const getToken = (): string | null => loadSession()?.token ?? null;

/** Quién recibe el aviso cuando el servidor rechaza el token (sesión vencida). */
let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};
export const notifyUnauthorized = () => unauthorizedHandler?.();
