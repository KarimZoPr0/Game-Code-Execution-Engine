// Backend build server for playpen-canvas
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const queue = require('./queue');
const worker = require('./worker');


const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server (needed for WebSocket upgrade)
const server = http.createServer(app);

// WebSocket server for hot-reload notifications - attach to HTTP server
const wss = new WebSocket.Server({ noServer: true });

function notifyHotReload() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send('reload');
    }
  });
}

// Export for worker to use
module.exports.notifyHotReload = notifyHotReload;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Store SSE connections per build
const sseConnections = new Map(); // buildId -> Set of response objects

// ============================================================================
// API ROUTES
// ============================================================================

// POST /api/build - Submit a new build
app.post('/api/build', (req, res) => {
  try {
    const { files, entry, language, buildProfile, buildConfig, targetBuildId } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    if (!entry) {
      return res.status(400).json({ error: 'No entry point specified' });
    }

    const buildId = uuidv4();

    const job = {
      id: buildId,
      files,
      entry,
      language: language || 'c',
      buildProfile,
      buildConfig,
      targetBuildId,
      status: 'queued',
      phase: 'queued',
      createdAt: Date.now()
    };

    queue.enqueue(job);
    console.log(`[Server] Build ${buildId} queued with ${files.length} files`);

    res.json({ buildId, status: 'queued' });

  } catch (err) {
    console.error('[Server] Build submission error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/build/:id/events - SSE stream for build events
app.get('/api/build/:id/events', (req, res) => {
  const { id } = req.params;
  const job = queue.getJob(id);

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // For nginx
  res.flushHeaders();

  // Track this connection
  if (!sseConnections.has(id)) {
    sseConnections.set(id, new Set());
  }
  sseConnections.get(id).add(res);

  // Helper to send SSE data
  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // If job is already done, send final status immediately
  if (job) {
    send({ buildId: id, type: 'status', phase: job.phase, message: `Build ${job.status}` });

    if (job.status === 'done') {
      send({ buildId: id, type: 'done', success: true, previewUrl: job.previewUrl });
      res.end();
      return;
    } else if (job.status === 'error') {
      send({ buildId: id, type: 'error', message: job.error || 'Build failed' });
      res.end();
      return;
    }
  }

  // Listen for job events
  const eventHandler = (event) => {
    send(event);

    // Close connection on terminal events
    if (event.type === 'done' || event.type === 'error') {
      setTimeout(() => {
        res.end();
        sseConnections.get(id)?.delete(res);
      }, 100);
    }
  };

  queue.on(`job:${id}`, eventHandler);

  // Clean up on disconnect
  req.on('close', () => {
    queue.off(`job:${id}`, eventHandler);
    sseConnections.get(id)?.delete(res);
    if (sseConnections.get(id)?.size === 0) {
      sseConnections.delete(id);
    }
  });
});

// GET /api/build/:id/result - Polling endpoint for build status
app.get('/api/build/:id/result', (req, res) => {
  const { id } = req.params;
  const job = queue.getJob(id);

  if (!job) {
    return res.status(404).json({ error: 'Build not found' });
  }

  res.json({
    ok: job.status === 'done',
    status: job.phase || job.status,
    previewUrl: job.previewUrl,
    error: job.error,
    message: job.status === 'done' ? 'Build complete' :
      job.status === 'error' ? job.error :
        `Build ${job.status}`
  });
});

// GET /preview/:id/* - Serve built files
app.get('/preview/:id/*', (req, res) => {
  const { id } = req.params;
  const filePath = req.params[0] || 'index.html';
  const buildsDir = path.join('/tmp/builds', id);
  const fullPath = path.join(buildsDir, filePath);

  // Security: ensure path is within builds directory
  if (!fullPath.startsWith(buildsDir)) {
    return res.status(403).send('Forbidden');
  }

  res.sendFile(fullPath, (err) => {
    if (err) {
      res.status(404).send('File not found');
    }
  });
});

// GET /preview/:id - Redirect to index.html
app.get('/preview/:id', (req, res) => {
  res.redirect(`/preview/${req.params.id}/index.html`);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// KTH Cloud health check
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});


// ============================================================================
// START SERVER
// ============================================================================

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});


server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Build server running on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket for hot-reload on ws://localhost:${PORT}/ws`);
  console.log(`[Server] API endpoints:`);
  console.log(`  POST /api/build          - Submit build`);
  console.log(`  GET  /api/build/:id/events - SSE stream`);
  console.log(`  GET  /api/build/:id/result - Poll status`);
  console.log(`  GET  /preview/:id/*      - Serve built files`);

  // Wire up hot-reload notifications
  worker.onBuildComplete = (jobId, event) => {
    if (event.isLiveCoding) {
      console.log(`[Server] Notifying hot-reload for build ${jobId}`);
      notifyHotReload();
    }
  };

  // Start the worker
  worker.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  worker.stop();
  process.exit(0);
});

// ============================================================================
// GAME SERVER (Port 1234) - Hybrid Multiplayer (Binary + JSON)
// ============================================================================

const GAME_PORT = 1234;
const wssGame = new WebSocket.Server({ port: GAME_PORT, host: '0.0.0.0' });

// Room-based game sessions (for JSON clients)
const gameRooms = new Map();     // roomId -> { players: Set, state: 'waiting'|'playing' }
const playerToRoom = new Map();  // ws -> roomId
const quickMatchQueue = [];      // Array of waiting players for auto-match

// Legacy binary matching (for SDL_Net clients)
const binaryQueue = [];          // Waiting binary players

/**
 * Create a new game room
 */
function createRoom(roomId) {
  if (gameRooms.has(roomId)) return null;
  const room = {
    id: roomId,
    players: new Set(),
    state: 'waiting',
    createdAt: Date.now()
  };
  gameRooms.set(roomId, room);
  console.log(`[GameServer] Room ${roomId} created`);
  return room;
}

/**
 * Join a player to a room
 */
function joinRoom(ws, roomId) {
  const room = gameRooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.players.size >= 2) return { error: 'Room is full' };
  if (room.state === 'playing') return { error: 'Game already in progress' };

  room.players.add(ws);
  playerToRoom.set(ws, roomId);

  if (room.players.size === 2) {
    startGame(room);
  }

  return { success: true, room };
}

/**
 * Start a game in a room
 */
function startGame(room) {
  room.state = 'playing';
  const players = Array.from(room.players);

  console.log(`[GameServer] Game started in room ${room.id}`);

  players.forEach((player, index) => {
    if (player._isJson) {
      player.send(JSON.stringify({
        type: 'game_start',
        roomId: room.id,
        playerIndex: index,
        message: 'Match started!'
      }));
    }
  });

  // Set up message forwarding
  players.forEach((player, index) => {
    const opponent = players[1 - index];
    player._gameMessageHandler = (data) => {
      if (opponent.readyState === WebSocket.OPEN) {
        opponent.send(data);
      }
    };
    player.on('message', player._gameMessageHandler);
  });
}

/**
 * Remove a player from their room
 */
function leaveRoom(ws) {
  const roomId = playerToRoom.get(ws);
  if (!roomId) return;

  const room = gameRooms.get(roomId);
  if (room) {
    room.players.delete(ws);

    room.players.forEach(player => {
      if (player.readyState === WebSocket.OPEN) {
        if (player._isJson) {
          player.send(JSON.stringify({ type: 'player_left', message: 'Opponent disconnected' }));
        }
      }
    });

    if (room.players.size === 0) {
      gameRooms.delete(roomId);
      console.log(`[GameServer] Room ${roomId} deleted (empty)`);
    } else {
      room.state = 'waiting';
    }
  }

  playerToRoom.delete(ws);

  // Remove from queues
  let idx = quickMatchQueue.indexOf(ws);
  if (idx !== -1) quickMatchQueue.splice(idx, 1);

  idx = binaryQueue.indexOf(ws);
  if (idx !== -1) binaryQueue.splice(idx, 1);

  if (ws._gameMessageHandler) {
    ws.off('message', ws._gameMessageHandler);
  }
}

/**
 * Quick match - auto pair JSON players
 */
function quickMatch(ws) {
  while (quickMatchQueue.length > 0) {
    const opponent = quickMatchQueue.shift();
    if (opponent.readyState === WebSocket.OPEN && opponent !== ws) {
      const roomId = `quick_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const room = createRoom(roomId);
      joinRoom(opponent, roomId);
      joinRoom(ws, roomId);
      return { matched: true, roomId };
    }
  }

  quickMatchQueue.push(ws);
  return { matched: false, message: 'Waiting for opponent...' };
}

/**
 * Binary auto-match for SDL_Net clients (legacy mode)
 */
function binaryMatch(ws) {
  while (binaryQueue.length > 0) {
    const opponent = binaryQueue.shift();
    if (opponent.readyState === WebSocket.OPEN && opponent !== ws) {
      // Pair them in a room
      const roomId = `binary_${Date.now()}`;
      const room = createRoom(roomId);
      room.players.add(opponent);
      room.players.add(ws);
      playerToRoom.set(opponent, roomId);
      playerToRoom.set(ws, roomId);
      room.state = 'playing';

      console.log(`[GameServer] Binary match started in room ${roomId}`);

      // Set up bidirectional forwarding
      ws._gameMessageHandler = (data) => {
        if (opponent.readyState === WebSocket.OPEN) opponent.send(data);
      };
      opponent._gameMessageHandler = (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      };
      ws.on('message', ws._gameMessageHandler);
      opponent.on('message', opponent._gameMessageHandler);

      return true;
    }
  }

  binaryQueue.push(ws);
  console.log(`[GameServer] Binary player waiting (${binaryQueue.length} in queue)`);
  return false;
}

wssGame.on('connection', (ws) => {
  console.log('[GameServer] Client connected');

  ws.on('error', console.error);
  ws._isJson = false;
  ws._firstMessage = true;

  ws.on('message', (data) => {
    // First message determines protocol
    if (ws._firstMessage) {
      ws._firstMessage = false;

      // Try to parse as JSON
      try {
        const str = data.toString();
        if (str.startsWith('{')) {
          const msg = JSON.parse(str);
          ws._isJson = true;
          handleJsonMessage(ws, msg);
          return;
        }
      } catch (e) {
        // Not JSON
      }

      // Binary mode - auto-match
      ws._isJson = false;
      console.log('[GameServer] Binary client detected, auto-matching...');
      binaryMatch(ws);

      // Forward this first message if already matched
      if (playerToRoom.has(ws) && ws._gameMessageHandler) {
        // Already handled by binaryMatch
      }
      return;
    }

    // Subsequent messages
    if (ws._isJson) {
      try {
        const msg = JSON.parse(data.toString());
        handleJsonMessage(ws, msg);
      } catch (e) {
        // Forward as game data
      }
    }
    // Binary messages are forwarded by _gameMessageHandler
  });

  ws.on('close', () => {
    leaveRoom(ws);
    console.log('[GameServer] Client disconnected');
  });
});

function handleJsonMessage(ws, msg) {
  switch (msg.type) {
    case 'create': {
      const roomId = msg.roomId || `room_${Date.now()}`;
      const room = createRoom(roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room already exists' }));
        return;
      }
      const result = joinRoom(ws, roomId);
      ws.send(JSON.stringify({ type: 'room_created', roomId, ...result }));
      break;
    }

    case 'join': {
      const result = joinRoom(ws, msg.roomId);
      if (result.error) {
        ws.send(JSON.stringify({ type: 'error', message: result.error }));
      } else {
        ws.send(JSON.stringify({ type: 'room_joined', roomId: msg.roomId }));
      }
      break;
    }

    case 'quick_match': {
      const result = quickMatch(ws);
      ws.send(JSON.stringify({
        type: result.matched ? 'matched' : 'waiting',
        ...result
      }));
      break;
    }

    case 'list_rooms': {
      const rooms = [];
      gameRooms.forEach((room, id) => {
        if (room.state === 'waiting' && room.players.size < 2) {
          rooms.push({ id, players: room.players.size });
        }
      });
      ws.send(JSON.stringify({ type: 'room_list', rooms }));
      break;
    }

    case 'leave': {
      leaveRoom(ws);
      ws.send(JSON.stringify({ type: 'left_room' }));
      break;
    }
  }
}

console.log(`[GameServer] Hybrid multiplayer (binary+JSON) listening on ws://localhost:${GAME_PORT}`);


