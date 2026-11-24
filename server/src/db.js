import pg from 'pg';

// NUMERIC (lat/lng) llega como texto por defecto; lo convertimos a número de JS
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

/**
 * Pool de conexiones a PostgreSQL.
 * La cadena de conexión viene de la variable de entorno DATABASE_URL
 * (definida en docker-compose.yml). Nunca se escriben credenciales en el código.
 */
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://rabiacun:rabiacun_dev@localhost:5432/rabiacun',
  max: 10,
});

/** Ejecuta una consulta parametrizada ($1, $2...) y devuelve las filas. */
export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

/** Ejecuta varias consultas dentro de una transacción (todo o nada). */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Espera a que la base de datos acepte conexiones (útil al arrancar en Docker). */
export async function waitForDatabase(retries = 20, delayMs = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`Esperando a PostgreSQL (${attempt}/${retries})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('No fue posible conectar con PostgreSQL');
}
