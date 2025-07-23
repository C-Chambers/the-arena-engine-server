// src/game/manager.js

const Game = require('./engine');
const { pool } = require('../config/database');
const { getCharacters } = require('../services/characterService');
const { v4: uuidv4 } = require('uuid');
const MatchmakingAnalytics = require('../services/matchmakingAnalytics');

const MATCHMAKING_TICK_RATE = 1000; // Default tick rate
const INITIAL_MMR_RANGE = 100;
const MMR_RANGE_INCREASE_PER_TICK = 50;
const NEW_PLAYER_GAME_THRESHOLD = 20; // Players with fewer games are considered "new"

// Phase 1: Wait time priority constants
const PRIORITY_WAIT_THRESHOLD = 30000; // 30 seconds
const MAX_NEW_PLAYER_WAIT = 120000; // 2 minutes

// Phase 1: Dynamic tick rate configuration
const DYNAMIC_TICK_CONFIG = {
    highTraffic: { threshold: 10, tickRate: 2000 },    // 2 seconds when 10+ players
    normalTraffic: { threshold: 4, tickRate: 1000 },   // 1 second when 4-9 players
    lowTraffic: { threshold: 0, tickRate: 500 }        // 0.5 seconds when <4 players
};

class GameManager {
  constructor() {
    this.games = new Map();
    // --- NEW: Separate queues for new and veteran players ---
    this.newPlayerQueue = []; // Will store objects with {player, timeEntered, priority}
    this.veteranQueue = [];
    this.onStatusUpdate = () => {}; 
    
    // Phase 1: Analytics and dynamic tick rate
    this.analytics = new MatchmakingAnalytics();
    this.currentTickRate = MATCHMAKING_TICK_RATE;
    this.matchmakingInterval = null;
    
    this.startMatchmaking();
  }

  setStatusUpdateCallback(callback) {
    this.onStatusUpdate = callback;
  }

  // Phase 1: Dynamic tick rate methods
  calculateOptimalTickRate() {
    const totalPlayers = this.newPlayerQueue.length + this.veteranQueue.length;
    
    if (totalPlayers >= DYNAMIC_TICK_CONFIG.highTraffic.threshold) {
        return DYNAMIC_TICK_CONFIG.highTraffic.tickRate;
    } else if (totalPlayers >= DYNAMIC_TICK_CONFIG.normalTraffic.threshold) {
        return DYNAMIC_TICK_CONFIG.normalTraffic.tickRate;
    } else {
        return DYNAMIC_TICK_CONFIG.lowTraffic.tickRate;
    }
  }

  startMatchmaking() {
    if (this.matchmakingInterval) {
        clearInterval(this.matchmakingInterval);
    }
    this.matchmakingInterval = setInterval(() => this.matchmakingTick(), this.currentTickRate);
  }

  updateTickRate() {
    const newTickRate = this.calculateOptimalTickRate();
    if (newTickRate !== this.currentTickRate) {
        this.currentTickRate = newTickRate;
        this.analytics.updateTickRate(newTickRate);
        this.startMatchmaking();
        console.log(`Matchmaking tick rate updated to ${newTickRate}ms`);
    }
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

  // Phase 1: Priority-based new player queue methods
  addToNewPlayerQueue(ws, gamesPlayed = 0) {
    this.newPlayerQueue.push({
        player: ws,
        timeEntered: Date.now(),
        priority: 0,
        gamesPlayed: gamesPlayed
    });
  }

  processNewPlayerQueue() {
    if (this.newPlayerQueue.length >= 2) {
        // Sort by priority (wait time), then by entry time
        this.newPlayerQueue.sort((a, b) => {
            const timeA = Date.now() - a.timeEntered;
            const timeB = Date.now() - b.timeEntered;
            
            // Prioritize players who have waited longer than threshold
            if (timeA > PRIORITY_WAIT_THRESHOLD && timeB <= PRIORITY_WAIT_THRESHOLD) return -1;
            if (timeB > PRIORITY_WAIT_THRESHOLD && timeA <= PRIORITY_WAIT_THRESHOLD) return 1;
            
            // Otherwise, first come first served
            return a.timeEntered - b.timeEntered;
        });
        
        const player1Data = this.newPlayerQueue.shift();
        const player2Data = this.newPlayerQueue.shift();
        
        return this.createGame(player1Data.player, player2Data.player, player1Data, player2Data);
    }
    return Promise.resolve(false);
  }

  async matchmakingTick() {
    // Update analytics with current queue population
    this.analytics.updateQueuePopulation(this.newPlayerQueue.length, this.veteranQueue.length);
    
    // Update tick rate based on current population
    this.updateTickRate();
    
    // Process the new player queue first with priority system
    if (this.newPlayerQueue.length >= 2) {
      console.log(`Matchmaking tick: Processing new player queue (${this.newPlayerQueue.length} players).`);
      await this.processNewPlayerQueue();
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

  async createGame(player1_ws, player2_ws, player1Data = null, player2Data = null) {
    try {
      // Calculate wait times for analytics
      const now = Date.now();
      const player1WaitTime = player1Data ? (now - player1Data.timeEntered) : 0;
      const player2WaitTime = player2Data ? (now - player2Data.timeEntered) : 0;
      
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
      
      // Record successful match in analytics
      this.analytics.recordMatch(player1WaitTime, player2WaitTime, true, false);
      
      this.onStatusUpdate('game-started');
      
      console.log(`Game created successfully: ${newGame.gameId}, Wait times: P1=${(player1WaitTime/1000).toFixed(1)}s, P2=${(player2WaitTime/1000).toFixed(1)}s`);
      
    } catch (error) {
      console.error('Error creating game:', error);
      
      // Record failed match in analytics
      this.analytics.recordMatch(0, 0, false, false);
      
      // Send error to players
      player1_ws.send(JSON.stringify({ type: 'MATCHMAKING_ERROR', message: 'Failed to create game' }));
      player2_ws.send(JSON.stringify({ type: 'MATCHMAKING_ERROR', message: 'Failed to create game' }));
    }
  }

  async handleNewPlayer(ws, user) {
    // Check if player is already in queue or game
    const inNewQueue = this.newPlayerQueue.some(p => p.player.id === user.id);
    const inVeteranQueue = this.veteranQueue.some(p => p.id === user.id);
    const inGame = Array.from(this.games.values()).some(g => g.players[user.id]);
    
    if (inNewQueue || inVeteranQueue || inGame) {
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
        this.addToNewPlayerQueue(ws, gamesPlayed);
        console.log(`Player ${user.id} added to NEW PLAYER queue (${gamesPlayed} games played).`);
        ws.send(JSON.stringify({ 
          type: 'STATUS', 
          message: `In new player queue...`,
          queueType: 'new',
          gamesPlayed: gamesPlayed
        }));
    } else {
        this.veteranQueue.push(ws);
        console.log(`Player ${user.id} added to VETERAN queue (${gamesPlayed} games played).`);
        ws.send(JSON.stringify({ 
          type: 'STATUS', 
          message: `In veteran queue...`,
          queueType: 'veteran',
          gamesPlayed: gamesPlayed
        }));
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
      
      // Handle new player queue (object structure)
      this.newPlayerQueue.forEach(playerData => {
        const timeInQueue = Math.floor((now - playerData.timeEntered) / 1000);
        const isPriority = (now - playerData.timeEntered) > PRIORITY_WAIT_THRESHOLD;
        
        playerData.player.send(JSON.stringify({
          type: 'STATUS',
          queue: 'new',
          timeInQueue,
          priority: isPriority,
          queuePosition: this.newPlayerQueue.indexOf(playerData) + 1,
          totalInQueue: this.newPlayerQueue.length
        }));
      });
      
      // Handle veteran queue (original structure)
      this.veteranQueue.forEach(ws => {
        const timeInQueue = Math.floor((now - ws.timeEnteredQueue) / 1000);
        ws.send(JSON.stringify({
          type: 'STATUS',
          queue: 'veteran',
          timeInQueue,
          queuePosition: this.veteranQueue.indexOf(ws) + 1,
          totalInQueue: this.veteranQueue.length
        }));
      });
  }

  handleDisconnect(ws) {
    // Remove from new player queue (object structure)
    let queueIndex = this.newPlayerQueue.findIndex(p => p.player.id === ws.id);
    if (queueIndex > -1) {
        this.newPlayerQueue.splice(queueIndex, 1);
        console.log(`Player ${ws.id} removed from new player queue on disconnect`);
    } else {
        // Remove from veteran queue (original structure)
        queueIndex = this.veteranQueue.findIndex(p => p.id === ws.id);
        if (queueIndex > -1) {
            this.veteranQueue.splice(queueIndex, 1);
            console.log(`Player ${ws.id} removed from veteran queue on disconnect`);
        }
    }
    
    // Handle game disconnection
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
        console.log(`Game ${ws.gameId} ended due to player ${ws.id} disconnect`);
      }
    }
  }

  // Phase 1: Cleanup method for graceful shutdown
  destroy() {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      this.matchmakingInterval = null;
    }
    
    if (this.analytics) {
      this.analytics.destroy();
      this.analytics = null;
    }
    
    console.log('GameManager destroyed');
  }

  // Phase 1: Get analytics data for monitoring
  getAnalytics() {
    return this.analytics ? this.analytics.getMetrics() : null;
  }
}

module.exports = new GameManager();
