// src/game/data.js

// This file contains the hardcoded character and skill data for our prototype.
// This data is themed around characters from Super Buckyball Tournament.

const CHAKRA_TYPES = ['Power', 'Technique', 'Agility', 'Focus']; // Themed chakra types

const characters = [
  // Pai's name on Grid's assassin/debuffer kit
  {
    id: 'char_sbt_01',
    name: 'Pai, the Digital Phantom',
    maxHp: 90, // Lower HP for an assassin
    skills: [
      {
        id: 'skill_sbt_08',
        name: 'Firewall Breach',
        description: 'Deal 30 damage that ignores shields.',
        cost: { Technique: 1, Agility: 1 },
        effects: [
          { type: 'damage', value: 30, ignores_shield: true, target: 'enemy' },
        ],
      },
      {
        id: 'skill_sbt_09',
        name: 'Data Corruption',
        description: 'Deal 10 damage and apply a "virus" that deals 10 damage per turn for 3 turns.',
        cost: { Technique: 2 },
        effects: [
          { type: 'damage', value: 10, target: 'enemy' },
          { type: 'apply_status', status: 'poison', damage: 10, duration: 3, target: 'enemy' },
        ],
      },
    ],
  },
  // Lang remains the same
  {
    id: 'char_sbt_02',
    name: 'Lang, the Rocket Ace',
    maxHp: 100, // Standard HP
    skills: [
      {
        id: 'skill_sbt_04',
        name: 'Rocket Shot',
        description: 'Deal 45 damage to a single enemy.',
        cost: { Technique: 2 },
        effects: [
          { type: 'damage', value: 45, target: 'enemy' },
        ],
      },
      {
        id: 'skill_sbt_05',
        name: 'Boost Dodge',
        description: 'Gain a 50% chance to dodge the next incoming attack.',
        cost: { Agility: 2 },
        effects: [
          { type: 'apply_status', status: 'dodge', chance: 0.5, duration: 1, target: 'self' },
        ],
      },
    ],
  },
  // Pink remains the same
  {
    id: 'char_sbt_03',
    name: 'Pink, the Healing Star',
    maxHp: 110, // Slightly more HP for a support
    skills: [
      {
        id: 'skill_sbt_06',
        name: 'Healing Wave',
        description: 'Heal an ally for 45 HP.',
        cost: { Focus: 2 },
        effects: [
          { type: 'heal', value: 45, target: 'ally' },
        ],
      },
      {
        id: 'skill_sbt_07',
        name: 'Dazzling Flash',
        description: 'Apply a "vulnerable" debuff to an enemy, causing them to take 20% more damage for 2 turns.',
        cost: { Focus: 1, Technique: 1 },
        effects: [
          { type: 'apply_status', status: 'vulnerable', value: 1.2, duration: 2, target: 'enemy' },
        ],
      },
    ],
  },
  // Grid's name on Pai's tank/defender kit
  {
    id: 'char_sbt_04',
    name: 'Grid, the Resolute Brawler',
    maxHp: 150, // High HP for a defensive character
    skills: [
      {
        id: 'skill_sbt_01',
        name: 'Iron Wall',
        description: 'Apply a shield to an ally that absorbs 40 damage.',
        cost: { Power: 2 },
        effects: [
          { type: 'add_shield', value: 40, target: 'ally' },
        ],
      },
      {
        id: 'skill_sbt_02',
        name: 'Charging Punch',
        description: 'Deal 25 damage to a single enemy.',
        cost: { Power: 1, Agility: 1 },
        effects: [
          { type: 'damage', value: 25, target: 'enemy' },
        ],
      },
      {
        id: 'skill_sbt_03',
        name: 'Magnetic Field',
        description: 'Pulls all enemies closer, dealing minor damage.',
        cost: { Technique: 2 },
        effects: [
          { type: 'damage', value: 10, target: 'all_enemies' },
        ],
      },
    ],
  },
];

module.exports = {
  characters,
  CHAKRA_TYPES,
};
