import { HealthAlert, IncidentReport } from '../types/rabiaCun';

/** Periodos predefinidos para filtrar reportes por fecha. */
export type PeriodPreset = 'all' | '7d' | '30d' | '90d' | 'custom';

export interface PeriodFilter {
  preset: PeriodPreset;
  /** AAAA-MM-DD, sólo con preset 'custom' */
  from?: string;
  to?: string;
}

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'all', label: 'Cualquier fecha' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
  { value: 'custom', label: 'Rango de fechas…' },
];

const PRESET_DAYS: Partial<Record<PeriodPreset, number>> = { '7d': 7, '30d': 30, '90d': 90 };

/** Fecha local en formato AAAA-MM-DD. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Convierte el periodo elegido en un rango [desde, hasta] (AAAA-MM-DD, inclusivo). */
export function periodRange(
  period: PeriodFilter,
  today: Date = new Date()
): { from: string | null; to: string | null } {
  if (period.preset === 'custom') {
    return { from: period.from || null, to: period.to || null };
  }
  const days = PRESET_DAYS[period.preset];
  if (!days) return { from: null, to: null };
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { from: toIsoDate(start), to: null };
}

/** true si la fecha del reporte ("AAAA-MM-DD HH:MM") cae dentro del periodo. */
export function isInPeriod(reportedAt: string, period: PeriodFilter, today: Date = new Date()): boolean {
  const { from, to } = periodRange(period, today);
  const day = reportedAt.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Zonas presentes en los reportes, ordenadas alfabéticamente. */
export function listZones(incidents: IncidentReport[]): string[] {
  return Array.from(new Set(incidents.map((i) => i.supermanzana))).sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}

/** Una alerta está vigente si su fecha de vigencia es hoy o posterior. */
export function isAlertActive(alert: HealthAlert, today: Date = new Date()): boolean {
  if (!alert.validUntilDate) return true;
  return alert.validUntilDate >= toIsoDate(today);
}

const SEVERITY_ORDER: Record<HealthAlert['severity'], number> = {
  alta: 0,
  preventiva: 1,
  informativa: 2,
};

/** Alerta a destacar en Inicio: la vigente más grave y, a igual gravedad, la más reciente. */
export function pickFeaturedAlert(alerts: HealthAlert[], today: Date = new Date()): HealthAlert | null {
  const active = alerts.filter((a) => isAlertActive(a, today));
  if (active.length === 0) return null;
  return [...active].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (b.issuedDate ?? '').localeCompare(a.issuedDate ?? '')
  )[0];
}
