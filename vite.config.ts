import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execFileSync} from 'child_process';
import fs from 'fs';
import type {IncomingMessage, ServerResponse} from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

interface StoredState {
  initialized: boolean;
  incidents: any[];
  updatedAt: number;
}

function getLocalLanIps(): string[] {
  const ips: string[] = [];
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const info of entries) {
      if (info.family === 'IPv4' && !info.internal) {
        ips.push(info.address);
      }
    }
  }
  return ips;
}

function ensureSelfSignedCert(cacheDir: string): {key: Buffer; cert: Buffer} | null {
  const keyFile = path.join(cacheDir, 'rabia-cun-lan-key.pem');
  const certFile = path.join(cacheDir, 'rabia-cun-lan-cert.pem');

  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    try {
      return {
        key: fs.readFileSync(keyFile),
        cert: fs.readFileSync(certFile),
      };
    } catch {
      // Regenerate below
    }
  }

  const opensslCandidates = [
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
  ];

  const sanParts = ['DNS:localhost', 'IP:127.0.0.1'];
  for (const ip of getLocalLanIps()) {
    sanParts.push(`IP:${ip}`);
  }

  fs.mkdirSync(cacheDir, {recursive: true});

  for (const bin of opensslCandidates) {
    try {
      execFileSync(
        bin,
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          keyFile,
          '-out',
          certFile,
          '-days',
          '365',
          '-subj',
          '/CN=rabia-cun-lan',
          '-addext',
          `subjectAltName=${sanParts.join(',')}`,
        ],
        {stdio: 'ignore'}
      );
      if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
        return {
          key: fs.readFileSync(keyFile),
          cert: fs.readFileSync(certFile),
        };
      }
    } catch {
      // Try next openssl binary
    }
  }

  return null;
}

function lanRealtimeIncidentsPlugin(): Plugin {
  const cacheDir = path.resolve(import.meta.dirname, 'node_modules/.cache');
  const storageFile = path.join(cacheDir, 'rabia-cun-live-incidents.json');

  let state: StoredState = {
    initialized: false,
    incidents: [],
    updatedAt: Date.now(),
  };

  try {
    if (fs.existsSync(storageFile)) {
      const raw = fs.readFileSync(storageFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.incidents) && parsed.incidents.length > 0) {
        state = {
          initialized: true,
          incidents: parsed.incidents,
          updatedAt: parsed.updatedAt || Date.now(),
        };
      }
    }
  } catch {
    // Fallback to empty uninitialized state
  }

  const saveState = () => {
    try {
      fs.mkdirSync(cacheDir, {recursive: true});
      fs.writeFileSync(storageFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // Ignore write error
    }
  };

  const sseClients = new Set<ServerResponse>();

  const broadcastSync = () => {
    const payload = `data: ${JSON.stringify({
      type: 'sync',
      initialized: state.initialized,
      incidents: state.incidents,
      updatedAt: state.updatedAt,
    })}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  };

  const readJsonBody = (req: IncomingMessage): Promise<any> =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
        if (body.length > 15 * 1024 * 1024) {
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });

  const attachMiddleware = (middlewares: any) => {
    middlewares.use(
      async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url?.split('?')[0] || '';

        if (!url.startsWith('/api/incidents')) {
          return next();
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, PATCH, OPTIONS'
        );
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        // SSE Real-time stream for all LAN devices
        if (req.method === 'GET' && url === '/api/incidents/stream') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });
          res.write(
            `data: ${JSON.stringify({
              type: 'sync',
              initialized: state.initialized,
              incidents: state.incidents,
              updatedAt: state.updatedAt,
              connectedClients: sseClients.size + 1,
            })}\n\n`
          );
          sseClients.add(res);
          req.on('close', () => {
            sseClients.delete(res);
          });
          return;
        }

        // GET current shared incidents list
        if (req.method === 'GET' && url === '/api/incidents') {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              initialized: state.initialized,
              incidents: state.incidents,
              updatedAt: state.updatedAt,
              connectedClients: Math.max(1, sseClients.size),
            })
          );
          return;
        }

        // POST seed initial incidents if server hasn't been initialized yet
        if (req.method === 'POST' && url === '/api/incidents/init') {
          try {
            const body = await readJsonBody(req);
            if (!state.initialized && Array.isArray(body.incidents)) {
              state.initialized = true;
              state.incidents = body.incidents;
              state.updatedAt = Date.now();
              saveState();
              broadcastSync();
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                initialized: state.initialized,
                incidents: state.incidents,
                updatedAt: state.updatedAt,
              })
            );
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({error: err?.message || 'Invalid JSON'}));
          }
          return;
        }

        // POST create a new incident report from any LAN device
        if (req.method === 'POST' && url === '/api/incidents') {
          try {
            const body = await readJsonBody(req);
            const newReport = body.report;
            if (newReport && newReport.id) {
              if (
                !state.initialized &&
                Array.isArray(body.fallbackSeedIncidents)
              ) {
                state.incidents = body.fallbackSeedIncidents;
                state.initialized = true;
              }
              const exists = state.incidents.some(
                (i) => i.id === newReport.id
              );
              if (!exists) {
                state.incidents = [newReport, ...state.incidents];
                state.initialized = true;
                state.updatedAt = Date.now();
                saveState();
                broadcastSync();
              }
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                incidents: state.incidents,
                updatedAt: state.updatedAt,
              })
            );
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({error: err?.message || 'Invalid JSON'}));
          }
          return;
        }

        // PATCH update verification status from Admin console on any LAN device
        if (req.method === 'PATCH' && url === '/api/incidents') {
          try {
            const body = await readJsonBody(req);
            const {id, verificationStatus, officialSource, evidenceNote} = body;
            if (id && verificationStatus) {
              state.incidents = state.incidents.map((inc) =>
                inc.id === id
                  ? {
                      ...inc,
                      verificationStatus,
                      officialSource:
                        verificationStatus === 'verificado_oficial'
                          ? officialSource ||
                            'SESA Quintana Roo · Jurisdicción Sanitaria No. 2'
                          : inc.officialSource,
                      evidenceNote,
                    }
                  : inc
              );
              state.updatedAt = Date.now();
              saveState();
              broadcastSync();
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                incidents: state.incidents,
                updatedAt: state.updatedAt,
              })
            );
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({error: err?.message || 'Invalid JSON'}));
          }
          return;
        }

        next();
      }
    );
  };

  const startHttpsCompanion = (
    middlewares: any,
    httpServer: any,
    httpsPort = 3443
  ) => {
    const tlsCreds = ensureSelfSignedCert(cacheDir);
    if (!tlsCreds) return;

    const httpsServer = https.createServer(tlsCreds, middlewares);
    httpsServer.on('error', () => {
      // Gracefully ignore if port 3443 is already bound
    });
    httpsServer.listen(httpsPort, '0.0.0.0', () => {
      const ips = getLocalLanIps();
      for (const ip of ips) {
        console.log(
          `  ➜  HTTPS Móvil (GPS/Giroscopio): https://${ip}:${httpsPort}/`
        );
      }
    });
    httpServer?.on('close', () => {
      httpsServer.close();
    });
  };

  return {
    name: 'lan-realtime-incidents-sync',
    configureServer(server) {
      attachMiddleware(server.middlewares);
      startHttpsCompanion(server.middlewares, server.httpServer, 3443);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
      startHttpsCompanion(server.middlewares, server.httpServer, 3443);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), lanRealtimeIncidentsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: true,
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
