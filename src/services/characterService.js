// src/services/characterService.js

const { pool } = require('../config/database');

let characterCache = [];
let chakraTypeCache = [];

const loadAllGameData = async () => {
  try {
    console.log('Loading all game data from database...');
    
    // UPDATED: Query now includes the new skill classification and lock columns
    const charactersQuery = `
      SELECT
        c.character_id, c.name, c.max_hp, c.image_url,
        json_agg(
          json_build_object(
            'id', s.skill_id, 
            'name', s.name, 
            'description', s.description,
            'cost', s.cost, 
            'effects', s.effects,
            'cooldown', s.cooldown,
            'skill_class', s.skill_class,
            'skill_range', s.skill_range,
            'skill_persistence', s.skill_persistence,
            'icon_url', s.icon_url,
            'is_locked_by_default', s.is_locked_by_default -- Include the new field
          )
        ) FILTER (WHERE s.skill_id IS NOT NULL) AS skills
      FROM arena_engine_schema.characters AS c
      LEFT JOIN arena_engine_schema.skills AS s ON c.character_id = c.character_id
      GROUP BY c.character_id;
    `;
    const { rows: characterRows } = await pool.query(charactersQuery);
    
    characterCache = characterRows.map(row => ({
        id: row.character_id,
        name: row.name,
        maxHp: row.max_hp,
        imageUrl: row.image_url,
        skills: row.skills || [],
    }));
    console.log(`✅ Successfully loaded ${characterCache.length} characters.`);

    const chakraQuery = 'SELECT name FROM arena_engine_schema.chakra_types';
    const { rows: chakraRows } = await pool.query(chakraQuery);
    chakraTypeCache = chakraRows.map(row => row.name);
    console.log(`✅ Successfully loaded ${chakraTypeCache.length} chakra types.`);

  } catch (err) {
    console.error('❌ Failed to load game data from database:', err);
  }
};

const getCharacters = () => characterCache;
const getChakraTypes = () => chakraTypeCache;

module.exports = {
  loadAllGameData,
  getCharacters,
  getChakraTypes,
};
