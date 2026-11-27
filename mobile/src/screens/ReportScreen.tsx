import { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSensors } from '../hooks/useSensors';
import { describeError, incidentsApi } from '../services/api';
import {
  IMSS_HGR_17_COORDS,
  KABAH_MAP_CENTER,
  MAX_IN_SITU_REPORT_DISTANCE_METERS,
  applyPrivacyApproximation,
  calculateDistanceMeters,
  clampToRadiusMeters,
  detectSupermanzana,
} from '../shared/geofence';
import { AnimalSpecies, EventType, LatLng } from '../shared/types';
import { Button, Chips, EVENT_LABELS, Field, SPECIES_LABELS, colors, styles } from '../ui';

/** Reduce la foto a ≤1280 px y la devuelve como data URL JPEG (lo que espera la API). */
async function toDataUrl(uri: string): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 1280 }).renderAsync();
  const result = await ref.saveAsync({ base64: true, compress: 0.6, format: SaveFormat.JPEG });
  return `data:image/jpeg;base64,${result.base64}`;
}

export default function ReportScreen({ onCreated }: { onCreated: () => void }) {
  const { gps, gyroscope, motionAvailable } = useSensors();
  const [demoMode, setDemoMode] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [eventType, setEventType] = useState<EventType>('avistamiento');
  const [species, setSpecies] = useState<AnimalSpecies>('perro');
  const [landmark, setLandmark] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; dataUrl: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Origen de la ubicación: GPS real, o el Parque Kabah en modo demo académico
  const origin: LatLng | null = demoMode ? KABAH_MAP_CENTER : gps.position;
  const gpsOutsideCancun = gps.position ? !detectSupermanzana(gps.position).insidePolygon : false;

  // Al tener ubicación por primera vez (o al cambiar de modo) el pin va al origen
  useEffect(() => {
    if (!origin) return;
    setPin(origin);
    mapRef.current?.animateToRegion({
      latitude: origin.lat,
      longitude: origin.lng,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, gps.position === null]);

  const zone = pin ? detectSupermanzana(pin) : null;
  const distanceToPin = origin && pin ? Math.round(calculateDistanceMeters(origin, pin)) : 0;

  const takePhoto = async (fromLibrary = false) => {
    try {
      if (!fromLibrary) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Cámara', 'Se necesita permiso de cámara para tomar la evidencia.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
      const result = fromLibrary
        ? await ImagePicker.launchImageLibraryAsync(options)
        : await ImagePicker.launchCameraAsync(options);
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        dataUrl: await toDataUrl(asset.uri),
        name: asset.fileName ?? `camara-${Date.now()}.jpg`,
      });
    } catch (err) {
      Alert.alert('Cámara', (err as Error).message);
    }
  };

  const submit = async () => {
    if (!origin || !pin || !zone) return;
    if (!zone.insidePolygon) {
      Alert.alert('Ubicación', 'El punto está fuera de la zona urbana de Cancún. Activa el modo demo académico.');
      return;
    }
    if (description.trim().length < 10) {
      Alert.alert('Descripción', 'Escribe al menos 10 caracteres.');
      return;
    }
    const approx = applyPrivacyApproximation(pin);
    const distHospital = Math.round(calculateDistanceMeters(pin, IMSS_HGR_17_COORDS));
    setBusy(true);
    try {
      await incidentsApi.create({
        title: `${EVENT_LABELS[eventType]} · ${SPECIES_LABELS[species]} en ${zone.code}`,
        eventType,
        species,
        approxLat: approx.lat,
        approxLng: approx.lng,
        privacyRadiusMeters: 150,
        supermanzana: zone.code,
        referenceLandmark: landmark.trim() || zone.code,
        description: description.trim(),
        gpsVerifiedInSitu: distanceToPin <= MAX_IN_SITU_REPORT_DISTANCE_METERS,
        userDistanceToPinMeters: distanceToPin,
        gpsVerificationMode: demoMode ? 'demo_academico' : 'hardware_gps',
        gyroscope,
        evidenceNote: `Captura en sitio (${photo?.name ?? 'sin foto'}) · Orientación ${gyroscope.cardinal} (${gyroscope.alpha}°) · App Expo.`,
        recommendations:
          eventType === 'mordedura' || eventType === 'aranazo'
            ? ['Lava la herida con agua y jabón por 15 min.', `Acude al IMSS HGR No. 17 (${distHospital} m) para valoración.`]
            : ['Mantén distancia y evita interactuar con el ejemplar.'],
        photoDataUrl: photo?.dataUrl ?? null,
        photoFileName: photo?.name ?? null,
      });
      Alert.alert('Reporte enviado', 'Tu reporte quedó registrado como "reporte ciudadano".');
      setDescription('');
      setLandmark('');
      setPhoto(null);
      onCreated();
    } catch (err) {
      Alert.alert('No se pudo enviar', describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Sensores */}
        <View style={styles.card}>
          <Text style={styles.subtitle}>Sensores</Text>
          <Text style={styles.muted}>
            GPS:{' '}
            {gps.position
              ? `${gps.position.lat.toFixed(5)}, ${gps.position.lng.toFixed(5)} (±${Math.round(gps.position.accuracy ?? 0)} m)`
              : gps.permission === 'denegado'
                ? 'permiso denegado'
                : 'buscando señal…'}
          </Text>
          <Text style={styles.muted}>
            Brújula: {gyroscope.alpha}° {gyroscope.cardinal} · Inclinación β {gyroscope.beta}° γ {gyroscope.gamma}°
            {motionAvailable ? '' : ' (sin giroscopio)'}
          </Text>
          <View style={styles.row}>
            <Text style={[styles.label, { flex: 1 }]}>Modo demo académico (pin en Parque Kabah)</Text>
            <Switch value={demoMode} onValueChange={setDemoMode} />
          </View>
          {gpsOutsideCancun && !demoMode && (
            <Text style={{ color: colors.danger, fontSize: 13 }}>
              Tu GPS está fuera de Cancún: activa el modo demo para poder enviar.
            </Text>
          )}
        </View>

        {/* Mapa para ajustar el pin */}
        <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
          <MapView
            ref={mapRef}
            style={{ height: 260 }}
            showsUserLocation
            initialRegion={{
              latitude: KABAH_MAP_CENTER.lat,
              longitude: KABAH_MAP_CENTER.lng,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
            onPress={(e) => {
              if (!origin) return;
              const tapped = { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude };
              setPin(clampToRadiusMeters(origin, tapped));
            }}
          >
            {origin && (
              <Circle
                center={{ latitude: origin.lat, longitude: origin.lng }}
                radius={MAX_IN_SITU_REPORT_DISTANCE_METERS}
                strokeColor="rgba(18,48,71,0.6)"
                fillColor="rgba(18,48,71,0.08)"
              />
            )}
            {pin && <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} pinColor={colors.danger} />}
          </MapView>
          <Text style={[styles.muted, { padding: 12 }]}>
            Toca el mapa para mover el pin (máx. {MAX_IN_SITU_REPORT_DISTANCE_METERS} m de ti). Zona:{' '}
            {zone?.code ?? '—'} · {distanceToPin} m
          </Text>
        </View>

        {/* Formulario */}
        <View style={styles.card}>
          <Text style={styles.subtitle}>Nuevo reporte</Text>
          <Text style={styles.label}>Tipo de evento</Text>
          <Chips options={EVENT_LABELS} value={eventType} onChange={setEventType} />
          <Text style={styles.label}>Especie</Text>
          <Chips options={SPECIES_LABELS} value={species} onChange={setSpecies} />
          <Field label="Referencia (opcional)" value={landmark} onChangeText={setLandmark} placeholder="Ej. frente al OXXO" />
          <Field
            label="Descripción"
            value={description}
            onChangeText={setDescription}
            multiline
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="¿Qué observaste?"
          />
          <Text style={styles.label}>Evidencia</Text>
          {photo && <Image source={{ uri: photo.uri }} style={{ height: 180, borderRadius: 12 }} resizeMode="cover" />}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title={photo ? 'Repetir foto' : 'Tomar foto'} variant="secondary" onPress={() => takePhoto(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Galería" variant="secondary" onPress={() => takePhoto(true)} />
            </View>
          </View>
          <Button title="Enviar reporte" onPress={submit} loading={busy} disabled={!origin || !pin} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
