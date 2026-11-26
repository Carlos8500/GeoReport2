import React from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronRight,
  Clock,
  Map,
  PhoneCall,
  PlusCircle,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { HealthAlert, IncidentReport } from '../types/rabiaCun';
import { isInPeriod, pickFeaturedAlert } from '../utils/filters';

export type HomeTarget = 'mapa' | 'alertas' | 'estadisticas';

interface HomeViewProps {
  alerts: HealthAlert[];
  /** Reportes públicos (sin descartados) */
  incidents: IncidentReport[];
  userName: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  onNavigate: (target: HomeTarget) => void;
  onStartReport: () => void;
  onOpenIncident: (incident: IncidentReport) => void;
}

const SEVERITY_STYLES: Record<HealthAlert['severity'], { box: string; badge: string; label: string }> = {
  alta: {
    box: 'bg-red-50 border-red-200',
    badge: 'bg-red-700 text-white',
    label: 'Alerta alta',
  },
  preventiva: {
    box: 'bg-amber-50 border-amber-200',
    badge: 'bg-[#E7A83E] text-slate-950',
    label: 'Preventiva',
  },
  informativa: {
    box: 'bg-teal-50 border-teal-200',
    badge: 'bg-[#087E8B] text-white',
    label: 'Informativa',
  },
};

const STATUS_META: Record<
  Exclude<IncidentReport['verificationStatus'], 'rechazado'>,
  { label: string; className: string; Icon: typeof ShieldCheck }
> = {
  verificado_oficial: { label: 'Oficial', className: 'text-[#087E8B]', Icon: ShieldCheck },
  en_revision: { label: 'En revisión', className: 'text-[#D97706]', Icon: Clock },
  reporte_ciudadano: { label: 'Ciudadano', className: 'text-slate-600', Icon: UserCheck },
};

export const HomeView: React.FC<HomeViewProps> = ({
  alerts,
  incidents,
  userName,
  isAdmin,
  isLoading,
  onNavigate,
  onStartReport,
  onOpenIncident,
}) => {
  const featured = pickFeaturedAlert(alerts);
  const last30 = incidents.filter((i) => isInPeriod(i.reportedAt, { preset: '30d' }));
  const recent = [...incidents].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)).slice(0, 3);

  const shortcuts: {
    key: string;
    label: string;
    detail: string;
    Icon: typeof Map;
    onClick: () => void;
    primary?: boolean;
  }[] = [
    { key: 'mapa', label: 'Mapa', detail: 'Incidentes por zona', Icon: Map, onClick: () => onNavigate('mapa') },
    {
      key: 'reportar',
      label: 'Reportar',
      detail: 'Avistamiento o agresión',
      Icon: PlusCircle,
      onClick: onStartReport,
      primary: true,
    },
    {
      key: 'alertas',
      label: 'Alertas y prevención',
      detail: 'Avisos oficiales y contactos',
      Icon: Bell,
      onClick: () => onNavigate('alertas'),
    },
    {
      key: 'estadisticas',
      label: isAdmin ? 'Revisión' : 'Estadísticas',
      detail: isAdmin ? 'Verificar reportes' : 'Registros por periodo',
      Icon: BarChart3,
      onClick: () => onNavigate('estadisticas'),
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-7 flex flex-col gap-4">
        {/* Alerta oficial destacada */}
        {featured ? (
          <article
            aria-label="Alerta oficial destacada"
            className={`rounded-2xl border p-5 flex flex-col gap-2.5 ${SEVERITY_STYLES[featured.severity].box}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wide inline-flex items-center gap-1 ${SEVERITY_STYLES[featured.severity].badge}`}
              >
                <AlertTriangle className="w-3 h-3" />
                {SEVERITY_STYLES[featured.severity].label}
              </span>
              <span className="text-slate-600">Vigente hasta {featured.validUntil}</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">{featured.title}</h2>
            <p className="text-xs text-slate-700">
              <strong>Zona:</strong> {featured.zone}
            </p>
            <p className="text-xs text-slate-700 leading-relaxed line-clamp-3">{featured.summary}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-slate-500 truncate">{featured.source}</span>
              <button
                type="button"
                onClick={() => onNavigate('alertas')}
                className="px-3 py-1.5 rounded-lg bg-[#123047] hover:bg-[#0c2233] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Ver alertas</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </article>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600">
            {isLoading ? 'Cargando alertas…' : 'No hay alertas sanitarias vigentes en este momento.'}
          </div>
        )}

        {/* Accesos rápidos */}
        <section aria-label="Accesos rápidos" className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-[#123047]">
            {userName ? `Hola, ${userName.split(' ')[0]}` : 'Bienvenido a RABIA-CUN'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">¿Qué necesitas hacer?</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {shortcuts.map(({ key, label, detail, Icon, onClick, primary }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`text-left p-3.5 rounded-xl border flex flex-col gap-1.5 min-h-[88px] transition-colors cursor-pointer ${
                  primary
                    ? 'bg-[#087E8B] border-[#087E8B] text-white hover:bg-[#066873]'
                    : 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-5 h-5 ${primary ? 'text-white' : 'text-[#087E8B]'}`} />
                <span className="text-sm font-bold leading-tight">{label}</span>
                <span className={`text-[11px] leading-tight ${primary ? 'text-teal-50' : 'text-slate-500'}`}>
                  {detail}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="lg:col-span-5 flex flex-col gap-4">
        {/* Resumen */}
        <section aria-label="Resumen de los últimos 30 días" className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Últimos 30 días</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 py-3">
              <div className="text-2xl font-bold font-mono-tabular text-[#123047]">{last30.length}</div>
              <div className="text-[11px] text-slate-500">Reportes</div>
            </div>
            <div className="rounded-xl bg-slate-50 py-3">
              <div className="text-2xl font-bold font-mono-tabular text-[#087E8B]">
                {last30.filter((i) => i.verificationStatus === 'verificado_oficial').length}
              </div>
              <div className="text-[11px] text-slate-500">Oficiales</div>
            </div>
            <div className="rounded-xl bg-slate-50 py-3">
              <div className="text-2xl font-bold font-mono-tabular text-[#D97706]">
                {last30.filter((i) => i.verificationStatus === 'en_revision').length}
              </div>
              <div className="text-[11px] text-slate-500">En revisión</div>
            </div>
          </div>
        </section>

        {/* Reportes recientes */}
        <section aria-label="Reportes recientes" className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Reportes recientes</h2>
            <button
              type="button"
              onClick={() => onNavigate('mapa')}
              className="text-xs font-semibold text-[#087E8B] hover:underline cursor-pointer"
            >
              Ver en mapa
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              {isLoading ? 'Cargando reportes…' : 'Aún no hay reportes.'}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {recent.map((inc) => {
                const meta =
                  STATUS_META[inc.verificationStatus as keyof typeof STATUS_META] ?? STATUS_META.reporte_ciudadano;
                return (
                  <li key={inc.id}>
                    <button
                      type="button"
                      onClick={() => onOpenIncident(inc)}
                      className="w-full text-left py-2.5 flex items-start justify-between gap-3 hover:bg-slate-50 rounded-lg px-1 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-500 truncate">
                          {inc.reportedAt.slice(0, 10)} · {inc.supermanzana}
                        </div>
                        <div className="text-xs font-semibold text-slate-900 truncate">{inc.title}</div>
                      </div>
                      <span className={`text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${meta.className}`}>
                        <meta.Icon className="w-3.5 h-3.5" />
                        {meta.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Qué hacer ante una exposición */}
        <section
          aria-label="Qué hacer ante una mordedura o arañazo"
          className="rounded-2xl border border-red-200 bg-red-50/70 p-5 flex flex-col gap-2"
        >
          <h2 className="text-sm font-bold text-red-900">¿Te mordió o arañó un animal?</h2>
          <ol className="list-decimal pl-4 text-xs text-slate-800 space-y-1">
            <li>Lava la herida con agua y jabón durante 15 minutos.</li>
            <li>Acude hoy mismo a urgencias para valoración antirrábica.</li>
            <li>No intentes capturar al animal; repórtalo desde la app.</li>
          </ol>
          <a
            href="tel:911"
            className="mt-1 self-start px-3 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            Emergencias 911
          </a>
        </section>
      </div>
    </div>
  );
};
