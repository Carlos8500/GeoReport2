import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import MapScreen from './src/screens/MapScreen';
import ReportScreen from './src/screens/ReportScreen';
import ServerScreen from './src/screens/ServerScreen';
import { getServerUrl, loadServerUrl } from './src/services/serverConfig';
import { Session, clearSession, loadSession, onUnauthorized } from './src/services/session';
import { Button, colors, styles } from './src/ui';

type Tab = 'mapa' | 'reportar' | 'perfil';

/**
 * RABIA-CUN · cliente móvil en Expo (para Expo Go en iPhone y Android).
 * Usa la MISMA API (server/) que la versión web/APK de Capacitor.
 */
export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [editingServer, setEditingServer] = useState(false);
  const [tab, setTab] = useState<Tab>('mapa');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      await loadServerUrl();
      setSession(await loadSession());
      setReady(true);
    })();
    onUnauthorized(() => {
      clearSession();
      setSession(null);
    });
    return () => onUnauthorized(null);
  }, []);

  const logout = async () => {
    await clearSession();
    setSession(null);
  };

  let body: React.ReactNode;
  if (!ready) {
    body = <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  } else if (!getServerUrl() || editingServer) {
    body = (
      <ServerScreen
        onSaved={() => setEditingServer(false)}
        onCancel={getServerUrl() ? () => setEditingServer(false) : undefined}
      />
    );
  } else if (!session) {
    body = <LoginScreen onLoggedIn={setSession} onChangeServer={() => setEditingServer(true)} />;
  } else {
    body = (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {tab === 'mapa' && <MapScreen refreshKey={refreshKey} />}
          {tab === 'reportar' && (
            <ReportScreen
              onCreated={() => {
                setRefreshKey((k) => k + 1);
                setTab('mapa');
              }}
            />
          )}
          {tab === 'perfil' && (
            <View style={{ flex: 1 }}>
              <View style={[styles.content, { paddingBottom: 0 }]}>
                <View style={styles.card}>
                  <Text style={styles.subtitle}>{session.user.name}</Text>
                  <Text style={styles.muted}>
                    {session.user.email} · {session.user.role}
                  </Text>
                  <Text style={styles.muted}>Servidor: {getServerUrl()}</Text>
                  <Button title="Cambiar servidor" variant="secondary" onPress={() => setEditingServer(true)} />
                  <Button title="Cerrar sesión" variant="danger" onPress={logout} />
                </View>
              </View>
              <MapScreen refreshKey={refreshKey} mineOnly />
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, backgroundColor: '#fff' }}>
          {(
            [
              ['mapa', 'Mapa'],
              ['reportar', 'Reportar'],
              ['perfil', 'Perfil'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={{ flex: 1, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: tab === key ? colors.primary : colors.muted, fontWeight: tab === key ? '700' : '500' }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {body}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
