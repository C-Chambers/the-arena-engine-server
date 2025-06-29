// src/game/engine.js

const { getCharacters, getChakraTypes } = require('../services/characterService'); 
const { processGameResults } = require('../services/missionService');
const { v4: uuidv4 } = require('uuid');

class Game {
  constructor(player1Info, player2Info) {
    this.gameId = uuidv4();
    this.players = {
      // --- NEW: Add a cooldowns object for each player ---
      [player1Info.id]: { ...player1Info, team: player1Info.team, chakra: {}, cooldowns: {} },
      [player2Info.id]: { ...player2Info, team: player2Info.team, chakra: {}, cooldowns: {} },
    };
    this.stats = {
      [player1Info.id]: { damageDealt: 0, healingDone: 0 },
      [player2Info.id]: { damageDealt: 0, healingDone: 0 },
    };
    this.turn = 1;
    this.activePlayerId = player1Info.id;
    this.isGameOver = false;
    this.log = [];
  }

  generateChakra() {
    const player = this.players[this.activePlayerId];
    const chakraTypes = getChakraTypes(); 
    for (let i = 0; i < 4; i++) {
      const randomChakra = chakraTypes[Math.floor(Math.random() * chakraTypes.length)];
      player.chakra[randomChakra] = (player.chakra[randomChakra] || 0) + 1;
    }
  }

  useSkill(skill, casterId, targetIds) {
    const casterPlayer = this.players[this.activePlayerId];
    const opponentId = Object.keys(this.players).find(id => parseInt(id, 10) !== this.activePlayerId);
    
    // --- NEW: Check if the skill is on cooldown ---
    if (casterPlayer.cooldowns[skill.id] > 0) {
        this.log.push(`${skill.name} is on cooldown for ${casterPlayer.cooldowns[skill.id]} more turn(s).`);
        return; // Return nothing to indicate an invalid action
    }
    
    for (const type in skill.cost) {
      if (!casterPlayer.chakra[type] || casterPlayer.chakra[type] < skill.cost[type]) {
        this.log.push(`Not enough ${type} chakra for ${skill.name}.`);
        return;
      }
    }
    
    for (const type in skill.cost) {
      casterPlayer.chakra[type] -= skill.cost[type];
    }

    // --- NEW: Put the skill on cooldown if it has one ---
    if (skill.cooldown > 0) {
        // We add 1 to the cooldown because it will be decremented at the end of this turn
        casterPlayer.cooldowns[skill.id] = skill.cooldown + 1; 
    }
    
    const casterChar = casterPlayer.team.find(c => c.instanceId === casterId);
    this.log.push(`${casterChar.name} used ${skill.name}.`);

    skill.effects.forEach(effect => {
      let targets = [];
      
      if(effect.target === 'all_enemies') {
        targets = this.players[opponentId].team.filter(c => c.isAlive);
      } else {
        targetIds.forEach(targetId => {
            const playerToTarget = Object.values(this.players).find(p => p.team.some(c => c.instanceId === targetId));
            if(playerToTarget) {
                const target = playerToTarget.team.find(c => c.instanceId === targetId);
                if (target) targets.push(target);
            }
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
            const initialDamage = damageToDeal; 
            if (!effect.ignores_shield) {
                const shield = target.statuses.find(s => s.type === 'shield');
                if(shield) {
                    if(shield.value >= damageToDeal) {
                        shield.value -= damageToDeal;
                        this.log.push(`${target.name}'s shield absorbed ${damageToDeal} damage.`);
                        damageToDeal = 0;
                    } else {
                        damageToDeal -= shield.value;
                        this.log.push(`${target.name}'s shield broke after absorbing ${shield.value} damage.`);
                        target.statuses = target.statuses.filter(s => s.type !== 'shield');
                    }
                }
            }
            if (damageToDeal > 0) {
              target.currentHp -= damageToDeal;
              this.log.push(`${target.name} took ${damageToDeal} damage.`);
            }
            this.stats[this.activePlayerId].damageDealt += initialDamage;
            if (target.currentHp <= 0) {
              target.isAlive = false;
              target.currentHp = 0;
              this.log.push(`${target.name} has been defeated!`);
            }
            break;
          case 'heal':
            const hpBeforeHeal = target.currentHp;
            target.currentHp += effect.value;
            if (target.currentHp > target.maxHp) target.currentHp = target.maxHp;
            const actualHealAmount = target.currentHp - hpBeforeHeal;
            if (actualHealAmount > 0) this.stats[this.activePlayerId].healingDone += actualHealAmount;
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
          const winnerId = Object.keys(this.players).find(id => parseInt(id, 10) !== parseInt(playerId, 10));
          this.log.push(`--- Game Over! ${this.players[winnerId].playerId} is victorious! ---`);
          processGameResults(this.getGameState());
        }
        break;
      }
    }
  }

  nextTurn() {
    const endingTurnPlayer = this.players[this.activePlayerId];
    this.processTurnBasedEffects(endingTurnPlayer);

    // --- NEW: Decrement skill cooldowns for the player whose turn is ending ---
    for (const skillId in endingTurnPlayer.cooldowns) {
        if (endingTurnPlayer.cooldowns[skillId] > 0) {
            endingTurnPlayer.cooldowns[skillId]--;
        }
    }

    this.turn++;
    const playerIds = Object.keys(this.players).map(id => parseInt(id, 10));
    const currentIndex = playerIds.indexOf(this.activePlayerId);
    this.activePlayerId = playerIds[(currentIndex + 1) % playerIds.length];

    this.log.push(`--- Turn ${this.turn}: ${this.players[this.activePlayerId].id}'s turn ---`);
    this.generateChakra();
    this.checkGameOver();
    return this.getGameState();
  }

  getGameState() {
    return {
      gameId: this.gameId,
      turn: this.turn,
      activePlayerId: this.activePlayerId,
      players: this.players,
      isGameOver: this.isGameOver,
      log: this.log,
      stats: this.stats,
    };
  }
}

module.exports = Game;
