// src/controllers/teamController.js

const { pool } = require('../config/database');

// Controller to save/update a user's team
const saveTeam = async (req, res) => {
  const userId = req.user.id;
  const { teamCharacterIds } = req.body; // Expecting an array of 3 character IDs

  if (!teamCharacterIds || teamCharacterIds.length !== 3) {
    return res.status(400).json({ msg: 'A team must consist of exactly 3 characters.' });
  }

  const [char1, char2, char3] = teamCharacterIds;

  try {
    // We use an "UPSERT" query.
    // It tries to INSERT a new row. If a row for the user_id already exists (ON CONFLICT),
    // it will UPDATE that existing row instead. This is very efficient.
    const query = `
      INSERT INTO arena_engine_schema.user_teams (user_id, character1_id, character2_id, character3_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET
        character1_id = EXCLUDED.character1_id,
        character2_id = EXCLUDED.character2_id,
        character3_id = EXCLUDED.character3_id,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    
    const result = await pool.query(query, [userId, char1, char2, char3]);
    res.json(result.rows[0]);

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// Controller to get the current user's team
const getTeam = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query('SELECT character1_id, character2_id, character3_id FROM arena_engine_schema.user_teams WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'No team set for this user.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

module.exports = {
  saveTeam,
  getTeam,
};
