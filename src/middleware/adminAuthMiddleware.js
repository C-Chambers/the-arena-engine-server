// src/middleware/adminAuthMiddleware.js

const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = async function(req, res, next) {
  // Get token from header
  const token = req.header('x-auth-token');

  // Check if no token
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user; // Add user payload to the request object

    // --- NEW: Check if the user is an admin ---
    const userResult = await pool.query(
      'SELECT is_admin FROM arena_engine_schema.users WHERE user_id = $1', 
      [req.user.id]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].is_admin) {
      return res.status(403).json({ msg: 'Access denied. User is not an administrator.' });
    }

    next(); // User is authenticated and is an admin, proceed.

  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
