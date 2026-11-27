import { Fragment, useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { absoluteUrl, alertsApi, authHeader, describeError, incidentsApi } from '../services/api';
import { CANCUN_MAP_CENTER } from '../shared/geofence';
import { HealthAlert, IncidentReport } from '../shared/types';
import { Button, EVENT_LABELS, SPECIES_LABELS, STATUS_COLORS, STATUS_LABELS, colors, styles } from '../ui';

/** Mapa de reportes y alertas vigentes (se actualiza cada 15 s, igual que la web con el túnel). */
export default function MapScreen({ refreshKey, mineOnly = false }: { refreshKey: number; mineOnly?: boolean }) {
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<IncidentReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, al] = await Promise.all([
        mineOnly ? incidentsApi.listMine() : incidentsApi.list(),
        mineOnly ? Promise.resolve([] as HealthAlert[]) : alertsApi.list(),
      ]);
      setIncidents(inc);
      setAlerts(al);
      setError('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [mineOnly]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {!mineOnly && (
        <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
          <MapView
            style={{ height: 320 }}
            showsUserLocation
            initialRegion={{
              latitude: CANCUN_MAP_CENTER.lat,
              longitude: CANCUN_MAP_CENTER.lng,
              latitudeDelta: 0.09,
              longitudeDelta: 0.09,
            }}
          >
            {incidents.map((inc) => (
              <Fragment key={inc.id}>
                <Circle
                  center={{ latitude: inc.approxLat, longitude: inc.approxLng }}
                  radius={inc.privacyRadiusMeters}
                  strokeColor={STATUS_COLORS[inc.verificationStatus]}
                  fillColor={`${STATUS_COLORS[inc.verificationStatus]}22`}
                />
                <Marker
                  coordinate={{ latitude: inc.approxLat, longitude: inc.approxLng }}
                  pinColor={STATUS_COLORS[inc.verificationStatus]}
                  title={inc.folio}
                  description={inc.title}
                  onCalloutPress={() => setSelected(inc)}
                />
              </Fragment>
            ))}
          </MapView>
        </View>
      )}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      {alerts.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Alertas sanitarias</Text>
          {alerts.slice(0, 3).map((a) => (
            <View key={a.id} style={{ gap: 2 }}>
              <Text style={styles.label}>
                [{a.severity.toUpperCase()}] {a.title}
              </Text>
              <Text style={styles.muted}>
                {a.zone} · {a.source}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.subtitle}>
          {mineOnly ? 'Mis reportes' : 'Reportes recientes'} ({incidents.length})
        </Text>
        {incidents.slice(0, 30).map((inc) => (
          <Pressable key={inc.id} onPress={() => setSelected(inc)} style={{ gap: 2, paddingVertical: 4 }}>
            <View style={styles.row}>
              <Text style={[styles.label, { flex: 1 }]}>{inc.folio}</Text>
              <Text style={{ color: STATUS_COLORS[inc.verificationStatus], fontSize: 12, fontWeight: '600' }}>
                {STATUS_LABELS[inc.verificationStatus]}
              </Text>
            </View>
            <Text style={styles.muted}>
              {EVENT_LABELS[inc.eventType]} · {SPECIES_LABELS[inc.species]} · {inc.supermanzana} · {inc.reportedAt}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: 60 }]}>
            <Text style={styles.title}>{selected.folio}</Text>
            <View style={styles.card}>
              <Text style={styles.subtitle}>{selected.title}</Text>
              <Text style={styles.muted}>
                {STATUS_LABELS[selected.verificationStatus]} · {selected.reportedAt}
              </Text>
              {selected.photoUrl && (
                <Image
                  source={{
                    uri: selected.photoUrl.startsWith('/') ? absoluteUrl(selected.photoUrl) : selected.photoUrl,
                    headers: authHeader(),
                  }}
                  style={{ height: 220, borderRadius: 12, backgroundColor: colors.border }}
                  resizeMode="cover"
                />
              )}
              <Text>{selected.description}</Text>
              {selected.gyroscope && (
                <Text style={styles.muted}>
                  Orientación al reportar: {selected.gyroscope.alpha}° {selected.gyroscope.cardinal}
                </Text>
              )}
              {selected.recommendations.map((r) => (
                <Text key={r} style={styles.muted}>
                  • {r}
                </Text>
              ))}
            </View>
            <Button title="Cerrar" variant="secondary" onPress={() => setSelected(null)} />
          </ScrollView>
        )}
      </Modal>
    </ScrollView>
  );
}
