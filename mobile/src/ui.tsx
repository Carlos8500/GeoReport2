import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { AnimalSpecies, EventType, VerificationStatus } from './shared/types';

/** Colores y componentes básicos compartidos por las pantallas. */
export const colors = {
  primary: '#123047',
  accent: '#0f766e',
  danger: '#b91c1c',
  bg: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
};

export const EVENT_LABELS: Record<EventType, string> = {
  avistamiento: 'Avistamiento',
  comportamiento_erratico: 'Conducta errática',
  aranazo: 'Arañazo',
  mordedura: 'Mordedura',
};

export const SPECIES_LABELS: Record<AnimalSpecies, string> = {
  zorra_gris: 'Zorra gris',
  perro: 'Perro sin dueño',
  gato: 'Gato sin dueño',
  coati_mapache: 'Coatí / Mapache',
  murcielago: 'Murciélago',
};

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  verificado_oficial: 'Oficial',
  en_revision: 'En revisión',
  reporte_ciudadano: 'Ciudadano',
  rechazado: 'Descartado',
};

export const STATUS_COLORS: Record<VerificationStatus, string> = {
  verificado_oficial: '#b91c1c',
  en_revision: '#d97706',
  reporte_ciudadano: '#2563eb',
  rechazado: '#64748b',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : '#e2e8f0';
  const fg = variant === 'secondary' ? colors.text : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#94a3b8" style={styles.input} {...props} />
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {(Object.keys(options) as T[]).map((key) => (
        <Pressable
          key={key}
          onPress={() => onChange(key)}
          style={[styles.chip, value === key && { backgroundColor: colors.primary, borderColor: colors.primary }]}
        >
          <Text style={{ color: value === key ? '#fff' : colors.text, fontSize: 13 }}>{options[key]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.primary },
  subtitle: { fontSize: 16, fontWeight: '700', color: colors.primary },
  muted: { color: colors.muted, fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#fff',
  },
  button: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
