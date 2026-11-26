import {
  AnimalSpecies,
  AuthUser,
  EventType,
  AlertPayload,
  HealthAlert,
  IncidentReport,
  VerificationStatus,
} from '../types/rabiaCun';
import { getToken, notifyUnauthorized } from './session';
import { getServerUrl } from './serverConfig';

/**
 * Dirección base de la API: la define serverConfig.ts (vacía en el navegador
 * = misma dirección que la página; en la APK, la que el usuario configura).
 */
/** Error de la API con el mensaje y los errores por campo devueltos por el servidor. */
export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;

  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const absoluteUrl = (path: string) => `${getServerUrl()}${path}`;

/** Encabezado con el token de la sesión (si hay sesión iniciada). */
const authHeader = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Petición asíncrona genérica (fetch + Promise) con manejo de errores.
 * Agrega el token de sesión; si el servidor responde 401 (sesión vencida)
 * avisa a la app para regresar a la pantalla de inicio de sesión.
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15000,
  { handleUnauthorized = true } = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const auth = authHeader();
  let response: Response;
  try {
    response = await fetch(absoluteUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...auth,
        ...options.headers,
      },
    });
  } catch (err) {
    throw new ApiError(
      0,
      (err as Error).name === 'AbortError'
        ? 'El servidor tardó demasiado en responder.'
        : 'No hay conexión con el servidor.'
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);
  // Una respuesta 200 sin JSON no viene de la API (p. ej. la APK sin servidor configurado)
  if (response.ok && data === null) {
    throw new ApiError(
      0,
      'La dirección configurada no responde como el servidor de RABIA-CUN. Revísala en «Servidor» (⚙).'
    );
  }
  // Sólo si se envió un token: un visitante sin sesión no tiene sesión que "expire"
  if (response.status === 401 && handleUnauthorized && auth.Authorization) {
    notifyUnauthorized();
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error || `Error ${response.status} del servidor.`,
      data?.details
    );
  }
  return data as T;
}

/** Las fotos llegan como ruta relativa (/api/photos/3); en la APK necesitan la URL completa. */
const withAbsolutePhoto = (incident: IncidentReport): IncidentReport =>
  incident.photoUrl && incident.photoUrl.startsWith('/')
    ? { ...incident, photoUrl: absoluteUrl(incident.photoUrl) }
    : incident;

/** Mensaje legible a partir de cualquier error (incluye errores por campo). */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    const fieldErrors = err.details ? Object.values(err.details).join(' ') : '';
    return fieldErrors ? `${err.message} ${fieldErrors}` : err.message;
  }
  return 'Ocurrió un error inesperado.';
}

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  // En login/registro un 401 significa credenciales incorrectas, no sesión vencida
  login: (email: string, password: string) =>
    request<AuthResponse>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      15000,
      { handleUnauthorized: false }
    ),

  register: (name: string, email: string, password: string) =>
    request<AuthResponse>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify({ name, email, password }) },
      15000,
      { handleUnauthorized: false }
    ),

  me: () => request<AuthUser>('/api/auth/me'),

  updateProfile: (payload: { name: string; currentPassword?: string; newPassword?: string }) =>
    request<AuthUser>('/api/auth/me', { method: 'PUT', body: JSON.stringify(payload) }),
};

/**
 * Las fotos también están protegidas: se descargan con el token y se
 * convierten en una URL local (blob:) para mostrarlas en <img>.
 */
export async function fetchProtectedImage(url: string): Promise<string> {
  const auth = authHeader();
  const response = await fetch(url, { headers: auth });
  if (response.status === 401 && auth.Authorization) notifyUnauthorized();
  if (!response.ok) throw new ApiError(response.status, 'No se pudo cargar la imagen.');
  return URL.createObjectURL(await response.blob());
}

// ---------------------------------------------------------------------------
// Reportes de incidentes (CRUD)
// ---------------------------------------------------------------------------

export interface NewIncidentPayload
  extends Omit<IncidentReport, 'id' | 'folio' | 'verificationStatus' | 'reportedAt' | 'photoUrl'> {
  photoDataUrl?: string | null;
  photoFileName?: string | null;
}

export interface IncidentEditPayload {
  title: string;
  eventType: EventType;
  species: AnimalSpecies;
  referenceLandmark: string;
  description: string;
}

export const incidentsApi = {
  list: async () =>
    (await request<IncidentReport[]>('/api/incidents')).map(withAbsolutePhoto),

  listMine: async () =>
    (await request<IncidentReport[]>('/api/incidents?mine=true')).map(withAbsolutePhoto),

  create: async (payload: NewIncidentPayload) =>
    withAbsolutePhoto(
      await request<IncidentReport>(
        '/api/incidents',
        { method: 'POST', body: JSON.stringify(payload) },
        60000
      )
    ),

  update: async (id: string, payload: IncidentEditPayload) =>
    withAbsolutePhoto(
      await request<IncidentReport>(`/api/incidents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    ),

  verify: async (
    id: string,
    verificationStatus: VerificationStatus,
    officialSource: string,
    evidenceNote: string
  ) =>
    withAbsolutePhoto(
      await request<IncidentReport>(`/api/incidents/${id}/verification`, {
        method: 'PATCH',
        body: JSON.stringify({ verificationStatus, officialSource, evidenceNote }),
      })
    ),

  remove: (id: string) =>
    request<{ ok: boolean; deleted: { id: string; folio: string } }>(`/api/incidents/${id}`, {
      method: 'DELETE',
    }),
};

// ---------------------------------------------------------------------------
// Alertas sanitarias
// ---------------------------------------------------------------------------

export const alertsApi = {
  list: () => request<HealthAlert[]>('/api/alerts'),

  // Sólo administrador (la API responde 403 a otros roles)
  create: (payload: AlertPayload) =>
    request<HealthAlert>('/api/alerts', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: AlertPayload) =>
    request<HealthAlert>(`/api/alerts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  remove: (id: string) =>
    request<{ ok: boolean; deleted: { id: string; folio: string } }>(`/api/alerts/${id}`, {
      method: 'DELETE',
    }),
};

// ---------------------------------------------------------------------------
// Tiempo real (Server-Sent Events): avisa cuando otro dispositivo cambia datos.
// Se lee con fetch + ReadableStream (en lugar de EventSource) porque así
// se puede enviar el token en el encabezado Authorization.
// ---------------------------------------------------------------------------

export function subscribeToChanges(
  onChange: (resource: 'incidents' | 'alerts') => void,
  onConnectionChange: (connected: boolean) => void
): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = async () => {
    if (stopped) return;
    controller = new AbortController();
    const auth = authHeader();
    try {
      const response = await fetch(absoluteUrl('/api/events'), {
        headers: { Accept: 'text/event-stream', ...auth },
        signal: controller.signal,
      });
      if (response.status === 401 && auth.Authorization) {
        notifyUnauthorized();
        return;
      }
      if (!response.ok || !response.body) throw new Error('SSE no disponible');
      onConnectionChange(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Cada evento SSE termina con una línea en blanco
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of rawEvent.split('\n')) {
            if (!line.startsWith('data:')) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (payload.type === 'changed') onChange(payload.resource);
            } catch {
              // Mensaje mal formado: se ignora
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch {
      // Conexión perdida: se reintenta abajo
    }
    if (!stopped) {
      onConnectionChange(false);
      retryTimer = setTimeout(connect, 5000);
    }
  };

  connect();
  return () => {
    stopped = true;
    controller?.abort();
    if (retryTimer) clearTimeout(retryTimer);
  };
}
