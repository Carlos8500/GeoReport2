import React, { useState } from 'react';
import { KeyRound, LogOut, Save, ShieldCheck, UserRound } from 'lucide-react';
import { AuthUser, IncidentReport } from '../types/rabiaCun';
import { authApi, describeError } from '../services/api';

interface ProfileViewProps {
  user: AuthUser;
  myIncidents: IncidentReport[];
  onUserChange: (user: AuthUser) => void;
  onLogout: () => void;
  onOpenIncident: (incident: IncidentReport) => void;
  showToast: (message: string, kind?: 'success' | 'warning' | 'error') => void;
}

const STATUS_LABELS: Record<IncidentReport['verificationStatus'], string> = {
  verificado_oficial: 'Oficial',
  en_revision: 'En revisión',
  reporte_ciudadano: 'Ciudadano',
  rechazado: 'Descartado',
};

const STATUS_COLORS: Record<IncidentReport['verificationStatus'], string> = {
  verificado_oficial: 'text-[#087E8B]',
  en_revision: 'text-[#D97706]',
  reporte_ciudadano: 'text-slate-600',
  rechazado: 'text-red-700',
};

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  myIncidents,
  onUserChange,
  onLogout,
  onOpenIncident,
  showToast,
}) => {
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 3) {
      setError('El nombre debe tener al menos 3 caracteres.');
      return;
    }
    if (newPassword) {
      if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
        setError('La nueva contraseña debe tener 8 caracteres o más, con letras y números.');
        return;
      }
      if (!currentPassword) {
        setError('Escribe tu contraseña actual para cambiarla.');
        return;
      }
    }
    setIsSaving(true);
    try {
      const updated = await authApi.updateProfile({
        name: name.trim(),
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      onUserChange(updated);
      setCurrentPassword('');
      setNewPassword('');
      showToast(newPassword ? 'Perfil y contraseña actualizados.' : 'Perfil actualizado.');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const isAdmin = user.role === 'admin';
  const inputClass =
    'mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#087E8B]/40';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <section className="lg:col-span-5 flex flex-col gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#123047] text-white flex items-center justify-center shrink-0">
            {isAdmin ? <ShieldCheck className="w-6 h-6" /> : <UserRound className="w-6 h-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[#123047] truncate">{user.name}</h2>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <span
              className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                isAdmin ? 'bg-teal-50 text-[#087E8B] border border-teal-200' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {isAdmin ? 'Administrador' : 'Ciudadano'}
            </span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="p-2.5 sm:px-3 sm:py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-[#123047]">Mis datos</h3>
          {error && (
            <div role="alert" className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {error}
            </div>
          )}
          <label className="text-xs font-semibold text-slate-600">
            Nombre
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Cambiar contraseña (opcional)</span>
          </div>
          <label className="text-xs font-semibold text-slate-600">
            Contraseña actual
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={isSaving}
            className="self-end px-4 py-2 rounded-xl bg-[#087E8B] hover:bg-[#066873] disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Guardando…' : 'Guardar'}</span>
          </button>
        </form>
      </section>

      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-[#123047]">Mis reportes ({myIncidents.length})</h3>
        {myIncidents.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            Aún no has enviado reportes. Usa «Nuevo Reporte» cuando observes un animal con conducta
            sospechosa.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {myIncidents.map((inc) => (
              <li key={inc.id}>
                <button
                  type="button"
                  onClick={() => onOpenIncident(inc)}
                  className="w-full text-left py-2.5 px-2 rounded-lg hover:bg-slate-50 flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">
                      <span className="font-mono-tabular font-semibold text-[#123047]">{inc.folio}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{inc.reportedAt}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900 truncate mt-0.5">{inc.title}</div>
                  </div>
                  <span className={`text-[11px] font-semibold whitespace-nowrap ${STATUS_COLORS[inc.verificationStatus]}`}>
                    {STATUS_LABELS[inc.verificationStatus]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
