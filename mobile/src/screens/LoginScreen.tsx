import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { authApi, describeError } from '../services/api';
import { getServerUrl } from '../services/serverConfig';
import { Session, saveSession } from '../services/session';
import { Button, Field, colors, styles } from '../ui';

export default function LoginScreen({
  onLoggedIn,
  onChangeServer,
}: {
  onLoggedIn: (session: Session) => void;
  onChangeServer: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setBusy(true);
    try {
      const session =
        mode === 'login'
          ? await authApi.login(email.trim(), password)
          : await authApi.register(name.trim(), email.trim(), password);
      await saveSession(session);
      onLoggedIn(session);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: 24, gap: 4 }}>
          <Text style={styles.title}>RABIA-CUN</Text>
          <Text style={styles.muted}>Vigilancia y alertas sanitarias geolocalizadas en Cancún</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.subtitle}>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
          {mode === 'register' && <Field label="Nombre" value={name} onChangeText={setName} />}
          <Field
            label="Correo"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
          <Button title={mode === 'login' ? 'Entrar' : 'Registrarme'} onPress={handleSubmit} loading={busy} />
          <Button
            title={mode === 'login' ? '¿No tienes cuenta? Regístrate' : 'Ya tengo cuenta'}
            variant="secondary"
            onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          />
        </View>
        <View style={styles.card}>
          <Text style={styles.muted}>Servidor: {getServerUrl() || '(sin configurar)'}</Text>
          <Button title="Cambiar servidor" variant="secondary" onPress={onChangeServer} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
