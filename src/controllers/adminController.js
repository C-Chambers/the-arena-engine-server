// src/controllers/adminController.js

const { pool } = require('../config/database');
const { loadAllGameData, getCharacters } = require('../services/characterService');

// --- Character Management ---
const getAllCharactersAdmin = (req, res) => {
    try {
        const characters = getCharacters(); // Get from cacheAdd commentMore actions
        res.json(characters);
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

const createCharacter = async (req, res) => {
  const { character_id, name, max_hp, image_url } = req.body;
  if (!character_id || !name || !max_hp || !image_url) {
    return res.status(400).json({ msg: 'Please provide all character fields.' });
  }
  try {
    const query = `INSERT INTO arena_engine_schema.characters (character_id, name, max_hp, image_url) VALUES ($1, $2, $3, $4) RETURNING *;`;
    const result = await pool.query(query, [character_id, name, max_hp, image_url]);
    await loadAllGameData();
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

const deleteCharacter = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM arena_engine_schema.skills WHERE character_id = $1', [id]);
    const result = await pool.query('DELETE FROM arena_engine_schema.characters WHERE character_id = $1 RETURNING *;', [id]);
    if (result.rowCount === 0) return res.status(404).json({ msg: 'Character not found.' });
    await loadAllGameData();
    res.json({ msg: 'Character and associated skills deleted successfully.' });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// --- NEW: Skill Management ---

const getAllSkillsAdmin = async (req, res) => {
    try {
        // Query to get all skills and join with characters to get the character name
        const query = `
            SELECT s.*, c.name as character_name 
            FROM arena_engine_schema.skills s
            JOIN arena_engine_schema.characters c ON s.character_id = c.character_id
            ORDER BY c.name, s.skill_id;
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const createSkill = async (req, res) => {
    const { skill_id, character_id, name, description, cost, effects } = req.body;
    if (!skill_id || !character_id || !name || !description || !cost || !effects) {
        return res.status(400).json({ msg: 'Please provide all skill fields.' });
    }
    try {
        const query = `
            INSERT INTO arena_engine_schema.skills (skill_id, character_id, name, description, cost, effects)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        // The cost and effects are sent as JSON strings from the frontend
        const result = await pool.query(query, [skill_id, character_id, name, description, cost, effects]);
        
        await loadAllGameData(); // Refresh the cache
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

module.exports = {
  getAllCharactersAdmin,
  createCharacter,
  deleteCharacter,
  getAllSkillsAdmin, // Export new function
  createSkill,       // Export new function
};
