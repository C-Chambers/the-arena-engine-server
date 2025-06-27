// src/services/ratingService.js

const { Glicko2 } = require('glicko2');
const { pool } = require('../config/database');

// Configure the Glicko-2 settings. These are standard values.
const glicko2Settings = {
  tau: 0.5,
  rating: 1500,
  rd: 350,
  vol: 0.06,
};
const ranking = new Glicko2(glicko2Settings);

// This function will be called after a game ends
const updateRatings = async (client, winnerId, loserId) => {
  try {
    console.log(`Updating ratings for winner: ${winnerId} and loser: ${loserId}`);

    // 1. Get the current ratings for both players from the database
    const ratingQuery = 'SELECT rating, rd, vol FROM arena_engine_schema.player_ratings WHERE user_id = $1';
    const winnerResult = await client.query(ratingQuery, [winnerId]);
    const loserResult = await client.query(ratingQuery, [loserId]);

    if (winnerResult.rows.length === 0 || loserResult.rows.length === 0) {
      throw new Error('Could not find rating information for one or more players.');
    }

    // 2. Create Glicko-2 player objects
    const winner = ranking.makePlayer(winnerResult.rows[0].rating, winnerResult.rows[0].rd, winnerResult.rows[0].vol);
    const loser = ranking.makePlayer(loserResult.rows[0].rating, loserResult.rows[0].rd, loserResult.rows[0].vol);

    // 3. Record the match outcome
    const matches = [[winner, loser, 1]]; // 1 means player1 (winner) won
    ranking.updateRatings(matches);

    // 4. Update the database with the new ratings
    const updateWinnerQuery = `
      UPDATE arena_engine_schema.player_ratings
      SET rating = $1, rd = $2, vol = $3, wins = wins + 1, games_played = games_played + 1
      WHERE user_id = $4
    `;
    await client.query(updateWinnerQuery, [winner.getRating(), winner.getRd(), winner.getVol(), winnerId]);

    const updateLoserQuery = `
      UPDATE arena_engine_schema.player_ratings
      SET rating = $1, rd = $2, vol = $3, losses = losses + 1, games_played = games_played + 1
      WHERE user_id = $4
    `;
    await client.query(updateLoserQuery, [loser.getRating(), loser.getRd(), loser.getVol(), loserId]);
    
    console.log(`- Ratings updated successfully.`);

  } catch (err) {
    console.error('Error updating ratings:', err);
    // We don't re-throw the error, because a rating update failure
    // shouldn't prevent mission progress from being saved.
  }
};

module.exports = {
  updateRatings,
};
