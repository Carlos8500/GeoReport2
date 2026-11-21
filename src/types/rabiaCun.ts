export type EventType =
  | 'avistamiento'
  | 'mordedura'
  | 'aranazo'
  | 'comportamiento_erratico';

export type AnimalSpecies =
  | 'zorra_gris'
  | 'perro'
  | 'gato'
  | 'coati_mapache'
  | 'murcielago';

export type VerificationStatus =
  | 'verificado_oficial'
  | 'en_revision'
  | 'reporte_ciudadano'
  | 'rechazado';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GyroscopeTelemetry {
  /** Azimut / orientación brújula (0° a 360°) */
  alpha: number;
  /** Inclinación frontal-trasera pitch (-180° a 180°) */
  beta: number;
  /** Inclinación lateral roll (-90° a 90°) */
  gamma: number;
  /** Punto cardinal calculado (N, NE, E, SE, S, SO, O, NO) */
  cardinal: string;
  /** Origen del sensor */
  source: 'sensor_hardware' | 'interactivo';
}

export interface IncidentReport {
  id: string;
  folio: string;
  title: string;
  eventType: EventType;
  species: AnimalSpecies;
  verificationStatus: VerificationStatus;
  approxLat: number;
  approxLng: number;
  privacyRadiusMeters: number;
  supermanzana: string;
  referenceLandmark: string;
  reportedAt: string;
  description: string;
  officialSource?: string;
  evidenceNote?: string;
  photoUrl?: string;
  gpsVerifiedInSitu?: boolean;
  userDistanceToPinMeters?: number;
  gpsVerificationMode?: 'hardware_gps' | 'demo_academico';
  gyroscope?: GyroscopeTelemetry;
  recommendations: string[];
}

export interface HealthAlert {
  id: string;
  folio: string;
  title: string;
  issuedAt: string;
  validUntil: string;
  zone: string;
  source: string;
  sourceUrl: string;
  severity: 'alta' | 'preventiva' | 'informativa';
  summary: string;
  recommendations: string[];
}

export interface LandmarkPoint {
  id: string;
  name: string;
  category: 'hospital' | 'parque' | 'comercio' | 'vialidad';
  lat: number;
  lng: number;
  supermanzana: string;
  detail: string;
}
