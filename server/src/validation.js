import { HttpError } from './errors.js';

export const EVENT_TYPES = ['avistamiento', 'mordedura', 'aranazo', 'comportamiento_erratico'];
export const SPECIES = ['zorra_gris', 'perro', 'gato', 'coati_mapache', 'murcielago'];
export const STATUSES = ['verificado_oficial', 'en_revision', 'reporte_ciudadano', 'rechazado'];
export const SEVERITIES = ['alta', 'preventiva', 'informativa'];

/**
 * Geocerca urbana de Cancún (misma que usa el frontend en src/utils/geofence.ts).
 * El servidor vuelve a validar: nunca se confía sólo en el cliente.
 */
const CANCUN_GEOFENCE = [
  [21.25, -86.96],
  [21.25, -86.79],
  [21.165, -86.79],
  [21.15, -86.725],
  [21.02, -86.755],
  [20.99, -86.83],
  [20.99, -86.96],
  [21.12, -86.99],
];

export function isInsideCancun(lat, lng) {
  let inside = false;
  for (let i = 0, j = CANCUN_GEOFENCE.length - 1; i < CANCUN_GEOFENCE.length; j = i++) {
    const [yi, xi] = CANCUN_GEOFENCE[i];
    const [yj, xj] = CANCUN_GEOFENCE[j];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Acumula errores de validación campo por campo y, al final,
 * responde 400 con la lista completa para mostrarla en el formulario.
 */
class Validator {
  constructor(body) {
    this.body = body && typeof body === 'object' ? body : {};
    this.errors = {};
    this.value = {};
  }

  text(field, { required = true, min = 1, max = 500 } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.errors[field] = 'Campo obligatorio.';
      else this.value[field] = null;
      return this;
    }
    if (typeof raw !== 'string') {
      this.errors[field] = 'Debe ser texto.';
      return this;
    }
    const trimmed = raw.trim();
    if (trimmed.length < min) this.errors[field] = `Mínimo ${min} caracteres.`;
    else if (trimmed.length > max) this.errors[field] = `Máximo ${max} caracteres.`;
    else this.value[field] = trimmed;
    return this;
  }

  oneOf(field, options, { required = true } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.errors[field] = 'Campo obligatorio.';
      else this.value[field] = null;
    } else if (!options.includes(raw)) {
      this.errors[field] = `Valor inválido. Opciones: ${options.join(', ')}.`;
    } else {
      this.value[field] = raw;
    }
    return this;
  }

  number(field, { required = true, min = -Infinity, max = Infinity, integer = false } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.errors[field] = 'Campo obligatorio.';
      else this.value[field] = null;
      return this;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || (integer && !Number.isInteger(num))) {
      this.errors[field] = integer ? 'Debe ser un número entero.' : 'Debe ser un número.';
    } else if (num < min || num > max) {
      this.errors[field] = `Debe estar entre ${min} y ${max}.`;
    } else {
      this.value[field] = num;
    }
    return this;
  }

  bool(field) {
    this.value[field] = Boolean(this.body[field]);
    return this;
  }

  date(field, { required = true } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.errors[field] = 'Campo obligatorio.';
      else this.value[field] = null;
    } else if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
      this.errors[field] = 'Fecha inválida (formato AAAA-MM-DD).';
    } else {
      this.value[field] = raw;
    }
    return this;
  }

  textList(field, { maxItems = 10, maxLength = 300 } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null) {
      this.value[field] = [];
    } else if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
      this.errors[field] = 'Debe ser una lista de textos.';
    } else if (raw.length > maxItems || raw.some((item) => item.length > maxLength)) {
      this.errors[field] = `Máximo ${maxItems} elementos de ${maxLength} caracteres.`;
    } else {
      this.value[field] = raw.map((item) => item.trim()).filter(Boolean);
    }
    return this;
  }

  check(condition, field, message) {
    if (!this.errors[field] && !condition) this.errors[field] = message;
    return this;
  }

  done() {
    if (Object.keys(this.errors).length > 0) {
      throw new HttpError(400, 'Revisa los datos enviados.', this.errors);
    }
    return this.value;
  }
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Decodifica una foto enviada como data URL (base64) desde la cámara. */
export function parsePhotoDataUrl(dataUrl) {
  if (dataUrl === undefined || dataUrl === null || dataUrl === '') return null;
  const match = typeof dataUrl === 'string'
    ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/)
    : null;
  if (!match) {
    throw new HttpError(400, 'Revisa los datos enviados.', {
      photoDataUrl: 'La foto debe ser una imagen JPG, PNG, WEBP o GIF en base64.',
    });
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new HttpError(413, 'La fotografía supera los 8 MB.');
  }
  return { mime: match[1], data: buffer };
}

export function validateIncidentCreate(body) {
  const v = new Validator(body)
    .text('title', { min: 5, max: 200 })
    .oneOf('eventType', EVENT_TYPES)
    .oneOf('species', SPECIES)
    .number('approxLat', { min: -90, max: 90 })
    .number('approxLng', { min: -180, max: 180 })
    .number('privacyRadiusMeters', { required: false, min: 50, max: 1000, integer: true })
    .text('supermanzana', { max: 120 })
    .text('referenceLandmark', { required: false, max: 200 })
    .text('description', { min: 10, max: 2000 })
    .text('evidenceNote', { required: false, max: 1000 })
    .bool('gpsVerifiedInSitu')
    .number('userDistanceToPinMeters', { required: false, min: 0, max: 100000, integer: true })
    .oneOf('gpsVerificationMode', ['hardware_gps', 'demo_academico'], { required: false })
    .textList('recommendations')
    .text('photoFileName', { required: false, max: 200 });

  const value = v.value;
  if (value.approxLat !== undefined && value.approxLng !== undefined) {
    v.check(
      isInsideCancun(value.approxLat, value.approxLng),
      'approxLat',
      'La ubicación está fuera de la zona urbana de Cancún.'
    );
  }
  const gyro = body?.gyroscope;
  value.gyroscope =
    gyro && typeof gyro === 'object' && Number.isFinite(Number(gyro.alpha))
      ? {
          alpha: Number(gyro.alpha),
          beta: Number(gyro.beta) || 0,
          gamma: Number(gyro.gamma) || 0,
          cardinal: String(gyro.cardinal ?? '').slice(0, 3),
          source: gyro.source === 'sensor_hardware' ? 'sensor_hardware' : 'interactivo',
        }
      : null;
  return v.done();
}

export function validateIncidentUpdate(body) {
  return new Validator(body)
    .text('title', { min: 5, max: 200 })
    .oneOf('eventType', EVENT_TYPES)
    .oneOf('species', SPECIES)
    .text('referenceLandmark', { required: false, max: 200 })
    .text('description', { min: 10, max: 2000 })
    .done();
}

export function validateVerification(body) {
  return new Validator(body)
    .oneOf('verificationStatus', STATUSES)
    .text('officialSource', { required: false, max: 200 })
    .text('evidenceNote', { required: false, max: 1000 })
    .done();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normaliza el correo a minúsculas antes de validarlo. */
function withNormalizedEmail(body) {
  const copy = { ...(body && typeof body === 'object' ? body : {}) };
  if (typeof copy.email === 'string') copy.email = copy.email.trim().toLowerCase();
  return copy;
}

export function validateRegister(body) {
  const v = new Validator(withNormalizedEmail(body))
    .text('name', { min: 3, max: 120 })
    .text('email', { max: 160 })
    .text('password', { min: 8, max: 72 });
  if (v.value.email) v.check(EMAIL_PATTERN.test(v.value.email), 'email', 'Correo electrónico inválido.');
  if (v.value.password) {
    v.check(
      /[A-Za-z]/.test(v.value.password) && /\d/.test(v.value.password),
      'password',
      'La contraseña debe incluir letras y números.'
    );
  }
  return v.done();
}

export function validateLogin(body) {
  return new Validator(withNormalizedEmail(body))
    .text('email', { max: 160 })
    .text('password', { max: 72 })
    .done();
}

export function validateProfile(body) {
  const v = new Validator(body)
    .text('name', { min: 3, max: 120 })
    .text('currentPassword', { required: false, max: 72 })
    .text('newPassword', { required: false, min: 8, max: 72 });
  if (v.value.newPassword) {
    v.check(
      /[A-Za-z]/.test(v.value.newPassword) && /\d/.test(v.value.newPassword),
      'newPassword',
      'La contraseña debe incluir letras y números.'
    );
  }
  return v.done();
}

export function validateAlert(body) {
  const v = new Validator(body)
    .text('folio', { min: 3, max: 40 })
    .text('title', { min: 5, max: 200 })
    .date('issuedDate')
    .date('validUntilDate')
    .text('zone', { max: 250 })
    .text('source', { max: 200 })
    .text('sourceUrl', { required: false, max: 400 })
    .oneOf('severity', SEVERITIES)
    .text('summary', { min: 10, max: 3000 })
    .textList('recommendations');
  const { issuedDate, validUntilDate, sourceUrl } = v.value;
  if (issuedDate && validUntilDate) {
    v.check(validUntilDate >= issuedDate, 'validUntilDate', 'La vigencia debe ser posterior a la emisión.');
  }
  if (sourceUrl) {
    v.check(/^https?:\/\//i.test(sourceUrl), 'sourceUrl', 'Debe iniciar con http:// o https://');
  }
  return v.done();
}
