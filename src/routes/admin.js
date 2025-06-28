// src/routes/admin.js

const { Router } = require('express');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const {
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getAllCharactersAdmin,
} = require('../controllers/adminController');

const router = Router();

// Apply the admin auth middleware to all routes in this file
router.use(adminAuthMiddleware);

// --- Character Routes ---
router.post('/characters', createCharacter);       // POST /api/admin/characters
router.put('/characters/:id', updateCharacter);    // PUT /api/admin/characters/char_sbt_01
router.delete('/characters/:id', deleteCharacter); // DELETE /api/admin/characters/char_sbt_01
router.get('/getCharacters', getAllCharactersAdmin); // GET /api/admin/getAllCharactersAdmin

// We will add routes for Skills and Missions here later.

module.exports = router;
