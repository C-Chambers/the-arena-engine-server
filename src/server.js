// src/server.js

const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { testConnection } = require('./config/database.js');
const authRoutes = require('./routes/auth.js');
const statusRoutes = require('./routes/status.js');
const characterRoutes = require('./routes/characters.js'); 
const teamRoutes = require('./routes/team.js');
const missionRoutes = require('./routes/missions.js');
const ratingRoutes = require('./routes/ratings.js'); // Import our new rating routes
const gameManager = require('./game/manager.js');
const { loadAllGameData } = require('./services/characterService');

const app = express();

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

async function startServer() {
  await testConnection();
  await loadAllGameData(); 

  app.use('/api/auth', authRoutes);
  app.use('/api/characters', characterRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/missions', missionRoutes);
  app.use('/api/ratings', ratingRoutes); // This line is crucial
  app.use('/status', statusRoutes(gameManager));

  app.get('/', (req, res) => {
    res.send('<h1>The Arena Engine server is running!</h1><p>Visit <a href="/status">/status</a> to see game activity.</p>');
  });

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server is listening on port ${PORT}`);
  });

  setupWebSockets(server);
}

function setupWebSockets(server) {
  // ... WebSocket setup code remains the same ...
  const statusClients = new Set();
  gameManager.setStatusUpdateCallback(() => {
    statusClients.forEach(client => {
      if (client.readyState === client.OPEN) client.send('refresh');
    });
  });

  const gameWss = new WebSocketServer({ noServer: true });
  gameWss.on('connection', (ws, request, user) => {
      gameManager.handleNewPlayer(ws, user);
      ws.on('message', (message) => {
        if (ws.gameId) {
          try {
            const action = JSON.parse(message);
            gameManager.handlePlayerAction(ws.gameId, ws.id, action);
          } catch(e) { console.error("Failed to parse message from client:", message); }
        }
      });
      ws.on('close', () => gameManager.handleDisconnect(ws));
  });

  const statusWss = new WebSocketServer({ noServer: true });
  statusWss.on('connection', (ws) => {
      statusClients.add(ws);
      ws.on('close', () => statusClients.delete(ws));
  });

  server.on('upgrade', (request, socket, head) => {
    const { pathname, query } = require('url').parse(request.url, true);
    if (pathname === '/status-ws') {
      statusWss.handleUpgrade(request, socket, head, (ws) => statusWss.emit('connection', ws, request));
    } else {
      const token = query.token;
      if (!token) { socket.destroy(); return; }
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET;
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) { socket.destroy(); return; }
        gameWss.handleUpgrade(request, socket, head, (ws) => gameWss.emit('connection', ws, request, decoded.user));
      });
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error(`ERROR: Port ${PORT} is already in use.`);
    else console.error(`An error occurred while starting the server: ${err}`);
  });
}

startServer();
