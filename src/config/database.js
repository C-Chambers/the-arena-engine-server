// src/config/database.js

// This file handles the connection to our PostgreSQL database.

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Create a new Pool instance with the connection details from our .env file
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Create a function to test the database connection
const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('✅ Successfully connected to the PostgreSQL database!');
  } catch (err) {
    console.error('❌ Error connecting to the PostgreSQL database:', err.stack);
  } finally {
    // Make sure to release the client back to the pool in either case
    if (client) {
      client.release();
    }
  }
};

// Export the testConnection function and the pool so other files can use them
module.exports = {
  pool,
  testConnection,
};
