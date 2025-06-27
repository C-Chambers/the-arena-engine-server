// src/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
//const JWT_SECRET = 'your-super-secret-key-that-should-be-in-a-env-file'; // Ensure this matches your authController
const process.env.JWT_SECRET = process.env.JWT_SECRET; // Ensure this matches your authController

module.exports = function(req, res, next) {
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
    next(); // Move on to the next piece of middleware
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
