import { GyroscopeTelemetry, LatLng } from '../types/rabiaCun';

const CARDINAL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export function normalizeHeading(deg: number): number {
  const mod = ((deg % 360) + 360) % 360;
  return Math.round(mod) % 360;
}

export function normalizeHeadingFloat(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function shortestAngleDiff(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function degreesToCardinal(alpha: number): string {
  const norm = normalizeHeading(alpha);
  const idx = Math.round(norm / 45) % 8;
  return CARDINAL_DIRECTIONS[idx];
}

/**
 * Interpolación en punto flotante por el ángulo más corto.
 * No redondea el estado interno para que giros suaves o lentos nunca se estanquen.
 */
export function smoothHeadingFloat(
  current: number,
  target: number,
  factor = 0.45
): number {
  const diff = shortestAngleDiff(current, target);
  return normalizeHeadingFloat(current + diff * factor);
}

/**
 * Calcula el rumbo (0°=N, 90°=E, 180°=S, 270°=O) a partir de los ángulos del sensor.
 */
export function computeCompassHeading(
  alpha: number,
  beta: number,
  gamma: number,
  screenOrientationAngle = 0
): number {
  // En postura normal de lectura/mapa (|beta| < 70°), (360 - alpha) es estable
  // y evita inversiones de 180° o desvíos por inclinación lateral de la muñeca.
  if (Math.abs(beta) < 70) {
    return normalizeHeadingFloat(360 - alpha + screenOrientationAngle);
  }

  // En postura vertical (cámara apuntando al frente, |beta| >= 70°),
  // compensar gimbal lock proyectando el eje de la cámara trasera (-Z).
  const degToRad = Math.PI / 180;
  const a = alpha * degToRad;
  const b = beta * degToRad;
  const g = gamma * degToRad;

  const camE =
    -Math.sin(g) * Math.cos(a) - Math.sin(b) * Math.cos(g) * Math.sin(a);
  const camN =
    -Math.sin(g) * Math.sin(a) + Math.sin(b) * Math.cos(g) * Math.cos(a);

  if (camE * camE + camN * camN > 0.04) {
    const headingDeg = Math.atan2(camE, camN) * (180 / Math.PI);
    return normalizeHeadingFloat(headingDeg + screenOrientationAngle);
  }

  return normalizeHeadingFloat(360 - alpha + screenOrientationAngle);
}

/**
 * Calcula el azimut geográfico (0°=N, 90°=E, 180°=S, 270°=O) desde `from` hacia `to`.
 * Permite orientar automáticamente el cono hacia donde el usuario mira o se desplaza.
 */
export function computeBearingDegrees(from: LatLng, to: LatLng): number {
  const dLat = to.lat - from.lat;
  const dLng = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7) {
    return 0;
  }
  const angleDeg = Math.atan2(dLng, dLat) * (180 / Math.PI);
  return normalizeHeadingFloat(angleDeg);
}

export function buildGyroscopeTelemetry(
  alpha: number,
  beta: number,
  gamma: number,
  source: 'sensor_hardware' | 'interactivo'
): GyroscopeTelemetry {
  const normAlpha = normalizeHeading(alpha);
  const clampedBeta = Math.max(-180, Math.min(180, Math.round(beta)));
  const clampedGamma = Math.max(-90, Math.min(90, Math.round(gamma)));
  return {
    alpha: normAlpha,
    beta: clampedBeta,
    gamma: clampedGamma,
    cardinal: degreesToCardinal(normAlpha),
    source,
  };
}
