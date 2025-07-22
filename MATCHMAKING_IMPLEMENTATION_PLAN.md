# Matchmaking System Implementation Plan

## Overview
This document outlines a comprehensive plan to enhance the current matchmaking system through three progressive phases. Each phase builds upon the previous one, ensuring stable improvements while maintaining system reliability.

## Current System Assessment

### Strengths
- Two-queue system (new vs veteran players)
- Glicko-2 rating system implementation
- Basic MMR-based matching for veterans
- Simple and functional core architecture

### Areas for Improvement
- Fixed parameters don't adapt to player population
- Limited match quality metrics
- Basic new player experience
- Minimal monitoring and analytics

---

## PHASE 1: Core Improvements (High Priority)

### 1.1 Wait Time Priority for New Players
**Objective**: Implement fair queuing for new players based on wait time
**Files to Modify**: `src/game/manager.js`

#### Implementation Details:
```javascript
// Add to constants section
const PRIORITY_WAIT_THRESHOLD = 30000; // 30 seconds
const MAX_NEW_PLAYER_WAIT = 120000; // 2 minutes

// Modify newPlayerQueue to include priority
this.newPlayerQueue = []; // Will store objects with {player, priority}

// New method to add in handleNewPlayer
addToNewPlayerQueue(ws) {
    this.newPlayerQueue.push({
        player: ws,
        timeEntered: Date.now(),
        priority: 0
    });
}

// New method to process with priority
processNewPlayerQueue() {
    if (this.newPlayerQueue.length >= 2) {
        // Sort by priority (wait time), then by entry time
        this.newPlayerQueue.sort((a, b) => {
            const timeA = Date.now() - a.timeEntered;
            const timeB = Date.now() - b.timeEntered;
            
            if (timeA > PRIORITY_WAIT_THRESHOLD && timeB <= PRIORITY_WAIT_THRESHOLD) return -1;
            if (timeB > PRIORITY_WAIT_THRESHOLD && timeA <= PRIORITY_WAIT_THRESHOLD) return 1;
            
            return a.timeEntered - b.timeEntered;
        });
        
        const player1 = this.newPlayerQueue.shift().player;
        const player2 = this.newPlayerQueue.shift().player;
        await this.createGame(player1, player2);
    }
}
```

#### Tasks:
- [ ] Update queue data structure to include priority information
- [ ] Modify `handleNewPlayer` method to use new queue structure
- [ ] Update `matchmakingTick` to use priority-based matching
- [ ] Update `broadcastQueueStatus` to show priority information
- [ ] Test with various wait time scenarios

### 1.2 Dynamic Tick Rate Based on Queue Population
**Objective**: Adjust matchmaking frequency based on player activity
**Files to Modify**: `src/game/manager.js`

#### Implementation Details:
```javascript
// Add to constants
const DYNAMIC_TICK_CONFIG = {
    highTraffic: { threshold: 10, tickRate: 2000 },    // 2 seconds when 10+ players
    normalTraffic: { threshold: 4, tickRate: 1000 },   // 1 second when 4-9 players
    lowTraffic: { threshold: 0, tickRate: 500 }        // 0.5 seconds when <4 players
};

// New method to calculate optimal tick rate
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

// Update constructor to use dynamic interval
constructor() {
    this.currentTickRate = MATCHMAKING_TICK_RATE;
    this.matchmakingInterval = null;
    this.startMatchmaking();
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
        this.startMatchmaking();
        console.log(`Matchmaking tick rate updated to ${newTickRate}ms`);
    }
}
```

#### Tasks:
- [ ] Implement dynamic tick rate calculation
- [ ] Update constructor to use dynamic intervals
- [ ] Add tick rate monitoring to `matchmakingTick`
- [ ] Add logging for tick rate changes
- [ ] Test performance under different load conditions

### 1.3 Comprehensive Matchmaking Metrics and Logging
**Objective**: Add detailed monitoring and analytics
**Files to Create**: `src/services/matchmakingAnalytics.js`
**Files to Modify**: `src/game/manager.js`

#### Implementation Details:
```javascript
// New file: src/services/matchmakingAnalytics.js
class MatchmakingAnalytics {
    constructor() {
        this.metrics = {
            totalMatches: 0,
            averageWaitTime: 0,
            queuePopulation: { new: 0, veteran: 0 },
            successfulMatches: 0,
            failedMatches: 0,
            peakWaitTime: 0,
            currentTickRate: 1000,
            hourlyStats: new Map()
        };
        
        this.waitTimes = [];
        this.lastLogTime = Date.now();
        
        // Log stats every minute
        setInterval(() => this.logStatistics(), 60000);
    }
    
    recordMatch(player1WaitTime, player2WaitTime, successful = true) {
        this.metrics.totalMatches++;
        if (successful) {
            this.metrics.successfulMatches++;
            this.waitTimes.push(player1WaitTime, player2WaitTime);
            this.updateAverageWaitTime();
            this.updatePeakWaitTime(Math.max(player1WaitTime, player2WaitTime));
        } else {
            this.metrics.failedMatches++;
        }
    }
    
    updateQueuePopulation(newPlayers, veteranPlayers) {
        this.metrics.queuePopulation.new = newPlayers;
        this.metrics.queuePopulation.veteran = veteranPlayers;
    }
    
    updateTickRate(tickRate) {
        this.metrics.currentTickRate = tickRate;
    }
    
    getMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalMatches > 0 ? 
                (this.metrics.successfulMatches / this.metrics.totalMatches) * 100 : 0
        };
    }
}
```

#### Tasks:
- [ ] Create analytics service class
- [ ] Integrate analytics into GameManager
- [ ] Add wait time tracking for all matches
- [ ] Implement periodic statistics logging
- [ ] Add alert system for performance thresholds
- [ ] Create metrics endpoint for monitoring

---

## PHASE 2: Enhanced Matching (Medium Priority)

### 2.1 Graduated New Player Tiers
**Objective**: Create skill-based progression for new players
**Files to Modify**: `src/game/manager.js`, `src/services/ratingService.js`

#### Implementation Details:
```javascript
// Add to constants
const NEW_PLAYER_TIERS = {
    COMPLETE_BEGINNER: { 
        maxGames: 5, 
        searchRange: 50,
        description: 'Complete Beginner'
    },
    BEGINNER: { 
        maxGames: 15, 
        searchRange: 100,
        description: 'Beginner'
    },
    LEARNING: { 
        maxGames: 30, 
        searchRange: 150,
        description: 'Learning'
    }
};

// New method to determine player tier
getPlayerTier(gamesPlayed) {
    if (gamesPlayed <= NEW_PLAYER_TIERS.COMPLETE_BEGINNER.maxGames) {
        return 'COMPLETE_BEGINNER';
    } else if (gamesPlayed <= NEW_PLAYER_TIERS.BEGINNER.maxGames) {
        return 'BEGINNER';
    } else if (gamesPlayed <= NEW_PLAYER_TIERS.LEARNING.maxGames) {
        return 'LEARNING';
    }
    return 'VETERAN';
}
```

#### Tasks:
- [ ] Define tier system constants
- [ ] Modify player classification logic
- [ ] Update queue management for tiers
- [ ] Implement tier-specific search ranges
- [ ] Add tier information to player status updates
- [ ] Test tier progression and balancing

### 2.2 Cross-Queue Matching for Long Wait Times
**Objective**: Allow experienced new players to match with low-rated veterans
**Files to Modify**: `src/game/manager.js`

#### Implementation Details:
```javascript
// Add to constants
const CROSS_QUEUE_CONDITIONS = {
    veteranWaitTime: 180000,      // 3 minutes
    newPlayerWaitTime: 120000,    // 2 minutes
    minGamesForCrossMatch: 15,    // New players need some experience
    maxRatingGapForCross: 200     // Rating difference limit
};

// New method for cross-queue matching
async attemptCrossQueueMatch() {
    const now = Date.now();
    
    // Find eligible new players (experienced enough)
    const eligibleNewPlayers = this.newPlayerQueue.filter(player => {
        const waitTime = now - player.timeEnteredQueue;
        return player.gamesPlayed >= CROSS_QUEUE_CONDITIONS.minGamesForCrossMatch &&
               waitTime >= CROSS_QUEUE_CONDITIONS.newPlayerWaitTime;
    });
    
    // Find veterans waiting too long
    const waitingVeterans = this.veteranQueue.filter(player => {
        const waitTime = now - player.timeEnteredQueue;
        return waitTime >= CROSS_QUEUE_CONDITIONS.veteranWaitTime;
    });
    
    // Attempt to match eligible players
    for (const newPlayer of eligibleNewPlayers) {
        for (const veteran of waitingVeterans) {
            const ratingDiff = Math.abs((newPlayer.estimatedRating || 1500) - veteran.rating);
            if (ratingDiff <= CROSS_QUEUE_CONDITIONS.maxRatingGapForCross) {
                await this.createGame(newPlayer, veteran);
                this.removeFromQueues(newPlayer, veteran);
                return true;
            }
        }
    }
    return false;
}
```

#### Tasks:
- [ ] Implement cross-queue matching logic
- [ ] Add estimated rating calculation for new players
- [ ] Integrate into main matchmaking tick
- [ ] Add logging for cross-queue matches
- [ ] Test rating accuracy after cross-queue matches

### 2.3 Enhanced Match Quality Scoring System
**Objective**: Evaluate and optimize match quality beyond just rating
**Files to Create**: `src/services/matchQualityService.js`

#### Implementation Details:
```javascript
// New file: src/services/matchQualityService.js
class MatchQualityService {
    calculateMatchQuality(player1, player2) {
        const weights = {
            ratingDifference: 0.5,
            experienceDifference: 0.2,
            waitTime: 0.2,
            tierAlignment: 0.1
        };
        
        const scores = {
            rating: this.calculateRatingScore(player1, player2),
            experience: this.calculateExperienceScore(player1, player2),
            waitTime: this.calculateWaitTimeScore(player1, player2),
            tier: this.calculateTierScore(player1, player2)
        };
        
        return (
            scores.rating * weights.ratingDifference +
            scores.experience * weights.experienceDifference +
            scores.waitTime * weights.waitTime +
            scores.tier * weights.tierAlignment
        );
    }
    
    calculateRatingScore(player1, player2) {
        const ratingDiff = Math.abs(player1.rating - player2.rating);
        const maxAcceptableDiff = 300;
        return Math.max(0, 1 - (ratingDiff / maxAcceptableDiff));
    }
}
```

#### Tasks:
- [ ] Create match quality service
- [ ] Implement quality scoring algorithms
- [ ] Integrate quality checks into matching
- [ ] Add quality metrics to analytics
- [ ] Tune quality thresholds based on data

---

## PHASE 3: Advanced Features (Lower Priority)

### 3.1 Seasonal Rating Adjustments
**Objective**: Implement seasonal resets and progression
**Files to Create**: `src/services/seasonService.js`
**Files to Modify**: `src/services/ratingService.js`

#### Implementation Details:
```javascript
// New file: src/services/seasonService.js
class SeasonService {
    constructor() {
        this.currentSeason = 1;
        this.seasonStartDate = new Date();
        this.seasonDuration = 90 * 24 * 60 * 60 * 1000; // 90 days
    }
    
    async applySoftReset(playerId, currentRating) {
        const resetFactor = 0.8; // 20% move toward 1500
        const newRating = currentRating * resetFactor + 1500 * (1 - resetFactor);
        
        // Reset RD to allow for faster rating changes
        const newRD = Math.min(350, currentRating.rd + 100);
        
        return {
            rating: Math.round(newRating),
            rd: newRD,
            placementMatches: 3 // Bonus placement matches
        };
    }
}
```

#### Tasks:
- [ ] Design seasonal system architecture
- [ ] Implement soft rating resets
- [ ] Add placement match bonuses
- [ ] Create season transition logic
- [ ] Add seasonal rewards system

### 3.2 Team Composition Balancing
**Objective**: Consider character diversity in matchmaking
**Files to Create**: `src/services/teamBalanceService.js`

#### Tasks:
- [ ] Analyze team composition data
- [ ] Define balance metrics
- [ ] Implement composition scoring
- [ ] Integrate into match quality system
- [ ] Test impact on match outcomes

### 3.3 Advanced Analytics Dashboard
**Objective**: Create comprehensive monitoring tools
**Files to Create**: `src/routes/analytics.js`, `src/controllers/analyticsController.js`

#### Tasks:
- [ ] Design analytics API endpoints
- [ ] Create data aggregation services
- [ ] Implement historical data storage
- [ ] Build visualization components
- [ ] Add real-time monitoring alerts

---

## Implementation Timeline

### Week 1-2: Phase 1 Foundation
- Set up analytics infrastructure
- Implement wait time priority system
- Add basic dynamic tick rate

### Week 3-4: Phase 1 Completion
- Complete metrics and logging system
- Performance testing and optimization
- Documentation and monitoring setup

### Week 5-7: Phase 2 Development
- Implement graduated player tiers
- Add cross-queue matching
- Develop match quality scoring

### Week 8-10: Phase 2 Testing & Refinement
- Extensive testing of new features
- Data collection and analysis
- Parameter tuning based on results

### Week 11-14: Phase 3 Planning & Development
- Begin seasonal system development
- Advanced analytics implementation
- Team composition analysis

## Success Metrics

### Phase 1 Goals:
- Reduce average wait time by 25%
- Achieve 95% uptime for matchmaking service
- Implement comprehensive logging with <1% performance impact

### Phase 2 Goals:
- Improve new player retention by 30%
- Reduce rating volatility for new players by 40%
- Achieve 90%+ match quality scores

### Phase 3 Goals:
- Implement full seasonal progression system
- Create predictive matchmaking algorithms
- Achieve sub-10 second average wait times

## Risk Mitigation

### Technical Risks:
- **Database Performance**: Monitor query performance, implement caching
- **Memory Usage**: Regular profiling, efficient data structures
- **Concurrent Access**: Proper locking mechanisms, queue safety

### Gameplay Risks:
- **Match Quality**: Gradual rollout with A/B testing
- **Player Satisfaction**: Continuous feedback collection and analysis
- **Rating Inflation**: Regular statistical analysis and adjustments

## Testing Strategy

### Unit Testing:
- Match quality calculation algorithms
- Queue management logic
- Analytics data accuracy

### Integration Testing:
- Cross-queue matching scenarios
- Database transaction integrity
- Real-time analytics updates

### Performance Testing:
- High-load queue processing
- Memory usage under stress
- Database query optimization

### User Acceptance Testing:
- New player experience flows
- Veteran player satisfaction
- Wait time acceptability thresholds

---

## Conclusion

This implementation plan provides a structured approach to significantly improving the matchmaking system while maintaining stability and performance. Each phase builds upon the previous one, allowing for iterative improvement and validation of changes before proceeding to more complex features.

The plan prioritizes immediate improvements that will enhance player experience while laying the groundwork for more sophisticated features in later phases. Regular monitoring and adjustment of parameters will ensure the system continues to perform optimally as the player base grows and evolves.