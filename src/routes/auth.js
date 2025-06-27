// src/routes/auth.js

const { Router } = require('express');
const { registerUser, loginUser } = require('../controllers/authController');

const router = Router();

// Route for user registration
// POST /api/auth/register
router.post('/register', registerUser);

// Route for user login
// POST /api/auth/login
router.post('/login', loginUser);

module.exports = router;
