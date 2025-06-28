// src/controllers/adminController.js

const { pool } = require('../config/database');
const { loadAllGameData } = require('../services/characterService');

// --- Character Management ---

const createCharacter = async (req, res) => {
  const { character_id, name, max_hp, image_url } = req.body;
  if (!character_id || !name || !max_hp || !image_url) {
    return res.status(400).json({ msg: 'Please provide character_id, name, max_hp, and image_url.' });
  }

  try {
    const query = `
      INSERT INTO arena_engine_schema.characters (character_id, name, max_hp, image_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await pool.query(query, [character_id, name, max_hp, image_url]);

    await loadAllGameData(); // Refresh the server's character cache
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

const updateCharacter = async (req, res) => {
  const { id } = req.params; // Get character_id from the URL parameter
  const { name, max_hp, image_url } = req.body;

  try {
    const query = `
      UPDATE arena_engine_schema.characters
      SET name = $1, max_hp = $2, image_url = $3
      WHERE character_id = $4
      RETURNING *;
    `;
    const result = await pool.query(query, [name, max_hp, image_url, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'Character not found.' });
    }
    
    await loadAllGameData(); // Refresh the cache
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

const deleteCharacter = async (req, res) => {
  const { id } = req.params;
  try {
    // Note: Due to foreign key constraints, you must delete associated skills first.
    // A more robust implementation would handle this in a transaction.
    await pool.query('DELETE FROM arena_engine_schema.skills WHERE character_id = $1', [id]);
    const result = await pool.query('DELETE FROM arena_engine_schema.characters WHERE character_id = $1 RETURNING *;', [id]);

    if (result.rowCount === 0) {
        return res.status(404).json({ msg: 'Character not found.' });
    }

    await loadAllGameData(); // Refresh the cache
    res.json({ msg: 'Character and associated skills deleted successfully.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};


// We will add functions for Skills and Missions here in the future.

module.exports = {
  createCharacter,
  updateCharacter,
  deleteCharacter,
};
