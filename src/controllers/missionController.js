// src/controllers/missionController.js

const { pool } = require('../config/database');

// Controller to get all available missions along with the user's progress
const getMissions = async (req, res) => {
  const userId = req.user.id; // Get user ID from our auth middleware

  try {
    // This query now joins the missions table with the user's specific progress.
    // It uses COALESCE to return 0 for progress if no entry exists yet.
    const query = `
      SELECT
        m.mission_id,
        m.title,
        m.description,
        m.type,
        m.goal,
        m.reward_text,
        COALESCE(mp.current_progress, 0) AS current_progress,
        COALESCE(mp.is_completed, FALSE) AS is_completed
      FROM
        arena_engine_schema.missions AS m
      LEFT JOIN
        arena_engine_schema.mission_progress AS mp
      ON
        m.mission_id = mp.mission_id AND mp.user_id = $1
      ORDER BY
        m.mission_id;
    `;
    
    const missionsResult = await pool.query(query, [userId]);
    
    res.json(missionsResult.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getMissions,
};
