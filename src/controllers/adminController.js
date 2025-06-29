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
  const { name, max_hp, image_url } = req.body;
  const query = `INSERT INTO arena_engine_schema.characters (name, max_hp, image_url) VALUES ($1, $2, $3) RETURNING *;`;
  const result = await pool.query(query, [name, max_hp, image_url]);
  await loadAllGameData();
  res.status(201).json(result.rows[0]);
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


// --- Skill Management ---
const getAllSkillsAdmin = async (req, res) => {
    try {
        const query = `
            SELECT s.*, c.name as character_name 
            FROM arena_engine_schema.skills s
            LEFT JOIN arena_engine_schema.characters c ON s.character_id = c.character_id
            ORDER BY c.name, s.skill_id;
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

// UPDATED: createSkill now includes the new classification fields
const createSkill = async (req, res) => {
    const { character_id, name, description, cost, effects, cooldown, skill_class, skill_range, skill_persistence } = req.body;
    if (!character_id || !name || !description || !cost || !effects) {
        return res.status(400).json({ msg: 'Please provide all required skill fields.' });
    }
    try {
        const query = `
            INSERT INTO arena_engine_schema.skills 
            (character_id, name, description, cost, effects, cooldown, skill_class, skill_range, skill_persistence)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
        `;
        const result = await pool.query(query, [
            character_id, name, description, cost, effects, 
            cooldown || 0, // Default to 0 if not provided
            skill_class, 
            skill_range, 
            skill_persistence
        ]);
        await loadAllGameData();
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
  getAllSkillsAdmin,
  createSkill,
};
