import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { asyncHandler, HttpError, parseId } from '../errors.js';
import { broadcast } from '../realtime.js';
import { assertOwnerOrAdmin, requireAdmin, requireAuth } from '../auth.js';
import {
  EVENT_TYPES,
  SPECIES,
  STATUSES,
  parsePhotoDataUrl,
  validateIncidentCreate,
  validateIncidentUpdate,
  validateVerification,
} from '../validation.js';

export const incidentsRouter = Router();

const DEFAULT_OFFICIAL_SOURCE = 'SESA Quintana Roo · Jurisdicción Sanitaria No. 2';

/** Columnas comunes: se formatean fechas en hora de Cancún y se toma la 1ª foto. */
const SELECT_INCIDENTS = `
  SELECT r.*,
         to_char(r.fecha_reporte AT TIME ZONE 'America/Cancun', 'YYYY-MM-DD HH24:MI') AS fecha_texto,
         f.id AS foto_id
  FROM reportes r
  LEFT JOIN LATERAL (
    SELECT id FROM reporte_fotos WHERE reporte_id = r.id ORDER BY id LIMIT 1
  ) f ON true
`;

/** Convierte una fila SQL (snake_case) al JSON que consume la app (camelCase). */
function toIncidentJson(row) {
  const json = {
    id: String(row.id),
    folio: row.folio,
    title: row.titulo,
    eventType: row.tipo_evento,
    species: row.especie,
    verificationStatus: row.estado,
    approxLat: row.lat,
    approxLng: row.lng,
    privacyRadiusMeters: row.radio_privacidad_m,
    supermanzana: row.zona,
    referenceLandmark: row.referencia ?? '',
    reportedAt: row.fecha_texto,
    description: row.descripcion,
    officialSource: row.fuente_oficial ?? undefined,
    evidenceNote: row.nota_evidencia ?? undefined,
    photoUrl: row.foto_id ? `/api/photos/${row.foto_id}` : undefined,
    gpsVerifiedInSitu: row.gps_verificado,
    userDistanceToPinMeters: row.distancia_pin_m ?? undefined,
    gpsVerificationMode: row.modo_gps ?? undefined,
    gyroscope: row.giroscopio ?? undefined,
    ownerId: row.usuario_id ? String(row.usuario_id) : null,
    recommendations: row.recomendaciones ?? [],
    createdAt: row.creado_en,
    updatedAt: row.actualizado_en,
  };
  return json;
}

async function findIncident(id) {
  const rows = await query(`${SELECT_INCIDENTS} WHERE r.id = $1`, [id]);
  if (rows.length === 0) throw new HttpError(404, `No existe el reporte ${id}.`);
  return toIncidentJson(rows[0]);
}

/**
 * GET /api/incidents
 * Filtros opcionales: ?status=&species=&eventType=&from=AAAA-MM-DD&to=AAAA-MM-DD&mine=true
 */
incidentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const conditions = [];
    const params = [];
    const addFilter = (sql, value) => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };

    const { status, species, eventType, from, to } = req.query;
    if (status) {
      if (!STATUSES.includes(status)) throw new HttpError(400, 'Filtro status inválido.');
      addFilter('r.estado = ?', status);
    }
    if (species) {
      if (!SPECIES.includes(species)) throw new HttpError(400, 'Filtro species inválido.');
      addFilter('r.especie = ?', species);
    }
    if (eventType) {
      if (!EVENT_TYPES.includes(eventType)) throw new HttpError(400, 'Filtro eventType inválido.');
      addFilter('r.tipo_evento = ?', eventType);
    }
    if (req.query.mine === 'true') {
      if (!req.user) throw new HttpError(401, 'Inicia sesión para ver tus reportes.');
      addFilter('r.usuario_id = ?', req.user.id);
    }
    // Los visitantes sin sesión no ven reportes descartados
    if (!req.user) conditions.push("r.estado <> 'rechazado'");
    if (from) addFilter('r.fecha_reporte >= ?::date', from);
    if (to) addFilter("r.fecha_reporte < ?::date + interval '1 day'", to);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query(`${SELECT_INCIDENTS} ${where} ORDER BY r.fecha_reporte DESC, r.id DESC`, params);
    res.json(rows.map(toIncidentJson));
  })
);

/** GET /api/incidents/:id */
incidentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const incident = await findIncident(parseId(req.params.id));
    if (!req.user && incident.verificationStatus === 'rechazado') {
      throw new HttpError(404, `No existe el reporte ${incident.id}.`);
    }
    res.json(incident);
  })
);

/** GET /api/incidents/:id/verifications · historial de revisión */
incidentsRouter.get(
  '/:id/verifications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await findIncident(id);
    const rows = await query(
      `SELECT v.id, v.estado_anterior, v.estado_nuevo, v.fuente, v.nota, v.creado_en, u.nombre AS admin
       FROM verificaciones v LEFT JOIN usuarios u ON u.id = v.admin_id
       WHERE v.reporte_id = $1 ORDER BY v.creado_en DESC`,
      [id]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        fromStatus: r.estado_anterior,
        toStatus: r.estado_nuevo,
        officialSource: r.fuente,
        note: r.nota,
        admin: r.admin,
        createdAt: r.creado_en,
      }))
    );
  })
);

/**
 * POST /api/incidents · registrar un reporte ciudadano.
 * El estado inicial siempre es 'reporte_ciudadano': sólo un admin puede verificarlo.
 */
incidentsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = validateIncidentCreate(req.body);
    const photo = parsePhotoDataUrl(req.body?.photoDataUrl);

    const newId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO reportes
           (titulo, tipo_evento, especie, estado, lat, lng, radio_privacidad_m, zona, referencia,
            descripcion, nota_evidencia, gps_verificado, distancia_pin_m, modo_gps, giroscopio, recomendaciones,
            usuario_id)
         VALUES ($1, $2, $3, 'reporte_ciudadano', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id`,
        [
          data.title,
          data.eventType,
          data.species,
          data.approxLat,
          data.approxLng,
          data.privacyRadiusMeters ?? 150,
          data.supermanzana,
          data.referenceLandmark,
          data.description,
          data.evidenceNote,
          data.gpsVerifiedInSitu,
          data.userDistanceToPinMeters,
          data.gpsVerificationMode,
          data.gyroscope ? JSON.stringify(data.gyroscope) : null,
          data.recommendations,
          req.user.id,
        ]
      );
      const id = rows[0].id;
      if (photo) {
        await client.query(
          'INSERT INTO reporte_fotos (reporte_id, nombre_archivo, mime, datos) VALUES ($1, $2, $3, $4)',
          [id, data.photoFileName, photo.mime, photo.data]
        );
      }
      return id;
    });

    const created = await findIncident(newId);
    broadcast('incidents', { id: created.id, action: 'created' });
    res.status(201).location(`/api/incidents/${created.id}`).json(created);
  })
);

/** Dueño del reporte (o 404 si no existe). */
async function findOwnerId(id) {
  const rows = await query('SELECT usuario_id FROM reportes WHERE id = $1', [id]);
  if (rows.length === 0) throw new HttpError(404, `No existe el reporte ${id}.`);
  return rows[0].usuario_id;
}

/** PUT /api/incidents/:id · editar el reporte (su autor o un administrador) */
incidentsRouter.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    assertOwnerOrAdmin(req.user, await findOwnerId(id));
    const data = validateIncidentUpdate(req.body);
    const rows = await query(
      `UPDATE reportes
         SET titulo = $2, tipo_evento = $3, especie = $4, referencia = $5, descripcion = $6
       WHERE id = $1 RETURNING id`,
      [id, data.title, data.eventType, data.species, data.referenceLandmark, data.description]
    );
    if (rows.length === 0) throw new HttpError(404, `No existe el reporte ${id}.`);
    const updated = await findIncident(id);
    broadcast('incidents', { id: updated.id, action: 'updated' });
    res.json(updated);
  })
);

/** PATCH /api/incidents/:id/verification · cambio de estado (sólo administrador) */
incidentsRouter.patch(
  '/:id/verification',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = validateVerification(req.body);

    await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT estado, fuente_oficial FROM reportes WHERE id = $1 FOR UPDATE', [id]);
      if (rows.length === 0) throw new HttpError(404, `No existe el reporte ${id}.`);
      const previous = rows[0];

      // Regla de integridad del brief: un reporte verificado debe tener fuente oficial
      const source =
        data.verificationStatus === 'verificado_oficial'
          ? data.officialSource || previous.fuente_oficial || DEFAULT_OFFICIAL_SOURCE
          : previous.fuente_oficial;

      await client.query(
        'UPDATE reportes SET estado = $2, fuente_oficial = $3, nota_evidencia = COALESCE($4, nota_evidencia) WHERE id = $1',
        [id, data.verificationStatus, source, data.evidenceNote]
      );
      await client.query(
        `INSERT INTO verificaciones (reporte_id, admin_id, estado_anterior, estado_nuevo, fuente, nota)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, req.user.id, previous.estado, data.verificationStatus, source, data.evidenceNote]
      );
    });

    const updated = await findIncident(id);
    broadcast('incidents', { id: updated.id, action: 'verified' });
    res.json(updated);
  })
);

/** DELETE /api/incidents/:id · su autor o un administrador (fotos e historial se borran en cascada) */
incidentsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    assertOwnerOrAdmin(req.user, await findOwnerId(id));
    const rows = await query('DELETE FROM reportes WHERE id = $1 RETURNING id, folio', [id]);
    if (rows.length === 0) throw new HttpError(404, `No existe el reporte ${id}.`);
    broadcast('incidents', { id: String(id), action: 'deleted' });
    res.json({ ok: true, deleted: { id: String(id), folio: rows[0].folio } });
  })
);
