// src/services/missionService.js

const { pool } = require('../config/database');
const { updateRatings } = require('./ratingService'); // Import our new rating service

// --- Helper function to grant rewards ---
async function grantReward(client, userId, mission) {
  console.log(`Granting reward for mission "${mission.title}" to user ${userId}`);
  
  if (mission.reward_text === 'Unlocks Character: Pink') {
    const characterIdToUnlock = '3';
    const unlockQuery = `
      INSERT INTO arena_engine_schema.unlocked_characters (user_id, character_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, character_id) DO NOTHING;
    `;
    await client.query(unlockQuery, [userId, characterIdToUnlock]);
    console.log(`- Unlocked character ${characterIdToUnlock} for user ${userId}.`);
  }
}

// --- Main function to process game results ---
const processGameResults = async (game) => {
  const winnerId = Object.keys(game.players).find(id => game.players[id].team.every(c => c.isAlive));
  // If there's no winner (e.g., a draw or disconnect), we can't process ratings.
  if (!winnerId) return;

  const loserId = Object.keys(game.players).find(id => id !== winnerId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- NEW: Update player ratings first ---
    // We pass the transaction client to this function to ensure it's part of the same atomic operation.
    await updateRatings(client, winnerId, loserId);

    // --- Then, update mission progress for both players ---
    for (const playerId in game.players) {
      const playerStats = game.stats[playerId];
      const userMissionsQuery = `
        SELECT m.mission_id, m.title, m.type, m.goal, m.reward_text, mp.current_progress
        FROM arena_engine_schema.missions m
        LEFT JOIN arena_engine_schema.mission_progress mp ON m.mission_id = mp.mission_id AND mp.user_id = $1
        WHERE mp.is_completed IS NOT TRUE OR mp.is_completed IS NULL;
      `;
      const { rows: userMissions } = await client.query(userMissionsQuery, [playerId]);
      
      for (const mission of userMissions) {
        let progressIncrement = 0;
        
        if (mission.type === 'win_games' && playerId === winnerId) {
          progressIncrement = 1;
        }
        
        if (mission.type === 'deal_damage') {
           progressIncrement = playerStats.damageDealt;
        }

        if (progressIncrement > 0) {
          const newProgress = (mission.current_progress || 0) + progressIncrement;
          
          const updateQuery = `
            INSERT INTO arena_engine_schema.mission_progress (user_id, mission_id, current_progress)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, mission_id) DO UPDATE SET
              current_progress = arena_engine_schema.mission_progress.current_progress + $4;
          `;
          await client.query(updateQuery, [playerId, mission.mission_id, newProgress, progressIncrement]);
          console.log(`Updated progress for mission "${mission.title}" for user ${playerId}. New progress: ${newProgress}`);

          if (newProgress >= mission.goal) {
            const completeQuery = 'UPDATE arena_engine_schema.mission_progress SET is_completed = TRUE, completed_at = NOW() WHERE user_id = $1 AND mission_id = $2';
            await client.query(completeQuery, [playerId, mission.mission_id]);
            await grantReward(client, playerId, mission);
          }
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error processing game results:', err);
  } finally {
    client.release();
  }
};

module.exports = {
  processGameResults,
};
