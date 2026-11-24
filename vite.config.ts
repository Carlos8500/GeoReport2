import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execFileSync} from 'child_process';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

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

/**
 * Servidor HTTPS adicional (puerto 3443) con certificado autofirmado.
 * Los navegadores móviles sólo permiten GPS y giroscopio en HTTPS.
 * Reutiliza los middlewares de Vite, incluido el proxy /api -> Docker.
 */
function httpsCompanionPlugin(): Plugin {
  const cacheDir = path.resolve(import.meta.dirname, 'node_modules/.cache');

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
    name: 'https-companion',
    configureServer(server) {
      startHttpsCompanion(server.middlewares, server.httpServer, 3443);
    },
    configurePreviewServer(server) {
      startHttpsCompanion(server.middlewares, server.httpServer, 3443);
    },
  };
}

/**
 * Dirección de la API (contenedor Docker). Se puede cambiar con la variable
 * de entorno API_PROXY_TARGET si la API corre en otra PC.
 */
const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:4000';

const apiProxy = {
  '/api': {
    target: API_PROXY_TARGET,
    changeOrigin: true,
  },
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), httpsCompanionPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: true,
      port: 3000,
      proxy: apiProxy,
    },
    preview: {
      host: true,
      proxy: apiProxy,
    },
  };
});
