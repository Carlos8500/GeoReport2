/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck,
  Clock,
  UserCheck,
  PlusCircle,
  Bell,
  BarChart3,
  Map,
  CheckCircle2,
  Navigation,
  Wifi,
  WifiOff,
  AlertTriangle,
  Pencil,
  Trash2,
  UserRound,
  Lock,
  LogIn,
  XCircle,
} from 'lucide-react';
import {
  AnimalSpecies,
  AuthUser,
  EventType,
  GyroscopeTelemetry,
  HealthAlert,
  IncidentReport,
  LatLng,
  VerificationStatus,
} from './types/rabiaCun';
import {
  alertsApi,
  describeError,
  incidentsApi,
  IncidentEditPayload,
  subscribeToChanges,
} from './services/api';
import {
  IMSS_HGR_17_COORDS,
  KABAH_MAP_CENTER,
  calculateDistanceMeters,
} from './utils/geofence';
import {
  buildGyroscopeTelemetry,
  computeBearingDegrees,
  computeCompassHeading,
  normalizeHeading,
  normalizeHeadingFloat,
  shortestAngleDiff,
  smoothHeadingFloat,
} from './utils/gyroscope';
import { IncidentMap } from './components/IncidentMap';
import { ReportWizardPanel } from './components/ReportWizardPanel';
import {
  AlertsAndPreventionView,
  StatsAndAdminReviewView,
} from './components/SecondaryViews';
import { ProfileView } from './components/ProfileView';
import { AuthImage } from './components/AuthImage';

type ActiveTab = 'mapa' | 'alertas' | 'estadisticas' | 'perfil';
type ToastKind = 'success' | 'warning' | 'error';

const TOAST_STYLES: Record<ToastKind, string> = {
  success: 'bg-[#087E8B] text-white',
  warning: 'bg-[#E7A83E] text-slate-950',
  error: 'bg-red-700 text-white',
};

interface AppProps {
  /** null = visitante sin sesión (sólo consulta) */
  currentUser: AuthUser | null;
  onLogout: () => void;
  onUserChange: (user: AuthUser) => void;
  /** Muestra la pantalla de inicio de sesión con un mensaje opcional */
  onRequestLogin: (message?: string | null) => void;
}

const EDIT_EVENT_TYPES: EventType[] = [
  'avistamiento',
  'mordedura',
  'aranazo',
  'comportamiento_erratico',
];
const EDIT_SPECIES: AnimalSpecies[] = [
  'zorra_gris',
  'perro',
  'gato',
  'coati_mapache',
  'murcielago',
];

export default function App({
  currentUser,
  onLogout,
  onUserChange,
  onRequestLogin,
}: AppProps) {
  const isGuest = currentUser === null;
  const isAdmin = currentUser?.role === 'admin';
  /** El autor del reporte o un administrador pueden editarlo/eliminarlo. */
  const canModify = (incident: IncidentReport) =>
    Boolean(currentUser) &&
    (isAdmin || incident.ownerId === currentUser?.id);
  const [activeTab, setActiveTab] = useState<ActiveTab>('mapa');
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);
  const [editDraft, setEditDraft] = useState<IncidentEditPayload | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
    null
  );
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isReporting, setIsReporting] = useState<boolean>(false);
  const [draftLocation, setDraftLocation] = useState<LatLng>(KABAH_MAP_CENTER);
  const [userGpsLocation, setUserGpsLocation] = useState<LatLng>(KABAH_MAP_CENTER);
  const [gpsSource, setGpsSource] = useState<'hardware_gps' | 'demo_academico'>('demo_academico');
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [demoModeEnabled, setDemoModeEnabled] = useState<boolean>(false);
  const [gyroscope, setGyroscope] = useState<GyroscopeTelemetry>(() =>
    buildGyroscopeTelemetry(0, 70, 0, 'interactivo')
  );
  // true = la API respondió en la última consulta; false = sin servidor
  const [apiOnline, setApiOnline] = useState<boolean>(false);
  // Aviso temporal: confirmación (verde), advertencia (ámbar) o error (rojo)
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);

  const hasAbsoluteOrientationRef = useRef<boolean>(false);
  const lastDeviceOrientationEventTimeRef = useRef<number>(0);
  const lastHardwareOrientationTimeRef = useRef<number>(0);
  const lastUiSyncTimeRef = useRef<number>(0);
  const smoothedHeadingRef = useRef<number>(0);
  const lastRenderedHeadingRef = useRef<number>(0);
  const lastBetaRef = useRef<number>(70);
  const lastGammaRef = useRef<number>(0);
  const lastMotionTimeRef = useRef<number>(0);
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iosGyroRequestedRef = useRef<boolean>(false);
  const geoWatchIdRef = useRef<number | null>(null);

  const visibleIncidents = incidents.filter((inc) => {
    if (inc.verificationStatus === 'rechazado') return false;
    if (statusFilter !== 'all' && inc.verificationStatus !== statusFilter) {
      return false;
    }
    return true;
  });

  const selectedIncident =
    incidents.find((i) => i.id === selectedIncidentId) ||
    visibleIncidents[0] ||
    null;

  useEffect(() => {
    setEditDraft(null);
  }, [selectedIncident?.id]);

  const showToast = useCallback((msg: string, kind: ToastKind = 'success') => {
    setToast({ message: msg, kind });
    // Los errores permanecen más tiempo en pantalla para poder leerlos
    setTimeout(() => {
      setToast((current) => (current?.message === msg ? null : current));
    }, kind === 'error' ? 8000 : 4000);
  }, []);

  // 1. CARGA DE DATOS DESDE LA API + SINCRONIZACIÓN EN TIEMPO REAL (SSE)
  const loadIncidents = useCallback(async () => {
    try {
      const data = await incidentsApi.list();
      setIncidents(data);
      setApiOnline(true);
      return true;
    } catch {
      setApiOnline(false);
      return false;
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await alertsApi.list());
    } catch {
      // El estado de conexión ya lo reporta loadIncidents
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    Promise.all([loadIncidents(), loadAlerts()]).then(([ok]) => {
      if (!isMounted) return;
      setIsLoadingData(false);
      if (!ok) {
        showToast('No hay conexión con el servidor. Verifica que Docker esté encendido.', 'error');
      }
    });

    // Otro dispositivo cambió datos -> volver a consultar la API
    const unsubscribe = subscribeToChanges(
      (resource) => {
        if (resource === 'incidents') loadIncidents();
        else loadAlerts();
      },
      (connected) => {
        if (connected) loadIncidents();
      }
    );

    // Respaldo: algunos navegadores móviles suspenden EventSource en segundo plano
    const pollInterval = setInterval(loadIncidents, 15000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [loadIncidents, loadAlerts, showToast]);

  // 2. AUTOMATIC GYROSCOPE / COMPASS ORIENTATION + GAZE / GPS TRACKING
  const commitHeadingToState = useCallback(
    (
      nextSmoothFloat: number,
      beta: number,
      gamma: number,
      source: 'sensor_hardware' | 'interactivo'
    ) => {
      smoothedHeadingRef.current = nextSmoothFloat;
      lastBetaRef.current = beta;
      lastGammaRef.current = gamma;

      const rounded = normalizeHeading(nextSmoothFloat);
      const diffFromRendered = Math.abs(
        shortestAngleDiff(lastRenderedHeadingRef.current, rounded)
      );
      const now = Date.now();

      if (
        lastUiSyncTimeRef.current === 0 ||
        (now - lastUiSyncTimeRef.current >= 40 && diffFromRendered >= 1)
      ) {
        if (trailingTimerRef.current) {
          clearTimeout(trailingTimerRef.current);
          trailingTimerRef.current = null;
        }
        lastRenderedHeadingRef.current = rounded;
        lastUiSyncTimeRef.current = now;
        setGyroscope(buildGyroscopeTelemetry(rounded, beta, gamma, source));
      } else if (diffFromRendered >= 1 && !trailingTimerRef.current) {
        trailingTimerRef.current = setTimeout(() => {
          trailingTimerRef.current = null;
          const finalRounded = normalizeHeading(smoothedHeadingRef.current);
          lastRenderedHeadingRef.current = finalRounded;
          lastUiSyncTimeRef.current = Date.now();
          setGyroscope(
            buildGyroscopeTelemetry(
              finalRounded,
              lastBetaRef.current,
              lastGammaRef.current,
              source
            )
          );
        }, 45);
      }
    },
    []
  );

  // Synchronous iOS 13+ permission request (must execute synchronously inside user gesture)
  const ensureIosGyroPermission = useCallback(() => {
    if (iosGyroRequestedRef.current) return;
    try {
      const DeviceOrientationEventAny =
        typeof DeviceOrientationEvent !== 'undefined'
          ? (DeviceOrientationEvent as any)
          : null;
      if (
        DeviceOrientationEventAny &&
        typeof DeviceOrientationEventAny.requestPermission === 'function'
      ) {
        iosGyroRequestedRef.current = true;
        DeviceOrientationEventAny.requestPermission().catch(() => {
          iosGyroRequestedRef.current = false;
        });
      }
      const DeviceMotionEventAny =
        typeof DeviceMotionEvent !== 'undefined'
          ? (DeviceMotionEvent as any)
          : null;
      if (
        DeviceMotionEventAny &&
        typeof DeviceMotionEventAny.requestPermission === 'function'
      ) {
        DeviceMotionEventAny.requestPermission().catch(() => {});
      }
    } catch {
      // Ignored if unavailable
    }
  }, []);

  useEffect(() => {
    const getScreenOrientationAngle = () => {
      if (typeof window.screen?.orientation?.angle === 'number') {
        return window.screen.orientation.angle;
      }
      if (typeof (window as any).orientation === 'number') {
        return (window as any).orientation;
      }
      return 0;
    };

    const handleOrientation = (
      event: DeviceOrientationEvent,
      isAbsoluteEvent: boolean
    ) => {
      if (typeof event.beta === 'number') lastBetaRef.current = event.beta;
      if (typeof event.gamma === 'number') lastGammaRef.current = event.gamma;

      const webkitHeading = (event as any).webkitCompassHeading;
      if (
        event.alpha === null &&
        typeof webkitHeading !== 'number'
      ) {
        return;
      }

      if (
        !isAbsoluteEvent &&
        hasAbsoluteOrientationRef.current &&
        !event.absolute &&
        typeof webkitHeading !== 'number'
      ) {
        return;
      }

      if (isAbsoluteEvent || event.absolute) {
        hasAbsoluteOrientationRef.current = true;
      }

      const screenAngle = getScreenOrientationAngle();
      const rawHeading =
        typeof webkitHeading === 'number'
          ? normalizeHeadingFloat(webkitHeading + screenAngle)
          : typeof event.alpha === 'number'
          ? computeCompassHeading(
              event.alpha,
              event.beta ?? 0,
              event.gamma ?? 0,
              screenAngle
            )
          : smoothedHeadingRef.current;

      const rawBeta = typeof event.beta === 'number' ? event.beta : 70;
      const rawGamma = typeof event.gamma === 'number' ? event.gamma : 0;

      const now = Date.now();
      lastDeviceOrientationEventTimeRef.current = now;
      lastHardwareOrientationTimeRef.current = now;
      const nextSmooth =
        lastUiSyncTimeRef.current === 0
          ? rawHeading
          : smoothHeadingFloat(smoothedHeadingRef.current, rawHeading, 0.45);

      commitHeadingToState(nextSmooth, rawBeta, rawGamma, 'sensor_hardware');
    };

    // Fallback: Hardware Gyroscope angular velocity integration (DeviceMotionEvent.rotationRate)
    // For devices that have a physical gyroscope but no magnetometer (alpha === null)
    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      const now = Date.now();
      // Only use angular velocity integration if compass orientation didn't fire recently
      if (now - lastDeviceOrientationEventTimeRef.current < 400) {
        lastMotionTimeRef.current = now;
        return;
      }
      const rot = event.rotationRate;
      if (!rot) return;
      const rotAlpha = typeof rot.alpha === 'number' ? rot.alpha : 0;
      const rotGamma = typeof rot.gamma === 'number' ? rot.gamma : 0;
      const betaRad = (lastBetaRef.current * Math.PI) / 180;
      const verticalYawRate =
        rotAlpha * Math.cos(betaRad) + rotGamma * Math.sin(betaRad);

      if (Math.abs(verticalYawRate) < 1.2) {
        lastMotionTimeRef.current = now;
        return;
      }
      if (lastMotionTimeRef.current > 0) {
        const dtSec = Math.min(0.2, (now - lastMotionTimeRef.current) / 1000);
        const nextAngle = normalizeHeadingFloat(
          smoothedHeadingRef.current - verticalYawRate * dtSec
        );
        lastHardwareOrientationTimeRef.current = now;
        commitHeadingToState(
          nextAngle,
          lastBetaRef.current,
          lastGammaRef.current,
          'sensor_hardware'
        );
      }
      lastMotionTimeRef.current = now;
    };

    const onRelativeOrientation = (e: DeviceOrientationEvent) =>
      handleOrientation(e, false);
    const onAbsoluteOrientation = (e: Event) =>
      handleOrientation(e as DeviceOrientationEvent, true);

    window.addEventListener('deviceorientationabsolute', onAbsoluteOrientation, true);
    window.addEventListener('deviceorientation', onRelativeOrientation, true);
    window.addEventListener('devicemotion', handleDeviceMotion, true);

    // Optional W3C Generic Sensor API (AbsoluteOrientationSensor / RelativeOrientationSensor)
    let genericSensor: any = null;
    try {
      const SensorClass =
        (window as any).AbsoluteOrientationSensor ||
        (window as any).RelativeOrientationSensor;
      if (typeof SensorClass === 'function') {
        genericSensor = new SensorClass({ frequency: 30, referenceFrame: 'device' });
        genericSensor.addEventListener('reading', () => {
          const now = Date.now();
          if (now - lastDeviceOrientationEventTimeRef.current < 300) return;
          const q = genericSensor?.quaternion;
          if (Array.isArray(q) && q.length === 4) {
            const [qx, qy, qz, qw] = q;
            const yawRad = Math.atan2(
              2 * (qx * qy + qw * qz),
              1 - 2 * (qy * qy + qz * qz)
            );
            const heading = normalizeHeadingFloat(
              360 - (yawRad * 180) / Math.PI + getScreenOrientationAngle()
            );
            lastHardwareOrientationTimeRef.current = now;
            const nextSmooth = smoothHeadingFloat(
              smoothedHeadingRef.current,
              heading,
              0.45
            );
            commitHeadingToState(
              nextSmooth,
              lastBetaRef.current,
              lastGammaRef.current,
              'sensor_hardware'
            );
          }
        });
        genericSensor.addEventListener('error', () => {});
        genericSensor.start();
      }
    } catch {
      // Generic Sensor API not supported or blocked
    }

    const onUserGesture = () => {
      ensureIosGyroPermission();
    };
    window.addEventListener('click', onUserGesture, false);
    window.addEventListener('touchend', onUserGesture, false);

    return () => {
      window.removeEventListener(
        'deviceorientationabsolute',
        onAbsoluteOrientation,
        true
      );
      window.removeEventListener('deviceorientation', onRelativeOrientation, true);
      window.removeEventListener('devicemotion', handleDeviceMotion, true);
      window.removeEventListener('click', onUserGesture, false);
      window.removeEventListener('touchend', onUserGesture, false);
      if (genericSensor && typeof genericSensor.stop === 'function') {
        try {
          genericSensor.stop();
        } catch {
          // ignore
        }
      }
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
      }
    };
  }, [commitHeadingToState, ensureIosGyroPermission]);

  // Automatic gaze orientation from map pointer / pan / movement when hardware sensor hasn't fired recently
  const handleAutoLookAngle = useCallback(
    (targetAngleDeg: number) => {
      if (Date.now() - lastHardwareOrientationTimeRef.current < 2000) {
        return;
      }
      const nextSmooth =
        lastUiSyncTimeRef.current === 0
          ? targetAngleDeg
          : smoothHeadingFloat(smoothedHeadingRef.current, targetAngleDeg, 0.4);
      commitHeadingToState(
        nextSmooth,
        lastBetaRef.current,
        lastGammaRef.current,
        'interactivo'
      );
    },
    [commitHeadingToState]
  );

  const startLiveGpsWatch = useCallback(() => {
    if (!('geolocation' in navigator) || geoWatchIdRef.current !== null) return;
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const realCoords: LatLng = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        setUserGpsLocation((prevCoords) => {
          if (Date.now() - lastHardwareOrientationTimeRef.current > 2000) {
            const gpsHeading = pos.coords.heading;
            if (typeof gpsHeading === 'number' && !Number.isNaN(gpsHeading)) {
              commitHeadingToState(
                normalizeHeadingFloat(gpsHeading),
                lastBetaRef.current,
                lastGammaRef.current,
                'sensor_hardware'
              );
            } else {
              const distMoved = calculateDistanceMeters(prevCoords, realCoords);
              if (distMoved >= 4) {
                const moveBearing = computeBearingDegrees(prevCoords, realCoords);
                commitHeadingToState(
                  moveBearing,
                  lastBetaRef.current,
                  lastGammaRef.current,
                  'sensor_hardware'
                );
              }
            }
          }
          return realCoords;
        });
        setGpsSource('hardware_gps');
      },
      () => {
        // Ignore silent watch errors
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }, [commitHeadingToState]);

  // Automatically attach GPS watcher if permission was already granted
  useEffect(() => {
    if ('permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (status.state === 'granted') {
            startLiveGpsWatch();
          }
        })
        .catch(() => {
          // Permissions API not supported
        });
    }
    return () => {
      if (geoWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    };
  }, [startLiveGpsWatch]);

  const handleRequestHardwareGps = () => {
    ensureIosGyroPermission();
    if (!('geolocation' in navigator)) {
      showToast('El navegador no soporta geolocalización.', 'error');
      return;
    }
    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const realCoords: LatLng = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        setIsLocatingGps(false);
        setUserGpsLocation(realCoords);
        setDraftLocation(realCoords);
        setGpsSource('hardware_gps');
        startLiveGpsWatch();
        showToast('GPS actualizado.');
      },
      () => {
        setIsLocatingGps(false);
        showToast('Sin acceso al GPS. Usa Demo para simular ubicación.', 'warning');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const handleStartReport = () => {
    if (isGuest) {
      onRequestLogin('Inicia sesión o crea una cuenta para enviar un reporte.');
      return;
    }
    ensureIosGyroPermission();
    setActiveTab('mapa');
    setDraftLocation(userGpsLocation);
    setIsReporting(true);
  };

  const handleCreateReport = async (newReport: IncidentReport) => {
    if (isSubmittingReport) return;
    // id, folio, estado y fecha los asigna el servidor
    const {
      id: _id,
      folio: _folio,
      verificationStatus: _status,
      reportedAt: _reportedAt,
      photoUrl,
      ...fields
    } = newReport;

    setIsSubmittingReport(true);
    try {
      const created = await incidentsApi.create({
        ...fields,
        photoDataUrl: photoUrl ?? null,
      });
      setIncidents((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);
      setSelectedIncidentId(created.id);
      setDraftLocation({ lat: created.approxLat, lng: created.approxLng });
      setActiveTab('mapa');
      setIsReporting(false);
      setStatusFilter('all');
      setApiOnline(true);
      showToast(`Reporte ${created.folio} registrado en ${created.supermanzana}.`);
    } catch (err) {
      // El formulario se mantiene abierto con sus datos para reintentar
      showToast(`No se pudo enviar el reporte: ${describeError(err)}`, 'error');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleStartEdit = (incident: IncidentReport) => {
    setEditDraft({
      title: incident.title,
      eventType: incident.eventType,
      species: incident.species,
      referenceLandmark: incident.referenceLandmark,
      description: incident.description,
    });
  };

  const handleSaveEdit = async (incidentId: string) => {
    if (!editDraft) return;
    if (editDraft.title.trim().length < 5) {
      showToast('El título debe tener al menos 5 caracteres.', 'warning');
      return;
    }
    if (editDraft.description.trim().length < 10) {
      showToast('La descripción debe tener al menos 10 caracteres.', 'warning');
      return;
    }
    setIsSavingEdit(true);
    try {
      const updated = await incidentsApi.update(incidentId, editDraft);
      setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditDraft(null);
      showToast(`Reporte ${updated.folio} actualizado.`);
    } catch (err) {
      showToast(`No se pudo actualizar: ${describeError(err)}`, 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteIncident = async (incident: IncidentReport) => {
    const confirmed = window.confirm(
      `¿Eliminar definitivamente el reporte ${incident.folio}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    try {
      await incidentsApi.remove(incident.id);
      setIncidents((prev) => prev.filter((i) => i.id !== incident.id));
      setSelectedIncidentId(null);
      setEditDraft(null);
      showToast(`Reporte ${incident.folio} eliminado.`);
    } catch (err) {
      showToast(`No se pudo eliminar: ${describeError(err)}`, 'error');
    }
  };

  const handleUpdateIncidentStatus = async (
    incidentId: string,
    newStatus: VerificationStatus,
    officialSource: string,
    evidenceNote: string
  ) => {
    const targetIncident = incidents.find((inc) => inc.id === incidentId);
    if (targetIncident && newStatus !== 'rechazado') {
      setSelectedIncidentId(targetIncident.id);
      setDraftLocation({
        lat: targetIncident.approxLat,
        lng: targetIncident.approxLng,
      });
    }

    try {
      const updated = await incidentsApi.verify(
        incidentId,
        newStatus,
        officialSource,
        evidenceNote
      );
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === updated.id ? updated : inc))
      );
      showToast(`Estado de ${updated.folio} actualizado.`);
    } catch (err) {
      showToast(`No se pudo actualizar el estado: ${describeError(err)}`, 'error');
    }
  };

  const statusLabel = (status: VerificationStatus) => {
    switch (status) {
      case 'verificado_oficial':
        return 'Oficial';
      case 'en_revision':
        return 'En revisión';
      case 'reporte_ciudadano':
        return 'Ciudadano';
      case 'rechazado':
        return 'Descartado';
    }
  };

  const eventLabel = (type: IncidentReport['eventType']) => {
    switch (type) {
      case 'avistamiento':
        return 'Avistamiento';
      case 'mordedura':
        return 'Mordedura';
      case 'aranazo':
        return 'Arañazo';
      case 'comportamiento_erratico':
        return 'Conducta errática';
    }
  };

  const speciesLabel = (sp: IncidentReport['species']) => {
    switch (sp) {
      case 'zorra_gris':
        return 'Zorra gris';
      case 'perro':
        return 'Perro sin dueño';
      case 'gato':
        return 'Gato sin dueño';
      case 'coati_mapache':
        return 'Coatí / Mapache';
      case 'murcielago':
        return 'Murciélago';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 pb-16 md:pb-0">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-[#123047] text-white border-b border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#mapa"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('mapa');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display"
        >
          RABIA-CUN
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Navegación principal"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-200"
        >
          <button
            type="button"
            onClick={() => setActiveTab('mapa')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'mapa'
                ? 'text-white underline underline-offset-8 decoration-[#2DD4BF] decoration-2 font-semibold'
                : 'hover:text-white'
            }`}
          >
            Mapa
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alertas')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'alertas'
                ? 'text-white underline underline-offset-8 decoration-[#2DD4BF] decoration-2 font-semibold'
                : 'hover:text-white'
            }`}
          >
            Alertas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('estadisticas')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'estadisticas'
                ? 'text-white underline underline-offset-8 decoration-[#2DD4BF] decoration-2 font-semibold'
                : 'hover:text-white'
            }`}
          >
            {isAdmin ? 'Revisión' : 'Estadísticas'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('perfil')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'perfil'
                ? 'text-white underline underline-offset-8 decoration-[#2DD4BF] decoration-2 font-semibold'
                : 'hover:text-white'
            }`}
          >
            {isGuest ? 'Cuenta' : 'Perfil'}
          </button>
        </nav>

        {/* Zone 3: primary action (+ entrar para visitantes) */}
        <div className="flex items-center gap-2 shrink-0">
          {isGuest && (
            <button
              type="button"
              onClick={() => onRequestLogin(null)}
              className="px-3 py-2 text-xs font-semibold text-white border border-white/30 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleStartReport}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#087E8B] hover:bg-[#066873] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Nuevo Reporte
          </button>
        </div>
      </header>

      {/* Toast Feedback Banner: éxito, advertencia o error */}
      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`${TOAST_STYLES[toast.kind]} px-6 py-2 text-xs font-medium flex items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {toast.kind === 'error' ? (
              <XCircle className="w-4 h-4 shrink-0" />
            ) : toast.kind === 'warning' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span className={toast.kind === 'success' ? 'truncate' : 'break-words'}>
              {toast.message}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {toast.kind === 'success' && activeTab !== 'mapa' && (
              <button
                type="button"
                onClick={() => {
                  setIsReporting(false);
                  setActiveTab('mapa');
                  setToast(null);
                }}
                className="px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-semibold cursor-pointer"
              >
                Ver en mapa
              </button>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="underline opacity-90 hover:opacity-100 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4">
        {/* Compact Top Bar: Zone Title + LAN Badge + Filters */}
        <section className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-[#123047] truncate">
              Vigilancia Sanitaria · Cancún
            </h1>
            {apiOnline ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold shrink-0">
                <Wifi className="w-3 h-3" />
                <span>Servidor en línea</span>
              </span>
            ) : (
              !isLoadingData && (
                <button
                  type="button"
                  onClick={() => {
                    loadIncidents();
                    loadAlerts();
                  }}
                  title="Reintentar conexión con la API"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[11px] font-semibold shrink-0 cursor-pointer"
                >
                  <WifiOff className="w-3 h-3" />
                  <span>Sin servidor · Reintentar</span>
                </button>
              )
            )}
          </div>

          {/* Interactive Filter Controls for Map View */}
          {activeTab === 'mapa' && (
            <div
              role="group"
              aria-label="Filtrar marcadores por estado de verificación"
              className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl"
            >
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white text-[#123047] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({incidents.filter((i) => i.verificationStatus !== 'rechazado').length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('verificado_oficial')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === 'verificado_oficial'
                    ? 'bg-white text-[#087E8B] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Oficiales (
                {
                  incidents.filter(
                    (i) => i.verificationStatus === 'verificado_oficial'
                  ).length
                }
                )
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('en_revision')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === 'en_revision'
                    ? 'bg-white text-[#D97706] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Revisión (
                {
                  incidents.filter((i) => i.verificationStatus === 'en_revision')
                    .length
                }
                )
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('reporte_ciudadano')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === 'reporte_ciudadano'
                    ? 'bg-white text-[#123047] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ciudadanos (
                {
                  incidents.filter(
                    (i) => i.verificationStatus === 'reporte_ciudadano'
                  ).length
                }
                )
              </button>
            </div>
          )}
        </section>

        {/* VIEW 1: MAPA DE INCIDENTES + FORMULARIO DE REPORTE / FICHA */}
        {activeTab === 'mapa' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Left 7 Cols: Interactive Map */}
            <div className="lg:col-span-7 flex flex-col min-h-[540px]">
              <IncidentMap
                incidents={visibleIncidents}
                selectedIncidentId={selectedIncident?.id ?? null}
                onSelectIncident={(inc) => {
                  setSelectedIncidentId(inc.id);
                  const target = { lat: inc.approxLat, lng: inc.approxLng };
                  setDraftLocation(target);
                  handleAutoLookAngle(
                    computeBearingDegrees(userGpsLocation, target)
                  );
                  setIsReporting(false);
                }}
                isPickingLocation={isReporting}
                viewCenter={draftLocation}
                onViewCenterChange={setDraftLocation}
                onStartReportAtUserGps={handleStartReport}
                userGpsLocation={userGpsLocation}
                onUserGpsLocationChange={(coords) => {
                  handleAutoLookAngle(
                    computeBearingDegrees(userGpsLocation, coords)
                  );
                  setUserGpsLocation(coords);
                  setGpsSource('demo_academico');
                }}
                gpsSource={gpsSource}
                onRequestHardwareGps={handleRequestHardwareGps}
                isLocatingGps={isLocatingGps}
                demoModeEnabled={demoModeEnabled}
                onToggleDemoMode={() => setDemoModeEnabled((v) => !v)}
                gyroscope={gyroscope}
                onAutoLookAngle={handleAutoLookAngle}
              />
            </div>

            {/* Right 5 Cols: Capture Form OR Concise Selected Incident Card + Feed */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {isReporting ? (
                <ReportWizardPanel
                  userGpsLocation={userGpsLocation}
                  gpsSource={gpsSource}
                  onRequestHardwareGps={handleRequestHardwareGps}
                  isLocatingGps={isLocatingGps}
                  gyroscope={gyroscope}
                  onSubmitReport={handleCreateReport}
                  isSubmitting={isSubmittingReport}
                  onCancel={() => setIsReporting(false)}
                />
              ) : (
                <>
                  {/* Concise Selected Incident Ficha */}
                  {selectedIncident ? (
                    <article
                      aria-label="Ficha de incidente seleccionado"
                      className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
                          <span className="font-mono-tabular font-bold text-[#123047]">
                            {selectedIncident.folio}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate font-medium text-slate-700">
                            {selectedIncident.supermanzana}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0">{selectedIncident.reportedAt}</span>
                        </div>

                        <span
                          className={`text-xs font-semibold inline-flex items-center gap-1 shrink-0 ${
                            selectedIncident.verificationStatus ===
                            'verificado_oficial'
                              ? 'text-[#087E8B]'
                              : selectedIncident.verificationStatus ===
                                'en_revision'
                              ? 'text-[#D97706]'
                              : 'text-[#123047]'
                          }`}
                        >
                          {selectedIncident.verificationStatus ===
                          'verificado_oficial' ? (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          ) : selectedIncident.verificationStatus ===
                            'en_revision' ? (
                            <Clock className="w-3.5 h-3.5" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {statusLabel(selectedIncident.verificationStatus)}
                          </span>
                        </span>
                      </div>

                      {editDraft ? (
                        <form
                          aria-label="Editar reporte"
                          className="flex flex-col gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSaveEdit(selectedIncident.id);
                          }}
                        >
                          <label className="text-[11px] font-semibold text-slate-600">
                            Título
                            <input
                              type="text"
                              required
                              minLength={5}
                              maxLength={200}
                              value={editDraft.title}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, title: e.target.value })
                              }
                              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-normal text-slate-900"
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[11px] font-semibold text-slate-600">
                              Evento
                              <select
                                value={editDraft.eventType}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    eventType: e.target.value as EventType,
                                  })
                                }
                                className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-300 text-xs font-normal text-slate-900 bg-white"
                              >
                                {EDIT_EVENT_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {eventLabel(type)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-[11px] font-semibold text-slate-600">
                              Especie
                              <select
                                value={editDraft.species}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    species: e.target.value as AnimalSpecies,
                                  })
                                }
                                className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-300 text-xs font-normal text-slate-900 bg-white"
                              >
                                {EDIT_SPECIES.map((sp) => (
                                  <option key={sp} value={sp}>
                                    {speciesLabel(sp)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="text-[11px] font-semibold text-slate-600">
                            Referencia
                            <input
                              type="text"
                              maxLength={200}
                              value={editDraft.referenceLandmark}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  referenceLandmark: e.target.value,
                                })
                              }
                              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-normal text-slate-900"
                            />
                          </label>
                          <label className="text-[11px] font-semibold text-slate-600">
                            Descripción
                            <textarea
                              required
                              minLength={10}
                              maxLength={2000}
                              rows={3}
                              value={editDraft.description}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, description: e.target.value })
                              }
                              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-normal text-slate-900"
                            />
                          </label>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditDraft(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={isSavingEdit}
                              className="px-3 py-1.5 rounded-lg bg-[#087E8B] hover:bg-[#066873] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                            >
                              {isSavingEdit ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                          </div>
                        </form>
                      ) : (
                      <>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">
                          {selectedIncident.title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1">
                          <span>{eventLabel(selectedIncident.eventType)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{speciesLabel(selectedIncident.species)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            Radio {selectedIncident.privacyRadiusMeters}m
                          </span>
                          {selectedIncident.gpsVerifiedInSitu && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-blue-700 font-semibold">
                                In-Situ
                              </span>
                            </>
                          )}
                          {selectedIncident.gyroscope && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#087E8B] font-semibold inline-flex items-center gap-1">
                                <Navigation
                                  className="w-3 h-3"
                                  style={{
                                    transform: `rotate(${selectedIncident.gyroscope.alpha}deg)`,
                                  }}
                                />
                                <span>{selectedIncident.gyroscope.cardinal}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed">
                        {selectedIncident.description}
                      </p>
                      </>
                      )}

                      {selectedIncident.photoUrl && (
                        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                          {isGuest ? (
                            <button
                              type="button"
                              onClick={() =>
                                onRequestLogin('Inicia sesión para ver las fotos de evidencia.')
                              }
                              className="w-full h-24 flex flex-col items-center justify-center gap-1 text-xs text-slate-600 hover:bg-slate-200/60 cursor-pointer"
                            >
                              <Lock className="w-4 h-4" />
                              <span>Foto de evidencia · inicia sesión para verla</span>
                            </button>
                          ) : (
                            <AuthImage
                              src={selectedIncident.photoUrl}
                              alt={`Evidencia de ${selectedIncident.folio}`}
                              className="w-full h-36 object-cover"
                            />
                          )}
                        </div>
                      )}

                      {(selectedIncident.referenceLandmark ||
                        selectedIncident.officialSource) && (
                        <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-0.5">
                          {selectedIncident.referenceLandmark && (
                            <div className="truncate">
                              <strong className="text-slate-700">Ref:</strong>{' '}
                              {selectedIncident.referenceLandmark}
                            </div>
                          )}
                          {selectedIncident.officialSource && (
                            <div className="truncate text-[#087E8B]">
                              <strong>Fuente:</strong> {selectedIncident.officialSource}
                            </div>
                          )}
                        </div>
                      )}

                      {(selectedIncident.eventType === 'mordedura' ||
                        selectedIncident.eventType === 'aranazo') && (
                        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-800 flex items-center gap-2 font-medium">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>
                            Lava la herida 15 min con agua y jabón y acude al IMSS HGR 17.
                          </span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500">
                          IMSS 17:{' '}
                          <strong className="font-mono-tabular text-slate-700">
                            {(() => {
                              const meters = calculateDistanceMeters(
                                {
                                  lat: selectedIncident.approxLat,
                                  lng: selectedIncident.approxLng,
                                },
                                IMSS_HGR_17_COORDS
                              );
                              return meters >= 1000
                                ? `${(meters / 1000).toFixed(1)} km`
                                : `${meters} m`;
                            })()}
                          </strong>
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          {canModify(selectedIncident) && (
                          <>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(selectedIncident)}
                            disabled={Boolean(editDraft)}
                            aria-label={`Editar reporte ${selectedIncident.folio}`}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteIncident(selectedIncident)}
                            aria-label={`Eliminar reporte ${selectedIncident.folio}`}
                            className="px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-xs font-semibold text-red-700 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                          </button>
                          </>
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveTab('estadisticas')}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            Revisar
                          </button>
                          <button
                            type="button"
                            onClick={handleStartReport}
                            className="px-3 py-1.5 rounded-lg bg-[#087E8B] hover:bg-[#066873] text-white text-xs font-semibold cursor-pointer"
                          >
                            Capturar aquí
                          </button>
                        </div>
                      </div>
                    </article>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
                      <p className="text-sm font-semibold text-slate-700">
                        {isLoadingData
                          ? 'Cargando reportes…'
                          : !apiOnline && incidents.length === 0
                          ? 'Sin conexión con el servidor.'
                          : 'Sin reportes con este filtro.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setStatusFilter('all')}
                        className="mt-3 px-4 py-2 bg-[#087E8B] text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Ver todos
                      </button>
                    </div>
                  )}

                  {/* Compact Incident List */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Registros ({visibleIncidents.length})
                      </h3>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[240px] overflow-y-auto pr-1">
                      {visibleIncidents.map((item) => {
                        const isActive = item.id === selectedIncident?.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedIncidentId(item.id);
                              const target = {
                                lat: item.approxLat,
                                lng: item.approxLng,
                              };
                              setDraftLocation(target);
                              handleAutoLookAngle(
                                computeBearingDegrees(userGpsLocation, target)
                              );
                            }}
                            className={`w-full text-left py-2.5 px-3 rounded-xl transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                              isActive
                                ? 'bg-teal-50/70'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                <span className="font-mono-tabular font-semibold text-[#123047]">
                                  {item.folio}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{item.supermanzana}</span>
                                <span aria-hidden="true">·</span>
                                <span>{speciesLabel(item.species)}</span>
                              </div>
                              <div className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                                {item.title}
                              </div>
                            </div>

                            <span
                              className={`text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                                item.verificationStatus === 'verificado_oficial'
                                  ? 'text-[#087E8B]'
                                  : item.verificationStatus === 'en_revision'
                                  ? 'text-[#D97706]'
                                  : 'text-slate-600'
                              }`}
                            >
                              {item.verificationStatus === 'verificado_oficial'
                                ? 'Oficial'
                                : item.verificationStatus === 'en_revision'
                                ? 'Revisión'
                                : 'Ciudadano'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: OFFICIAL HEALTH ALERTS & PREVENTION CENTER */}
        {activeTab === 'alertas' && (
          <AlertsAndPreventionView
            alerts={alerts}
            onFocusHospitalOnMap={() => {
              setDraftLocation(IMSS_HGR_17_COORDS);
              setActiveTab('mapa');
              showToast(
                'Mapa centrado en IMSS HGR No. 17.'
              );
            }}
          />
        )}

        {/* VIEW 3: DESCRIPTIVE STATISTICS & ADMIN VERIFICATION CONSOLE */}
        {activeTab === 'estadisticas' && (
          <StatsAndAdminReviewView
            incidents={incidents}
            onUpdateIncidentStatus={handleUpdateIncidentStatus}
            canReview={isAdmin}
            onSelectIncidentOnMap={(inc) => {
              setSelectedIncidentId(inc.id);
              setDraftLocation({ lat: inc.approxLat, lng: inc.approxLng });
              setIsReporting(false);
              setActiveTab('mapa');
            }}
          />
        )}

        {/* VIEW 4: PERFIL DEL USUARIO + MIS REPORTES + CERRAR SESIÓN */}
        {activeTab === 'perfil' && isGuest && (
          <section className="max-w-lg w-full mx-auto bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#123047] text-white flex items-center justify-center">
              <UserRound className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-[#123047]">Estás consultando como visitante</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              El mapa, los reportes, las alertas y las estadísticas son públicos. Con una cuenta
              puedes enviar reportes con foto, dar seguimiento a los tuyos y ver las fotos de
              evidencia.
            </p>
            <button
              type="button"
              onClick={() => onRequestLogin(null)}
              className="mt-1 px-5 py-2.5 rounded-xl bg-[#087E8B] hover:bg-[#066873] text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Iniciar sesión o crear cuenta</span>
            </button>
          </section>
        )}
        {activeTab === 'perfil' && currentUser && (
          <ProfileView
            user={currentUser}
            myIncidents={incidents.filter((inc) => inc.ownerId === currentUser.id)}
            onUserChange={onUserChange}
            onLogout={onLogout}
            showToast={showToast}
            onOpenIncident={(inc) => {
              setSelectedIncidentId(inc.id);
              setDraftLocation({ lat: inc.approxLat, lng: inc.approxLng });
              setIsReporting(false);
              if (inc.verificationStatus !== 'rechazado') setStatusFilter('all');
              setActiveTab('mapa');
            }}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb-zone ergonomic navigation) */}
      <nav
        aria-label="Navegación móvil inferior"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center h-14 px-1"
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab('mapa');
            setIsReporting(false);
          }}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium cursor-pointer ${
            activeTab === 'mapa' && !isReporting
              ? 'text-[#087E8B] font-bold'
              : 'text-slate-600'
          }`}
        >
          <Map className="w-4 h-4" />
          <span className="mt-0.5">Mapa</span>
        </button>

        <button
          type="button"
          onClick={handleStartReport}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium cursor-pointer ${
            isReporting ? 'text-[#087E8B] font-bold' : 'text-slate-600'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span className="mt-0.5">Reportar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('alertas')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium cursor-pointer ${
            activeTab === 'alertas'
              ? 'text-[#087E8B] font-bold'
              : 'text-slate-600'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span className="mt-0.5">Alertas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('estadisticas')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium cursor-pointer ${
            activeTab === 'estadisticas'
              ? 'text-[#087E8B] font-bold'
              : 'text-slate-600'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="mt-0.5">{isAdmin ? 'Revisión' : 'Estadísticas'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('perfil');
            setIsReporting(false);
          }}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium cursor-pointer ${
            activeTab === 'perfil'
              ? 'text-[#087E8B] font-bold'
              : 'text-slate-600'
          }`}
        >
          {isGuest ? <LogIn className="w-4 h-4" /> : <UserRound className="w-4 h-4" />}
          <span className="mt-0.5">{isGuest ? 'Entrar' : 'Perfil'}</span>
        </button>
      </nav>
    </div>
  );
}
