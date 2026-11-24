import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  Circle,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ShieldCheck,
  Clock,
  UserCheck,
  Navigation,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Compass,
  Camera,
  LocateFixed,
  Lock,
} from 'lucide-react';
import { GyroscopeTelemetry, IncidentReport, LatLng } from '../types/rabiaCun';
import {
  CANCUN_GEOFENCE_VERTICES,
  KABAH_MAP_CENTER,
  IMSS_HGR_17_COORDS,
  isPointInPolygon,
  detectSupermanzana,
  calculateDistanceMeters,
} from '../utils/geofence';
import { KABAH_LANDMARKS } from '../data/seedCancun';

interface IncidentMapProps {
  incidents: IncidentReport[];
  selectedIncidentId: string | null;
  onSelectIncident: (incident: IncidentReport) => void;
  isPickingLocation: boolean;
  viewCenter: LatLng;
  onViewCenterChange: (coords: LatLng) => void;
  onStartReportAtUserGps: () => void;
  userGpsLocation: LatLng;
  onUserGpsLocationChange: (coords: LatLng) => void;
  gpsSource: 'hardware_gps' | 'demo_academico';
  onRequestHardwareGps: () => void;
  isLocatingGps: boolean;
  demoModeEnabled: boolean;
  onToggleDemoMode: () => void;
  gyroscope: GyroscopeTelemetry;
  onAutoLookAngle?: (angleDeg: number) => void;
}

/**
 * Teselas de OpenStreetMap (gratuitas, requieren atribución visible).
 * Política de uso: https://operations.osmfoundation.org/policies/tiles/
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const DEFAULT_ZOOM = 15;
const USER_PRIVACY_RADIUS_METERS = 150;

/** Límites máximos de navegación: Cancún y alrededores (Puerto Morelos a Isla Blanca). */
const MAX_BOUNDS = L.latLngBounds([20.75, -87.15], [21.4, -86.6]);

const toLeaflet = (p: LatLng): [number, number] => [p.lat, p.lng];

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );

const statusColorOf = (inc: IncidentReport) =>
  inc.verificationStatus === 'verificado_oficial'
    ? '#087E8B'
    : inc.verificationStatus === 'en_revision'
    ? '#D97706'
    : '#123047';

const statusLetterOf = (inc: IncidentReport) =>
  inc.verificationStatus === 'verificado_oficial'
    ? 'V'
    : inc.verificationStatus === 'en_revision'
    ? 'R'
    : 'C';

function buildIncidentIcon(inc: IncidentReport, isSelected: boolean): L.DivIcon {
  const color = isSelected ? '#DC2626' : statusColorOf(inc);
  const showWaves =
    isSelected ||
    inc.verificationStatus === 'verificado_oficial' ||
    inc.verificationStatus === 'en_revision' ||
    Boolean(inc.gpsVerifiedInSitu);
  const waves = showWaves
    ? '<span class="rc-wave"></span><span class="rc-wave rc-wave-2"></span>'
    : '';
  const direction = inc.gyroscope
    ? `<span class="rc-dir" style="transform: rotate(${Math.round(
        inc.gyroscope.alpha
      )}deg)"></span>`
    : '';
  return L.divIcon({
    className: 'rc-leaflet-icon',
    html: `<div class="rc-inc${isSelected ? ' is-selected' : ''}" style="--rc-color:${color}">${waves}${direction}<span class="rc-dot">${statusLetterOf(
      inc
    )}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function buildLandmarkIcon(name: string, isHospital: boolean): L.DivIcon {
  return L.divIcon({
    className: 'rc-leaflet-icon',
    html: `<div class="rc-landmark${isHospital ? ' is-hospital' : ''}"><span class="rc-landmark-dot">${
      isHospital ? 'H' : ''
    }</span><span class="rc-landmark-label">${escapeHtml(name)}</span></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const USER_ICON = L.divIcon({
  className: 'rc-leaflet-icon rc-user-icon',
  html: `<div class="rc-user">
      <svg class="rc-user-cone" viewBox="-60 -60 120 120" width="120" height="120" aria-hidden="true">
        <path d="M 0 0 L -24 -52 A 56 56 0 0 1 24 -52 Z" fill="rgba(37,99,235,0.24)" stroke="#2563EB" stroke-width="1.2" />
        <polygon points="0,-46 -5,-34 5,-34" fill="#1D4ED8" />
      </svg>
      <span class="rc-user-halo"></span>
      <span class="rc-user-dot"></span>
      <span class="rc-user-label"></span>
    </div>`,
  iconSize: [120, 120],
  iconAnchor: [60, 60],
});

const formatDistance = (meters: number) =>
  meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;

/** Sincroniza el centro de la vista con el estado de la app y reporta la mirada del puntero. */
const MapSync: React.FC<{
  viewCenter: LatLng;
  onViewCenterChange: (coords: LatLng) => void;
  userGpsLocation: LatLng;
  onAutoLookAngle?: (angleDeg: number) => void;
}> = ({ viewCenter, onViewCenterChange, userGpsLocation, onAutoLookAngle }) => {
  const map = useMap();

  // Mover la cámara cuando el estado externo cambia (seleccionar incidente, GPS, presets)
  useEffect(() => {
    const current = map.getCenter();
    const dist = calculateDistanceMeters(
      { lat: current.lat, lng: current.lng },
      viewCenter
    );
    if (dist > 5) {
      // Saltos largos (otra zona de la ciudad) son instantáneos; los cortos se animan
      map.setView(toLeaflet(viewCenter), Math.max(map.getZoom(), DEFAULT_ZOOM), {
        animate: dist < 3000,
      });
    }
  }, [map, viewCenter.lat, viewCenter.lng]);

  // Mantener el tamaño correcto cuando el contenedor cambia (rotación de tableta, layout)
  useEffect(() => {
    const container = map.getContainer();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  const reportGaze = (containerPoint: L.Point) => {
    if (!onAutoLookAngle) return;
    const userPt = map.latLngToContainerPoint(toLeaflet(userGpsLocation));
    const dx = containerPoint.x - userPt.x;
    const dy = containerPoint.y - userPt.y;
    if (dx * dx + dy * dy > 100) {
      onAutoLookAngle(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
    }
  };

  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      onViewCenterChange({
        lat: Number(c.lat.toFixed(5)),
        lng: Number(c.lng.toFixed(5)),
      });
    },
    mousemove: (e) => reportGaze(e.containerPoint),
    click: (e) => reportGaze(e.containerPoint),
  });

  return null;
};

export const IncidentMap: React.FC<IncidentMapProps> = ({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  isPickingLocation,
  viewCenter,
  onViewCenterChange,
  onStartReportAtUserGps,
  userGpsLocation,
  onUserGpsLocationChange,
  gpsSource,
  onRequestHardwareGps,
  isLocatingGps,
  demoModeEnabled,
  onToggleDemoMode,
  gyroscope,
  onAutoLookAngle,
}) => {
  const [map, setMap] = useState<L.Map | null>(null);
  const [showPrivacyCircles, setShowPrivacyCircles] = useState<boolean>(true);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const insideGeofence = isPointInPolygon(userGpsLocation);
  const zoneInfo = detectSupermanzana(userGpsLocation);
  const distToImss = calculateDistanceMeters(userGpsLocation, IMSS_HGR_17_COORDS);

  // La posición inicial sólo se usa al montar; luego MapSync controla la cámara
  const [initialCenter] = useState<[number, number]>(() => toLeaflet(viewCenter));

  const visibleIncidents = useMemo(
    () =>
      [...incidents]
        .filter((inc) => inc.verificationStatus !== 'rechazado')
        .sort((a, b) =>
          a.id === selectedIncidentId ? 1 : b.id === selectedIncidentId ? -1 : 0
        ),
    [incidents, selectedIncidentId]
  );

  // Íconos memorizados: evita recrear el DOM (y reiniciar animaciones) en cada lectura del giroscopio
  const incidentIcons = useMemo(() => {
    const icons = new Map<string, L.DivIcon>();
    for (const inc of visibleIncidents) {
      icons.set(inc.id, buildIncidentIcon(inc, inc.id === selectedIncidentId));
    }
    return icons;
  }, [visibleIncidents, selectedIncidentId]);

  const landmarkIcons = useMemo(
    () =>
      new Map(
        KABAH_LANDMARKS.map((lm) => [
          lm.id,
          buildLandmarkIcon(lm.name, lm.category === 'hospital'),
        ])
      ),
    []
  );

  // Rotar el cono de visión directamente en el DOM (sensor de orientación a alta frecuencia)
  const applyUserHeading = () => {
    const el = userMarkerRef.current?.getElement();
    if (!el) return;
    const cone = el.querySelector<SVGElement>('.rc-user-cone');
    const label = el.querySelector<HTMLElement>('.rc-user-label');
    if (cone) cone.style.transform = `rotate(${gyroscope.alpha}deg)`;
    if (label) label.textContent = `Tú · ${gyroscope.cardinal}`;
  };
  useEffect(applyUserHeading, [gyroscope.alpha, gyroscope.cardinal]);

  // Ubicaciones simuladas para la demostración académica (dentro y fuera de la geocerca)
  const presetLocations: { label: string; coords: LatLng; inside: boolean }[] = [
    { label: 'Parque Kabah', coords: KABAH_MAP_CENTER, inside: true },
    { label: 'Centro (Av. Tulum)', coords: { lat: 21.1619, lng: -86.8268 }, inside: true },
    { label: 'Zona Hotelera', coords: { lat: 21.1035, lng: -86.7645 }, inside: true },
    { label: 'Puerto Juárez', coords: { lat: 21.1855, lng: -86.8105 }, inside: true },
    { label: 'Fuera: Puerto Morelos', coords: { lat: 20.847, lng: -86.875 }, inside: false },
    { label: 'Fuera: Isla Mujeres', coords: { lat: 21.232, lng: -86.731 }, inside: false },
  ];

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      {/* Top Geofence Bar (Concise) */}
      <div className="flex flex-col gap-2 px-4 py-2.5 bg-[#123047] text-white border-b border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {insideGeofence ? (
              <CheckCircle2 className="w-4 h-4 text-[#2DD4BF] shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-[#E7A83E] shrink-0" />
            )}
            <div className="text-xs truncate">
              <span className="font-semibold">
                {insideGeofence ? 'Dentro de Cancún' : 'Fuera de Cancún'}
              </span>
              <span className="mx-1.5 opacity-60">·</span>
              <span className="text-slate-200">{zoneInfo.code}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {typeof window !== 'undefined' && !window.isSecureContext && (
              <a
                href={`https://${window.location.hostname}:3443/`}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                title="Abrir en HTTPS para habilitar GPS y giroscopio físico en móvil"
              >
                <Lock className="w-3 h-3" />
                <span>HTTPS</span>
              </a>
            )}
            <button
              type="button"
              onClick={onRequestHardwareGps}
              disabled={isLocatingGps}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-[#087E8B] hover:bg-[#066873] text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LocateFixed className="w-3 h-3" />
              <span>{isLocatingGps ? 'GPS...' : gpsSource === 'hardware_gps' ? 'GPS activo' : 'Mi GPS'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleDemoMode}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                demoModeEnabled
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="Simular ubicación en otra zona para pruebas"
            >
              Demo
            </button>
          </div>
        </div>

        {/* Collapsible Academic Demo Bar */}
        {demoModeEnabled && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 border-t border-slate-700/80">
            <span className="text-[11px] text-amber-300 font-medium mr-1 whitespace-nowrap">
              Simular GPS:
            </span>
            {presetLocations.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onUserGpsLocationChange(preset.coords);
                  onViewCenterChange(preset.coords);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  Math.abs(userGpsLocation.lat - preset.coords.lat) < 0.0015 &&
                  Math.abs(userGpsLocation.lng - preset.coords.lng) < 0.0015
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : preset.inside
                    ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'bg-red-950/80 text-red-200 hover:bg-red-900/80'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Interactive Map (Leaflet + OpenStreetMap) */}
      <div
        data-testid="incident-map"
        className="relative isolate flex-1 min-h-[420px] bg-[#EEF2F6] overflow-hidden"
      >
        <MapContainer
          ref={setMap}
          center={initialCenter}
          zoom={DEFAULT_ZOOM}
          minZoom={11}
          maxZoom={19}
          maxBounds={MAX_BOUNDS}
          maxBoundsViscosity={0.8}
          zoomControl={false}
          className="absolute inset-0 w-full h-full"
          aria-label="Mapa interactivo de incidentes en Cancún"
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />

          <MapSync
            viewCenter={viewCenter}
            onViewCenterChange={onViewCenterChange}
            userGpsLocation={userGpsLocation}
            onAutoLookAngle={onAutoLookAngle}
          />

          {/* Geocerca de reporte: zona urbana de Cancún */}
          <Polygon
            positions={CANCUN_GEOFENCE_VERTICES.map(toLeaflet)}
            interactive={false}
            pathOptions={{
              color: '#087E8B',
              weight: 2,
              dashArray: '8 6',
              fillColor: '#087E8B',
              fillOpacity: 0.03,
            }}
          />

          {/* Radio público aproximado de cada incidente (privacidad) */}
          {showPrivacyCircles &&
            visibleIncidents.map((inc) => {
              const isSelected = inc.id === selectedIncidentId;
              const color = isSelected ? '#DC2626' : statusColorOf(inc);
              return (
                <Circle
                  key={`radius-${inc.id}`}
                  center={[inc.approxLat, inc.approxLng]}
                  radius={inc.privacyRadiusMeters || 150}
                  interactive={false}
                  pathOptions={{
                    color,
                    weight: isSelected ? 1.8 : 1.2,
                    dashArray: '4 3',
                    fillColor: color,
                    fillOpacity: isSelected ? 0.14 : 0.08,
                  }}
                />
              );
            })}

          {/* Puntos de referencia */}
          {KABAH_LANDMARKS.map((lm) => (
            <Marker
              key={lm.id}
              position={[lm.lat, lm.lng]}
              icon={landmarkIcons.get(lm.id)!}
              interactive={false}
              keyboard={false}
            />
          ))}

          {/* Marcadores de incidentes */}
          {visibleIncidents.map((inc) => (
            <Marker
              key={inc.id}
              position={[inc.approxLat, inc.approxLng]}
              icon={incidentIcons.get(inc.id)!}
              zIndexOffset={inc.id === selectedIncidentId ? 1000 : 0}
              title={inc.title}
              eventHandlers={{ click: () => onSelectIncident(inc) }}
            />
          ))}

          {/* Ubicación GPS del usuario + cono de orientación */}
          <Circle
            center={toLeaflet(userGpsLocation)}
            radius={USER_PRIVACY_RADIUS_METERS}
            interactive={false}
            pathOptions={{
              color: '#2563EB',
              weight: 1.5,
              dashArray: '4 3',
              fillColor: '#2563EB',
              fillOpacity: 0.08,
            }}
          />
          <Marker
            ref={userMarkerRef}
            position={toLeaflet(userGpsLocation)}
            icon={USER_ICON}
            interactive={false}
            keyboard={false}
            zIndexOffset={2000}
            eventHandlers={{ add: applyUserHeading }}
          />
        </MapContainer>

        {/* Floating Map Controls (Top-Right) */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-[1000]">
          <button
            type="button"
            onClick={() => map?.zoomIn()}
            aria-label="Acercar mapa"
            className="w-10 h-10 bg-white/95 hover:bg-white text-slate-800 border border-slate-200 rounded-xl shadow-xs flex items-center justify-center cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => map?.zoomOut()}
            aria-label="Alejar mapa"
            className="w-10 h-10 bg-white/95 hover:bg-white text-slate-800 border border-slate-200 rounded-xl shadow-xs flex items-center justify-center cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              onViewCenterChange(userGpsLocation);
              map?.setView(toLeaflet(userGpsLocation), 17);
            }}
            aria-label="Centrar en mi ubicación"
            title="Centrar en mi ubicación"
            className="w-10 h-10 bg-white/95 hover:bg-white text-blue-600 border border-slate-200 rounded-xl shadow-xs flex items-center justify-center cursor-pointer"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>

        {/* Map Legend & Toggles (Bottom) */}
        <div className="absolute bottom-6 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-[1000]">
          <div className="flex items-center gap-2 pointer-events-auto bg-white/95 backdrop-blur-xs px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-xs text-[11px]">
            <span className="inline-flex items-center gap-1 text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-[#087E8B]" />
              <span>Oficial</span>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1 text-slate-700">
              <Clock className="w-3.5 h-3.5 text-[#D97706]" />
              <span>Revisión</span>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1 text-slate-700">
              <UserCheck className="w-3.5 h-3.5 text-[#123047]" />
              <span>Ciudadano</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={() => setShowPrivacyCircles((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                showPrivacyCircles
                  ? 'bg-[#123047] text-white border-[#123047]'
                  : 'bg-white/95 text-slate-700 border-slate-200 hover:bg-white'
              }`}
            >
              <Navigation className="w-3 h-3" />
              <span>150m</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Direct Capture Action Bar (Concise) */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          IMSS HGR 17 a{' '}
          <strong className="text-slate-900 font-mono-tabular">
            {formatDistance(distToImss)}
          </strong>
        </div>

        {!isPickingLocation && (
          <button
            type="button"
            onClick={onStartReportAtUserGps}
            disabled={!insideGeofence}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-2 shadow-xs cursor-pointer ${
              insideGeofence
                ? 'bg-[#087E8B] text-white hover:bg-[#066873]'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>{insideGeofence ? 'Capturar Reporte' : 'Fuera de Cancún'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
