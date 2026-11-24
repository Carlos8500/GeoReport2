import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, HttpError, parseId } from '../errors.js';
import { connectedClients } from '../realtime.js';
import { requireAuth } from '../auth.js';

export const miscRouter = Router();

/** GET /api/health · estado del servidor y de la base de datos */
miscRouter.get(
  '/health',
  asyncHandler(async (req, res) => {
    let database = 'ok';
    try {
      await query('SELECT 1');
    } catch {
      database = 'sin conexión';
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degradado',
      database,
      realtimeClients: connectedClients(),
      time: new Date().toISOString(),
    });
  })
);

/** GET /api/catalogs · opciones válidas para los formularios */
miscRouter.get(
  '/catalogs',
  asyncHandler(async (req, res) => {
    const [eventTypes, species] = await Promise.all([
      query('SELECT clave AS value, nombre AS label FROM catalogo_eventos ORDER BY nombre'),
      query('SELECT clave AS value, nombre AS label FROM catalogo_especies ORDER BY nombre'),
    ]);
    res.json({ eventTypes, species });
  })
);

/** GET /api/stats · estadísticas descriptivas (?from=&to=) · excluye rechazados */
miscRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const params = [];
    const conditions = ["estado <> 'rechazado'"];
    if (req.query.from) {
      params.push(req.query.from);
      conditions.push(`fecha_reporte >= $${params.length}::date`);
    }
    if (req.query.to) {
      params.push(req.query.to);
      conditions.push(`fecha_reporte < $${params.length}::date + interval '1 day'`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const group = (column) =>
      query(`SELECT ${column} AS key, COUNT(*)::int AS total FROM reportes ${where} GROUP BY ${column} ORDER BY total DESC`, params);

    const [byStatus, bySpecies, byEventType, byZone] = await Promise.all([
      group('estado'),
      group('especie'),
      group('tipo_evento'),
      group('zona'),
    ]);
    const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.key, r.total]));
    const statusMap = toMap(byStatus);
    res.json({
      totalActive: byStatus.reduce((sum, r) => sum + r.total, 0),
      verifiedCount: statusMap.verificado_oficial ?? 0,
      inReviewCount: statusMap.en_revision ?? 0,
      citizenCount: statusMap.reporte_ciudadano ?? 0,
      bySpecies: toMap(bySpecies),
      byEventType: toMap(byEventType),
      byZone: toMap(byZone),
    });
  })
);

/**
 * GET /api/photos/:id · imagen de evidencia guardada en la BD.
 * Requiere sesión: una foto puede mostrar personas, casas o placas, y el
 * brief prohíbe publicar datos sensibles a cualquier visitante.
 */
miscRouter.get(
  '/photos/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query('SELECT mime, datos FROM reporte_fotos WHERE id = $1', [parseId(req.params.id)]);
    if (rows.length === 0) throw new HttpError(404, 'Foto no encontrada.');
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(rows[0].datos);
  })
);
