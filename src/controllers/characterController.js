// src/controllers/characterController.js

const { pool } = require('../config/database');
const { getCharacters } = require('../services/characterService');

const getUnlockedCharacters = async (req, res) => {
  try {
    const userId = req.user.id;
    const allCharacters = getCharacters(); // Get all characters from cache

    // Get the IDs of the characters this specific user has unlocked
    const unlockedResult = await pool.query(
      'SELECT character_id FROM arena_engine_schema.unlocked_characters WHERE user_id = $1',
      [userId]
    );
    // Create a Set for quick lookups
    const unlockedIds = new Set(unlockedResult.rows.map(row => row.character_id));

    // Map over all characters and add the isUnlocked flag
    const characterRoster = allCharacters.map(char => ({
      ...char,
      isUnlocked: unlockedIds.has(char.id),
    }));

    res.json(characterRoster);

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getUnlockedCharacters,
};
