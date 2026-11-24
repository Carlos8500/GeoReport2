import React, { useCallback, useEffect, useState } from 'react';
import App from './App';
import { LoginScreen } from './components/LoginScreen';
import { authApi, AuthResponse } from './services/api';
import {
  clearSession,
  loadSession,
  onUnauthorized,
  saveSession,
  Session,
} from './services/session';
import { AuthUser } from './types/rabiaCun';

/**
 * Controla la sesión de la app.
 * - Sin sesión: la app funciona en modo visitante (mapa, reportes, alertas
 *   y estadísticas son información pública).
 * - Para reportar, editar, ver fotos o el perfil se muestra el inicio de sesión.
 */
export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [showLogin, setShowLogin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const requestLogin = useCallback((message: string | null = null) => {
    setNotice(message);
    setShowLogin(true);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setShowLogin(false);
    setNotice(null);
  }, []);

  // Si la API rechaza el token (vencido o inválido): se cierra la sesión y se ofrece entrar de nuevo
  useEffect(() => {
    onUnauthorized(() => {
      clearSession();
      setSession(null);
      requestLogin('Tu sesión expiró. Inicia sesión de nuevo o continúa como visitante.');
    });
    return () => onUnauthorized(null);
  }, [requestLogin]);

  // Al abrir la app se confirma con el servidor que la sesión guardada sigue vigente
  useEffect(() => {
    if (!session) return;
    authApi
      .me()
      .then((user) => {
        const updated = { token: session.token, user };
        saveSession(updated);
        setSession(updated);
      })
      .catch(() => {
        // Sin conexión: se conserva la sesión; un 401 ya la cerró vía onUnauthorized
      });
    // Sólo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthenticated = (auth: AuthResponse) => {
    const next = { token: auth.token, user: auth.user };
    saveSession(next);
    setSession(next);
    setShowLogin(false);
    setNotice(null);
  };

  const handleUserChange = (user: AuthUser) => {
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, user };
      saveSession(next);
      return next;
    });
  };

  if (showLogin && !session) {
    return (
      <LoginScreen
        onAuthenticated={handleAuthenticated}
        notice={notice}
        onContinueAsGuest={() => {
          setShowLogin(false);
          setNotice(null);
        }}
      />
    );
  }

  return (
    <App
      key={session?.user.id ?? 'visitante'}
      currentUser={session?.user ?? null}
      onLogout={logout}
      onUserChange={handleUserChange}
      onRequestLogin={requestLogin}
    />
  );
}
