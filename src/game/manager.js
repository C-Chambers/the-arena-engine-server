// src/game/manager.js

const Game = require('./engine');
const { pool } = require('../config/database');
const { getCharacters } = require('../services/characterService');
const { v4: uuidv4 } = require('uuid');

const MATCHMAKING_TICK_RATE = 1000; // 5 seconds
const INITIAL_MMR_RANGE = 100;
const MMR_RANGE_INCREASE_PER_TICK = 50;
const NEW_PLAYER_GAME_THRESHOLD = 20; // Players with fewer games are considered "new"

class GameManager {
  constructor() {
    this.games = new Map();
    // --- NEW: Separate queues for new and veteran players ---
    this.newPlayerQueue = [];
    this.veteranQueue = [];
    this.onStatusUpdate = () => {}; 
    
    setInterval(() => this.matchmakingTick(), MATCHMAKING_TICK_RATE); 
  }

  setStatusUpdateCallback(callback) {
    this.onStatusUpdate = callback;
  }
  
  async getTeamForPlayer(playerId) {
    const allCharacters = getCharacters();
    try {
      const res = await pool.query('SELECT character1_id, character2_id, character3_id FROM arena_engine_schema.user_teams WHERE user_id = $1', [playerId]);
      if (res.rows.length > 0) {
        const savedTeamIds = res.rows[0];
        const teamCharacterIds = [savedTeamIds.character1_id, savedTeamIds.character2_id, savedTeamIds.character3_id];
        const team = teamCharacterIds.map(id => {
            const charData = allCharacters.find(c => c.id === id);
            if (!charData) return null;
            const instanceId = `${charData.id}_${uuidv4()}`;
            return { ...JSON.parse(JSON.stringify(charData)), instanceId, currentHp: charData.maxHp, statuses: [], isAlive: true };
        }).filter(Boolean); 
        if (team.length === 3) return team;
      }
    } catch (err) {
      console.error(`Error fetching team for player ${playerId}:`, err);
    }
    return Game.createRandomTeam();
  }

  async matchmakingTick() {
    // Process the new player queue first
    if (this.newPlayerQueue.length >= 2) {
      console.log(`Matchmaking tick: Processing new player queue (${this.newPlayerQueue.length} players).`);
      // For new players, we can use a simpler "first two" logic for faster matches
      const player1_ws = this.newPlayerQueue.shift();
      const player2_ws = this.newPlayerQueue.shift();
      await this.createGame(player1_ws, player2_ws);
    }
    
    // Process the veteran player queue
    if (this.veteranQueue.length >= 2) {
        console.log(`Matchmaking tick: Processing veteran queue (${this.veteranQueue.length} players).`);
        await this.findAndCreateVeteranMatch();
    }

    this.broadcastQueueStatus();
  }
  
  async findAndCreateVeteranMatch() {
    const playerIds = this.veteranQueue.map(p => p.id);
    const ratingsQuery = `SELECT user_id, rating FROM arena_engine_schema.player_ratings WHERE user_id = ANY($1::int[])`;
    const { rows: ratings } = await pool.query(ratingsQuery, [playerIds]);

    let ratedQueue = this.veteranQueue
      .map(player => {
        const ratingInfo = ratings.find(r => r.user_id === player.id);
        const timeInQueue = Date.now() - player.timeEnteredQueue;
        const searchRange = INITIAL_MMR_RANGE + (Math.floor(timeInQueue / MATCHMAKING_TICK_RATE) * MMR_RANGE_INCREASE_PER_TICK);
        return { ...player, rating: ratingInfo ? ratingInfo.rating : 1500, searchRange };
      })
      .sort((a, b) => a.rating - b.rating);
      
    const matchedPlayerIds = new Set();
    const queueToCheck = [...ratedQueue];

    for (const player1 of queueToCheck) {
      if (matchedPlayerIds.has(player1.id)) continue;
      let bestMatch = null;
      let smallestDiff = Infinity;
      for (const player2 of queueToCheck) {
        if (player1.id === player2.id || matchedPlayerIds.has(player2.id)) continue;
        const ratingDifference = Math.abs(player1.rating - player2.rating);
        if (ratingDifference < smallestDiff && ratingDifference <= player1.searchRange && ratingDifference <= player2.searchRange) {
          smallestDiff = ratingDifference;
          bestMatch = player2;
        }
      }

      if (bestMatch) {
        matchedPlayerIds.add(player1.id);
        matchedPlayerIds.add(bestMatch.id);
        await this.createGame(player1, bestMatch);
      }
    }
    this.veteranQueue = this.veteranQueue.filter(p => !matchedPlayerIds.has(p.id));
  }

  async createGame(player1_ws, player2_ws) {
    const [player1Team, player2Team] = await Promise.all([
      this.getTeamForPlayer(player1_ws.id),
      this.getTeamForPlayer(player2_ws.id)
    ]);
    const player1 = { id: player1_ws.id, email: player1_ws.email, ws: player1_ws, team: player1Team };
    const player2 = { id: player2_ws.id, email: player2_ws.email, ws: player2_ws, team: player2Team };
    const newGame = new Game(player1, player2);
    this.games.set(newGame.gameId, newGame);
    player1.ws.gameId = newGame.gameId;
    player2.ws.gameId = newGame.gameId;
    const initialState = newGame.startGame();
    player1.ws.send(JSON.stringify({ type: 'GAME_START', yourId: player1.id, state: initialState }));
    player2.ws.send(JSON.stringify({ type: 'GAME_START', yourId: player2.id, state: initialState }));
    this.onStatusUpdate('game-started');
  }

  async handleNewPlayer(ws, user) {
    if (this.newPlayerQueue.some(p => p.id === user.id) || this.veteranQueue.some(p => p.id === user.id) || Array.from(this.games.values()).some(g => g.players[user.id])) {
      console.log(`Player ${user.id} is already in queue or in a game.`);
      return;
    }
    const ratingsQuery = `SELECT games_played FROM arena_engine_schema.player_ratings WHERE user_id = $1`;
    const { rows } = await pool.query(ratingsQuery, [user.id]);
    const gamesPlayed = rows.length > 0 ? rows[0].games_played : 0;
    ws.id = user.id;
    ws.email = user.email;
    ws.timeEnteredQueue = Date.now();

    if (gamesPlayed < NEW_PLAYER_GAME_THRESHOLD) {
        this.newPlayerQueue.push(ws);
        console.log(`Player ${user.id} added to NEW PLAYER queue.`);
        ws.send(JSON.stringify({ type: 'STATUS', message: `In new player queue...` }));
    } else {
        this.veteranQueue.push(ws);
        console.log(`Player ${user.id} added to VETERAN queue.`);
        ws.send(JSON.stringify({ type: 'STATUS', message: `In veteran queue...` }));
    }
    
    this.onStatusUpdate('player-joined-queue');
  }

  handlePlayerAction(gameId, playerId, action) {
    const game = this.games.get(gameId);
    if (!game || game.activePlayerId !== playerId || game.isGameOver) {
      // Add a log for debugging why an action might be rejected
      if (game && game.activePlayerId !== playerId) {
        console.error(`Action rejected: Not player ${playerId}'s turn.`);
      }
      return;
    }

    let result;
    switch (action.type) {
        case 'QUEUE_SKILL':
            result = game.queueSkill(action.payload);
            break;
        case 'DEQUEUE_SKILL':
            result = game.dequeueSkill(action.payload.queueIndex);
            break;
        case 'REORDER_QUEUE':
            result = game.reorderQueue(action.payload.oldIndex, action.payload.newIndex);
            break;
        case 'EXECUTE_TURN':
            result = { success: true, state: game.executeTurn() };
            break;
        default:
            console.log(`Unknown action type: ${action.type}`);
            return;
    }

    if (result && result.success) {
        const newState = result.state || game.getGameState();
        const gameStateMessage = JSON.stringify({ type: 'GAME_UPDATE', state: newState });
        
        Object.values(game.players).forEach(player => {
            if (player.ws.readyState === player.ws.OPEN) {
              player.ws.send(gameStateMessage);
            }
        });
    } else if (result) {
        const player = game.players[playerId];
        if (player.ws.readyState === player.ws.OPEN) {
            player.ws.send(JSON.stringify({ type: 'ACTION_ERROR', message: result.message }));
        }
    }
        
    this.onStatusUpdate('game-action');
  }

  broadcastQueueStatus() {
      const now = Date.now();
      [...this.newPlayerQueue, ...this.veteranQueue].forEach(ws => {
        const timeInQueue = Math.floor((now - ws.timeEnteredQueue) / 1000);
        ws.send(JSON.stringify({
          type: 'STATUS',
          queue: this.newPlayerQueue.includes(ws) ? 'new' : 'veteran',
          timeInQueue
        }));
      });
  }

  handleDisconnect(ws) {
    let queueIndex = this.newPlayerQueue.findIndex(p => p.id === ws.id);
    if (queueIndex > -1) {
        this.newPlayerQueue.splice(queueIndex, 1);
    } else {
        queueIndex = this.veteranQueue.findIndex(p => p.id === ws.id);
        if (queueIndex > -1) {
            this.veteranQueue.splice(queueIndex, 1);
        }
    }
    if (ws.gameId) {
      const game = this.games.get(ws.gameId);
      if (game) {
        const remainingPlayerId = Object.keys(game.players).find(id => id !== ws.id);
        if (remainingPlayerId) {
          const remainingPlayer = game.players[remainingPlayerId];
          if (remainingPlayer.ws.readyState === remainingPlayer.ws.OPEN) {
            remainingPlayer.ws.send(JSON.stringify({ type: 'OPPONENT_DISCONNECTED' }));
          }
        }
        this.games.delete(ws.gameId);
        this.onStatusUpdate('game-ended');
      }
    }
  }
}

module.exports = new GameManager();
