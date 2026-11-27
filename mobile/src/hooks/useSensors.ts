import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import { buildGyroscopeTelemetry } from '../shared/gyroscope';
import { GyroscopeTelemetry, LatLng } from '../shared/types';

export interface GpsState {
  position: (LatLng & { accuracy: number | null }) | null;
  permission: 'pendiente' | 'concedido' | 'denegado';
  error: string | null;
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Sensores del teléfono, todos incluidos en Expo Go:
 *  - GPS (expo-location · watchPositionAsync)
 *  - Brújula (expo-location · watchHeadingAsync) → alpha / punto cardinal
 *  - Giroscopio / acelerómetro fusionados (expo-sensors · DeviceMotion) → beta, gamma
 */
export function useSensors(): { gps: GpsState; gyroscope: GyroscopeTelemetry; motionAvailable: boolean } {
  const [gps, setGps] = useState<GpsState>({ position: null, permission: 'pendiente', error: null });
  const [heading, setHeading] = useState<number | null>(null);
  const [tilt, setTilt] = useState({ beta: 0, gamma: 0 });
  const [motionAvailable, setMotionAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const subs: { remove: () => void }[] = [];

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setGps({ position: null, permission: 'denegado', error: 'Permiso de ubicación denegado.' });
        return;
      }
      setGps((g) => ({ ...g, permission: 'concedido' }));
      try {
        subs.push(
          await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 3, timeInterval: 2000 },
            (loc) =>
              setGps({
                permission: 'concedido',
                error: null,
                position: {
                  lat: loc.coords.latitude,
                  lng: loc.coords.longitude,
                  accuracy: loc.coords.accuracy ?? null,
                },
              }),
            (reason) => setGps((g) => ({ ...g, error: reason }))
          )
        );
        subs.push(
          await Location.watchHeadingAsync((h) => setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading))
        );
      } catch (err) {
        setGps((g) => ({ ...g, error: (err as Error).message }));
      }

      if (await DeviceMotion.isAvailableAsync()) {
        const perm = await DeviceMotion.requestPermissionsAsync();
        if (cancelled || perm.status !== 'granted') return;
        setMotionAvailable(true);
        DeviceMotion.setUpdateInterval(250);
        subs.push(
          DeviceMotion.addListener((m) => {
            if (!m.rotation) return;
            setTilt({ beta: toDeg(m.rotation.beta), gamma: toDeg(m.rotation.gamma) });
          })
        );
      }
    })();

    return () => {
      cancelled = true;
      subs.forEach((s) => s.remove());
    };
  }, []);

  const gyroscope = buildGyroscopeTelemetry(
    heading ?? 0,
    tilt.beta,
    tilt.gamma,
    heading !== null || motionAvailable ? 'sensor_hardware' : 'interactivo'
  );

  return { gps, gyroscope, motionAvailable };
}
