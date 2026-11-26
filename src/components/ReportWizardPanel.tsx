import React, { useState, useRef } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Lock,
  Camera,
  Send,
  MapPin,
  Trash2,
} from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isNativeApp } from '../services/serverConfig';
import {
  AnimalSpecies,
  EventType,
  GyroscopeTelemetry,
  IncidentReport,
  LatLng,
} from '../types/rabiaCun';
import {
  applyPrivacyApproximation,
  calculateDistanceMeters,
  detectSupermanzana,
  IMSS_HGR_17_COORDS,
  isPointInPolygon,
} from '../utils/geofence';

interface ReportWizardPanelProps {
  userGpsLocation: LatLng;
  gpsSource: 'hardware_gps' | 'demo_academico';
  onRequestHardwareGps: () => void;
  isLocatingGps: boolean;
  gyroscope: GyroscopeTelemetry;
  onSubmitReport: (newReport: IncidentReport) => void;
  onCancel: () => void;
  /** true mientras la API guarda el reporte (evita envíos duplicados) */
  isSubmitting?: boolean;
}

const EVENT_LABELS: Record<EventType, string> = {
  avistamiento: 'Avistamiento',
  comportamiento_erratico: 'Conducta errática',
  aranazo: 'Arañazo',
  mordedura: 'Mordedura',
};

const SPECIES_LABELS: Record<AnimalSpecies, string> = {
  zorra_gris: 'Zorra gris',
  perro: 'Perro sin dueño',
  gato: 'Gato sin dueño',
  coati_mapache: 'Coatí / Mapache',
  murcielago: 'Murciélago',
};

function compressImageDataUrl(dataUrl: string, maxWidth = 800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const ReportWizardPanel: React.FC<ReportWizardPanelProps> = ({
  userGpsLocation,
  gpsSource,
  onRequestHardwareGps,
  isLocatingGps,
  gyroscope,
  onSubmitReport,
  isSubmitting = false,
  onCancel,
}) => {
  const [eventType, setEventType] = useState<EventType>('avistamiento');
  const [species, setSpecies] = useState<AnimalSpecies>('zorra_gris');
  const [referenceLandmark, setReferenceLandmark] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const insidePolygon = isPointInPolygon(userGpsLocation);
  const zoneInfo = detectSupermanzana(userGpsLocation);
  const publicApprox = applyPrivacyApproximation(userGpsLocation);
  const distToHospital = calculateDistanceMeters(userGpsLocation, IMSS_HGR_17_COORDS);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFileName(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const compressed = await compressImageDataUrl(reader.result, 800);
        setPhotoPreviewUrl(compressed);
      }
    };
    reader.readAsDataURL(file);
    setFormError(null);
  };

  /**
   * Cámara: en la APK usa el complemento nativo @capacitor/camera (tomar foto
   * o elegir de la galería); en el navegador, el <input capture="environment">.
   */
  const handleTakePhoto = async () => {
    if (!isNativeApp()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const photo = await CapCamera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        quality: 75,
        width: 1280,
        correctOrientation: true,
        promptLabelHeader: 'Fotografía de evidencia',
        promptLabelPicture: 'Tomar foto',
        promptLabelPhoto: 'Elegir de la galería',
        promptLabelCancel: 'Cancelar',
      });
      if (photo.dataUrl) {
        setPhotoPreviewUrl(await compressImageDataUrl(photo.dataUrl, 800));
        setPhotoFileName(`camara.${photo.format}`);
        setFormError(null);
      }
    } catch (err) {
      // Cerrar la cámara sin tomar foto no es un error
      if (!/cancel/i.test(String((err as Error)?.message ?? ''))) {
        setFormError('No se pudo abrir la cámara. Revisa el permiso de cámara de la app.');
      }
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreviewUrl(null);
    setPhotoFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!insidePolygon) {
      setFormError('Tu ubicación actual está fuera de la zona urbana de Cancún.');
      return;
    }
    if (!photoPreviewUrl) {
      setFormError('Toma o adjunta una fotografía antes de enviar.');
      return;
    }
    if (description.trim().length < 10) {
      setFormError('Escribe una descripción breve (mínimo 10 caracteres).');
      return;
    }

    const folioNumber = Math.floor(120 + Math.random() * 850);
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(
      2,
      '0'
    )}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newReport: IncidentReport = {
      id: `inc-${Date.now()}`,
      folio: `CUN-2026-0${folioNumber}`,
      title: `${EVENT_LABELS[eventType]} · ${SPECIES_LABELS[species]} en ${zoneInfo.code}`,
      eventType,
      species,
      verificationStatus: 'reporte_ciudadano',
      approxLat: publicApprox.lat,
      approxLng: publicApprox.lng,
      privacyRadiusMeters: 150,
      supermanzana: zoneInfo.code,
      referenceLandmark: referenceLandmark.trim() || zoneInfo.code,
      reportedAt: formattedDate,
      description: description.trim(),
      photoUrl: photoPreviewUrl,
      gpsVerifiedInSitu: true,
      userDistanceToPinMeters: 0,
      gpsVerificationMode: gpsSource,
      gyroscope: { ...gyroscope },
      evidenceNote: `Captura en sitio (${photoFileName || 'camara.jpg'}) · Orientación ${
        gyroscope.cardinal
      } (${gyroscope.alpha}°).`,
      recommendations:
        eventType === 'mordedura' || eventType === 'aranazo'
          ? [
              'Lava la herida con agua y jabón por 15 min.',
              `Acude al IMSS HGR No. 17 (${distToHospital} m) para valoración.`,
            ]
          : ['Mantén distancia y evita interactuar con el ejemplar.'],
    };

    onSubmitReport(newReport);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 className="text-base font-bold text-[#123047]">Nuevo Reporte</h2>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
        >
          Cancelar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
          aria-label="Capturar fotografía"
        />

        {/* Camera capture button / preview */}
        {!photoPreviewUrl ? (
          <button
            type="button"
            onClick={handleTakePhoto}
            className="w-full py-5 px-4 rounded-2xl border-2 border-dashed border-[#087E8B] bg-teal-50/50 hover:bg-teal-50 transition-colors flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-xl bg-[#087E8B] text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-[#123047]">
              Tomar fotografía
            </span>
            <span className="text-[11px] text-slate-500">
              Cámara y ubicación actual
            </span>
          </button>
        ) : (
          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
            <img
              src={photoPreviewUrl}
              alt="Evidencia capturada"
              className="w-full h-40 object-cover"
            />
            <div className="px-3 py-2 bg-slate-900/90 text-white flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <CheckCircle2 className="w-4 h-4 text-[#2DD4BF] shrink-0" />
                <span className="truncate font-medium">Foto lista</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleTakePhoto}
                  className="px-2 py-1 rounded-md bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold cursor-pointer"
                >
                  Repetir
                </button>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  aria-label="Eliminar foto"
                  className="p-1 rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-200 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Compact GPS Location Status */}
        <div
          className={`px-3 py-2.5 rounded-xl border flex items-center justify-between gap-2 ${
            insidePolygon
              ? 'bg-blue-50/50 border-blue-200'
              : 'bg-red-50/70 border-red-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {insidePolygon ? (
              <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="text-xs font-semibold text-slate-800 truncate">
              {insidePolygon ? zoneInfo.code : 'Fuera de Cancún'}
            </span>
          </div>

          <button
            type="button"
            onClick={onRequestHardwareGps}
            disabled={isLocatingGps}
            className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg shrink-0 cursor-pointer"
          >
            {isLocatingGps ? 'GPS...' : 'Actualizar GPS'}
          </button>
        </div>

        {/* Event & Species */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="report-event-type"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Evento
            </label>
            <select
              id="report-event-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#087E8B]"
            >
              {(Object.keys(EVENT_LABELS) as EventType[]).map((key) => (
                <option key={key} value={key}>
                  {EVENT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-species"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Especie
            </label>
            <select
              id="report-species"
              value={species}
              onChange={(e) => setSpecies(e.target.value as AnimalSpecies)}
              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#087E8B]"
            >
              {(Object.keys(SPECIES_LABELS) as AnimalSpecies[]).map((key) => (
                <option key={key} value={key}>
                  {SPECIES_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="report-description"
            className="block text-[11px] font-semibold text-slate-600 mb-1"
          >
            Descripción
          </label>
          <textarea
            id="report-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="¿Qué observaste?"
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#087E8B]"
          />
        </div>

        <div>
          <input
            id="report-landmark"
            type="text"
            aria-label="Referencia visual opcional"
            value={referenceLandmark}
            onChange={(e) => setReferenceLandmark(e.target.value)}
            placeholder="Referencia cercana (opcional)"
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#087E8B]"
          />
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Publicación con radio aproximado de 150 m por privacidad.</span>
        </div>

        {formError && (
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={!insidePolygon || isSubmitting}
          className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            insidePolygon
              ? 'bg-[#087E8B] hover:bg-[#066873] text-white'
              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>{!insidePolygon ? 'Fuera de Cancún' : isSubmitting ? 'Enviando…' : 'Enviar Reporte'}</span>
        </button>
      </form>
    </div>
  );
};
