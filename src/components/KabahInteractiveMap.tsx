import React, { useState, useRef } from 'react';
import {
  ShieldCheck,
  Clock,
  UserCheck,
  Navigation,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Compass,
  Camera,
  LocateFixed,
  Lock,
} from 'lucide-react';
import { GyroscopeTelemetry, IncidentReport, LatLng } from '../types/rabiaCun';
import {
  KABAH_POLYGON_VERTICES,
  KABAH_MAP_CENTER,
  IMSS_HGR_17_COORDS,
  isPointInPolygon,
  detectSupermanzana,
  calculateDistanceMeters,
} from '../utils/geofence';
import { KABAH_LANDMARKS } from '../data/seedCancun';

interface KabahInteractiveMapProps {
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

// Bounding box covering the exact screenshot area of Cancún (SM 97/95/50/516 to Av. Bonampak/Huayacán)
const BOUNDS = {
  minLat: 21.1195,
  maxLat: 21.1575,
  minLng: -86.8645,
  maxLng: -86.8195,
};

function latLngToSvg(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 1000;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 680;
  return { x, y };
}

function svgToLatLng(x: number, y: number): LatLng {
  const lng = BOUNDS.minLng + (x / 1000) * (BOUNDS.maxLng - BOUNDS.minLng);
  const lat = BOUNDS.maxLat - (y / 680) * (BOUNDS.maxLat - BOUNDS.minLat);
  return {
    lat: Number(Math.max(BOUNDS.minLat, Math.min(BOUNDS.maxLat, lat)).toFixed(5)),
    lng: Number(Math.max(BOUNDS.minLng, Math.min(BOUNDS.maxLng, lng)).toFixed(5)),
  };
}

export const KabahInteractiveMap: React.FC<KabahInteractiveMapProps> = ({
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
  const [zoom, setZoom] = useState<number>(1);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showOriginalOverlay, setShowOriginalOverlay] = useState<boolean>(false);
  const [showPrivacyCircles, setShowPrivacyCircles] = useState<boolean>(true);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startLat: number;
    startLng: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const insideGeofence = isPointInPolygon(userGpsLocation);
  const zoneInfo = detectSupermanzana(userGpsLocation);
  const distToImss = calculateDistanceMeters(userGpsLocation, IMSS_HGR_17_COORDS);
  const userSvgPt = latLngToSvg(userGpsLocation.lat, userGpsLocation.lng);

  // Convert polygon vertices to SVG points
  const polygonSvgPoints = KABAH_POLYGON_VERTICES.map((v) => {
    const pt = latLngToSvg(v.lat, v.lng);
    return `${pt.x},${pt.y}`;
  }).join(' ');

  // Parque Ecológico Kabah inner green reserve polygon
  const kabahParkVertices: LatLng[] = [
    { lat: 21.1492, lng: -86.8364 },
    { lat: 21.1382, lng: -86.8322 },
    { lat: 21.1378, lng: -86.8422 },
  ];
  const kabahParkSvgPoints = kabahParkVertices
    .map((v) => {
      const pt = latLngToSvg(v.lat, v.lng);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');

  // Camera translation is purely for exploring the map (`viewCenter`), while reports always use `userGpsLocation`
  const centerSvg = latLngToSvg(viewCenter.lat, viewCenter.lng);
  const offsetX = 500 - centerSvg.x;
  const offsetY = 340 - centerSvg.y;

  const updateGazeFromPointer = (clientX: number, clientY: number) => {
    if (!onAutoLookAngle || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const userScreenX =
      rect.left +
      rect.width / 2 +
      ((userSvgPt.x - centerSvg.x) / 1000) * rect.width * zoom;
    const userScreenY =
      rect.top +
      rect.height / 2 +
      ((userSvgPt.y - centerSvg.y) / 680) * rect.height * zoom;
    const dx = clientX - userScreenX;
    const dy = clientY - userScreenY;
    if (dx * dx + dy * dy > 100) {
      const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      onAutoLookAngle(deg);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    updateGazeFromPointer(e.clientX, e.clientY);
    setIsDragging(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startLat: viewCenter.lat,
      startLng: viewCenter.lng,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current || !containerRef.current) {
      updateGazeFromPointer(e.clientX, e.clientY);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;

    const latSpan = (BOUNDS.maxLat - BOUNDS.minLat) / zoom;
    const lngSpan = (BOUNDS.maxLng - BOUNDS.minLng) / zoom;

    const dLng = -(dx / rect.width) * lngSpan;
    const dLat = (dy / rect.height) * latSpan;

    const nextLat = Math.max(
      BOUNDS.minLat + 0.002,
      Math.min(BOUNDS.maxLat - 0.002, dragStartRef.current.startLat + dLat)
    );
    const nextLng = Math.max(
      BOUNDS.minLng + 0.002,
      Math.min(BOUNDS.maxLng - 0.002, dragStartRef.current.startLng + dLng)
    );

    if (onAutoLookAngle) {
      const nextCenterSvg = latLngToSvg(nextLat, nextLng);
      const viewDx = nextCenterSvg.x - userSvgPt.x;
      const viewDy = nextCenterSvg.y - userSvgPt.y;
      if (viewDx * viewDx + viewDy * viewDy > 144) {
        const deg = ((Math.atan2(viewDx, -viewDy) * 180) / Math.PI + 360) % 360;
        onAutoLookAngle(deg);
      } else {
        updateGazeFromPointer(e.clientX, e.clientY);
      }
    }

    onViewCenterChange({
      lat: Number(nextLat.toFixed(5)),
      lng: Number(nextLng.toFixed(5)),
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Preset test locations to quickly test Uber pin inside vs outside polygon
  const presetLocations: { label: string; coords: LatLng; inside: boolean }[] = [
    {
      label: 'Parque Kabah (Centro)',
      coords: KABAH_MAP_CENTER,
      inside: true,
    },
    {
      label: 'SM 51 / Paraíso Villas',
      coords: { lat: 21.1318, lng: -86.8395 },
      inside: true,
    },
    {
      label: 'SM 48 / Av. Kohunlich',
      coords: { lat: 21.1422, lng: -86.8415 },
      inside: true,
    },
    {
      label: 'Fuera: SM 95 (Oeste)',
      coords: { lat: 21.1415, lng: -86.8565 },
      inside: false,
    },
    {
      label: 'Fuera: Av. Bonampak (Este)',
      coords: { lat: 21.1355, lng: -86.8235 },
      inside: false,
    },
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
                {insideGeofence ? 'Dentro del polígono' : 'Fuera del polígono'}
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

      {/* Main Interactive Map Canvas */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-testid="kabah-interactive-map"
        className={`relative flex-1 min-h-[420px] bg-[#EEF2F6] overflow-hidden select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Pannable & Zoomable Cartographic World Layer */}
        <div
          className="w-full h-full transition-transform duration-75 ease-out"
          style={{
            transform: `scale(${zoom}) translate(${(offsetX / 1000) * 100}%, ${(offsetY / 680) * 100}%)`,
            transformOrigin: 'center center',
          }}
        >
          <svg
            viewBox="0 0 1000 680"
            className="w-full h-full object-cover"
            aria-label="Mapa interactivo del Polígono Parque Ecológico Kabah en Cancún"
          >
            <defs>
              <pattern
                id="urbanBlocks"
                width="36"
                height="28"
                patternUnits="userSpaceOnUse"
              >
                <rect width="36" height="28" fill="#F1F5F9" />
                <rect
                  x="2"
                  y="2"
                  width="30"
                  height="22"
                  rx="2"
                  fill="#E2E8F0"
                  opacity="0.65"
                />
              </pattern>
              <pattern
                id="forestPattern"
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <rect width="24" height="24" fill="#DCFCE7" />
                <circle cx="8" cy="8" r="3" fill="#86EFAC" opacity="0.6" />
                <circle cx="18" cy="16" r="3.5" fill="#4ADE80" opacity="0.45" />
              </pattern>
            </defs>

            {/* Base Urban Grid */}
            <rect x="0" y="0" width="1000" height="680" fill="url(#urbanBlocks)" />

            {/* Secondary Neighborhood Streets */}
            <g stroke="#CBD5E1" strokeWidth="2.5" fill="none">
              {/* SM 95 / 50 / 516 horizontal streets */}
              <line x1="20" y1="220" x2="360" y2="220" />
              <line x1="20" y1="265" x2="380" y2="265" />
              <line x1="20" y1="310" x2="400" y2="310" />
              <line x1="20" y1="450" x2="680" y2="450" />
              <line x1="20" y1="495" x2="700" y2="495" />
              <line x1="20" y1="535" x2="710" y2="535" />
              {/* SM 51 / Paraíso Villas internal grid */}
              <line x1="420" y1="335" x2="660" y2="335" />
              <line x1="420" y1="385" x2="670" y2="385" />
              <line x1="460" y1="330" x2="460" y2="555" />
              <line x1="535" y1="330" x2="535" y2="550" />
              <line x1="610" y1="330" x2="610" y2="545" />
              {/* Av. Kinik & Av. Kohunlich */}
              <line x1="175" y1="140" x2="175" y2="575" strokeWidth="4" />
              <line x1="330" y1="155" x2="415" y2="330" strokeWidth="4.5" />
              {/* Av. Yaxchilán & Av. Labná */}
              <line x1="650" y1="180" x2="765" y2="20" strokeWidth="4" />
              <line x1="720" y1="80" x2="880" y2="210" strokeWidth="4" />
              <line x1="815" y1="25" x2="900" y2="180" strokeWidth="4" />
            </g>

            {/* Parque Ecológico Kabah Green Reserve */}
            <polygon
              points={kabahParkSvgPoints}
              fill="url(#forestPattern)"
              stroke="#4ADE80"
              strokeWidth="2"
            />

            {/* Primary Avenues of Cancún matching user screenshot */}
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              {/* Av. Andrés Quintana Roo (diagonal upper-left to north vertex) */}
              <path
                d="M 0 185 L 250 115 L 595 10"
                stroke="#FFFFFF"
                strokeWidth="12"
              />
              <path
                d="M 0 185 L 250 115 L 595 10"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeDasharray="6 6"
              />

              {/* Av. Nichupté (horizontal middle crossing right below Parque Kabah) */}
              <path
                d="M 0 385 L 185 330 L 675 330 L 900 395"
                stroke="#FFFFFF"
                strokeWidth="11"
              />

              {/* Av. Cancún / Las Torres (southern horizontal artery) */}
              <path
                d="M 0 568 L 718 538 L 870 595"
                stroke="#FFFFFF"
                strokeWidth="12"
              />

              {/* Av. Kabah / Av. Rodrigo Gómez (eastern border of Parque Kabah) */}
              <path
                d="M 580 10 L 675 330 L 718 538 L 735 680"
                stroke="#FDE68A"
                strokeWidth="13"
              />
              <path
                d="M 580 10 L 675 330 L 718 538 L 735 680"
                stroke="#F59E0B"
                strokeWidth="1.5"
              />

              {/* Av. Huayacán (south-east diagonal from vertex SE) */}
              <path
                d="M 718 538 L 620 680"
                stroke="#FFFFFF"
                strokeWidth="10"
              />

              {/* Av. Bonampak / Blvd. Luis Donaldo Colosio highway on right */}
              <path
                d="M 895 0 L 905 260 L 875 425 L 755 680"
                stroke="#94A3B8"
                strokeWidth="10"
              />
            </g>

            {/* Street & Supermanzana Typography Labels (Directly matching screenshot) */}
            <g
              fontFamily="Public Sans, sans-serif"
              fontSize="11"
              fontWeight="600"
              fill="#475569"
            >
              <text
                x="335"
                y="84"
                transform="rotate(-16 335 84)"
                fill="#334155"
              >
                Av. Andrés Quintana Roo
              </text>
              <text x="455" y="324" fill="#334155">
                Av. Nichupté
              </text>
              <text
                x="685"
                y="410"
                transform="rotate(77 685 410)"
                fill="#334155"
              >
                Av. Rodrigo Gómez (Kabah)
              </text>
              <text x="430" y="546" fill="#334155">
                Av. Cancún (Las Torres)
              </text>
              <text
                x="340"
                y="210"
                transform="rotate(62 340 210)"
                fontSize="10"
              >
                Av. Kohunlich
              </text>
              <text
                x="166"
                y="225"
                transform="rotate(90 166 225)"
                fontSize="10"
              >
                Av. Kinik
              </text>
              <text
                x="650"
                y="635"
                transform="rotate(-54 650 635)"
                fontSize="10"
              >
                Av. Huayacán
              </text>

              {/* Parque Ecológico Kabah Title */}
              <text
                x="565"
                y="245"
                textAnchor="middle"
                fill="#15803D"
                fontSize="14"
                fontWeight="700"
              >
                Parque
              </text>
              <text
                x="565"
                y="263"
                textAnchor="middle"
                fill="#15803D"
                fontSize="14"
                fontWeight="700"
              >
                Ecológico
              </text>
              <text
                x="565"
                y="281"
                textAnchor="middle"
                fill="#15803D"
                fontSize="14"
                fontWeight="700"
              >
                Kabah
              </text>

              {/* Supermanzana Numbers */}
              <text x="445" y="250" fontSize="13" fontWeight="700" fill="#1E293B">
                SM 48
              </text>
              <text x="285" y="260" fontSize="13" fontWeight="700" fill="#1E293B">
                SM 50
              </text>
              <text x="65" y="265" fontSize="13" fontWeight="700" fill="#64748B">
                SM 95
              </text>
              <text x="415" y="372" fontSize="13" fontWeight="700" fill="#1E293B">
                SM 51
              </text>
              <text
                x="485"
                y="488"
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill="#334155"
                letterSpacing="1"
              >
                PARAÍSO VILLAS
              </text>
              <text x="380" y="572" fontSize="14" fontWeight="700" fill="#1E293B">
                SM 523
              </text>
              <text x="135" y="575" fontSize="12" fontWeight="700" fill="#475569">
                SM 516
              </text>
              <text x="650" y="575" fontSize="12" fontWeight="700" fill="#1E293B">
                SM 56
              </text>
            </g>

            {/* THE RED TRIANGULAR GEOFENCE POLYGON FROM USER'S IMAGE */}
            <polygon
              points={polygonSvgPoints}
              fill={insideGeofence ? 'rgba(8, 126, 139, 0.09)' : 'rgba(220, 38, 38, 0.10)'}
              stroke="#DC2626"
              strokeWidth="5.5"
              strokeLinejoin="round"
            />

            {/* Polygon Vertex Reference Dots */}
            {KABAH_POLYGON_VERTICES.map((vertex, idx) => {
              const pt = latLngToSvg(vertex.lat, vertex.lng);
              return (
                <g key={idx}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="6"
                    fill="#DC2626"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                </g>
              );
            })}

            {/* Hospital & Key Reference Landmarks */}
            {KABAH_LANDMARKS.map((lm) => {
              const pt = latLngToSvg(lm.lat, lm.lng);
              const isHospital = lm.category === 'hospital';
              return (
                <g key={lm.id} transform={`translate(${pt.x}, ${pt.y})`}>
                  <circle
                    r={isHospital ? 11 : 7}
                    fill={isHospital ? '#E11D48' : '#334155'}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                  {isHospital && (
                    <text
                      y="4"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="11"
                      fontWeight="700"
                    >
                      H
                    </text>
                  )}
                  <text
                    x={isHospital ? -14 : 10}
                    y="4"
                    textAnchor={isHospital ? 'end' : 'start'}
                    fill={isHospital ? '#BE123C' : '#334155'}
                    fontSize="11"
                    fontWeight="700"
                  >
                    {lm.name}
                  </text>
                </g>
              );
            })}

            {/* Incident Report Markers + Animated Red Waves (Ondas Rojas) + 150m Privacy Circles */}
            {[...incidents]
              .filter((inc) => inc.verificationStatus !== 'rechazado')
              .sort((a, b) =>
                a.id === selectedIncidentId
                  ? 1
                  : b.id === selectedIncidentId
                  ? -1
                  : 0
              )
              .map((inc) => {
                const pt = latLngToSvg(inc.approxLat, inc.approxLng);
                const isSelected = inc.id === selectedIncidentId;
                const showRedWaves =
                  isSelected ||
                  inc.verificationStatus === 'verificado_oficial' ||
                  inc.verificationStatus === 'en_revision' ||
                  Boolean(inc.gpsVerifiedInSitu);

                const statusColor =
                  inc.verificationStatus === 'verificado_oficial'
                    ? '#087E8B'
                    : inc.verificationStatus === 'en_revision'
                    ? '#D97706'
                    : '#123047';

                return (
                  <g
                    key={inc.id}
                    transform={`translate(${pt.x}, ${pt.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectIncident(inc);
                    }}
                    className="cursor-pointer"
                  >
                    {/* Animated Concentric Red Radar Waves (Ondas Rojas) */}
                    {showRedWaves && (
                      <g pointerEvents="none">
                        {(isSelected ? [0, 0.7, 1.4] : [0, 1.1]).map(
                          (delay, waveIdx) => (
                            <circle
                              key={waveIdx}
                              cx="0"
                              cy="0"
                              r="11"
                              fill={
                                isSelected
                                  ? 'rgba(239, 68, 68, 0.22)'
                                  : 'rgba(239, 68, 68, 0.12)'
                              }
                              stroke={isSelected ? '#DC2626' : '#EF4444'}
                              strokeWidth={isSelected ? '2.6' : '1.8'}
                            >
                              <animate
                                attributeName="r"
                                from="11"
                                to={isSelected ? '58' : '38'}
                                dur={isSelected ? '2.1s' : '2.2s'}
                                begin={`${delay}s`}
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="opacity"
                                from={isSelected ? '0.92' : '0.65'}
                                to="0"
                                dur={isSelected ? '2.1s' : '2.2s'}
                                begin={`${delay}s`}
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="stroke-width"
                                from={isSelected ? '2.8' : '1.8'}
                                to="0.5"
                                dur={isSelected ? '2.1s' : '2.2s'}
                                begin={`${delay}s`}
                                repeatCount="indefinite"
                              />
                            </circle>
                          )
                        )}
                      </g>
                    )}

                    {/* 150m Privacy Approximation Radius Circle */}
                    {showPrivacyCircles && (
                      <circle
                        r={isSelected ? 34 : 26}
                        fill={isSelected ? '#EF4444' : statusColor}
                        fillOpacity={isSelected ? 0.14 : 0.1}
                        stroke={isSelected ? '#DC2626' : statusColor}
                        strokeWidth={isSelected ? 1.8 : 1.2}
                        strokeDasharray="4 3"
                      />
                    )}

                    {/* Outer Selection Halo */}
                    {isSelected && (
                      <circle
                        r="16"
                        fill="none"
                        stroke="#DC2626"
                        strokeWidth="2.5"
                      />
                    )}

                    {/* Optional Gyroscope Sighting Direction Pointer on Incident Marker */}
                    {inc.gyroscope && (
                      <g transform={`rotate(${inc.gyroscope.alpha})`}>
                        <polygon
                          points="0,-18 -4.5,-10 4.5,-10"
                          fill={isSelected ? '#DC2626' : statusColor}
                          stroke="#FFFFFF"
                          strokeWidth="1"
                        />
                      </g>
                    )}

                    {/* Core Incident Marker */}
                    <circle
                      r={isSelected ? 11 : 9}
                      fill={isSelected ? '#DC2626' : statusColor}
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                    />

                    {/* Inner semantic letter (V = Verificado, R = Revisión, C = Ciudadano) */}
                    <text
                      y="3.5"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="9.5"
                      fontWeight="700"
                    >
                      {inc.verificationStatus === 'verificado_oficial'
                        ? 'V'
                        : inc.verificationStatus === 'en_revision'
                        ? 'R'
                        : 'C'}
                    </text>
                  </g>
                );
              })}

            {/* USER PHYSICAL GPS LOCATION BLUE BEACON + AUTOMATIC VIEW CONE */}
            <g transform={`translate(${userSvgPt.x}, ${userSvgPt.y})`}>
              {/* 150m Public Privacy Radius around User's GPS */}
              <circle
                r="28"
                fill="rgba(37, 99, 235, 0.08)"
                stroke="#2563EB"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />

              {/* AUTOMATIC DIRECTIONAL VIEW CONE (Follows user's gaze/heading automatically) */}
              <g transform={`rotate(${gyroscope.alpha})`}>
                <path
                  d="M 0 0 L -24 -52 A 56 56 0 0 1 24 -52 Z"
                  fill="rgba(37, 99, 235, 0.24)"
                  stroke="#2563EB"
                  strokeWidth="1.2"
                />
                <polygon
                  points="0,-46 -5,-34 5,-34"
                  fill="#1D4ED8"
                />
              </g>

              {/* Outer GPS Pulse Halo */}
              <circle
                r="13"
                fill="rgba(37, 99, 235, 0.22)"
              />
              {/* User GPS Blue Dot */}
              <circle
                r="7"
                fill="#2563EB"
                stroke="#FFFFFF"
                strokeWidth="2.5"
              />
              <text
                y="22"
                textAnchor="middle"
                fill="#1D4ED8"
                fontSize="10"
                fontWeight="700"
              >
                {`Tú · ${gyroscope.cardinal}`}
              </text>
            </g>
          </svg>

          {/* Optional User Reference Image Overlay (`/assets/aistudio/image_c9cc877b.png`) */}
          {showOriginalOverlay && (
            <img
              src="/assets/aistudio/image_c9cc877b.png"
              alt="Referencia original del polígono trazado en Cancún"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-fill opacity-60 pointer-events-none"
            />
          )}
        </div>

        {/* Floating Map Controls (Top-Right) */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.25).toFixed(2))))}
            aria-label="Acercar mapa"
            className="w-10 h-10 bg-white/95 hover:bg-white text-slate-800 border border-slate-200 rounded-xl shadow-xs flex items-center justify-center cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.85, Number((z - 0.25).toFixed(2))))}
            aria-label="Alejar mapa"
            className="w-10 h-10 bg-white/95 hover:bg-white text-slate-800 border border-slate-200 rounded-xl shadow-xs flex items-center justify-center cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              onViewCenterChange(userGpsLocation);
              setZoom(1.2);
            }}
            aria-label="Centrar en mi ubicación"
            title="Centrar en mi ubicación"
            className="w-10 h-10 bg-white/95 hover:bg-white text-blue-600 border border-slate-200 rounded-xl shadow-xs flex items-center justify-center cursor-pointer"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>

        {/* Map Legend & Toggles (Bottom) */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
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
            <button
              type="button"
              onClick={() => setShowOriginalOverlay((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                showOriginalOverlay
                  ? 'bg-[#087E8B] text-white border-[#087E8B]'
                  : 'bg-white/95 text-slate-700 border-slate-200 hover:bg-white'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{showOriginalOverlay ? 'Ocultar' : 'Calcar'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Direct Capture Action Bar (Concise) */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          IMSS HGR 17 a{' '}
          <strong className="text-slate-900 font-mono-tabular">
            {distToImss} m
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
            <span>
              {insideGeofence ? 'Capturar Reporte' : 'Fuera del Polígono'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
