// src/game/engine.js

const { getCharacters, getChakraTypes } = require('../services/characterService'); 
const { processGameResults } = require('../services/missionService');
const { v4: uuidv4 } = require('uuid');

class Game {
  constructor(player1Info, player2Info) {
    this.gameId = uuidv4();
    this.players = {
      [player1Info.id]: { ...player1Info, team: player1Info.team, chakra: {}, cooldowns: {}, actionQueue: [] },
      [player2Info.id]: { ...player2Info, team: player2Info.team, chakra: {}, cooldowns: {}, actionQueue: [] },
    };
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
    this.log.push(`${player.email} gains 3 new chakra.`);
    for (let i = 0; i < 3; i++) {
      const randomChakra = chakraTypes[Math.floor(Math.random() * chakraTypes.length)];
      player.chakra[randomChakra] = (player.chakra[randomChakra] || 0) + 1;
    }
  }

  // UPDATED: queueSkill now validates if a skill is enabled
  queueSkill(action) {
    const player = this.players[this.activePlayerId];
    const { skill } = action;
    const caster = player.team.find(c => c.instanceId === action.casterId);
    
    if (!caster || !caster.isAlive) {
      return { success: false, message: "Invalid caster." };
    }

    // --- NEW: Enable Skill Validation ---
    if (skill.is_locked_by_default) {
      const isEnabled = caster.statuses.some(s => s.type === 'enable_skill' && s.skillId === skill.id);
      if (!isEnabled) {
        return { success: false, message: `${skill.name} is not currently enabled.` };
      }
    }
    
    if (player.actionQueue.some(a => a.casterId === action.casterId)) {
        return { success: false, message: `${caster.name} has already queued a skill this turn.` };
    }
    
    const currentQueueCost = this.calculateQueueCost(player.actionQueue);
    const newTotalCost = { ...currentQueueCost };
    for (const type in skill.cost) {
        newTotalCost[type] = (newTotalCost[type] || 0) + skill.cost[type];
    }
    
    if (!this.canAffordCost(player.chakra, newTotalCost)) {
        return { success: false, message: `Not enough chakra.` };
    }

    player.actionQueue.push(action);
    return { success: true };
  }
  
  canAffordCost(availableChakra, totalCost) {
    const tempChakra = { ...availableChakra };
    
    for (const type in totalCost) {
        if (type !== 'Random') {
            if (!tempChakra[type] || tempChakra[type] < totalCost[type]) {
                return false; 
            }
            tempChakra[type] -= totalCost[type];
        }
    }
    
    const randomCost = totalCost['Random'] || 0;
    if (randomCost > 0) {
        const remainingChakraCount = Object.values(tempChakra).reduce((sum, count) => sum + count, 0);
        if (remainingChakraCount < randomCost) {
            return false;
        }
    }
    
    return true;
  }


  dequeueSkill(queueIndex) {
      const player = this.players[this.activePlayerId];
      if(player.actionQueue[queueIndex]) {
          player.actionQueue.splice(queueIndex, 1);
          return { success: true };
      }
      return { success: false, message: "Invalid queue index." };
  }
  
  reorderQueue(oldIndex, newIndex) {
      const player = this.players[this.activePlayerId];
      const [movedItem] = player.actionQueue.splice(oldIndex, 1);
      player.actionQueue.splice(newIndex, 0, movedItem);
      return { success: true };
  }

  calculateQueueCost(actionQueue) {
    const totalCost = {};
    actionQueue.forEach(action => {
        for (const type in action.skill.cost) {
            totalCost[type] = (totalCost[type] || 0) + action.skill.cost[type];
        }
    });
    return totalCost;
  }

  executeTurn() {
    const player = this.players[this.activePlayerId];
    const finalCost = this.calculateQueueCost(player.actionQueue);
    
    if (!this.canAffordCost(player.chakra, finalCost)) {
        this.log.push(`Execution failed: Not enough chakra.`);
        return this.getGameState();
    }

    for (const type in finalCost) {
        if (type !== 'Random') {
            player.chakra[type] -= finalCost[type];
        }
    }

    // 2. Deduct Random Costs
    let randomCostToPay = finalCost['Random'] || 0;
    if (randomCostToPay > 0) {
        // Create a sorted list of available chakra types, from most abundant to least
        let sortedChakra = Object.entries(player.chakra)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1]);

        for (const [type, count] of sortedChakra) {
            if (randomCostToPay === 0) break;
            //const amountToDeduct = Math.min(randomCostToPay, count);
            const amountToDeduct = 1; //Deduct 1 chakra at time, to deduct across the board evenly
            player.chakra[type] -= amountToDeduct;
            randomCostToPay -= amountToDeduct;

            //Re-sort the chakra to grab from the most abundant again
            sortedChakra = Object.entries(player.chakra)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1]);
        }
    }

    // Process each action in the queue
    for (const action of player.actionQueue) {
        if (this.isGameOver) break;
        this.processSingleSkill(action.skill, action.casterId, [action.targetId]);
    }
    
    player.actionQueue = [];
    return this.nextTurn();
  }

  processSingleSkill(skill, casterId, targetIds) {
    const casterPlayer = this.players[this.activePlayerId];
    const casterChar = casterPlayer.team.find(c => c.instanceId === casterId);

    if (!casterChar || !casterChar.isAlive) return;
    
    if (casterChar.statuses.some(s => s.type === 'stun')) {
        this.log.push(`${casterChar.name} is stunned and cannot use ${skill.name}!`);
        return;
    }
    
    if (casterPlayer.cooldowns[skill.id] > 0) return;
    if (skill.cooldown > 0) casterPlayer.cooldowns[skill.id] = skill.cooldown + 1;
    
    this.log.push(`${casterChar.name} used ${skill.name}.`);

    skill.effects.forEach(effect => {
      let targets = [];
      const opponentId = Object.keys(this.players).find(id => parseInt(id, 10) !== this.activePlayerId);
      
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
        if (target.statuses.some(s => s.status === 'invulnerable')) {
            this.log.push(`${target.name} is invulnerable. The attack had no effect!`);
            return;
        }
        const dodgeStatus = target.statuses.find(s => s.status === 'dodge');
        if (dodgeStatus && effect.type === 'damage' && Math.random() < dodgeStatus.chance) {
          this.log.push(`${target.name} dodged the attack!`);
          return;
        }
        switch(effect.type) {
          case 'damage':
            let damageToDeal = effect.value;

            // --- NEW: Empower Skill Logic ---
            const empowerStatus = casterChar.statuses.find(s => s.type === 'empower_skill' && s.skillId === skill.id);
            if (empowerStatus) {
                damageToDeal += empowerStatus.damageBonus;
                this.log.push(`${casterChar.name}'s ${skill.name} is empowered, dealing extra damage!`);
            }

            const vulnerableStatus = target.statuses.find(s => s.type === 'vulnerable');
            if(vulnerableStatus) damageToDeal = Math.round(damageToDeal * vulnerableStatus.value);

            const reductionStatuses = target.statuses.filter(s => s.type === 'damage_reduction');
            if (reductionStatuses.length > 0) {
                const totalReduction = reductionStatuses.reduce((sum, status) => sum + status.value, 0);
                damageToDeal = Math.max(0, damageToDeal - totalReduction);
                this.log.push(`${target.name}'s damage reduction lowered damage by ${totalReduction}.`);
            }
            
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
            if (damageToDeal > 0) target.currentHp -= damageToDeal;
            this.stats[this.activePlayerId].damageDealt += initialDamage;
            this.log.push(`${target.name} took ${initialDamage} damage.`);
            if (target.currentHp <= 0) {
              target.isAlive = false;
              target.currentHp = 0;
              this.log.push(`${target.name} has been defeated!`);
            }
            break;
          case 'heal':
            const hpBeforeHeal = target.currentHp;
            target.currentHp = Math.min(target.maxHp, target.currentHp + effect.value);
            const actualHealAmount = target.currentHp - hpBeforeHeal;
            if (actualHealAmount > 0) this.stats[this.activePlayerId].healingDone += actualHealAmount;
            this.log.push(`${target.name} healed for ${actualHealAmount} HP.`);
            break;
          case 'add_shield':
            target.statuses.push({ type: 'shield', value: effect.value });
            this.log.push(`${target.name} gained a ${effect.value} HP shield.`);
            break;
          case 'apply_status':
            // --- UPDATED LOGIC ---
            // Create the new status object with the source skill information
            const newStatus = {
                ...effect, // This includes type, status, duration, etc. from the skill definition
                sourceSkill: {
                    id: skill.id,
                    name: skill.name,
                    iconUrl: skill.icon_url, // Pass the icon URL
                }
            };
            target.statuses.push(newStatus);
            this.log.push(`${target.name} is now affected by ${effect.status}.`);
            break;
        }
      });
    });
  }

  startGame() {
    this.log.push('Game has started!');
    return this.getGameState(true);
  }

  processTurnBasedEffects(player) {
    player.team.forEach(char => {
        if (!char.isAlive) return;
        const newStatuses = [];
        char.statuses.forEach(status => {
            if (status.status === 'poison') {
                const poisonDamage = status.damage;
                char.currentHp -= poisonDamage;
                this.log.push(`${char.name} took ${poisonDamage} damage from poison!`);
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
          this.log.push(`--- Game Over! ${this.players[winnerId].email} is victorious! ---`);
          processGameResults(this.getGameState());
        }
        break;
      }
    }
  }

  nextTurn() {
    const endingTurnPlayer = this.players[this.activePlayerId];
    this.processTurnBasedEffects(endingTurnPlayer);

    const newCooldowns = {};
    for (const skillId in endingTurnPlayer.cooldowns) {
        if (endingTurnPlayer.cooldowns[skillId] > 1) {
            newCooldowns[skillId] = endingTurnPlayer.cooldowns[skillId] - 1;
        }
    }
    endingTurnPlayer.cooldowns = newCooldowns;

    this.turn++;
    const playerIds = Object.keys(this.players).map(id => parseInt(id, 10));
    const currentIndex = playerIds.indexOf(this.activePlayerId);
    this.activePlayerId = playerIds[(currentIndex + 1) % playerIds.length];

    this.log.push(`--- Turn ${this.turn}: It is now ${this.players[this.activePlayerId].email}'s turn ---`);
    this.generateChakra();
    this.checkGameOver();
    return this.getGameState();
  }

  getGameState(isInitial = false) {
    if (isInitial) {
        this.generateChakra();
    }
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
