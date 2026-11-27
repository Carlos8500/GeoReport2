import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { getServerUrl, saveServerUrl, testServerUrl } from '../services/serverConfig';
import { Button, Field, colors, styles } from '../ui';

/** Configura la dirección de la API (túnel de Cloudflare o IP de la PC). */
export default function ServerScreen({ onSaved, onCancel }: { onSaved: () => void; onCancel?: () => void }) {
  const [url, setUrl] = useState(getServerUrl());
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    const result = await testServerUrl(url);
    setStatus(result);
    setBusy(false);
    if (result.ok) {
      await saveServerUrl(url);
      onSaved();
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Servidor</Text>
      <View style={styles.card}>
        <Text style={styles.muted}>
          Escribe la dirección de la API de RABIA-CUN. Con Cloudflare Tunnel es la https://….trycloudflare.com que
          muestra scripts\tunnel.ps1 (cambia cada vez que se inicia el túnel).
        </Text>
        <Field
          label="Dirección"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://ejemplo.trycloudflare.com"
        />
        {status && (
          <Text style={{ color: status.ok ? colors.accent : colors.danger, fontSize: 13 }}>{status.message}</Text>
        )}
        <Button title="Probar y guardar" onPress={handleSave} loading={busy} />
        {onCancel && <Button title="Cancelar" variant="secondary" onPress={onCancel} />}
      </View>
    </ScrollView>
  );
}
