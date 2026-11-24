import fs from 'node:fs';
import os from 'node:os';
import express from 'express';
import cors from 'cors';
import { pool, waitForDatabase } from './db.js';
import { errorMiddleware } from './errors.js';
import { eventsHandler } from './realtime.js';
import { optionalAuth, prepareAuth } from './auth.js';
import { authRouter } from './routes/auth.js';
import { incidentsRouter } from './routes/incidents.js';
import { alertsRouter } from './routes/alerts.js';
import { miscRouter } from './routes/misc.js';

const PORT = Number(process.env.PORT) || 4000;

const app = express();

// CORS abierto: la app se abre desde el navegador, la APK (Capacitor) o la red local
app.use(cors());
// Las fotos de la cámara llegan en base64 dentro del JSON
app.use(express.json({ limit: '12mb' }));

// Registro sencillo de cada petición (útil al probar con Postman)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path !== '/api/events') {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start} ms)`);
    }
  });
  next();
});

// Registro, inicio de sesión y perfil
app.use('/api/auth', authRouter);
// Consultar es público (información preventiva para todos); cada ruta que
// registra, modifica o elimina exige sesión o rol de administrador.
app.use('/api', optionalAuth);

app.get('/api/events', eventsHandler);
app.use('/api/incidents', incidentsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api', miscRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});
app.use(errorMiddleware);

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((info) => info && info.family === 'IPv4' && !info.internal)
    .map((info) => info.address);
}

await waitForDatabase();
await prepareAuth();
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`API RABIA-CUN escuchando en http://localhost:${PORT}/api`);
  if (fs.existsSync('/.dockerenv')) {
    // Dentro de Docker la IP visible es la interna del contenedor, no la de la PC
    console.log(`  ➜ Red local: http://<IP-de-esta-PC>:${PORT}/api  (consulta la IP con "ipconfig")`);
  } else {
    for (const ip of lanAddresses()) console.log(`  ➜ Red local: http://${ip}:${PORT}/api`);
  }
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
