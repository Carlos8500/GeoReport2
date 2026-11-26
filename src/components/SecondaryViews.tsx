import React, { useState } from 'react';
import {
  FileCheck2,
  XCircle,
  Filter,
} from 'lucide-react';
import {
  AnimalSpecies,
  EventType,
  IncidentReport,
  VerificationStatus,
} from '../types/rabiaCun';
import { computeIncidentSummary } from '../utils/geofence';
import { PERIOD_OPTIONS, PeriodFilter, PeriodPreset, isInPeriod } from '../utils/filters';

/* ============================================================================
 * VISTA ESTADÍSTICAS DESCRIPTIVAS Y CONSOLA DE REVISIÓN (Funcionalidades 3 y 6)
 * ========================================================================== */
interface StatsAndAdminReviewProps {
  incidents: IncidentReport[];
  onUpdateIncidentStatus: (
    incidentId: string,
    newStatus: VerificationStatus,
    officialSource: string,
    evidenceNote: string
  ) => void;
  onSelectIncidentOnMap: (incident: IncidentReport) => void;
  /** Sólo el administrador ve los controles para verificar o descartar */
  canReview: boolean;
}

export const StatsAndAdminReviewView: React.FC<StatsAndAdminReviewProps> = ({
  incidents,
  onUpdateIncidentStatus,
  onSelectIncidentOnMap,
  canReview,
}) => {
  const [speciesFilter, setSpeciesFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, string>>({});

  const [eventFilter, setEventFilter] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodFilter>({ preset: 'all' });

  const filteredIncidents = incidents.filter((inc) => {
    if (speciesFilter !== 'all' && inc.species !== speciesFilter) return false;
    if (eventFilter !== 'all' && inc.eventType !== eventFilter) return false;
    if (statusFilter !== 'all' && inc.verificationStatus !== statusFilter)
      return false;
    if (!isInPeriod(inc.reportedAt, period)) return false;
    return true;
  });
  const hasFilters =
    speciesFilter !== 'all' ||
    eventFilter !== 'all' ||
    statusFilter !== 'all' ||
    period.preset !== 'all';
  const clearFilters = () => {
    setSpeciesFilter('all');
    setEventFilter('all');
    setStatusFilter('all');
    setPeriod({ preset: 'all' });
  };
  const selectClass = 'w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg';

  const stats = computeIncidentSummary(filteredIncidents);

  const speciesLabels: Record<AnimalSpecies, string> = {
    zorra_gris: 'Zorra gris',
    perro: 'Perro',
    gato: 'Gato',
    coati_mapache: 'Coatí / Mapache',
    murcielago: 'Murciélago',
  };

  const eventLabels: Record<EventType, string> = {
    avistamiento: 'Avistamiento',
    mordedura: 'Mordedura',
    aranazo: 'Arañazo',
    comportamiento_erratico: 'Conducta errática',
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Descriptive KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-500">Activos</div>
          <div className="text-2xl font-bold text-[#123047] font-mono-tabular mt-1">
            {stats.totalActive}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-500">Oficiales</div>
          <div className="text-2xl font-bold text-[#087E8B] font-mono-tabular mt-1">
            {stats.verifiedCount}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-500">En revisión</div>
          <div className="text-2xl font-bold text-[#D97706] font-mono-tabular mt-1">
            {stats.inReviewCount}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-500">Ciudadanos</div>
          <div className="text-2xl font-bold text-slate-800 font-mono-tabular mt-1">
            {stats.citizenCount}
          </div>
        </div>
      </div>

      {/* Breakdown by Species & Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#123047]">
              Distribución de registros
            </h2>
            <Filter className="w-4 h-4 text-slate-400" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="stats-period-filter" className="block text-xs font-semibold text-slate-600 mb-1">
                Periodo
              </label>
              <select
                id="stats-period-filter"
                value={period.preset}
                onChange={(e) => setPeriod((prev) => ({ ...prev, preset: e.target.value as PeriodPreset }))}
                className={selectClass}
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="stats-event-filter" className="block text-xs font-semibold text-slate-600 mb-1">
                Tipo de evento
              </label>
              <select
                id="stats-event-filter"
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className={selectClass}
              >
                <option value="all">Todos los eventos</option>
                {(Object.keys(eventLabels) as EventType[]).map((type) => (
                  <option key={type} value={type}>
                    {eventLabels[type]}
                  </option>
                ))}
              </select>
            </div>

            {period.preset === 'custom' && (
              <>
                <div>
                  <label htmlFor="stats-from" className="block text-xs font-semibold text-slate-600 mb-1">
                    Desde
                  </label>
                  <input
                    id="stats-from"
                    type="date"
                    value={period.from ?? ''}
                    max={period.to || undefined}
                    onChange={(e) => setPeriod((prev) => ({ ...prev, from: e.target.value }))}
                    className={selectClass}
                  />
                </div>
                <div>
                  <label htmlFor="stats-to" className="block text-xs font-semibold text-slate-600 mb-1">
                    Hasta
                  </label>
                  <input
                    id="stats-to"
                    type="date"
                    value={period.to ?? ''}
                    min={period.from || undefined}
                    onChange={(e) => setPeriod((prev) => ({ ...prev, to: e.target.value }))}
                    className={selectClass}
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="stats-species-filter"
                className="block text-xs font-semibold text-slate-600 mb-1"
              >
                Filtrar por especie
              </label>
              <select
                id="stats-species-filter"
                value={speciesFilter}
                onChange={(e) => setSpeciesFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="all">Todas las especies</option>
                <option value="zorra_gris">Zorra gris</option>
                <option value="perro">Perro</option>
                <option value="gato">Gato</option>
                <option value="coati_mapache">Coatí / Mapache</option>
                <option value="murcielago">Murciélago</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="stats-status-filter"
                className="block text-xs font-semibold text-slate-600 mb-1"
              >
                Estado de revisión
              </label>
              <select
                id="stats-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="all">Todos los estados</option>
                <option value="verificado_oficial">Verificado oficial</option>
                <option value="en_revision">En revisión</option>
                <option value="reporte_ciudadano">Reporte ciudadano</option>
              </select>
            </div>
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="self-start px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Quitar filtros
            </button>
          )}

          {/* Event Type Bars */}
          <div className="space-y-2.5 pt-2">
            <div className="text-xs font-semibold text-slate-700">
              Registros por tipo de evento
            </div>
            {(Object.keys(eventLabels) as EventType[]).map((type) => {
              const count = stats.byEventType[type] || 0;
              const pct =
                stats.totalActive > 0
                  ? Math.round((count / stats.totalActive) * 100)
                  : 0;
              return (
                <div key={type} className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-700 font-medium">{eventLabels[type]}</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#123047] rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Species Bars */}
          <div className="space-y-2.5 pt-2">
            <div className="text-xs font-semibold text-slate-700">
              Registros por especie observada
            </div>
            {(Object.keys(speciesLabels) as AnimalSpecies[]).map((sp) => {
              const count = stats.bySpecies[sp] || 0;
              const pct =
                stats.totalActive > 0
                  ? Math.round((count / stats.totalActive) * 100)
                  : 0;
              return (
                <div key={sp} className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-700 font-medium">
                      {speciesLabels[sp]}
                    </span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#087E8B] rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zone Breakdown */}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              Registros por zona
            </div>
            {Object.entries(stats.byZone).map(([zone, count]) => (
              <div
                key={zone}
                className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0"
              >
                <span className="text-slate-700">{zone}</span>
                <span className="font-mono-tabular font-bold text-[#123047]">
                  {count} reg.
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right 7 cols: Administrative Review & Verification Console (Funcionalidad 3) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold text-[#123047]">
            {canReview ? 'Revisión Administrativa' : 'Reportes registrados'}
          </h2>
          {!canReview && (
            <p className="text-xs text-slate-500">
              Sólo el personal administrador puede verificar o descartar reportes.
            </p>
          )}

          <p className="text-[11px] text-slate-500">
            {filteredIncidents.length} {filteredIncidents.length === 1 ? 'reporte' : 'reportes'} con los filtros actuales.
          </p>
          <div className="space-y-3">
            {filteredIncidents.length === 0 && (
              <p className="text-xs text-slate-500 py-6 text-center">Ningún reporte coincide con los filtros.</p>
            )}
            {filteredIncidents.map((inc) => {
              const draftSource =
                sourceDrafts[inc.id] ??
                inc.officialSource ??
                'SESA Quintana Roo · Brigada Zoonosis Jurisdicción No. 2';

              return (
                <div
                  key={inc.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-mono-tabular font-bold text-[#123047]">
                        {inc.folio}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{inc.supermanzana}</span>
                      <span aria-hidden="true">·</span>
                      <span>{eventLabels[inc.eventType]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{speciesLabels[inc.species]}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectIncidentOnMap(inc)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-xs font-semibold text-red-700 transition-colors cursor-pointer"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                      </span>
                      <span>Ver en mapa</span>
                    </button>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {inc.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      {inc.description}
                    </p>
                  </div>

                  {/* Source citation input for Admin Verification */}
                  {canReview && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <input
                      type="text"
                      aria-label={`Fuente oficial para ${inc.folio}`}
                      value={draftSource}
                      onChange={(e) =>
                        setSourceDrafts((prev) => ({
                          ...prev,
                          [inc.id]: e.target.value,
                        }))
                      }
                      placeholder="Fuente oficial (ej. SESA Q. Roo Folio 2026-X)"
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                    />

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateIncidentStatus(
                            inc.id,
                            'verificado_oficial',
                            draftSource,
                            'Validado oficialmente por administrador con fuente documental.'
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                          inc.verificationStatus === 'verificado_oficial'
                            ? 'bg-[#087E8B] text-white'
                            : 'bg-teal-50 text-[#087E8B] border border-[#087E8B]/30 hover:bg-teal-100'
                        }`}
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        <span>Verificar Oficial</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateIncidentStatus(
                            inc.id,
                            'en_revision',
                            '',
                            'En revisión por brigada de verificación.'
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          inc.verificationStatus === 'en_revision'
                            ? 'bg-[#E7A83E] text-slate-950'
                            : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        En Revisión
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateIncidentStatus(
                            inc.id,
                            'rechazado',
                            '',
                            'Descartado por duplicidad o falta de sustento.'
                          )
                        }
                        aria-label={`Descartar reporte ${inc.folio}`}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Descartar</span>
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
