// src/routes/team.js

const { Router } = require('express');
const { saveTeam, getTeam } = require('../controllers/teamController');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// @route   POST api/team
// @desc    Save a user's active team
// @access  Private
router.post('/', authMiddleware, saveTeam);

// @route   GET api/team
// @desc    Get a user's active team
// @access  Private
router.get('/', authMiddleware, getTeam);


module.exports = router;
