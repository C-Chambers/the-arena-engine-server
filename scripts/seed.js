// scripts/seed.js
// This script will populate our database with initial character, skill, and mission data.

const { Pool } = require('pg');
const { characters } = require('../src/game/data');
let pool;
// Our chakra types, now defined here for seeding
const CHAKRA_TYPES = ['Power', 'Technique', 'Agility', 'Focus'];

// --- NEW: Define our initial missions ---
const missionsToSeed = [
  {
    title: "First Victory",
    description: "Win 1 game in any mode.",
    type: "win_games",
    goal: 1,
    reward_text: "500 XP"
  },
  {
    title: "Proven Brawler",
    description: "Win 5 games with Grid on your team.",
    type: "win_games_with_char",
    goal: 5,
    reward_text: "Grid Character Badge"
  },
  {
    title: "Aggressor",
    description: "Deal a total of 10,000 damage.",
    type: "deal_damage",
    goal: 10000,
    reward_text: "Unlocks Character: Pink"
  }
];

async function seedDatabase() {
  pool = new Pool({
    connectionString: "postgresql://arena_user:ft3Cok3PJs5GldOetWle5x7CoBl3mHeL@dpg-d1fh7sgdl3ps73ci33lg-a.ohio-postgres.render.com/arena_engine_db",
    ssl: {
            rejectUnauthorized: false // Required for Render connections
         }
   });
  const client = await pool.connect();
  try {
    console.log('Starting database seeding process...');

    // Update TRUNCATE to include the new missions table
    await client.query('TRUNCATE TABLE arena_engine_schema.skills, arena_engine_schema.characters, arena_engine_schema.chakra_types, arena_engine_schema.missions RESTART IDENTITY CASCADE');
    console.log('Cleared existing tables in arena_engine_schema.');

    // --- Seed Chakra Types ---
    console.log('Seeding chakra types...');
    for (const typeName of CHAKRA_TYPES) {
      await client.query('INSERT INTO arena_engine_schema.chakra_types(name) VALUES($1)', [typeName]);
    }
    console.log(`- Seeded ${CHAKRA_TYPES.length} chakra types.`);

    // --- Seed Characters and Skills ---
    for (const character of characters) {
      let i = 1;
      const charInsertQuery = 'INSERT INTO arena_engine_schema.characters(name, max_hp) VALUES($1, $2)';
      await client.query(charInsertQuery, [character.name, character.maxHp]);
      console.log(`Inserted character: ${character.name}`);

      for (const skill of character.skills) {
        const skillInsertQuery = 'INSERT INTO arena_engine_schema.skills(character_id, name, description, cost, effects) VALUES($1, $2, $3, $4, $5)';
        await client.query(skillInsertQuery, [
          i,
          skill.name,
          skill.description,
          JSON.stringify(skill.cost),
          JSON.stringify(skill.effects)
        ]);
        console.log(`  - Inserted skill: ${skill.name}`);
      }
      i++;
    }
    
    // --- NEW: Seed Missions ---
    console.log('Seeding missions...');
    for (const mission of missionsToSeed) {
      const missionQuery = 'INSERT INTO arena_engine_schema.missions(title, description, type, goal, reward_text) VALUES($1, $2, $3, $4, $5)';
      await client.query(missionQuery, [mission.title, mission.description, mission.type, mission.goal, mission.reward_text]);
    }
    console.log(`- Seeded ${missionsToSeed.length} missions.`);


    console.log('✅ Database seeding completed successfully!');
  } catch (err) {
    console.error('❌ Error during database seeding:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seedDatabase();
