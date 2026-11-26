import React, { useEffect, useState } from 'react';
import { IonModal } from '@ionic/react';
import { CheckCircle2, Server, X, XCircle } from 'lucide-react';
import {
  getServerUrl,
  isNativeApp,
  normalizeServerUrl,
  saveServerUrl,
  testServerUrl,
} from '../services/serverConfig';

interface ServerSettingsModalProps {
  isOpen: boolean;
  /** true en el primer arranque de la APK: no se puede cerrar sin configurar */
  required?: boolean;
  onClose: () => void;
  /** Se llama con la dirección ya guardada */
  onSaved: (url: string) => void;
}

/**
 * Configuración del servidor (ventana modal de Ionic).
 * Permite usar la APK en cualquier red sin recompilarla: la dirección de la
 * API se escribe aquí y se guarda en el dispositivo.
 */
export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  isOpen,
  required = false,
  onClose,
  onSaved,
}) => {
  const [value, setValue] = useState(getServerUrl());
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const native = isNativeApp();

  useEffect(() => {
    if (isOpen) {
      setValue(getServerUrl());
      setResult(null);
    }
  }, [isOpen]);

  const handleTest = async () => {
    if (!value.trim()) {
      setResult({ ok: false, message: 'Escribe la dirección del servidor.' });
      return;
    }
    setBusy(true);
    setResult(await testServerUrl(value));
    setBusy(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (native && !value.trim()) {
      setResult({ ok: false, message: 'En la app instalada hay que escribir la dirección del servidor.' });
      return;
    }
    setBusy(true);
    // Vacío en el navegador = misma dirección que la página
    const check = value.trim() ? await testServerUrl(value) : { ok: true, message: '' };
    if (!check.ok) {
      setResult(check);
      setBusy(false);
      return;
    }
    const saved = await saveServerUrl(value);
    setBusy(false);
    onSaved(saved);
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} canDismiss={!required} className="rc-server-modal">
      <form onSubmit={handleSave} className="h-full overflow-y-auto bg-white p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#123047] text-white flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#123047]">Servidor de RABIA-CUN</h2>
              <p className="text-xs text-slate-500">Dirección de la API a la que se conecta la app</p>
            </div>
          </div>
          {!required && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {required && (
          <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            Antes de empezar, escribe la dirección del servidor que te dio el equipo.
          </div>
        )}

        <label className="text-xs font-semibold text-slate-700">
          Dirección del servidor
          <input
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="http://192.168.1.73:4000"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setResult(null);
            }}
            onBlur={() => value.trim() && setValue(normalizeServerUrl(value))}
            className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-normal text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#087E8B]/40"
          />
        </label>

        <ul className="text-[11px] text-slate-600 space-y-1.5 list-disc pl-4">
          <li>
            <strong>Misma Wi-Fi que la PC:</strong> <code>http://IP-de-la-PC:4000</code> (en la PC:{' '}
            <code>ipconfig</code> → Dirección IPv4).
          </li>
          <li>
            <strong>Desde cualquier red:</strong> la dirección <code>https://…trycloudflare.com</code> que muestra{' '}
            <code>cloudflared</code> en la PC.
          </li>
          {!native && <li>Vacío = el mismo servidor que esta página.</li>}
        </ul>

        {result && (
          <div
            role={result.ok ? 'status' : 'alert'}
            className={`px-3 py-2.5 rounded-xl border text-xs flex items-start gap-2 ${
              result.ok
                ? 'bg-teal-50 border-teal-200 text-[#065f68]'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {result.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{result.message}</span>
          </div>
        )}

        <div className="mt-auto flex gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold text-slate-700 cursor-pointer"
          >
            Probar conexión
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-[#087E8B] hover:bg-[#066873] disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
          >
            {busy ? 'Conectando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </IonModal>
  );
};
