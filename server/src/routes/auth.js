import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, HttpError } from '../errors.js';
import {
  hashPassword,
  requireAuth,
  signToken,
  toUserJson,
  verifyPassword,
} from '../auth.js';
import { validateLogin, validateProfile, validateRegister } from '../validation.js';

export const authRouter = Router();

/** POST /api/auth/register · crea una cuenta de ciudadano e inicia sesión */
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = validateRegister(req.body);
    const exists = await query('SELECT 1 FROM usuarios WHERE correo = $1', [data.email]);
    if (exists.length > 0) {
      throw new HttpError(409, 'Ya existe una cuenta con ese correo.', { email: 'Correo ya registrado.' });
    }
    const hash = await hashPassword(data.password);
    // El rol siempre es 'ciudadano': nadie puede registrarse como administrador
    const rows = await query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol, ultimo_acceso)
       VALUES ($1, $2, $3, 'ciudadano', now()) RETURNING *`,
      [data.name, data.email, hash]
    );
    res.status(201).json({ token: signToken(rows[0]), user: toUserJson(rows[0]) });
  })
);

/** POST /api/auth/login · devuelve un token válido por 7 días */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = validateLogin(req.body);
    const rows = await query('SELECT * FROM usuarios WHERE correo = $1 AND activo = true', [data.email]);
    const user = rows[0];
    // Mismo mensaje si el correo no existe o la contraseña es incorrecta
    if (!user || !(await verifyPassword(data.password, user.password_hash))) {
      throw new HttpError(401, 'Correo o contraseña incorrectos.');
    }
    await query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [user.id]);
    res.json({ token: signToken(user), user: toUserJson(user) });
  })
);

/** GET /api/auth/me · datos del usuario de la sesión */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query('SELECT * FROM usuarios WHERE id = $1', [req.user.id]);
    res.json(toUserJson(rows[0]));
  })
);

/**
 * DELETE /api/auth/me · el ciudadano elimina su cuenta.
 * Sus reportes se conservan de forma anónima (usuario_id queda en NULL).
 */
authRouter.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role === 'admin') {
      throw new HttpError(400, 'Una cuenta administradora no puede eliminarse desde la app.');
    }
    await query('DELETE FROM usuarios WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  })
);

/** PUT /api/auth/me · actualizar nombre y, opcionalmente, la contraseña */
authRouter.put(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = validateProfile(req.body);
    if (data.newPassword) {
      const current = await query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id]);
      if (!(await verifyPassword(data.currentPassword || '', current[0].password_hash))) {
        throw new HttpError(400, 'La contraseña actual no es correcta.', {
          currentPassword: 'Contraseña actual incorrecta.',
        });
      }
      await query('UPDATE usuarios SET password_hash = $2 WHERE id = $1', [
        req.user.id,
        await hashPassword(data.newPassword),
      ]);
    }
    const rows = await query('UPDATE usuarios SET nombre = $2 WHERE id = $1 RETURNING *', [req.user.id, data.name]);
    res.json(toUserJson(rows[0]));
  })
);
