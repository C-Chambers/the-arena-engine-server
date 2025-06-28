// src/controllers/teamController.js

const { pool } = require('../config/database');
const { getCharacters } = require('../services/characterService');

const saveTeam = async (req, res) => {
  const userId = req.user.id;
  const { teamCharacterIds } = req.body;

  if (!teamCharacterIds || teamCharacterIds.length !== 3) {
    return res.status(400).json({ msg: 'A team must consist of exactly 3 characters.' });
  }

  const [char1, char2, char3] = teamCharacterIds;

  try {
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

const getTeam = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query('SELECT character1_id, character2_id, character3_id FROM arena_engine_schema.user_teams WHERE user_id = $1', [userId]);
        
        if (result.rows.length === 0) {
            return res.json([]); 
        }

        const teamIds = [result.rows[0].character1_id, result.rows[0].character2_id, result.rows[0].character3_id];
        const allCharacters = getCharacters();

        // --- FIX: Add a check to ensure character data exists before mapping ---
        const userTeam = teamIds
          .map(id => allCharacters.find(char => char.id === id))
          .filter(Boolean); // The .filter(Boolean) will remove any null or undefined entries

        res.json(userTeam);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

module.exports = {
  saveTeam,
  getTeam,
};
