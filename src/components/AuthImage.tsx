import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { fetchProtectedImage } from '../services/api';

interface AuthImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * <img> para fotos protegidas por sesión. Las imágenes ya cargadas en el
 * dispositivo (data:, blob:) se muestran directo; las del servidor se
 * descargan con el token.
 */
export const AuthImage: React.FC<AuthImageProps> = ({ src, alt, className }) => {
  const isLocal = src.startsWith('data:') || src.startsWith('blob:');
  const [objectUrl, setObjectUrl] = useState<string | null>(isLocal ? src : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isLocal) {
      setObjectUrl(src);
      return;
    }
    let revoked = false;
    let created: string | null = null;
    setFailed(false);
    setObjectUrl(null);
    fetchProtectedImage(src)
      .then((url) => {
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setObjectUrl(url);
      })
      .catch(() => !revoked && setFailed(true));
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src, isLocal]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center gap-2 text-xs text-slate-500 ${className ?? ''}`}>
        <ImageOff className="w-4 h-4" />
        <span>No se pudo cargar la foto</span>
      </div>
    );
  }
  if (!objectUrl) {
    return <div className={`animate-pulse bg-slate-200 ${className ?? ''}`} aria-label="Cargando foto" />;
  }
  return <img src={objectUrl} alt={alt} className={className} />;
};
