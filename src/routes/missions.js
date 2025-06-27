// src/routes/missions.js

const { Router } = require('express');
const { getMissions } = require('../controllers/missionController');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// @route   GET api/missions
// @desc    Get all available missions
// @access  Private
router.get('/', authMiddleware, getMissions);

module.exports = router;
