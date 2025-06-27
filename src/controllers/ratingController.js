// src/controllers/ratingController.js

const { pool } = require('../config/database');

// Controller to get the authenticated user's rating information
const getMyRating = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // We fetch all columns from the player_ratings table for the user
    const query = 'SELECT * FROM arena_engine_schema.player_ratings WHERE user_id = $1';
    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'Rating information not found for this user.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getMyRating,
};
