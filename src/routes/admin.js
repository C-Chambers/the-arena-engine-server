// src/routes/admin.js

const { Router } = require('express');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const {
  getAllCharactersAdmin,
  createCharacter,
  deleteCharacter,
  getAllSkillsAdmin, // Import new skill function
  createSkill,       // Import new skill function
} = require('../controllers/adminController');

const router = Router();
router.use(adminAuthMiddleware);

// --- Character Routes ---
router.get('/characters', getAllCharactersAdmin);
router.post('/characters', createCharacter);
router.delete('/characters/:id', deleteCharacter);

// --- NEW: Skill Routes ---
router.get('/skills', getAllSkillsAdmin);     // GET /api/admin/skills
router.post('/skills', createSkill);        // POST /api/admin/skills

module.exports = router;
