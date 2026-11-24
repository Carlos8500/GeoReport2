import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { HttpError } from './errors.js';

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = '7d';

/**
 * Secreto para firmar los tokens. Se lee de la variable de entorno JWT_SECRET
 * (archivo .env, que no se sube a GitHub). Si falta, se genera uno aleatorio:
 * funciona, pero las sesiones se cierran cada vez que se reinicia la API.
 */
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('⚠ JWT_SECRET no está definido: se usa uno temporal (las sesiones se pierden al reiniciar).');
}

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain, hash) => (hash ? bcrypt.compare(plain, hash) : Promise.resolve(false));

/** Datos públicos del usuario (nunca se envía el hash de la contraseña). */
export const toUserJson = (row) => ({
  id: String(row.id),
  name: row.nombre,
  email: row.correo,
  role: row.rol,
  createdAt: row.creado_en,
});

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.rol }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/**
 * Identifica al usuario a partir del encabezado "Authorization: Bearer <token>".
 * - Sin encabezado: visitante (null).
 * - Token inválido o vencido: 401, para que la app pida iniciar sesión de nuevo.
 * Vuelve a consultar al usuario para que un rol cambiado o una cuenta
 * desactivada surtan efecto de inmediato.
 */
async function resolveUser(req) {
  const header = req.get('Authorization') || '';
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Encabezado de autorización inválido.');
  }
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Tu sesión expiró. Inicia sesión de nuevo.');
  }
  const rows = await query('SELECT * FROM usuarios WHERE id = $1 AND activo = true', [Number(payload.sub)]);
  if (rows.length === 0) throw new HttpError(401, 'La cuenta no existe o está desactivada.');
  return { id: rows[0].id, role: rows[0].rol, name: rows[0].nombre };
}

async function ensureUserResolved(req) {
  if (req.user === undefined) req.user = await resolveUser(req);
}

/**
 * Middleware: sesión opcional. Deja en req.user al usuario o null (visitante).
 * Se usa en las consultas públicas: mapa, reportes, alertas y estadísticas.
 */
export async function optionalAuth(req, _res, next) {
  try {
    await ensureUserResolved(req);
    next();
  } catch (err) {
    next(err);
  }
}

/** Middleware: exige sesión iniciada (enviar, editar o eliminar). */
export async function requireAuth(req, _res, next) {
  try {
    await ensureUserResolved(req);
    if (!req.user) throw new HttpError(401, 'Inicia sesión para continuar.');
    next();
  } catch (err) {
    next(err);
  }
}

/** Middleware: sólo personal administrador. */
export async function requireAdmin(req, _res, next) {
  try {
    await ensureUserResolved(req);
    if (!req.user) throw new HttpError(401, 'Inicia sesión para continuar.');
    if (req.user.role !== 'admin') {
      throw new HttpError(403, 'Esta acción es exclusiva del personal administrador.');
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** El dueño del recurso o un administrador. */
export function assertOwnerOrAdmin(user, ownerId) {
  if (user.role === 'admin') return;
  if (ownerId === null || ownerId === undefined || Number(ownerId) !== Number(user.id)) {
    throw new HttpError(403, 'Sólo puedes modificar tus propios reportes.');
  }
}

/**
 * Preparación al arrancar:
 * 1. Agrega las columnas de autenticación si la BD se creó con una versión anterior.
 * 2. Crea/actualiza la cuenta administradora con ADMIN_EMAIL y ADMIN_PASSWORD
 *    del archivo .env (así ninguna contraseña queda escrita en el código).
 */
export async function prepareAuth() {
  await query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash VARCHAR(100);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ;
  `);

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.warn('⚠ ADMIN_EMAIL / ADMIN_PASSWORD no definidos: no se configuró la cuenta administradora.');
    return;
  }
  if (password.length < 8) {
    console.warn('⚠ ADMIN_PASSWORD debe tener al menos 8 caracteres: no se configuró la cuenta administradora.');
    return;
  }
  const hash = await hashPassword(password);
  await query(
    `INSERT INTO usuarios (nombre, correo, password_hash, rol)
     VALUES ('Administrador', $1, $2, 'admin')
     ON CONFLICT (correo) DO UPDATE SET password_hash = EXCLUDED.password_hash, rol = 'admin', activo = true`,
    [email, hash]
  );
  console.log(`Cuenta administradora lista: ${email}`);
}
