import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer();
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = 3004;

// Track which sockets are in which request rooms: serviceRequestId -> Set of socketIds
const requestRooms = new Map<string, Set<string>>();

io.on('connection', (socket) => {
  console.log('[ChatService] Client connected:', socket.id);

  // Join a service request room
  socket.on('join:request', ({ serviceRequestId }: { serviceRequestId: string }) => {
    if (!serviceRequestId) return;
    socket.join(`request:${serviceRequestId}`);
    if (!requestRooms.has(serviceRequestId)) {
      requestRooms.set(serviceRequestId, new Set());
    }
    requestRooms.get(serviceRequestId)!.add(socket.id);
    console.log(`[ChatService] ${socket.id} joined request:${serviceRequestId}`);
  });

  // Leave a service request room
  socket.on('leave:request', ({ serviceRequestId }: { serviceRequestId: string }) => {
    if (!serviceRequestId) return;
    socket.leave(`request:${serviceRequestId}`);
    requestRooms.get(serviceRequestId)?.delete(socket.id);
    console.log(`[ChatService] ${socket.id} left request:${serviceRequestId}`);
  });

  // Relay a chat message to all other clients in the room
  // Persistence is handled by the REST API; this service only relays in real-time
  socket.on('chat:message', (data: { serviceRequestId: string; message: any }) => {
    if (!data.serviceRequestId) return;
    socket.to(`request:${data.serviceRequestId}`).emit('chat:message', data.message);
  });

  // Broadcast typing indicator to room (excluding sender)
  socket.on('chat:typing', (data: { serviceRequestId: string; senderId: string }) => {
    if (!data.serviceRequestId) return;
    socket.to(`request:${data.serviceRequestId}`).emit('chat:typing', {
      senderId: data.senderId,
    });
  });

  // Handle read receipts
  socket.on('chat:read', (data: { serviceRequestId: string; readerId: string }) => {
    if (!data.serviceRequestId) return;
    // Broadcast read status to room (excluding sender) so the other party can update UI
    socket.to(`request:${data.serviceRequestId}`).emit('chat:read', {
      readerId: data.readerId,
    });
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    for (const [reqId, sockets] of requestRooms) {
      sockets.delete(socket.id);
      if (sockets.size === 0) requestRooms.delete(reqId);
    }
    console.log('[ChatService] Client disconnected:', socket.id);
  });

  socket.on('error', (error) => {
    console.error(`[ChatService] Socket error (${socket.id}):`, error);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[ChatService] Chat WebSocket service running on port ${PORT}`);
});

// =============================================================
// [DEV-KEEPER] Self-healing: relance `next dev` (port 3000) s'il
// est absent. Ce process (bun --hot) survit aux rechargements du
// sandbox, il agit donc comme gardien du serveur de dev.
// Idempotent : ne spawn que si localhost:3000 ne répond pas.
// =============================================================
async function ensureNextDevServer() {
  const probe = await fetch('http://127.0.0.1:3000/', {
    signal: AbortSignal.timeout(2000),
  })
    .then(() => true)
    .catch(() => false);

  if (probe) {
    console.log('[DEV-KEEPER] next dev déjà en ligne sur :3000 — rien à faire.');
    return;
  }

  console.log('[DEV-KEEPER] next dev absent — relance de `bun run dev`…');
  try {
    const child = Bun.spawn(['bun', 'run', 'dev'], {
      cwd: '/home/z/my-project',
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    child.unref();
    console.log(`[DEV-KEEPER] next dev relancé (pid ${child.pid}).`);
  } catch (err) {
    console.error('[DEV-KEEPER] Échec du spawn next dev :', err);
  }
}

// Petit délai pour ne pas gêner le démarrage du service websocket.
setTimeout(ensureNextDevServer, 1500);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[ChatService] Received SIGTERM signal, shutting down server...');
  httpServer.close(() => {
    console.log('[ChatService] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[ChatService] Received SIGINT signal, shutting down server...');
  httpServer.close(() => {
    console.log('[ChatService] Server closed');
    process.exit(0);
  });
});
