// src/game/engine.js

const { getCharacters, getChakraTypes } = require('../services/characterService'); 
const { processGameResults } = require('../services/missionService');
const { v4: uuidv4 } = require('uuid');

class Game {
  constructor(player1Info, player2Info) {
    this.gameId = uuidv4();
    this.players = {
      [player1Info.id]: { ...player1Info, team: player1Info.team, chakra: {} },
      [player2Info.id]: { ...player2Info, team: player2Info.team, chakra: {} },
    };
    // --- NEW: Add a stats object to track game metrics ---
    this.stats = {
      [player1Info.id]: { damageDealt: 0, healingDone: 0 },
      [player2Info.id]: { damageDealt: 0, healingDone: 0 },
    };
    this.turn = 0;
    this.activePlayerId = player1Info.id;
    this.isGameOver = false;
    this.log = [];
  }

  generateChakra() {
    const player = this.players[this.activePlayerId];
    const chakraTypes = getChakraTypes(); 
    //Generate our chakra
    let randomChakra;
    let TempChakra = {};
    for (let i = 0; i < 4; i++) {
      const randomChakra = chakraTypes[Math.floor(Math.random() * chakraTypes.length)];
      TempChakra[randomChakra] = (TempChakra[randomChakra] || 0) + 1;
    }

    //Adds the generated chakra to the player's total'
    player.chakra = { ...TempChakra, ...player.chakra };
  }

  useSkill(skill, casterId, targetIds) {
    const casterPlayer = this.players[this.activePlayerId];
    const opponentId = Object.keys(this.players).find(id => id !== this.activePlayerId);
    
    for (const type in skill.cost) {
      if (!casterPlayer.chakra[type] || casterPlayer.chakra[type] < skill.cost[type]) {
        this.log.push(`Not enough ${type} chakra for ${skill.name}.`);
        return;
      }
    }
    
    for (const type in skill.cost) {
      casterPlayer.chakra[type] -= skill.cost[type];
    }
    
    const casterChar = casterPlayer.team.find(c => c.instanceId === casterId);
    this.log.push(`${casterChar.name} used ${skill.name}.`);

    skill.effects.forEach(effect => {
      let targets = [];
      const targetPlayerId = (effect.target === 'ally' || effect.target === 'self') ? this.activePlayerId : opponentId;
      
      if(effect.target === 'all_enemies') {
        targets = this.players[opponentId].team.filter(c => c.isAlive);
      } else {
        targetIds.forEach(targetId => {
            const target = this.players[targetPlayerId].team.find(c => c.instanceId === targetId);
            if (target) targets.push(target);
        });
      }

      targets.forEach(target => {
        if (!target.isAlive) return;

        const dodgeStatus = target.statuses.find(s => s.type === 'dodge');
        if (dodgeStatus && effect.type === 'damage') {
          if (Math.random() < dodgeStatus.chance) {
            this.log.push(`${target.name} dodged the attack!`);
            return;
          }
        }

        switch(effect.type) {
          case 'damage':
            let damageToDeal = effect.value;
            const vulnerableStatus = target.statuses.find(s => s.type === 'vulnerable');
            if(vulnerableStatus) {
                damageToDeal = Math.round(damageToDeal * vulnerableStatus.value);
            }

            // --- Track total damage before shield reduction ---
            const initialDamage = damageToDeal; 
            
            if (!effect.ignores_shield) {
                const shield = target.statuses.find(s => s.type === 'shield');
                if(shield) {
                    if(shield.value >= damageToDeal) {
                        shield.value -= damageToDeal;
                        damageToDeal = 0;
                    } else {
                        damageToDeal -= shield.value;
                        target.statuses = target.statuses.filter(s => s.type !== 'shield');
                    }
                }
            }
            if (damageToDeal > 0) {
              target.currentHp -= damageToDeal;
            }

            // --- NEW: Update damageDealt stat with the initial damage value ---
            this.stats[this.activePlayerId].damageDealt += damageToDeal;
            this.log.push(`${target.name} took ${damageToDeal} damage.`);

            if (target.currentHp <= 0) {
              target.isAlive = false;
              target.currentHp = 0;
              this.log.push(`${target.name} has been defeated!`);
            }
            break;
          case 'heal':
            const hpBeforeHeal = target.currentHp;
            target.currentHp += effect.value;
            if (target.currentHp > target.maxHp) {
              target.currentHp = target.maxHp;
            }
            const actualHealAmount = target.currentHp - hpBeforeHeal;

            // --- NEW: Update healingDone stat ---
            if (actualHealAmount > 0) {
              this.stats[this.activePlayerId].healingDone += actualHealAmount;
            }
            this.log.push(`${target.name} healed for ${actualHealAmount} HP.`);
            break;
          case 'add_shield':
            target.statuses.push({ type: 'shield', value: effect.value });
            this.log.push(`${target.name} gained a ${effect.value} HP shield.`);
            break;
          case 'apply_status':
            target.statuses.push({ type: effect.status, ...effect });
            this.log.push(`${target.name} is now affected by ${effect.status}.`);
            break;
        }
      });
    });
    return this.nextTurn();
  }

  startGame() {
    this.log.push('Game has started!');
    this.generateChakra();
    return this.getGameState();
  }

  processTurnBasedEffects(player) {
    player.team.forEach(char => {
        if (!char.isAlive) return;
        const newStatuses = [];
        char.statuses.forEach(status => {
            if (status.type === 'poison') {
                const poisonDamage = status.damage;
                char.currentHp -= poisonDamage;
                this.log.push(`${char.name} took ${poisonDamage} damage from poison.`);
                // Note: We don't track poison damage for mission stats right now, but could add it here.
                if (char.currentHp <= 0) {
                    char.isAlive = false;
                    char.currentHp = 0;
                    this.log.push(`${char.name} succumbed to poison!`);
                }
            }
            if (status.duration > 1) {
                newStatuses.push({ ...status, duration: status.duration - 1 });
            } else {
                this.log.push(`${char.name}'s ${status.type} effect has worn off.`);
            }
        });
        char.statuses = newStatuses;
    });
  }

  checkGameOver() {
    for (const playerId in this.players) {
      const teamIsDefeated = this.players[playerId].team.every(char => !char.isAlive);
      if (teamIsDefeated) {
        if (!this.isGameOver) {
          this.isGameOver = true;
          const winnerId = Object.keys(this.players).find(id => id !== playerId);
          this.log.push(`--- Game Over! ${winnerId} is victorious! ---`);
          processGameResults(this.getGameState());
        }
        break;
      }
    }
  }

  nextTurn() {
    this.processTurnBasedEffects(this.players[this.activePlayerId]);
    this.turn++;
    const playerIds = Object.keys(this.players);
    const currentIndex = playerIds.indexOf(this.activePlayerId);
    this.activePlayerId = playerIds[(currentIndex + 1) % playerIds.length];
    this.log.push(`--- Turn ${this.turn}: ${this.players[this.activePlayerId].id}'s turn ---`);
    this.generateChakra();
    this.checkGameOver();
    return this.getGameState();
  }

  // --- NEW: Update getGameState to include stats ---
  getGameState() {
    return {
      gameId: this.gameId,
      turn: this.turn,
      activePlayerId: this.activePlayerId,
      players: this.players,
      isGameOver: this.isGameOver,
      log: this.log,
      stats: this.stats, // Include the game stats
    };
  }
}

module.exports = Game;
