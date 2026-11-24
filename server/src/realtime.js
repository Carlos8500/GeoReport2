/**
 * Notificaciones en tiempo real con Server-Sent Events (SSE).
 * Cada dispositivo conectado (celular, tableta, PC) abre GET /api/events y
 * recibe un aviso cuando cambian los datos; entonces vuelve a consultar la API.
 */
const clients = new Set();

export function eventsHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`data: ${JSON.stringify({ type: 'hello', clients: clients.size + 1 })}\n\n`);
  clients.add(res);

  // Comentario periódico para que proxies/túneles no cierren la conexión
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

/** Avisa a todos los dispositivos que cambió un recurso ('incidents' | 'alerts'). */
export function broadcast(resource, extra = {}) {
  const payload = `data: ${JSON.stringify({ type: 'changed', resource, ...extra })}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export const connectedClients = () => clients.size;
