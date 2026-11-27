import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser } from '../shared/types';

/**
 * Sesión guardada en el teléfono (token firmado por el servidor, nunca la contraseña).
 * Se mantiene una copia en memoria porque AsyncStorage es asíncrono.
 */
const STORAGE_KEY = 'rabiacun.session';

export interface Session {
  token: string;
  user: AuthUser;
}

let current: Session | null = null;

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    current = parsed && typeof parsed.token === 'string' && parsed.user ? parsed : null;
  } catch {
    current = null;
  }
  return current;
}

export async function saveSession(session: Session): Promise<void> {
  current = session;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Sólo en memoria
  }
}

export async function clearSession(): Promise<void> {
  current = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin acceso al almacenamiento
  }
}

export const getToken = (): string | null => current?.token ?? null;

let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};
export const notifyUnauthorized = () => unauthorizedHandler?.();
