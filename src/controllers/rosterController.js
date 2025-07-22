// src/controllers/rosterController.js

const { getCharacters } = require('../services/characterService');

// Controller to get the full character roster for public display
const getFullRoster = (req, res) => {
  try {
    // We get the character data from our in-memory cache, which is very fast.
    const characters = getCharacters();
    res.json(characters);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getFullRoster,
};
