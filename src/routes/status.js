// src/routes/status.js

const { Router } = require('express');

// This module exports a function that takes the gameManager
// and returns a configured router.
module.exports = function(gameManager) {
  const router = Router();

  router.get('/', (req, res) => {
    const activeGames = Array.from(gameManager.games.values());
    const waitingPlayer = gameManager.waitingPlayer;

    let html = `
      <html>
      <head>
        <title>Arena Engine Status</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #111827; color: #d1d5db; padding: 2rem; transition: background-color 0.5s; }
          h1, h2 { color: white; border-bottom: 1px solid #374151; padding-bottom: 0.5rem; }
          ul { list-style-type: none; padding-left: 0; }
          li { background-color: #1f2937; padding: 1rem; border-radius: 0.5rem; margin-bottom: 0.5rem; font-family: monospace; }
          p { color: #9ca3af; }
          strong { color: #38bdf8; }
          .status-dot { height: 10px; width: 10px; background-color: #ef4444; border-radius: 50%; display: inline-block; margin-right: 10px; }
          .status-dot.connected { background-color: #22c55e; }
        </style>
      </head>
      <body>
        <h1>The Arena Engine Server Status</h1>
        <p><span id="status-dot" class="status-dot"></span><span id="status-text">Connecting to real-time updates...</span></p>
        
        <h2>Active Games (${activeGames.length})</h2>
    `;

    if (activeGames.length === 0) {
      html += '<p>No active games.</p>';
    } else {
      html += '<ul>';
      activeGames.forEach(game => {
        const playerIds = Object.keys(game.players);
        html += `<li>Game ID: ${game.gameId}<br>Players: ${playerIds.join(' vs ')}</li>`;
      });
      html += '</ul>';
    }

    html += '<h2>Waiting Player</h2>';
    if (waitingPlayer) {
      html += `<p>Player <strong>${waitingPlayer.id}</strong> is waiting for an opponent.</p>`;
    } else {
      html += '<p>No player is currently in the queue.</p>';
    }

    html += `
        <script>
          // Connect to the explicit /status-ws WebSocket endpoint
          const ws = new WebSocket('ws://' + window.location.host + '/status-ws'); 
          const statusDot = document.getElementById('status-dot');
          const statusText = document.getElementById('status-text');

          ws.onopen = () => {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected to real-time updates. Page will refresh automatically.';
          };

          ws.onmessage = (event) => {
            if (event.data === 'refresh') {
              statusText.textContent = 'Change detected! Refreshing...';
              setTimeout(() => location.reload(), 250);
            }
          };

          ws.onclose = () => {
            statusDot.classList.remove('connected');
            statusText.textContent = 'Connection lost. Refreshing in 5 seconds...';
            setTimeout(() => location.reload(), 5000);
          };
        </script>
      </body>
      </html>
    `;

    res.send(html);
  });

  return router;
};
