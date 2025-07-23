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
            hourlyStats: new Map(),
            crossQueueMatches: 0
        };
        
        this.waitTimes = [];
        this.lastLogTime = Date.now();
        this.maxWaitTimesToTrack = 1000; // Keep last 1000 wait times for rolling average
        
        // Log stats every minute
        this.logInterval = setInterval(() => this.logStatistics(), 60000);
        
        console.log('MatchmakingAnalytics service initialized');
    }
    
    recordMatch(player1WaitTime, player2WaitTime, successful = true, isCrossQueue = false) {
        this.metrics.totalMatches++;
        
        if (successful) {
            this.metrics.successfulMatches++;
            this.waitTimes.push(player1WaitTime, player2WaitTime);
            
            // Keep only recent wait times for rolling average
            if (this.waitTimes.length > this.maxWaitTimesToTrack) {
                this.waitTimes = this.waitTimes.slice(-this.maxWaitTimesToTrack);
            }
            
            this.updateAverageWaitTime();
            this.updatePeakWaitTime(Math.max(player1WaitTime, player2WaitTime));
            
            if (isCrossQueue) {
                this.metrics.crossQueueMatches++;
            }
            
            // Record hourly stats
            this.recordHourlyStats();
        } else {
            this.metrics.failedMatches++;
        }
        
        console.log(`Match recorded: ${successful ? 'SUCCESS' : 'FAILED'}, Wait times: ${player1WaitTime}ms, ${player2WaitTime}ms${isCrossQueue ? ' (Cross-queue)' : ''}`);
    }
    
    updateQueuePopulation(newPlayers, veteranPlayers) {
        this.metrics.queuePopulation.new = newPlayers;
        this.metrics.queuePopulation.veteran = veteranPlayers;
    }
    
    updateTickRate(tickRate) {
        if (this.metrics.currentTickRate !== tickRate) {
            console.log(`Tick rate updated: ${this.metrics.currentTickRate}ms -> ${tickRate}ms`);
            this.metrics.currentTickRate = tickRate;
        }
    }
    
    updateAverageWaitTime() {
        if (this.waitTimes.length > 0) {
            const sum = this.waitTimes.reduce((acc, time) => acc + time, 0);
            this.metrics.averageWaitTime = Math.round(sum / this.waitTimes.length);
        }
    }
    
    updatePeakWaitTime(waitTime) {
        if (waitTime > this.metrics.peakWaitTime) {
            this.metrics.peakWaitTime = waitTime;
        }
    }
    
    recordHourlyStats() {
        const currentHour = new Date().getHours();
        const hourKey = `${new Date().toDateString()}_${currentHour}`;
        
        if (!this.metrics.hourlyStats.has(hourKey)) {
            this.metrics.hourlyStats.set(hourKey, {
                matches: 0,
                totalWaitTime: 0,
                players: 0
            });
        }
        
        const hourStats = this.metrics.hourlyStats.get(hourKey);
        hourStats.matches++;
        
        // Clean up old hourly stats (keep last 48 hours)
        if (this.metrics.hourlyStats.size > 48) {
            const oldestKey = this.metrics.hourlyStats.keys().next().value;
            this.metrics.hourlyStats.delete(oldestKey);
        }
    }
    
    getMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalMatches > 0 ? 
                ((this.metrics.successfulMatches / this.metrics.totalMatches) * 100).toFixed(2) : 0,
            crossQueueRate: this.metrics.successfulMatches > 0 ?
                ((this.metrics.crossQueueMatches / this.metrics.successfulMatches) * 100).toFixed(2) : 0,
            averageWaitTimeSeconds: (this.metrics.averageWaitTime / 1000).toFixed(1),
            peakWaitTimeSeconds: (this.metrics.peakWaitTime / 1000).toFixed(1)
        };
    }
    
    logStatistics() {
        const now = Date.now();
        const timeSinceLastLog = now - this.lastLogTime;
        this.lastLogTime = now;
        
        const metrics = this.getMetrics();
        
        console.log('\n=== MATCHMAKING ANALYTICS ===');
        console.log(`Total Matches: ${metrics.totalMatches} (Success Rate: ${metrics.successRate}%)`);
        console.log(`Queue Population: New=${metrics.queuePopulation.new}, Veteran=${metrics.queuePopulation.veteran}`);
        console.log(`Wait Times: Avg=${metrics.averageWaitTimeSeconds}s, Peak=${metrics.peakWaitTimeSeconds}s`);
        console.log(`Current Tick Rate: ${metrics.currentTickRate}ms`);
        console.log(`Cross-Queue Matches: ${metrics.crossQueueMatches} (${metrics.crossQueueRate}%)`);
        console.log(`Log interval: ${(timeSinceLastLog / 1000).toFixed(1)}s`);
        console.log('============================\n');
    }
    
    // Method to get queue performance alerts
    getPerformanceAlerts() {
        const alerts = [];
        const metrics = this.getMetrics();
        
        if (metrics.averageWaitTime > 60000) { // 1 minute
            alerts.push(`HIGH_WAIT_TIME: Average wait time is ${metrics.averageWaitTimeSeconds}s`);
        }
        
        if (metrics.successRate < 95 && metrics.totalMatches > 10) {
            alerts.push(`LOW_SUCCESS_RATE: Match success rate is ${metrics.successRate}%`);
        }
        
        const totalQueue = metrics.queuePopulation.new + metrics.queuePopulation.veteran;
        if (totalQueue > 20) {
            alerts.push(`HIGH_QUEUE_POPULATION: ${totalQueue} players waiting`);
        }
        
        return alerts;
    }
    
    // Cleanup method for graceful shutdown
    destroy() {
        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
        }
        console.log('MatchmakingAnalytics service destroyed');
    }
}

module.exports = MatchmakingAnalytics; 