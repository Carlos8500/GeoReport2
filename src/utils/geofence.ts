import { IncidentReport, LatLng } from '../types/rabiaCun';

/**
 * Geocerca principal: zona urbana de Cancún (Benito Juárez, Q. Roo).
 * Polígono aproximado que cubre Puerto Juárez, el Centro (SM 1-30), las Regiones
 * del poniente, el sur (Av. Huayacán / Aeropuerto) y la Zona Hotelera.
 * Excluye Isla Mujeres, Puerto Morelos y Playa del Carmen.
 * Coordenadas WGS84 (las mismas que entrega el GPS y usa OpenStreetMap).
 */
export const CANCUN_GEOFENCE_VERTICES: LatLng[] = [
  { lat: 21.25, lng: -86.96 }, // Noroeste
  { lat: 21.25, lng: -86.79 }, // Norte · Punta Sam
  { lat: 21.165, lng: -86.79 }, // Costa · Puerto Juárez
  { lat: 21.15, lng: -86.725 }, // Punta Cancún (Zona Hotelera norte)
  { lat: 21.02, lng: -86.755 }, // Punta Nizuc (Zona Hotelera sur)
  { lat: 20.99, lng: -86.83 }, // Sur · Aeropuerto
  { lat: 20.99, lng: -86.96 }, // Suroeste
  { lat: 21.12, lng: -86.99 }, // Poniente
];

/**
 * Área alrededor del Parque Ecológico Kabah donde se conocen las Supermanzanas
 * con más detalle (sólo para nombrar la zona de un reporte; no restringe nada).
 */
const KABAH_DETAIL_BOUNDS = {
  minLat: 21.125,
  maxLat: 21.154,
  minLng: -86.858,
  maxLng: -86.8285,
};

export const CANCUN_MAP_CENTER: LatLng = {
  lat: 21.1405,
  lng: -86.8466,
};

export const KABAH_MAP_CENTER: LatLng = {
  lat: 21.1372,
  lng: -86.8398,
};

export const IMSS_HGR_17_COORDS: LatLng = {
  lat: 21.1312,
  lng: -86.8535,
};

/**
 * Radio máximo permitido (en metros) entre la posición GPS real del usuario
 * y el punto donde coloca el pin de reporte estilo Uber.
 * Esto impide que usuarios reporten incidentes en lugares donde no se encuentran.
 */
export const MAX_IN_SITU_REPORT_DISTANCE_METERS = 200;

/**
 * Restringe una coordenada objetivo (draftPin) para que no exceda el radio máximo
 * permitido respecto a la ubicación GPS del usuario.
 */
export function clampToRadiusMeters(
  userLocation: LatLng,
  targetPoint: LatLng,
  maxRadiusMeters: number = MAX_IN_SITU_REPORT_DISTANCE_METERS
): LatLng {
  const dist = calculateDistanceMeters(userLocation, targetPoint);
  if (dist <= maxRadiusMeters || dist === 0) {
    return targetPoint;
  }
  const ratio = maxRadiusMeters / dist;
  return {
    lat: Number((userLocation.lat + (targetPoint.lat - userLocation.lat) * ratio).toFixed(5)),
    lng: Number((userLocation.lng + (targetPoint.lng - userLocation.lng) * ratio).toFixed(5)),
  };
}

/**
 * Ray-casting Point-in-Polygon: valida si una coordenada (lat, lng) está dentro
 * de un polígono. Por defecto usa la geocerca urbana de Cancún.
 */
export function isPointInPolygon(
  point: LatLng,
  polygon: LatLng[] = CANCUN_GEOFENCE_VERTICES
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 1e-12) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Sector aproximado de Cancún (sin servicios externos). Alrededor del Parque
 * Kabah se identifica la Supermanzana; en el resto de la ciudad se asigna una
 * región general.
 */
export function detectSupermanzana(point: LatLng): {
  code: string;
  sectorName: string;
  insidePolygon: boolean;
} {
  const inside = isPointInPolygon(point);

  if (!inside) {
    return {
      code: 'Fuera de Cancún',
      sectorName: 'Ubicación externa a la zona urbana de Cancún (Envío bloqueado)',
      insidePolygon: false,
    };
  }

  if (
    point.lat >= KABAH_DETAIL_BOUNDS.minLat &&
    point.lat <= KABAH_DETAIL_BOUNDS.maxLat &&
    point.lng >= KABAH_DETAIL_BOUNDS.minLng &&
    point.lng <= KABAH_DETAIL_BOUNDS.maxLng
  ) {
    return { ...detectKabahSector(point), insidePolygon: true };
  }

  if (point.lng > -86.795 && point.lat < 21.15) {
    return {
      code: 'Zona Hotelera',
      sectorName: 'Zona Hotelera · Blvd. Kukulcán (aprox.)',
      insidePolygon: true,
    };
  }
  if (point.lat >= 21.175) {
    return {
      code: 'Puerto Juárez / Norte',
      sectorName: 'Norte de Cancún · Puerto Juárez / Av. López Portillo (aprox.)',
      insidePolygon: true,
    };
  }
  if (point.lat >= 21.145 && point.lng > -86.845) {
    return {
      code: 'Centro (SM 1–30)',
      sectorName: 'Centro de Cancún · Av. Tulum / Av. Yaxchilán (aprox.)',
      insidePolygon: true,
    };
  }
  if (point.lat < 21.115) {
    return {
      code: 'Sur / Huayacán',
      sectorName: 'Sur de Cancún · Av. Huayacán / Aeropuerto (aprox.)',
      insidePolygon: true,
    };
  }
  if (point.lng < -86.86) {
    return {
      code: 'Regiones Poniente',
      sectorName: 'Poniente de Cancún · Regiones / Av. Kabah Oeste (aprox.)',
      insidePolygon: true,
    };
  }
  return {
    code: 'Cancún · Zona urbana',
    sectorName: 'Zona urbana de Cancún (aprox.)',
    insidePolygon: true,
  };
}

/** Supermanzanas alrededor del Parque Ecológico Kabah. */
function detectKabahSector(point: LatLng): { code: string; sectorName: string } {
  if (
    point.lat >= 21.1365 &&
    point.lat <= 21.1495 &&
    point.lng >= -86.8415 &&
    point.lng <= -86.8315
  ) {
    return {
      code: 'Parque Ecológico Kabah',
      sectorName: 'Reserva Urbana Kabah · Senderos y Área Silvestre',
    };
  }
  if (point.lat >= 21.1375 && point.lng < -86.8405) {
    return {
      code: 'SM 48',
      sectorName: 'Supermanzana 48 · Corredor Av. Kohunlich / Andrés Q. Roo',
    };
  }
  if (point.lat >= 21.1345 && point.lat < 21.142 && point.lng < -86.8445) {
    return {
      code: 'SM 50',
      sectorName: 'Supermanzana 50 · Sector Av. Kinik / Av. Nichupté',
    };
  }
  if (
    point.lat >= 21.1308 &&
    point.lat < 21.1375 &&
    point.lng >= -86.8465 &&
    point.lng <= -86.833
  ) {
    return {
      code: 'SM 51',
      sectorName: 'Supermanzana 51 · Av. Nichupté Sur / Rodrigo Gómez',
    };
  }
  if (point.lat < 21.1315 && point.lng >= -86.843) {
    return {
      code: 'SM 56 · Paraíso Villas',
      sectorName: 'Supermanzana 56 · Corredor Paraíso Villas / Av. Rodrigo Gómez',
    };
  }
  if (point.lat < 21.1345 && point.lng < -86.843) {
    return {
      code: 'SM 523 / SM 516',
      sectorName: 'Sector Suroeste · Av. Cancún (Las Torres) / Entorno IMSS HGR 17',
    };
  }
  return {
    code: 'Zona Av. Kabah',
    sectorName: 'Corredor Av. Kabah / Av. Nichupté (aprox.)',
  };
}

/**
 * Regla de Integridad (Pág. 2 del Brief):
 * "Las ubicaciones públicas serán aproximadas... No se publicarán nombres,
 * domicilios ni coordenadas sensibles."
 * Redondea la coordenada a una rejilla de ~150m (~0.0012 grados) garantizando
 * que el punto resultante permanezca dentro del polígono si el original lo estaba.
 */
export function applyPrivacyApproximation(point: LatLng): LatLng {
  const gridStep = 0.001; // ~111 metros
  const approx: LatLng = {
    lat: Number((Math.round(point.lat / gridStep) * gridStep).toFixed(4)),
    lng: Number((Math.round(point.lng / gridStep) * gridStep).toFixed(4)),
  };

  if (isPointInPolygon(point) && !isPointInPolygon(approx)) {
    return {
      lat: Number(point.lat.toFixed(4)),
      lng: Number(point.lng.toFixed(4)),
    };
  }
  return approx;
}

/**
 * Calcula la distancia en metros (fórmula de Haversine) entre dos coordenadas
 * para indicar a cuántos metros se encuentra el hospital IMSS HGR No. 17 más cercano.
 */
export function calculateDistanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c);
}

/**
 * Resumen estadístico descriptivo (Funcionalidad 6 del Brief RABIA-CUN)
 */
export function computeIncidentSummary(reports: IncidentReport[]) {
  const activeReports = reports.filter((r) => r.verificationStatus !== 'rechazado');
  const verifiedCount = activeReports.filter(
    (r) => r.verificationStatus === 'verificado_oficial'
  ).length;
  const inReviewCount = activeReports.filter(
    (r) => r.verificationStatus === 'en_revision'
  ).length;
  const citizenCount = activeReports.filter(
    (r) => r.verificationStatus === 'reporte_ciudadano'
  ).length;

  const bySpecies: Record<string, number> = {};
  const byEventType: Record<string, number> = {};
  const byZone: Record<string, number> = {};

  for (const r of activeReports) {
    bySpecies[r.species] = (bySpecies[r.species] || 0) + 1;
    byEventType[r.eventType] = (byEventType[r.eventType] || 0) + 1;
    byZone[r.supermanzana] = (byZone[r.supermanzana] || 0) + 1;
  }

  return {
    totalActive: activeReports.length,
    verifiedCount,
    inReviewCount,
    citizenCount,
    bySpecies,
    byEventType,
    byZone,
  };
}
