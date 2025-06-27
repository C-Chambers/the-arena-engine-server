// src/controllers/authController.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

//const JWT_SECRET = 'your-super-secret-key-that-should-be-in-a-env-file';
const JWT_SECRET = process.env.JWT_SECRET;

const DEFAULT_CHARACTERS = ['char_sbt_04', 'char_sbt_01', 'char_sbt_02'];

const registerUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert the new user into the 'users' table
    const newUserQuery = `
      INSERT INTO arena_engine_schema.users (email, password_hash) 
      VALUES ($1, $2) 
      RETURNING user_id, email
    `;
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const newUserResult = await client.query(newUserQuery, [email, password_hash]);
    const newUser = newUserResult.rows[0];

    // 2. Grant the default characters to the new user
    console.log(`Granting default characters to new user: ${newUser.user_id}`);
    const unlockQuery = `
      INSERT INTO arena_engine_schema.unlocked_characters (user_id, character_id) 
      VALUES ($1, $2)
    `;
    for (const charId of DEFAULT_CHARACTERS) {
      await client.query(unlockQuery, [newUser.user_id, charId]);
    }
    console.log(`- Unlocked default characters for user ${newUser.user_id}`);

    // --- NEW: Create a default entry in the player_ratings table ---
    console.log(`Creating default rating entry for user: ${newUser.user_id}`);
    const ratingQuery = `
      INSERT INTO arena_engine_schema.player_ratings (user_id) 
      VALUES ($1)
    `;
    await client.query(ratingQuery, [newUser.user_id]);
    console.log(`- Default rating entry created for user ${newUser.user_id}`);

    await client.query('COMMIT');

    res.status(201).json(newUser);

  } catch (err) {
    await client.query('ROLLBACK');
    
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email already in use.' });
    }
    console.error(err.message);
    res.status(500).send('Server error');
  } finally {
    client.release();
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const userResult = await pool.query('SELECT * FROM arena_engine_schema.users WHERE email = $1', [
      email,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = userResult.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const payload = {
      user: {
        id: user.user_id,
        email: user.email,
      },
    };

    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

module.exports = {
  registerUser,
  loginUser,
};
