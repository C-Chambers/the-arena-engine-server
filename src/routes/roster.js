// src/routes/roster.js

const { Router } = require('express');
const { getFullRoster } = require('../controllers/rosterController');

const router = Router();

// @route   GET api/roster
// @desc    Get the full list of all characters in the game
// @access  Public
router.get('/', getFullRoster);

module.exports = router;
