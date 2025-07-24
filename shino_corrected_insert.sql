-- SQL INSERT statements for Shino Aburame (CORRECTED CHAKRA COSTS)
-- Character ID: 5 (Shino Aburame)
-- 
-- NOTES:
-- - Run the character INSERT first, then the skill INSERTs
-- - Character ID 5 is assumed (check your database if different)
-- - Image assets need to be added to the specified paths
-- - All effects use the new mechanics implemented in Phase 1
-- - Chakra costs corrected based on skill card image

-- First, insert the character
INSERT INTO arena_engine_schema.characters (
    name, max_hp, image_url
) VALUES (
    'Shino Aburame',
    100,
    '/images/characters/shino.png'
);

-- Then insert the skills (assuming character_id will be 5)

-- Skill 1: Female Bug (No Energy Cost)
INSERT INTO arena_engine_schema.skills (
    character_id, name, description, cost, effects, cooldown, 
    skill_class, skill_range, skill_persistence, icon_url, is_locked_by_default
) VALUES (
    5,
    'Female Bug',
    'Shino directs one of his female bugs to attach itself. For 4 turns, ''Chakra Leach'' will deal 5 additional damage to one enemy. During this time, if that enemy uses a new harmful skill, they will deal 5 less non-affliction damage for 4 turn. This skill stacks.',
    '{}',
    '[{
        "type": "apply_status",
        "status": "female_bug_mark",
        "target": "enemy",
        "duration": 4,
        "stacks": true,
        "damage_bonus": {
            "skill_name": "Chakra Leach",
            "bonus": 5
        },
        "tracks_harmful_skills": true
    }]',
    2,
    'Physical',
    'Ranged',
    'Instant',
    '/images/skills/shino/female_bug.png',
    false
);

-- Skill 2: Chakra Leach (1 Power Energy)
INSERT INTO arena_engine_schema.skills (
    character_id, name, description, cost, effects, cooldown,
    skill_class, skill_range, skill_persistence, icon_url, is_locked_by_default
) VALUES (
    5,
    'Chakra Leach',
    'Shino directs his chakra draining bugs to one enemy, dealing 15 affliction damage and stealing 1 taijutsu or genjutsu random from their chakra pool. The following turn (only), this skill will deal 20 affliction damage but will not steal chakra.',
    '{"Power": 1}',
    '[{
        "type": "damage",
        "value": 15,
        "damage_type": "affliction",
        "target": "enemy",
        "conditional_bonus": {
            "status_required": "female_bug_mark",
            "bonus_per_stack": 5
        }
    }, {
        "type": "steal_chakra",
        "target": "enemy",
        "chakra_types": ["Technique", "Focus"],
        "amount": 1,
        "random": true,
        "condition": "not_enhanced"
    }, {
        "type": "apply_status",
        "status": "chakra_leach_enhanced",
        "target": "self",
        "duration": 1,
        "enhanced_damage": 20
    }]',
    0,
    'Chakra',
    'Ranged',
    'Instant',
    '/images/skills/shino/chakra_leach.png',
    false
);

-- Skill 3: Bug Wall (2 Power Energy)
INSERT INTO arena_engine_schema.skills (
    character_id, name, description, cost, effects, cooldown,
    skill_class, skill_range, skill_persistence, icon_url, is_locked_by_default  
) VALUES (
    5,
    'Bug Wall',
    'Shino calls millions of bugs to create a wall protecting himself and his allies, making the entire team invulnerable for 1 turn and granting them 10 points of permanent destructible defense.',
    '{"Power": 2}',
    '[{
        "type": "apply_status",
        "status": "invulnerable",
        "target": "all_allies",
        "duration": 2
    }, {
        "type": "apply_status",
        "status": "permanent_destructible_defense",
        "target": "all_allies",
        "max_value": 10,
        "permanent": true
    }]',
    5,
    'Physical',
    'Self',
    'Instant',
    '/images/skills/shino/bug_wall.png',
    false
);

-- Skill 4: Bug Clone (1 Random Energy)
INSERT INTO arena_engine_schema.skills (
    character_id, name, description, cost, effects, cooldown,
    skill_class, skill_range, skill_persistence, icon_url, is_locked_by_default
) VALUES (
    5,
    'Bug Clone', 
    'This skill makes Aburame Shino invulnerable for 1 turn.',
    '{"Random": 1}',
    '[{
        "type": "apply_status",
        "status": "invulnerable",
        "target": "self",
        "duration": 2
    }]',
    4,
    'Chakra',
    'Self',
    'Instant',
    '/images/skills/shino/bug_clone.png',
    false
); 