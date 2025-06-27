// src/routes/ratings.js

const { Router } = require('express');
const { getMyRating } = require('../controllers/ratingController');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// @route   GET api/ratings/me
// @desc    Get the authenticated user's rating info
// @access  Private
router.get('/', authMiddleware, getMyRating);

module.exports = router;
