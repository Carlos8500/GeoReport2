/** Error con código HTTP para responder al cliente con un mensaje claro. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Envuelve un controlador async para que sus errores lleguen al middleware de errores. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Middleware final: convierte cualquier error en una respuesta JSON. */
export function errorMiddleware(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La fotografía o el cuerpo de la petición es demasiado grande.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
  }
  // Violaciones de restricciones de PostgreSQL (llave foránea, CHECK, UNIQUE)
  if (err?.code === '23503' || err?.code === '23514' || err?.code === '23505') {
    return res.status(400).json({ error: 'Datos inválidos para la base de datos.', details: err.detail });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}

/** Convierte un parámetro de ruta en id numérico o lanza 400. */
export function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'El id debe ser un número entero positivo.');
  }
  return id;
}
