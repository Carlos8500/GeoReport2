import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { ApiError, authApi, AuthResponse } from '../services/api';

interface LoginScreenProps {
  onAuthenticated: (auth: AuthResponse) => void;
  /** Mensaje opcional, p. ej. "Inicia sesión para enviar un reporte" */
  notice?: string | null;
  /** Regresar a la app sin cuenta (modo visitante) */
  onContinueAsGuest?: () => void;
}

type Mode = 'login' | 'register';
type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validación en el dispositivo antes de llamar a la API (el servidor vuelve a validar). */
function validate(mode: Mode, name: string, email: string, password: string, confirm: string): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'register' && name.trim().length < 3) errors.name = 'Escribe tu nombre (mínimo 3 caracteres).';
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Escribe un correo electrónico válido.';
  if (mode === 'login') {
    if (!password) errors.password = 'Escribe tu contraseña.';
  } else {
    if (password.length < 8) errors.password = 'Mínimo 8 caracteres.';
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
      errors.password = 'Debe incluir letras y números.';
    if (confirm !== password) errors.confirm = 'Las contraseñas no coinciden.';
  }
  return errors;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated, notice, onContinueAsGuest }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setConfirm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const found = validate(mode, name, email, password, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      const auth =
        mode === 'login'
          ? await authApi.login(email.trim(), password)
          : await authApi.register(name.trim(), email.trim(), password);
      onAuthenticated(auth);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.status === 0 ? `${err.message} Verifica que el servidor esté encendido.` : err.message);
        if (err.details) setErrors(err.details as FieldErrors);
      } else {
        setFormError('Ocurrió un error inesperado.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (hasError: boolean) =>
    `mt-1 w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 bg-white outline-none transition-shadow focus:ring-2 focus:ring-[#087E8B]/40 ${
      hasError ? 'border-red-400' : 'border-slate-300 focus:border-[#087E8B]'
    }`;

  return (
    <div className="min-h-screen bg-[#123047] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center text-white mb-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#087E8B] flex items-center justify-center shadow-lg">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight font-display">RABIA-CUN</h1>
          <p className="mt-1 text-sm text-slate-300">
            Vigilancia y alertas sanitarias geolocalizadas en Cancún
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <div role="tablist" aria-label="Acceso" className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-6">
            {(['login', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  mode === m ? 'bg-white text-[#123047] shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {m === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </button>
            ))}
          </div>

          {notice && !formError && (
            <div role="status" className="mb-4 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              {notice}
            </div>
          )}
          {formError && (
            <div role="alert" className="mb-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            {mode === 'register' && (
              <label className="text-xs font-semibold text-slate-700">
                Nombre
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  className={inputClass(Boolean(errors.name))}
                />
                {errors.name && <span className="mt-1 block font-normal text-red-600">{errors.name}</span>}
              </label>
            )}

            <label className="text-xs font-semibold text-slate-700">
              Correo electrónico
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(errors.email)}
                className={inputClass(Boolean(errors.email))}
              />
              {errors.email && <span className="mt-1 block font-normal text-red-600">{errors.email}</span>}
            </label>

            <label className="text-xs font-semibold text-slate-700">
              Contraseña
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  className={`${inputClass(Boolean(errors.password))} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password ? (
                <span className="mt-1 block font-normal text-red-600">{errors.password}</span>
              ) : (
                mode === 'register' && (
                  <span className="mt-1 block font-normal text-slate-500">Mínimo 8 caracteres, con letras y números.</span>
                )
              )}
            </label>

            {mode === 'register' && (
              <label className="text-xs font-semibold text-slate-700">
                Confirmar contraseña
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={Boolean(errors.confirm)}
                  className={inputClass(Boolean(errors.confirm))}
                />
                {errors.confirm && <span className="mt-1 block font-normal text-red-600">{errors.confirm}</span>}
              </label>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full py-3 rounded-xl bg-[#087E8B] hover:bg-[#066873] disabled:opacity-60 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              <span>
                {isSubmitting
                  ? mode === 'login'
                    ? 'Entrando…'
                    : 'Creando cuenta…'
                  : mode === 'login'
                  ? 'Entrar'
                  : 'Crear cuenta'}
              </span>
            </button>
          </form>
        </div>

        {onContinueAsGuest && (
          <button
            type="button"
            onClick={onContinueAsGuest}
            className="mt-5 mx-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Continuar sin cuenta</span>
          </button>
        )}

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
          RABIA-CUN no diagnostica ni sustituye a las autoridades sanitarias. Ante una mordedura o
          arañazo, lava la herida con agua y jabón 15 minutos y acude a atención médica.
        </p>
      </div>
    </div>
  );
};
