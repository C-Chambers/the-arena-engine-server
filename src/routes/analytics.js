const express = require('express');
const router = express.Router();
const gameManager = require('../game/manager');

/**
 * GET /api/analytics/matchmaking
 * Returns current matchmaking analytics and performance metrics
 */
router.get('/matchmaking', (req, res) => {
    try {
        const analytics = gameManager.getAnalytics();
        
        if (!analytics) {
            return res.status(503).json({
                error: 'Analytics service not available',
                message: 'Matchmaking analytics are not currently available'
            });
        }

        // Get current queue status
        const queueStatus = {
            newPlayerQueue: gameManager.newPlayerQueue.length,
            veteranQueue: gameManager.veteranQueue.length,
            totalGames: gameManager.games.size
        };

        // Get performance alerts
        const alerts = gameManager.analytics.getPerformanceAlerts();

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            analytics: analytics,
            queueStatus: queueStatus,
            alerts: alerts,
            version: 'Phase 1 Implementation'
        });

    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve analytics data'
        });
    }
});

/**
 * GET /api/analytics/health
 * Returns basic health check for matchmaking system
 */
router.get('/health', (req, res) => {
    try {
        const analytics = gameManager.getAnalytics();
        const alerts = analytics ? gameManager.analytics.getPerformanceAlerts() : [];
        
        const health = {
            status: alerts.length === 0 ? 'healthy' : 'warning',
            uptime: process.uptime(),
            alerts: alerts,
            queueCount: gameManager.newPlayerQueue.length + gameManager.veteranQueue.length,
            activeGames: gameManager.games.size,
            currentTickRate: analytics ? analytics.currentTickRate : 'unknown'
        };

        res.json(health);
    } catch (error) {
        console.error('Error checking health:', error);
        res.status(500).json({
            status: 'error',
            message: 'Health check failed'
        });
    }
});

module.exports = router; 