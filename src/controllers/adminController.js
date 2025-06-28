// src/controllers/adminController.js

const { pool } = require('../config/database');
const { loadAllGameData, getCharacters } = require('../services/characterService');

// --- Character Management ---

// NEW: Get all characters for the admin panel
const getAllCharactersAdmin = (req, res) => {
    try {
        const characters = getCharacters(); // Get from cache
        res.json(characters);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

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
  const { id } = req.params;
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
    
    await loadAllGameData(); 
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

const deleteCharacter = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM arena_engine_schema.skills WHERE character_id = $1', [id]);
    const result = await pool.query('DELETE FROM arena_engine_schema.characters WHERE character_id = $1 RETURNING *;', [id]);

    if (result.rowCount === 0) {
        return res.status(404).json({ msg: 'Character not found.' });
    }

    await loadAllGameData();
    res.json({ msg: 'Character and associated skills deleted successfully.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getAllCharactersAdmin,
  createCharacter,
  updateCharacter,
  deleteCharacter,
};
