import React, { useState } from 'react';
import {
  ExternalLink,
  MapPin,
  Pencil,
  PhoneCall,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { AlertPayload, HealthAlert } from '../types/rabiaCun';
import { alertsApi, ApiError, describeError } from '../services/api';
import { isAlertActive, toIsoDate } from '../utils/filters';

/* ============================================================================
 * ALERTAS SANITARIAS (Funcionalidad 4) + CENTRO DE PREVENCIÓN (Funcionalidad 5)
 * El administrador puede registrar, editar y eliminar alertas desde aquí.
 * ========================================================================== */

type ToastFn = (message: string, kind?: 'success' | 'warning' | 'error') => void;

interface AlertsViewProps {
  alerts: HealthAlert[];
  isAdmin: boolean;
  onAlertsChanged: () => void;
  onFocusHospitalOnMap: () => void;
  showToast: ToastFn;
  /** Diálogo de confirmación de Ionic */
  confirmAction: (header: string, message: string) => Promise<boolean>;
}

const SEVERITY_LABELS: Record<HealthAlert['severity'], string> = {
  alta: 'Alta',
  preventiva: 'Preventiva',
  informativa: 'Informativa',
};

const SEVERITY_COLORS: Record<HealthAlert['severity'], string> = {
  alta: 'bg-red-700 text-white',
  preventiva: 'bg-[#E7A83E] text-slate-950',
  informativa: 'bg-[#087E8B] text-white',
};

type FormErrors = Partial<Record<keyof AlertPayload, string>>;

interface AlertDraft extends Omit<AlertPayload, 'recommendations'> {
  /** Una recomendación por línea */
  recommendationsText: string;
}

function emptyDraft(): AlertDraft {
  const today = new Date();
  const inOneMonth = new Date(today);
  inOneMonth.setMonth(inOneMonth.getMonth() + 1);
  return {
    folio: '',
    title: '',
    issuedDate: toIsoDate(today),
    validUntilDate: toIsoDate(inOneMonth),
    zone: '',
    source: '',
    sourceUrl: '',
    severity: 'preventiva',
    summary: '',
    recommendationsText: '',
  };
}

function draftFromAlert(alert: HealthAlert): AlertDraft {
  return {
    folio: alert.folio,
    title: alert.title,
    issuedDate: alert.issuedDate ?? '',
    validUntilDate: alert.validUntilDate ?? '',
    zone: alert.zone,
    source: alert.source,
    sourceUrl: alert.sourceUrl,
    severity: alert.severity,
    summary: alert.summary,
    recommendationsText: alert.recommendations.join('\n'),
  };
}

function toPayload(draft: AlertDraft): AlertPayload {
  const { recommendationsText, ...rest } = draft;
  return {
    ...rest,
    folio: rest.folio.trim(),
    title: rest.title.trim(),
    zone: rest.zone.trim(),
    source: rest.source.trim(),
    sourceUrl: rest.sourceUrl.trim(),
    summary: rest.summary.trim(),
    recommendations: recommendationsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

/** Mismas reglas que valida la API (server/src/validation.js). */
function validateDraft(p: AlertPayload): FormErrors {
  const errors: FormErrors = {};
  if (p.folio.length < 3) errors.folio = 'Mínimo 3 caracteres.';
  if (p.title.length < 5) errors.title = 'Mínimo 5 caracteres.';
  if (!p.issuedDate) errors.issuedDate = 'Indica la fecha de emisión.';
  if (!p.validUntilDate) errors.validUntilDate = 'Indica la vigencia.';
  else if (p.issuedDate && p.validUntilDate < p.issuedDate)
    errors.validUntilDate = 'La vigencia debe ser posterior a la emisión.';
  if (!p.zone) errors.zone = 'Indica la zona afectada.';
  if (!p.source) errors.source = 'Indica la fuente oficial.';
  if (p.sourceUrl && !/^https?:\/\//i.test(p.sourceUrl))
    errors.sourceUrl = 'Debe iniciar con http:// o https://';
  if (p.summary.length < 10) errors.summary = 'Mínimo 10 caracteres.';
  if (p.recommendations.length > 10) errors.recommendations = 'Máximo 10 recomendaciones.';
  return errors;
}

/* ---------------------------------------------------------------------------
 * Formulario de alerta (crear / editar)
 * ------------------------------------------------------------------------- */
interface AlertFormProps {
  initial: AlertDraft;
  editingId: string | null;
  onCancel: () => void;
  onSaved: (alert: HealthAlert) => void;
}

const AlertForm: React.FC<AlertFormProps> = ({ initial, editingId, onCancel, onSaved }) => {
  const [draft, setDraft] = useState<AlertDraft>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const set = <K extends keyof AlertDraft>(key: K, value: AlertDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const payload = toPayload(draft);
    const found = validateDraft(payload);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Revisa los campos marcados.');
      return;
    }
    setIsSaving(true);
    try {
      const saved = editingId
        ? await alertsApi.update(editingId, payload)
        : await alertsApi.create(payload);
      onSaved(saved);
    } catch (err) {
      setFormError(describeError(err));
      if (err instanceof ApiError && err.details) setErrors(err.details as FormErrors);
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = (field: keyof AlertPayload) =>
    `mt-1 w-full px-3 py-2 rounded-lg border text-xs font-normal text-slate-900 bg-white ${
      errors[field] ? 'border-red-400' : 'border-slate-300'
    }`;
  const fieldError = (field: keyof AlertPayload) =>
    errors[field] ? <span className="mt-0.5 block font-normal text-red-600">{errors[field]}</span> : null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={editingId ? 'Editar alerta' : 'Nueva alerta'}
      className="p-4 rounded-xl border-2 border-[#087E8B]/40 bg-teal-50/40 flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#123047]">{editingId ? 'Editar alerta' : 'Nueva alerta'}</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cerrar formulario"
          className="p-1 rounded-md text-slate-500 hover:bg-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {formError && (
        <div role="alert" className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-[11px] font-semibold text-slate-600">
          Folio
          <input
            type="text"
            maxLength={40}
            placeholder="SESA-QROO-2026-12"
            value={draft.folio}
            onChange={(e) => set('folio', e.target.value)}
            className={inputClass('folio')}
          />
          {fieldError('folio')}
        </label>
        <label className="sm:col-span-2 text-[11px] font-semibold text-slate-600">
          Título
          <input
            type="text"
            maxLength={200}
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            className={inputClass('title')}
          />
          {fieldError('title')}
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="text-[11px] font-semibold text-slate-600">
          Emitida
          <input
            type="date"
            value={draft.issuedDate}
            onChange={(e) => set('issuedDate', e.target.value)}
            className={inputClass('issuedDate')}
          />
          {fieldError('issuedDate')}
        </label>
        <label className="text-[11px] font-semibold text-slate-600">
          Vigente hasta
          <input
            type="date"
            value={draft.validUntilDate}
            min={draft.issuedDate || undefined}
            onChange={(e) => set('validUntilDate', e.target.value)}
            className={inputClass('validUntilDate')}
          />
          {fieldError('validUntilDate')}
        </label>
        <label className="col-span-2 sm:col-span-1 text-[11px] font-semibold text-slate-600">
          Severidad
          <select
            value={draft.severity}
            onChange={(e) => set('severity', e.target.value as HealthAlert['severity'])}
            className={inputClass('severity')}
          >
            <option value="alta">Alta</option>
            <option value="preventiva">Preventiva</option>
            <option value="informativa">Informativa</option>
          </select>
        </label>
      </div>

      <label className="text-[11px] font-semibold text-slate-600">
        Zona afectada
        <input
          type="text"
          maxLength={250}
          placeholder="Ej. SM 248 y colonias colindantes"
          value={draft.zone}
          onChange={(e) => set('zone', e.target.value)}
          className={inputClass('zone')}
        />
        {fieldError('zone')}
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold text-slate-600">
          Fuente oficial
          <input
            type="text"
            maxLength={200}
            placeholder="Secretaría de Salud de Quintana Roo"
            value={draft.source}
            onChange={(e) => set('source', e.target.value)}
            className={inputClass('source')}
          />
          {fieldError('source')}
        </label>
        <label className="text-[11px] font-semibold text-slate-600">
          Enlace al comunicado (opcional)
          <input
            type="url"
            inputMode="url"
            maxLength={400}
            placeholder="https://"
            value={draft.sourceUrl}
            onChange={(e) => set('sourceUrl', e.target.value)}
            className={inputClass('sourceUrl')}
          />
          {fieldError('sourceUrl')}
        </label>
      </div>

      <label className="text-[11px] font-semibold text-slate-600">
        Resumen
        <textarea
          rows={3}
          maxLength={3000}
          value={draft.summary}
          onChange={(e) => set('summary', e.target.value)}
          className={inputClass('summary')}
        />
        {fieldError('summary')}
      </label>

      <label className="text-[11px] font-semibold text-slate-600">
        Recomendaciones (una por línea)
        <textarea
          rows={3}
          value={draft.recommendationsText}
          onChange={(e) => set('recommendationsText', e.target.value)}
          className={inputClass('recommendations')}
        />
        {fieldError('recommendations')}
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="px-3 py-1.5 rounded-lg bg-[#087E8B] hover:bg-[#066873] disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Publicar alerta'}
        </button>
      </div>
    </form>
  );
};

/* ---------------------------------------------------------------------------
 * Contactos oficiales (fuentes: comunicados del Ayuntamiento de Benito Juárez
 * y directorio de instalaciones del IMSS)
 * ------------------------------------------------------------------------- */
const CONTACTS: {
  name: string;
  detail: string;
  phone?: { label: string; tel: string };
  badge?: string;
  focusHospital?: boolean;
}[] = [
  {
    name: 'Emergencias',
    detail: 'Mordedura grave, sangrado o persona en riesgo',
    phone: { label: '911', tel: '911' },
  },
  {
    name: 'IMSS HGR No. 17 · Urgencias',
    detail: 'Av. Politécnico Nacional y Av. Kinik, Región 506',
    badge: '24 h',
    focusHospital: true,
  },
  {
    name: 'Protección y Bienestar Animal BJ',
    detail: 'Av. Nichupté, SM 99, Mz 54, Lt 01 · vacunación y reportes de animales',
    phone: { label: '998 892 3326', tel: '+529988923326' },
  },
  {
    name: 'Centro de Salud de tu colonia (SESA)',
    detail: 'Valoración y vacuna antirrábica humana sin costo',
  },
];

/* ---------------------------------------------------------------------------
 * Vista principal
 * ------------------------------------------------------------------------- */
type PreventionTopic = 'mordedura' | 'mascota' | 'avistamiento' | 'vacunacion';

const TOPICS: { value: PreventionTopic; label: string }[] = [
  { value: 'mordedura', label: 'Mordedura' },
  { value: 'mascota', label: 'Mascota' },
  { value: 'avistamiento', label: 'Avistamiento' },
  { value: 'vacunacion', label: 'Vacunación' },
];

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts,
  isAdmin,
  onAlertsChanged,
  onFocusHospitalOnMap,
  showToast,
  confirmAction,
}) => {
  const [topic, setTopic] = useState<PreventionTopic>('mordedura');
  /** null = sin formulario; 'new' = alta; id = edición */
  const [formTarget, setFormTarget] = useState<string | null>(null);
  const [showExpired, setShowExpired] = useState(false);

  const activeAlerts = alerts.filter((a) => isAlertActive(a));
  const expiredAlerts = alerts.filter((a) => !isAlertActive(a));
  const shownAlerts = showExpired ? alerts : activeAlerts;
  const editingAlert = formTarget && formTarget !== 'new' ? alerts.find((a) => a.id === formTarget) : null;

  const handleSaved = (saved: HealthAlert) => {
    showToast(
      formTarget === 'new' ? `Alerta ${saved.folio} publicada.` : `Alerta ${saved.folio} actualizada.`
    );
    setFormTarget(null);
    onAlertsChanged();
  };

  const handleDelete = async (alert: HealthAlert) => {
    const confirmed = await confirmAction(
      `Eliminar ${alert.folio}`,
      'La alerta dejará de mostrarse a todos los usuarios. Esta acción no se puede deshacer.'
    );
    if (!confirmed) return;
    try {
      await alertsApi.remove(alert.id);
      showToast(`Alerta ${alert.folio} eliminada.`);
      if (formTarget === alert.id) setFormTarget(null);
      onAlertsChanged();
    } catch (err) {
      showToast(`No se pudo eliminar la alerta: ${describeError(err)}`, 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Alertas oficiales */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-[#123047]">Alertas sanitarias oficiales</h2>
              <p className="text-xs text-slate-500">
                {activeAlerts.length} vigente{activeAlerts.length === 1 ? '' : 's'}
                {expiredAlerts.length > 0 && ` · ${expiredAlerts.length} vencida${expiredAlerts.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {expiredAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowExpired((v) => !v)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  {showExpired ? 'Sólo vigentes' : 'Ver vencidas'}
                </button>
              )}
              {isAdmin && formTarget !== 'new' && (
                <button
                  type="button"
                  onClick={() => setFormTarget('new')}
                  className="px-3 py-1.5 rounded-lg bg-[#087E8B] hover:bg-[#066873] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nueva alerta
                </button>
              )}
            </div>
          </div>

          {isAdmin && formTarget === 'new' && (
            <AlertForm
              key="new"
              initial={emptyDraft()}
              editingId={null}
              onCancel={() => setFormTarget(null)}
              onSaved={handleSaved}
            />
          )}

          {shownAlerts.length === 0 && formTarget !== 'new' && (
            <p className="text-xs text-slate-500 py-6 text-center">No hay alertas vigentes en este momento.</p>
          )}

          {shownAlerts.map((alert) =>
            isAdmin && editingAlert?.id === alert.id ? (
              <AlertForm
                key={`edit-${alert.id}`}
                initial={draftFromAlert(alert)}
                editingId={alert.id}
                onCancel={() => setFormTarget(null)}
                onSaved={handleSaved}
              />
            ) : (
              <article
                key={alert.id}
                className={`p-4 rounded-xl border border-slate-200 flex flex-col gap-2.5 ${
                  isAlertActive(alert) ? 'bg-slate-50/60' : 'bg-slate-100/70 opacity-80'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono-tabular font-semibold text-[#123047]">{alert.folio}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${SEVERITY_COLORS[alert.severity]}`}
                  >
                    {SEVERITY_LABELS[alert.severity]}
                  </span>
                  {!isAlertActive(alert) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-300 text-slate-800">
                      Vencida
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-slate-900">{alert.title}</h3>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-600">
                  <div>
                    <dt className="inline font-semibold text-slate-700">Emitida: </dt>
                    <dd className="inline">{alert.issuedAt}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-slate-700">Vigente hasta: </dt>
                    <dd className="inline">{alert.validUntil}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline font-semibold text-slate-700">Zona: </dt>
                    <dd className="inline">{alert.zone}</dd>
                  </div>
                </dl>

                <p className="text-xs text-slate-700 leading-relaxed">{alert.summary}</p>

                {alert.recommendations.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-700 list-disc pl-7 pr-3 py-3 bg-white border border-slate-200 rounded-lg">
                    {alert.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="truncate">{alert.source}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {alert.sourceUrl && (
                      <a
                        href={alert.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#087E8B] font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        <span>Fuente oficial</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => setFormTarget(alert.id)}
                          aria-label={`Editar alerta ${alert.folio}`}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-700 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(alert)}
                          aria-label={`Eliminar alerta ${alert.folio}`}
                          className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            )
          )}
        </div>
      </div>

      {/* Centro de prevención */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3.5">
          <h2 className="text-lg font-bold text-[#123047]">Centro de prevención</h2>

          <div role="tablist" aria-label="Temas de prevención" className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
            {TOPICS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={topic === t.value}
                onClick={() => setTopic(t.value)}
                className={`py-2 px-1 text-[11px] sm:text-xs font-semibold rounded-lg transition-colors truncate cursor-pointer ${
                  topic === t.value ? 'bg-[#123047] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {topic === 'mordedura' && (
            <div className="p-4 rounded-xl bg-red-50/70 border border-red-200 flex flex-col gap-2.5">
              <div className="text-xs font-bold text-red-900">Atención médica inmediata</div>
              <ol className="space-y-1.5 text-xs text-slate-800 list-decimal pl-4">
                <li>Lava la herida con agua y jabón durante 15 minutos.</li>
                <li>No apliques pomadas ni cubras la herida.</li>
                <li>Acude hoy mismo a urgencias para valoración antirrábica.</li>
                <li>Anota cómo era el animal y dónde ocurrió; no intentes capturarlo.</li>
              </ol>
              <button
                type="button"
                onClick={onFocusHospitalOnMap}
                className="mt-1 py-2 px-3 bg-[#087E8B] hover:bg-[#066873] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Ubicar IMSS HGR No. 17 en el mapa
              </button>
            </div>
          )}

          {topic === 'mascota' && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col gap-2 text-xs text-slate-800">
              <div className="font-bold text-amber-950">Tu mascota tuvo contacto con fauna silvestre</div>
              <ol className="space-y-1.5 list-decimal pl-4">
                <li>No toques saliva ni heridas sin guantes.</li>
                <li>Aísla a tu mascota de personas y otros animales.</li>
                <li>Llévala con un veterinario o a Bienestar Animal y presenta su cartilla de vacunación.</li>
              </ol>
            </div>
          )}

          {topic === 'avistamiento' && (
            <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 flex flex-col gap-2 text-xs text-slate-800">
              <div className="font-bold text-[#123047]">Avistamiento de fauna silvestre</div>
              <ol className="space-y-1.5 list-decimal pl-4">
                <li>Mantén distancia (más de 15 m) y aleja a niños y mascotas.</li>
                <li>No alimentes ni intentes capturar al animal.</li>
                <li>Si se ve dócil, desorientado o agresivo, repórtalo desde la app.</li>
              </ol>
            </div>
          )}

          {topic === 'vacunacion' && (
            <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200 flex flex-col gap-2 text-xs text-slate-800">
              <div className="font-bold text-[#123047]">Vacunación antirrábica de perros y gatos</div>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Vacuna a perros y gatos a partir del primer mes de edad.</li>
                <li>Aplica un refuerzo cada año; es gratuita en las campañas de SESA y del Ayuntamiento.</li>
                <li>Lleva a los perros con correa y a los gatos en transportadora.</li>
                <li>Conserva el comprobante de vacunación.</li>
              </ul>
              <p className="text-[11px] text-slate-600">
                Las fechas y sedes de las campañas se publican como alertas informativas en esta sección.
              </p>
            </div>
          )}

          {/* Contactos oficiales */}
          <div className="border-t border-slate-200 pt-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2.5">Contactos oficiales</h3>
            <ul className="space-y-2 text-xs">
              {CONTACTS.map((c) => (
                <li
                  key={c.name}
                  className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">{c.name}</div>
                    <div className="text-slate-500">{c.detail}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.badge && (
                      <span className="font-mono-tabular font-semibold text-[#087E8B]">{c.badge}</span>
                    )}
                    {c.focusHospital && (
                      <button
                        type="button"
                        onClick={onFocusHospitalOnMap}
                        aria-label="Ver IMSS HGR No. 17 en el mapa"
                        className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#087E8B] cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {c.phone && (
                      <a
                        href={`tel:${c.phone.tel}`}
                        className="px-2.5 py-2 rounded-lg bg-[#087E8B] hover:bg-[#066873] text-white font-mono-tabular font-semibold inline-flex items-center gap-1"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        {c.phone.label}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
              Datos tomados de comunicados del Ayuntamiento de Benito Juárez y del directorio del IMSS. Confirma
              horarios antes de acudir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
