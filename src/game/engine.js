// src/game/engine.js

const { getCharacters, getChakraTypes } = require('../services/characterService'); 
const { processGameResults } = require('../services/missionService');
const { v4: uuidv4 } = require('uuid');

// --- NEW: Harmful skill detection function ---
function isSkillHarmful(skill) {
  return skill.effects.some(effect => {
    switch(effect.type) {
      case 'damage':
        return true;
      case 'apply_status':
        // Check if status is harmful (negative effects)
        const harmfulStatuses = ['poison', 'stun', 'vulnerable', 'damage_reduction_enemy', 'chakra_drain', 'female_bug_mark'];
        return harmfulStatuses.includes(effect.status);
      case 'steal_chakra':
      case 'remove_chakra':
        return true;
      default:
        return false;
    }
  });
}

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

  // --- NEW: Destructible Defense System ---
  applyToDestructibleDefense(target, damage) {
    const destructibleDefense = target.statuses.find(s => s.status === 'destructible_defense');
    if (destructibleDefense && destructibleDefense.value > 0) {
      if (destructibleDefense.value >= damage) {
        // Defense absorbs all damage
        destructibleDefense.value -= damage;
        this.log.push(`${target.name}'s destructible defense absorbed ${damage} damage.`);
        return 0; // No damage to HP
      } else {
        // Defense is broken, remaining damage goes to HP
        const remainingDamage = damage - destructibleDefense.value;
        this.log.push(`${target.name}'s destructible defense is destroyed!`);
        destructibleDefense.value = 0;
        return remainingDamage;
      }
    } else {
      // No destructible defense, all damage goes to HP
      return damage;
    }
  }

  // --- NEW: Apply damage reduction logic ---
  applyDamageReduction(target, damage) {
    const reductionStatuses = target.statuses.filter(s => s.status === 'damage_reduction');
    let reducedDamage = damage;
    
    if (reductionStatuses.length > 0) {
      // First, apply flat reduction
      const flatReduction = reductionStatuses
        .filter(s => !s.reduction_type || s.reduction_type === 'flat')
        .reduce((sum, status) => sum + status.value, 0);
      reducedDamage = Math.max(0, reducedDamage - flatReduction);
      if (flatReduction > 0) this.log.push(`${target.name}'s damage reduction lowered damage by ${flatReduction}.`);
      
      // Then, apply percentage reduction to the remaining damage
      const percentageReductionStatuses = reductionStatuses.filter(s => s.reduction_type === 'percentage');
      if (percentageReductionStatuses.length > 0) {
        const totalPercentageReduction = percentageReductionStatuses.reduce((sum, status) => sum + status.value, 0);
        const damageReduced = Math.round(reducedDamage * totalPercentageReduction);
        reducedDamage = Math.max(0, reducedDamage - damageReduced);
        this.log.push(`${target.name}'s percentage damage reduction lowered damage by ${Math.round(totalPercentageReduction * 100)}%.`);
      }
    }
    
    return reducedDamage;
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

  queueSkill(action) {
    const player = this.players[this.activePlayerId];
    const { skill } = action;
    const caster = player.team.find(c => c.instanceId === action.casterId);
    
    if (!caster || !caster.isAlive) {
      return { success: false, message: "Invalid caster." };
    }
    
    if (skill.is_locked_by_default) {
      const isEnabled = caster.statuses.some(s => s.status === 'enable_skill' && s.skillId === skill.id);
      if (!isEnabled) {
        return { success: false, message: `${skill.name} is not currently enabled.` };
      }
    }
    
    // Check for targeting restriction (Dynamic Air Marking)
    if (skill.name === 'Dynamic Air Marking') {
      const targetPlayer = Object.values(this.players).find(p => p.team.some(c => c.instanceId === action.targetId));
      if (targetPlayer) {
        const target = targetPlayer.team.find(c => c.instanceId === action.targetId);
        if (target && target.statuses.some(s => s.status === 'dynamic_air_mark')) {
          return { success: false, message: `${target.name} is already affected by Dynamic Air Marking!` };
        }
      }
    }
    
    if (player.actionQueue.some(a => a.casterId === action.casterId)) {
        return { success: false, message: `${caster.name} has already queued a skill this turn.` };
    }
    
    const currentCost = this.calculateQueueCost(player.actionQueue);
    const newTotalCost = { ...currentCost };
    for (const type in skill.cost) {
        newTotalCost[type] = (newTotalCost[type] || 0) + skill.cost[type];
    }
    
    if (!this.canAffordCost(player.chakra, newTotalCost, action.casterId)) {
        return { success: false, message: `Not enough chakra.` };
    }

    player.actionQueue.push(action);
    return { success: true };
  }
  
  canAffordCost(availableChakra, totalCost, casterId = null) {
    const tempChakra = { ...availableChakra };
    let modifiedCost = { ...totalCost };
    
    // Check for cost reduction status if casterId is provided
    if (casterId) {
        const player = this.players[this.activePlayerId];
        const caster = player.team.find(c => c.instanceId === casterId);
        
        if (caster) {
            const costReductionStatus = caster.statuses.find(s => s.status === 'cost_reduction');
            if (costReductionStatus && costReductionStatus.cost_change) {
                // Apply cost reduction - cost_change contains the chakra type and reduction amount
                for (const chakraType in costReductionStatus.cost_change) {
                    const reductionAmount = costReductionStatus.cost_change[chakraType];
                    if (modifiedCost[chakraType] && reductionAmount < 0) {
                        // Reduce cost but not below 0
                        modifiedCost[chakraType] = Math.max(0, modifiedCost[chakraType] + reductionAmount);
                    }
                }
            }
        }
    }
    
    for (const type in modifiedCost) {
        if (type !== 'Random') {
            if (!tempChakra[type] || tempChakra[type] < modifiedCost[type]) {
                return false; 
            }
            tempChakra[type] -= modifiedCost[type];
        }
    }
    
    const randomCost = modifiedCost['Random'] || 0;
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
    let finalCost = this.calculateQueueCost(player.actionQueue);
    
    // Apply cost reduction from all casters in the queue
    const modifiedCost = { ...finalCost };
    player.actionQueue.forEach(action => {
        const caster = player.team.find(c => c.instanceId === action.casterId);
        if (caster) {
            const costReductionStatus = caster.statuses.find(s => s.status === 'cost_reduction');
            if (costReductionStatus && costReductionStatus.skillId === action.skill.id && costReductionStatus.cost_change) {
                // Apply cost reduction - cost_change contains the chakra type and reduction amount
                for (const chakraType in costReductionStatus.cost_change) {
                    const reductionAmount = costReductionStatus.cost_change[chakraType];
                    if (modifiedCost[chakraType] && reductionAmount < 0) {
                        // Reduce cost but not below 0
                        modifiedCost[chakraType] = Math.max(0, modifiedCost[chakraType] + reductionAmount);
                    }
                }
            }
        }
    });
    
    if (!this.canAffordCost(player.chakra, modifiedCost)) {
        this.log.push(`Execution failed: Not enough chakra.`);
        return this.getGameState();
    }

    for (const type in modifiedCost) {
        if (type !== 'Random') {
            player.chakra[type] -= modifiedCost[type];
        }
    }

    let randomCostToPay = modifiedCost['Random'] || 0;
    if (randomCostToPay > 0) {
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
    
    // --- UPDATED: Targeted Stun Logic ---
    const stunStatuses = casterChar.statuses.filter(s => s.status === 'stun');
    if (stunStatuses.length > 0) {
        const isStunned = stunStatuses.some(stun => {
            // If the classes array is empty or not present, it stuns ALL skills
            if (!stun.classes || stun.classes.length === 0) {
                return true; 
            }
            // Otherwise, check if the skill's class is in the stun's list
            return stun.classes.includes(skill.skill_class);
        });

        if (isStunned) {
            this.log.push(`${casterChar.name} is stunned and cannot use ${skill.name}!`);
            return;
        }
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

        // --- NEW: Effect Immunity Check ---
        const isImmune = target.statuses.some(s => s.type === 'effect_immunity');
        const isDamagingOrHealing = effect.type === 'damage' || effect.type === 'heal';
        if (isImmune && !isDamagingOrHealing) {
            this.log.push(`${target.name} is immune to the non-damaging effects of ${skill.name}!`);
            return;
        }

        // --- NEW: Dynamic Air Mark Buff Immunity Check ---
        const hasDynamicAirMark = target.statuses.some(s => s.status === 'dynamic_air_mark');
        const isDefensiveEffect = effect.type === 'add_shield' || (effect.type === 'apply_status' && 
            (effect.status === 'damage_reduction' || effect.status === 'invulnerable'));
        if (hasDynamicAirMark && isDefensiveEffect) {
            this.log.push(`${target.name} is marked by Dynamic Air Marking and cannot receive defensive benefits!`);
            return;
        }

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
            const empowerStatus = casterChar.statuses.find(s => s.status === 'empower_skill' && s.skillId === skill.id);
            if (empowerStatus) {
                damageToDeal += empowerStatus.damageBonus;
                this.log.push(`${casterChar.name}'s ${skill.name} is empowered, dealing extra damage!`);
            }

            // --- NEW: Enhanced Chakra Leach damage ---
            if (skill.name === 'Chakra Leach') {
              const enhancedStatus = casterChar.statuses.find(s => s.status === 'chakra_leach_enhanced');
              if (enhancedStatus && enhancedStatus.enhanced_damage) {
                damageToDeal = enhancedStatus.enhanced_damage;
                this.log.push(`${casterChar.name}'s Chakra Leach is enhanced, dealing increased damage!`);
              }
            }

            // --- NEW: Conditional damage bonuses for Female Bug marks ---
            const femaleBugMarks = target.statuses.filter(s => s.status === 'female_bug_mark');
            if (femaleBugMarks.length > 0 && effect.conditional_bonus) {
              if (effect.conditional_bonus.status_required === 'female_bug_mark' && skill.name === 'Chakra Leach') {
                const totalBonus = femaleBugMarks.reduce((sum, mark) => sum + (mark.stack_count || 1), 0) * effect.conditional_bonus.bonus_per_stack;
                damageToDeal += totalBonus;
                this.log.push(`${target.name} is marked by Female Bugs! ${skill.name} deals ${totalBonus} bonus damage!`);
              }
            }

            // --- UPDATED: Conditional Damage for Sharingan Mark (Step 1.3) ---
            const sharinganMark = target.statuses.find(s => s.status === 'sharingan_mark' && s.casterInstanceId === casterId);
            if (sharinganMark) {
                // Check if this is a "Chidori" or "Lion Combo" skill that should get bonus damage
                const isTargetedSkill = skill.name === 'Chidori' || skill.name === 'Lion Combo';
                if (isTargetedSkill) {
                    const bonusDamage = 15; // Fixed 15 bonus damage as per plan
                    damageToDeal += bonusDamage;
                    this.log.push(`${target.name} is marked by ${casterChar.name}'s Sharingan! ${skill.name} deals ${bonusDamage} bonus damage!`);
                }
            }

            const vulnerableStatus = target.statuses.find(s => s.status === 'vulnerable');
            if(vulnerableStatus) damageToDeal = Math.round(damageToDeal * vulnerableStatus.value);

            const initialDamage = damageToDeal;

            // --- NEW: Enhanced Damage System with damage types ---
            if (effect.damage_type === 'affliction') {
              // Affliction damage bypasses both damage reduction AND destructible defense
              target.currentHp -= damageToDeal;
              this.log.push(`${target.name} took ${damageToDeal} affliction damage (bypassing all defenses).`);
            } else if (effect.damage_type === 'piercing') {
              // Piercing bypasses damage reduction but still hits destructible defense
              const finalDamage = this.applyToDestructibleDefense(target, damageToDeal);
              if (finalDamage > 0) {
                target.currentHp -= finalDamage;
                this.log.push(`${target.name} took ${finalDamage} piercing damage.`);
              }
            } else {
              // Normal damage - apply reduction, then destructible defense, then HP
              damageToDeal = this.applyDamageReduction(target, damageToDeal);
              
              if (!effect.ignores_shield) {
                const shield = target.statuses.find(s => s.status === 'shield');
                if(shield) {
                  if(shield.value >= damageToDeal) {
                    shield.value -= damageToDeal;
                    damageToDeal = 0;
                  } else {
                    damageToDeal -= shield.value;
                    target.statuses = target.statuses.filter(s => s.status !== 'shield');
                  }
                }
              }

              const finalDamage = this.applyToDestructibleDefense(target, damageToDeal);
              if (finalDamage > 0) {
                target.currentHp -= finalDamage;
                this.log.push(`${target.name} took ${finalDamage} damage.`);
              }
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
            target.currentHp = Math.min(target.maxHp, target.currentHp + effect.value);
            const actualHealAmount = target.currentHp - hpBeforeHeal;
            if (actualHealAmount > 0) this.stats[this.activePlayerId].healingDone += actualHealAmount;
            this.log.push(`${target.name} healed for ${actualHealAmount} HP.`);
            break;
          case 'add_shield':
            target.statuses.push({ type: 'shield', value: effect.value });
            this.log.push(`${target.name} gained a ${effect.value} HP shield.`);
            break;
          case 'steal_chakra':
            // --- NEW: Chakra Stealing System ---
            // Check if this is an enhanced Chakra Leach that shouldn't steal
            const isEnhanced = casterChar.statuses.some(s => s.status === 'chakra_leach_enhanced');
            const shouldSkipSteal = effect.condition === 'not_enhanced' && isEnhanced;
            
            if (!shouldSkipSteal) {
              const targetPlayer = Object.values(this.players).find(p => p.team.some(c => c.instanceId === target.instanceId));
              if (targetPlayer) {
                const availableChakra = Object.keys(targetPlayer.chakra).filter(type => 
                  targetPlayer.chakra[type] > 0 && 
                  (effect.chakra_types ? effect.chakra_types.includes(type) : true)
                );
                
                if (availableChakra.length > 0) {
                  const randomType = availableChakra[Math.floor(Math.random() * availableChakra.length)];
                  const stealAmount = Math.min(effect.amount, targetPlayer.chakra[randomType]);
                  
                  // Remove from target
                  targetPlayer.chakra[randomType] -= stealAmount;
                  
                  // Add to caster
                  const casterPlayer = this.players[this.activePlayerId];
                  casterPlayer.chakra[randomType] = (casterPlayer.chakra[randomType] || 0) + stealAmount;
                  
                  this.log.push(`${casterChar.name} stole ${stealAmount} ${randomType} chakra from ${target.name}.`);
                } else {
                  this.log.push(`${target.name} has no chakra to steal!`);
                }
              }
            } else {
              this.log.push(`${casterChar.name}'s enhanced Chakra Leach doesn't steal chakra this turn.`);
            }
            break;
          case 'apply_status':
            // --- NEW: Enhanced status application with stacking support ---
            const existingStatusIndex = target.statuses.findIndex(s => 
              s.status === effect.status && effect.stacks
            );
            
            if (existingStatusIndex !== -1 && effect.stacks) {
              // Increase stack count for stacking status
              target.statuses[existingStatusIndex].stack_count = 
                (target.statuses[existingStatusIndex].stack_count || 1) + 1;
              // Reset duration
              target.statuses[existingStatusIndex].duration = effect.duration;
              this.log.push(`${target.name}'s ${effect.status} increased to ${target.statuses[existingStatusIndex].stack_count} stacks.`);
            } else {
              // Add new status
              const newStatus = {
                ...effect,
                stack_count: effect.stacks ? 1 : undefined,
                casterInstanceId: casterId, // Add the caster's unique ID to the status
                sourceSkill: {
                  id: skill.id,
                  name: skill.name,
                  iconUrl: skill.icon_url,
                }
              };
              target.statuses.push(newStatus);
              this.log.push(`${target.name} is now affected by ${effect.status}.`);
              
              // --- NEW: If applying permanent destructible defense, immediately create the destructible defense ---
              if (effect.status === 'permanent_destructible_defense' && effect.max_value) {
                const existingDD = target.statuses.find(s => s.status === 'destructible_defense');
                if (!existingDD) {
                  target.statuses.push({
                    status: 'destructible_defense',
                    value: effect.max_value,
                    type: 'defense'
                  });
                  this.log.push(`${target.name} gains ${effect.max_value} destructible defense.`);
                }
              }
            }
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
    // --- NEW: Track harmful skill usage for Female Bug marks ---
    const opponentId = Object.keys(this.players).find(id => parseInt(id, 10) !== this.activePlayerId);
    const opponentPlayer = this.players[opponentId];
    
    if (opponentPlayer && opponentPlayer.actionQueue) {
      opponentPlayer.actionQueue.forEach(action => {
        if (isSkillHarmful(action.skill)) {
          // Find the caster and mark them for Female Bug tracking
          const caster = opponentPlayer.team.find(c => c.instanceId === action.casterId);
          if (caster) {
            const femaleBugMarks = caster.statuses.filter(s => s.status === 'female_bug_mark');
            femaleBugMarks.forEach(mark => {
              mark.harmful_skill_used_this_turn = true;
            });
          }
        }
      });
    }

    // --- NEW: Regenerate permanent destructible defense ---
    player.team.forEach(char => {
      if (!char.isAlive) return;
      
      const permanentDefense = char.statuses.find(s => s.status === 'permanent_destructible_defense');
      if (permanentDefense) {
        let destructibleDefense = char.statuses.find(s => s.status === 'destructible_defense');
        if (destructibleDefense) {
          destructibleDefense.value = permanentDefense.max_value;
        } else {
          char.statuses.push({
            status: 'destructible_defense',
            value: permanentDefense.max_value,
            type: 'defense'
          });
        }
        this.log.push(`${char.name}'s destructible defense regenerated to ${permanentDefense.max_value}.`);
      }
      
      // --- NEW: Process Female Bug mark reactions ---
      const femaleBugMarks = char.statuses.filter(s => s.status === 'female_bug_mark');
      femaleBugMarks.forEach(mark => {
        if (mark.harmful_skill_used_this_turn) {
          // Apply damage reduction to the marked character
          char.statuses.push({
            status: 'damage_reduction',
            value: 5,
            duration: 4,
            applies_to: 'non_affliction',
            source: 'female_bug_mark',
            reduction_type: 'flat'
          });
          this.log.push(`${char.name} suffers reduced damage output due to Female Bug marking!`);
          mark.harmful_skill_used_this_turn = false;
        }
      });
    });

    // First, check for persistent AoE damage effects
    const casterInstanceIds = [];
    player.team.forEach(char => {
        if (!char.isAlive) return;
        const persistentAoEStatus = char.statuses.find(s => s.status === 'persistent_aoe_damage');
        if (persistentAoEStatus) {
            casterInstanceIds.push(char.instanceId);
        }
    });

    // Apply persistent AoE damage to all living enemies
    if (casterInstanceIds.length > 0) {
        const opponentId = Object.keys(this.players).find(id => parseInt(id, 10) !== this.activePlayerId);
        const enemyTeam = this.players[opponentId].team.filter(c => c.isAlive);
        
        casterInstanceIds.forEach(casterInstanceId => {
            const caster = player.team.find(c => c.instanceId === casterInstanceId);
            const persistentAoEStatus = caster.statuses.find(s => s.status === 'persistent_aoe_damage');
            
            if (persistentAoEStatus) {
                this.log.push(`${caster.name}'s persistent AoE effect deals damage to all enemies!`);
                
                enemyTeam.forEach(enemy => {
                    let damage = persistentAoEStatus.damage || 0;
                    
                    // Apply damage reduction if enemy has it
                    const reductionStatuses = enemy.statuses.filter(s => s.status === 'damage_reduction');
                    if (reductionStatuses.length > 0) {
                        const flatReduction = reductionStatuses
                            .filter(s => !s.reduction_type || s.reduction_type === 'flat')
                            .reduce((sum, status) => sum + status.value, 0);
                        damage = Math.max(0, damage - flatReduction);
                        
                        const percentageReductionStatuses = reductionStatuses.filter(s => s.reduction_type === 'percentage');
                        if (percentageReductionStatuses.length > 0) {
                            const totalPercentageReduction = percentageReductionStatuses.reduce((sum, status) => sum + status.value, 0);
                            const damageReduced = Math.round(damage * totalPercentageReduction);
                            damage = Math.max(0, damage - damageReduced);
                        }
                    }
                    
                    // Apply shield protection
                    const shield = enemy.statuses.find(s => s.status === 'shield');
                    if (shield) {
                        if (shield.value >= damage) {
                            shield.value -= damage;
                            damage = 0;
                        } else {
                            damage -= shield.value;
                            enemy.statuses = enemy.statuses.filter(s => s.status !== 'shield');
                        }
                    }
                    
                    if (damage > 0) {
                        enemy.currentHp -= damage;
                        this.log.push(`${enemy.name} took ${damage} damage from persistent AoE!`);
                        
                        if (enemy.currentHp <= 0) {
                            enemy.isAlive = false;
                            enemy.currentHp = 0;
                            this.log.push(`${enemy.name} has been defeated by persistent AoE damage!`);
                        }
                    }
                });
            }
        });
    }

    // Process regular status effects
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
                this.log.push(`${char.name}'s ${status.status} effect has worn off.`);
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
