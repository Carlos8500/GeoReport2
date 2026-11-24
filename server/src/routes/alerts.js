import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, HttpError, parseId } from '../errors.js';
import { broadcast } from '../realtime.js';
import { validateAlert } from '../validation.js';
import { requireAdmin } from '../auth.js';

export const alertsRouter = Router();

const SELECT_ALERTS = `
  SELECT a.*,
         to_char(a.emitida, 'YYYY-MM-DD') AS emitida_iso,
         to_char(a.vigente_hasta, 'YYYY-MM-DD') AS vigente_iso
  FROM alertas a
`;

const formatDate = (iso) =>
  new Date(`${iso}T12:00:00`)
    .toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace('.', '');

function toAlertJson(row) {
  return {
    id: String(row.id),
    folio: row.folio,
    title: row.titulo,
    issuedAt: formatDate(row.emitida_iso),
    validUntil: formatDate(row.vigente_iso),
    issuedDate: row.emitida_iso,
    validUntilDate: row.vigente_iso,
    zone: row.zona,
    source: row.fuente,
    sourceUrl: row.url_fuente ?? '',
    severity: row.severidad,
    summary: row.resumen,
    recommendations: row.recomendaciones ?? [],
  };
}

async function findAlert(id) {
  const rows = await query(`${SELECT_ALERTS} WHERE a.id = $1`, [id]);
  if (rows.length === 0) throw new HttpError(404, `No existe la alerta ${id}.`);
  return toAlertJson(rows[0]);
}

/** GET /api/alerts · ?active=true devuelve sólo las vigentes hoy */
alertsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.query.active === 'true' ? 'WHERE a.vigente_hasta >= CURRENT_DATE' : '';
    const rows = await query(`${SELECT_ALERTS} ${where} ORDER BY a.emitida DESC, a.id DESC`);
    res.json(rows.map(toAlertJson));
  })
);

alertsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await findAlert(parseId(req.params.id)));
  })
);

// Crear, editar y eliminar alertas: sólo administrador
alertsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const a = validateAlert(req.body);
    const rows = await query(
      `INSERT INTO alertas (folio, titulo, emitida, vigente_hasta, zona, fuente, url_fuente, severidad, resumen, recomendaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [a.folio, a.title, a.issuedDate, a.validUntilDate, a.zone, a.source, a.sourceUrl, a.severity, a.summary, a.recommendations]
    );
    const created = await findAlert(rows[0].id);
    broadcast('alerts', { id: created.id, action: 'created' });
    res.status(201).location(`/api/alerts/${created.id}`).json(created);
  })
);

alertsRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const a = validateAlert(req.body);
    const rows = await query(
      `UPDATE alertas SET folio = $2, titulo = $3, emitida = $4, vigente_hasta = $5, zona = $6,
              fuente = $7, url_fuente = $8, severidad = $9, resumen = $10, recomendaciones = $11
       WHERE id = $1 RETURNING id`,
      [id, a.folio, a.title, a.issuedDate, a.validUntilDate, a.zone, a.source, a.sourceUrl, a.severity, a.summary, a.recommendations]
    );
    if (rows.length === 0) throw new HttpError(404, `No existe la alerta ${id}.`);
    const updated = await findAlert(id);
    broadcast('alerts', { id: updated.id, action: 'updated' });
    res.json(updated);
  })
);

alertsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const rows = await query('DELETE FROM alertas WHERE id = $1 RETURNING id, folio', [id]);
    if (rows.length === 0) throw new HttpError(404, `No existe la alerta ${id}.`);
    broadcast('alerts', { id: String(id), action: 'deleted' });
    res.json({ ok: true, deleted: { id: String(id), folio: rows[0].folio } });
  })
);
