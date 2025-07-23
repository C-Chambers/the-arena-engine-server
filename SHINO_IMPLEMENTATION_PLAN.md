# Shino Aburame Implementation Plan

## Overview

This document outlines the implementation plan for adding Shino Aburame as a playable character, including new game mechanics required for his unique abilities.

## Reference Documentation

Based on [Naruto Arena Terminology](https://narutoarena.fandom.com/wiki/Terminology) for proper mechanic implementation.

## Current System Analysis

The game currently supports:
- Basic damage, healing, shields
- Status effects (poison, vulnerable, stun, dodge, damage_reduction, invulnerable)
- Chakra costs and management
- Turn-based effects processing
- Effect targeting (self, ally, enemy, all_enemies)

## New Mechanics Required for Shino

1. **Affliction Damage Type** - Bypasses damage reduction AND destructible defense
2. **Destructible Defense System** - Acts as additional health layer
3. **Permanent Destructible Defense** - Regenerates every turn
4. **Stacking Status Effects** - Female Bug can stack multiple times
5. **Conditional Damage Bonuses** - Based on status stacks
6. **Chakra Stealing Mechanism** - Random chakra type selection and transfer
7. **Skill State Tracking** - Enhanced skill modes
8. **Harmful Skill Detection** - Automatic detection without manual tagging

## Harmful Skill Detection System

**Question Resolution**: Instead of manually tagging every skill as "harmful", we'll implement automatic detection:

```javascript
// Automatic harmful skill detection
function isSkillHarmful(skill) {
  return skill.effects.some(effect => {
    switch(effect.type) {
      case 'damage':
        return true;
      case 'apply_status':
        // Check if status is harmful (negative effects)
        const harmfulStatuses = ['poison', 'stun', 'vulnerable', 'damage_reduction_enemy', 'chakra_drain'];
        return harmfulStatuses.includes(effect.status);
      case 'steal_chakra':
      case 'remove_chakra':
        return true;
      default:
        return false;
    }
  });
}
```

This approach:
- Requires no modifications to existing skills
- Automatically classifies skills based on their effects
- Can be easily extended for new harmful effect types
- Maintains backward compatibility

## Implementation Phases

### Phase 1: Core Engine Enhancements

#### 1.1: Enhanced Damage System

```javascript
// Update damage processing in engine.js
case 'damage':
  let damageToDeal = effect.value;
  
  // Apply damage type logic
  if (effect.damage_type === 'affliction') {
    // Affliction damage bypasses both damage reduction AND destructible defense
    target.currentHp -= damageToDeal;
    this.log.push(`${target.name} took ${damageToDeal} affliction damage (bypassing defenses).`);
  } else if (effect.damage_type === 'piercing') {
    // Piercing bypasses damage reduction but still hits destructible defense
    this.applyToDestructibleDefense(target, damageToDeal);
  } else {
    // Normal damage - apply reduction, then destructible defense, then HP
    damageToDeal = this.applyDamageReduction(target, damageToDeal);
    this.applyToDestructibleDefense(target, damageToDeal);
  }
```

#### 1.2: Destructible Defense System

```javascript
// New function for handling destructible defense
applyToDestructibleDefense(target, damage) {
  const destructibleDefense = target.statuses.find(s => s.status === 'destructible_defense');
  if (destructibleDefense && destructibleDefense.value > 0) {
    if (destructibleDefense.value >= damage) {
      // Defense absorbs all damage
      destructibleDefense.value -= damage;
      this.log.push(`${target.name}'s destructible defense absorbed ${damage} damage.`);
      return;
    } else {
      // Defense is broken, remaining damage goes to HP
      const remainingDamage = damage - destructibleDefense.value;
      this.log.push(`${target.name}'s destructible defense is destroyed!`);
      destructibleDefense.value = 0;
      target.currentHp -= remainingDamage;
    }
  } else {
    // No destructible defense, damage goes to HP
    target.currentHp -= damage;
  }
}
```

#### 1.3: Chakra Stealing System

```javascript
// New effect type for chakra stealing
case 'steal_chakra':
  const availableChakra = Object.keys(target.chakra).filter(type => 
    target.chakra[type] > 0 && 
    (effect.chakra_types ? effect.chakra_types.includes(type) : true)
  );
  
  if (availableChakra.length > 0) {
    const randomType = availableChakra[Math.floor(Math.random() * availableChakra.length)];
    const stealAmount = Math.min(effect.amount, target.chakra[randomType]);
    
    // Remove from target
    target.chakra[randomType] -= stealAmount;
    
    // Add to caster
    const casterPlayer = this.players[this.activePlayerId];
    casterPlayer.chakra[randomType] = (casterPlayer.chakra[randomType] || 0) + stealAmount;
    
    this.log.push(`${casterChar.name} stole ${stealAmount} ${randomType} chakra from ${target.name}.`);
  }
  break;
```

#### 1.4: Stacking Status System

```javascript
// Modify status application to handle stacks
case 'apply_status':
  const existingStatusIndex = target.statuses.findIndex(s => 
    s.status === effect.status && s.stacks
  );
  
  if (existingStatusIndex !== -1 && effect.stacks) {
    // Increase stack count
    target.statuses[existingStatusIndex].stack_count = 
      (target.statuses[existingStatusIndex].stack_count || 1) + 1;
    // Reset duration
    target.statuses[existingStatusIndex].duration = effect.duration;
    this.log.push(`${target.name}'s ${effect.status} increased to ${target.statuses[existingStatusIndex].stack_count} stacks.`);
  } else {
    // Add new status
    const newStatus = {
      ...effect,
      stack_count: 1,
      casterInstanceId: casterId,
      sourceSkill: { id: skill.id, name: skill.name }
    };
    target.statuses.push(newStatus);
    this.log.push(`${target.name} is now affected by ${effect.status}.`);
  }
  break;
```

#### 1.5: Permanent Defense Regeneration

```javascript
// Add to turn-based effects processing
processTurnBasedEffects(player) {
  player.team.forEach(char => {
    if (!char.isAlive) return;
    
    // Regenerate permanent destructible defense
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
    
    // Process harmful skill tracking for Female Bug
    const femaleBugMarks = char.statuses.filter(s => s.status === 'female_bug_mark');
    femaleBugMarks.forEach(mark => {
      if (mark.harmful_skill_used_this_turn) {
        // Apply damage reduction to future attacks
        char.statuses.push({
          status: 'damage_reduction',
          value: 5,
          duration: 4,
          applies_to: 'non_affliction',
          source: 'female_bug_mark'
        });
        mark.harmful_skill_used_this_turn = false;
      }
    });
  });
}
```

### Phase 2: Shino Character Implementation

#### 2.1: Character Data Structure

```json
{
  "id": "5",
  "name": "Shino Aburame", 
  "maxHp": 100,
  "imageUrl": "/images/characters/shino.png",
  "skills": [...]
}
```

#### 2.2: Skill Implementations

**Female Bug**
```json
{
  "id": "17",
  "name": "Female Bug",
  "description": "Shino directs one of his female bugs to attach itself. For 4 turns, 'Chakra Leach' will deal 5 additional damage to one enemy. During this time, if that enemy uses a new harmful skill, they will deal 5 less non-affliction damage for 4 turn. This skill stacks.",
  "cost": {},
  "cooldown": 2,
  "skill_class": "Physical",
  "skill_range": "Ranged",
  "skill_persistence": "Instant",
  "effects": [
    {
      "type": "apply_status",
      "status": "female_bug_mark",
      "target": "enemy",
      "duration": 4,
      "stacks": true,
      "damage_bonus": {
        "skill_name": "Chakra Leach",
        "bonus": 5
      },
      "tracks_harmful_skills": true
    }
  ]
}
```

**Chakra Leach**
```json
{
  "id": "18",
  "name": "Chakra Leach", 
  "description": "Shino directs his chakra draining bugs to one enemy, dealing 15 affliction damage and stealing 1 taijutsu or genjutsu random from their chakra pool. The following turn (only), this skill will deal 20 affliction damage but will not steal chakra.",
  "cost": { "Technique": 1 },
  "cooldown": 0,
  "skill_class": "Chakra",
  "skill_range": "Ranged", 
  "skill_persistence": "Instant",
  "effects": [
    {
      "type": "damage",
      "value": 15,
      "damage_type": "affliction",
      "target": "enemy",
      "conditional_bonus": {
        "status_required": "female_bug_mark",
        "bonus_per_stack": 5
      }
    },
    {
      "type": "steal_chakra",
      "target": "enemy", 
      "chakra_types": ["Technique", "Focus"],
      "amount": 1,
      "random": true,
      "condition": "not_enhanced"
    },
    {
      "type": "apply_status",
      "status": "chakra_leach_enhanced",
      "target": "self",
      "duration": 1
    }
  ]
}
```

**Bug Wall**
```json
{
  "id": "19", 
  "name": "Bug Wall",
  "description": "Shino calls millions of bugs to create a wall protecting himself and his allies, making the entire team invulnerable for 1 turn and granting them 10 points of permanent destructible defense.",
  "cost": { "Power": 2 },
  "cooldown": 5,
  "skill_class": "Physical",
  "skill_range": "Self",
  "skill_persistence": "Instant",
  "effects": [
    {
      "type": "apply_status",
      "status": "invulnerable",
      "target": "all_allies",
      "duration": 1
    },
    {
      "type": "apply_status", 
      "status": "permanent_destructible_defense",
      "target": "all_allies",
      "max_value": 10,
      "permanent": true
    }
  ]
}
```

**Bug Clone**
```json
{
  "id": "20",
  "name": "Bug Clone",
  "description": "This skill makes Aburame Shino invulnerable for 1 turn.",
  "cost": { "Focus": 1 },
  "cooldown": 4,
  "skill_class": "Chakra", 
  "skill_range": "Self",
  "skill_persistence": "Instant",
  "effects": [
    {
      "type": "apply_status",
      "status": "invulnerable",
      "target": "self",
      "duration": 1
    }
  ]
}
```

### Phase 3: Database Updates

#### 3.1: Add Shino to Database
- Update seed script to include Shino character data
- Add character image assets
- Add skill icon assets

#### 3.2: Schema Considerations
- No database schema changes required
- All new mechanics handled in application logic
- JSON skill effects support new properties

### Phase 4: Testing Strategy

#### 4.1: Unit Tests
- Test affliction damage bypassing defenses
- Test destructible defense damage absorption
- Test permanent defense regeneration
- Test stacking status effects
- Test chakra stealing mechanics
- Test harmful skill detection

#### 4.2: Integration Tests  
- Test skill combinations and interactions
- Test turn-based effect processing
- Test Female Bug conditional triggers
- Test Chakra Leach enhancement mode

#### 4.3: Balance Testing
- Validate damage numbers
- Test chakra economy impact
- Verify cooldown balance
- Test team composition effects

## New Status Effects

1. **female_bug_mark** - Stacking status providing damage bonuses and harmful skill tracking
2. **chakra_leach_enhanced** - Modifies next Chakra Leach usage
3. **permanent_destructible_defense** - Regenerates destructible defense each turn
4. **destructible_defense** - Additional HP layer that must be broken first

## Implementation Timeline

- **Week 1**: Phase 1 - Core engine enhancements
- **Week 2**: Phase 2 - Character and skill implementation  
- **Week 3**: Phase 3 - Database integration and assets
- **Week 4**: Phase 4 - Testing and balance adjustments

## Success Metrics

- All four Shino skills function according to descriptions
- No performance degradation from new mechanics
- Proper interaction with existing skills and characters
- Balanced gameplay integration
- Comprehensive test coverage (>90%)

## Risk Mitigation

- Implement new mechanics incrementally
- Extensive testing of edge cases
- Performance monitoring for stacking effects
- Rollback plan for each phase
- Community feedback integration

## Future Considerations

This implementation establishes foundations for:
- More complex status effect interactions
- Advanced damage type systems
- Permanent effect mechanics
- Enhanced skill state management

These systems can be leveraged for future character implementations requiring similar advanced mechanics. 