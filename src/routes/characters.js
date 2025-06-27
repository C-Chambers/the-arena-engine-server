// src/routes/characters.js

const { Router } = require('express');
const { getUnlockedCharacters } = require('../controllers/characterController'); // We will create this controller next
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// @route   GET api/characters
// @desc    Get the characters unlocked by the authenticated user
// @access  Private
router.get('/', authMiddleware, getUnlockedCharacters);

module.exports = router;
